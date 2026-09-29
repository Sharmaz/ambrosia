package pos.ambrosia.services

import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import pos.ambrosia.db.tables.ClientEntity
import pos.ambrosia.db.tables.ClientsTable
import pos.ambrosia.db.tables.CurrencyTable
import pos.ambrosia.db.tables.PayoutAccountsTable
import pos.ambrosia.logger
import pos.ambrosia.models.FreelanceClient
import pos.ambrosia.models.FreelanceClientUpsert
import java.time.LocalDateTime
import java.util.UUID

class ClientService {
    private val validBillingCycles = setOf("weekly", "biweekly", "monthly")
    private val validPaymentMethods = setOf("bank", "lightning")

    private fun parseUuid(value: String): UUID? =
        try {
            UUID.fromString(value)
        } catch (_: IllegalArgumentException) {
            null
        }

    private fun currencyExists(currencyId: String): Boolean {
        val currencyUuid = parseUuid(currencyId) ?: return false
        return !CurrencyTable
            .selectAll()
            .where { CurrencyTable.id eq EntityID(currencyUuid, CurrencyTable) }
            .empty()
    }

    private fun payoutAccountExists(payoutAccountId: String?): Boolean {
        if (payoutAccountId.isNullOrBlank()) return true
        val payoutAccountUuid = parseUuid(payoutAccountId) ?: return false
        return !PayoutAccountsTable
            .selectAll()
            .where {
                (PayoutAccountsTable.id eq EntityID(payoutAccountUuid, PayoutAccountsTable)) and
                    (PayoutAccountsTable.isDeleted eq false)
            }.empty()
    }

    private fun isValidClientRequest(clientRequest: FreelanceClientUpsert): Boolean =
        clientRequest.name.isNotBlank() &&
            clientRequest.hourlyRateCents >= 0 &&
            clientRequest.billingCycle in validBillingCycles &&
            clientRequest.paymentMethod in validPaymentMethods &&
            currencyExists(clientRequest.currencyId) &&
            payoutAccountExists(clientRequest.payoutAccountId)

    private fun toClientModel(clientEntity: ClientEntity): FreelanceClient =
        FreelanceClient(
            id = clientEntity.id.value.toString(),
            name = clientEntity.name,
            currencyId = clientEntity.currencyId.value.toString(),
            hourlyRateCents = clientEntity.hourlyRateCents,
            billingCycle = clientEntity.billingCycle,
            paymentMethod = clientEntity.paymentMethod,
            payoutAccountId = clientEntity.payoutAccountId?.value?.toString(),
            isDeleted = clientEntity.isDeleted,
            createdAt = clientEntity.createdAt,
        )

    fun getClients(): List<FreelanceClient> =
        transaction {
            ClientEntity
                .find { ClientsTable.isDeleted eq false }
                .map { clientEntity -> toClientModel(clientEntity) }
        }

    fun getClientById(clientId: String): FreelanceClient? =
        transaction {
            val clientUuid = parseUuid(clientId) ?: return@transaction null
            val clientEntity = ClientEntity.findById(clientUuid) ?: return@transaction null
            if (clientEntity.isDeleted) return@transaction null
            toClientModel(clientEntity)
        }

    fun addClient(clientRequest: FreelanceClientUpsert): String? =
        transaction {
            if (!isValidClientRequest(clientRequest)) return@transaction null

            val clientId =
                ClientEntity
                    .new(UUID.randomUUID()) {
                        name = clientRequest.name
                        currencyId = EntityID(UUID.fromString(clientRequest.currencyId), CurrencyTable)
                        hourlyRateCents = clientRequest.hourlyRateCents
                        billingCycle = clientRequest.billingCycle
                        paymentMethod = clientRequest.paymentMethod
                        payoutAccountId =
                            clientRequest.payoutAccountId?.let { EntityID(UUID.fromString(it), PayoutAccountsTable) }
                        isDeleted = false
                        createdAt = LocalDateTime.now().toString()
                    }.id.value
                    .toString()
            logger.info("Freelance client created: $clientId")
            clientId
        }

    fun updateClient(
        clientId: String,
        clientRequest: FreelanceClientUpsert,
    ): Boolean =
        transaction {
            val clientUuid = parseUuid(clientId) ?: return@transaction false
            if (!isValidClientRequest(clientRequest)) return@transaction false

            val clientEntity = ClientEntity.findById(clientUuid) ?: return@transaction false
            if (clientEntity.isDeleted) return@transaction false

            clientEntity.name = clientRequest.name
            clientEntity.currencyId = EntityID(UUID.fromString(clientRequest.currencyId), CurrencyTable)
            clientEntity.hourlyRateCents = clientRequest.hourlyRateCents
            clientEntity.billingCycle = clientRequest.billingCycle
            clientEntity.paymentMethod = clientRequest.paymentMethod
            clientEntity.payoutAccountId = clientRequest.payoutAccountId?.let { EntityID(UUID.fromString(it), PayoutAccountsTable) }
            logger.info("Freelance client updated: $clientId")
            true
        }

    fun deleteClient(clientId: String): Boolean =
        transaction {
            val clientUuid = parseUuid(clientId) ?: return@transaction false
            val clientEntity = ClientEntity.findById(clientUuid) ?: return@transaction false
            if (clientEntity.isDeleted) return@transaction false

            clientEntity.isDeleted = true
            logger.info("Freelance client soft deleted: $clientId")
            true
        }
}
