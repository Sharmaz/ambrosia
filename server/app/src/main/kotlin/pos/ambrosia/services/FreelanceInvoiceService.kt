package pos.ambrosia.services

import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.v1.core.SortOrder
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greaterEq
import org.jetbrains.exposed.v1.core.inList
import org.jetbrains.exposed.v1.core.isNull
import org.jetbrains.exposed.v1.core.lessEq
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import pos.ambrosia.db.tables.ClientEntity
import pos.ambrosia.db.tables.ClientsTable
import pos.ambrosia.db.tables.CurrencyEntity
import pos.ambrosia.db.tables.CurrencyTable
import pos.ambrosia.db.tables.InvoiceEntity
import pos.ambrosia.db.tables.InvoiceLineItemEntity
import pos.ambrosia.db.tables.InvoiceLineItemsTable
import pos.ambrosia.db.tables.InvoicesTable
import pos.ambrosia.db.tables.PayoutAccountEntity
import pos.ambrosia.db.tables.ProjectEntity
import pos.ambrosia.db.tables.ProjectsTable
import pos.ambrosia.db.tables.TaskEntity
import pos.ambrosia.db.tables.TasksTable
import pos.ambrosia.db.tables.TimeEntriesTable
import pos.ambrosia.db.tables.TimeEntryEntity
import pos.ambrosia.models.CreateFreelanceInvoiceRequest
import pos.ambrosia.models.FreelanceInvoiceLineItemResponse
import pos.ambrosia.models.FreelanceInvoicePayoutSnapshot
import pos.ambrosia.models.FreelanceInvoiceResponse
import pos.ambrosia.models.WalletInvoiceRate
import pos.ambrosia.models.phoenix.CreateInvoiceRequest
import pos.ambrosia.utils.InvalidTimeEntryException
import pos.ambrosia.utils.ResourceNotFoundException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.UUID

class FreelanceInvoiceService(
    private val lightningBackend: LightningBackend = ActiveLightningBackend,
    private val walletRateService: WalletRateService = WalletRateService(),
) {
    suspend fun createDraftInvoice(createFreelanceInvoiceRequest: CreateFreelanceInvoiceRequest): FreelanceInvoiceResponse {
        val preparedFreelanceInvoice = prepareDraftFreelanceInvoice(createFreelanceInvoiceRequest)
        val lightningInvoiceData = createLightningInvoiceIfNeeded(preparedFreelanceInvoice, createFreelanceInvoiceRequest)
        val createdFreelanceInvoice = persistDraftFreelanceInvoice(preparedFreelanceInvoice, lightningInvoiceData)
        lightningInvoiceData?.let { createdLightningInvoiceData ->
            walletRateService.saveInvoiceRate(
                WalletInvoiceRate(
                    paymentHash = createdLightningInvoiceData.paymentHash,
                    satoshiAmount = createdLightningInvoiceData.satoshiAmount,
                    exchangeRate = createdLightningInvoiceData.exchangeRate,
                    exchangeRateCurrency = createdLightningInvoiceData.exchangeRateCurrency,
                    fiatAmount = createdLightningInvoiceData.fiatAmount,
                ),
            )
        }
        return createdFreelanceInvoice
    }

    private fun prepareDraftFreelanceInvoice(createFreelanceInvoiceRequest: CreateFreelanceInvoiceRequest): PreparedFreelanceInvoice =
        transaction {
            val periodStartDate = parseDate(createFreelanceInvoiceRequest.periodStart, "periodStart")
            val periodEndDate = parseDate(createFreelanceInvoiceRequest.periodEnd, "periodEnd")
            if (periodStartDate > periodEndDate) {
                throw InvalidTimeEntryException("periodStart must be before or equal to periodEnd")
            }

            val requestedClient =
                ClientEntity
                    .findById(parseUuid(createFreelanceInvoiceRequest.clientId, "clientId"))
                    ?.takeIf { client -> !client.isDeleted }
                    ?: throw ResourceNotFoundException("Client not found")
            val clientProjects =
                ProjectEntity
                    .find {
                        (ProjectsTable.clientId eq requestedClient.id) and
                            (ProjectsTable.isDeleted eq false)
                    }.toList()
            if (clientProjects.isEmpty()) throw InvalidTimeEntryException("No projects found for this client")

            val uninvoicedTimeEntries =
                TimeEntryEntity
                    .find {
                        (TimeEntriesTable.projectId inList clientProjects.map { project -> project.id }) and
                            (TimeEntriesTable.entryDate greaterEq periodStartDate.toString()) and
                            (TimeEntriesTable.entryDate lessEq periodEndDate.toString()) and
                            (TimeEntriesTable.isBillable eq true) and
                            TimeEntriesTable.invoiceId.isNull()
                    }.orderBy(
                        TimeEntriesTable.entryDate to SortOrder.ASC,
                        TimeEntriesTable.createdAt to SortOrder.ASC,
                    ).toList()
            if (uninvoicedTimeEntries.isEmpty()) {
                throw InvalidTimeEntryException("No uninvoiced billable time entries found for this period")
            }

            val projectReferences = clientProjects.associateBy { project -> project.id }
            val preparedLineItems =
                uninvoicedTimeEntries
                    .groupBy { timeEntry ->
                        val project = projectReferences.getValue(timeEntry.projectId)
                        FreelanceInvoiceLineItemKey(
                            projectId = timeEntry.projectId,
                            taskId = timeEntry.taskId,
                            rateCents = project.hourlyRateCents ?: requestedClient.hourlyRateCents,
                        )
                    }.map { (freelanceInvoiceLineItemKey, timeEntriesForLineItem) ->
                        val project = projectReferences.getValue(freelanceInvoiceLineItemKey.projectId)
                        val task =
                            TaskEntity.findById(freelanceInvoiceLineItemKey.taskId)
                                ?: throw ResourceNotFoundException("Task not found")
                        PreparedFreelanceInvoiceLineItem(
                            projectId = freelanceInvoiceLineItemKey.projectId.value,
                            projectName = project.name,
                            taskId = freelanceInvoiceLineItemKey.taskId.value,
                            taskName = task.name,
                            quantityMinutes = timeEntriesForLineItem.sumOf { timeEntry -> timeEntry.durationMinutes },
                            rateCents = freelanceInvoiceLineItemKey.rateCents,
                            amountCents =
                                timeEntriesForLineItem.sumOf { timeEntry ->
                                    calculateAmountCents(freelanceInvoiceLineItemKey.rateCents, timeEntry.durationMinutes)
                                },
                        )
                    }.sortedWith(
                        compareBy<PreparedFreelanceInvoiceLineItem> { preparedLineItem ->
                            preparedLineItem.projectName
                        }.thenBy { preparedLineItem ->
                            preparedLineItem.taskName
                        },
                    )
            PreparedFreelanceInvoice(
                invoiceYear = periodStartDate.year,
                clientId = requestedClient.id.value,
                currencyId = requestedClient.currencyId.value,
                periodStart = periodStartDate.toString(),
                periodEnd = periodEndDate.toString(),
                totalCents = preparedLineItems.sumOf { preparedLineItem -> preparedLineItem.amountCents },
                payoutSnapshot = buildPayoutSnapshot(requestedClient, createFreelanceInvoiceRequest.payoutAccountId),
                paymentMethod = requestedClient.paymentMethod,
                lineItems = preparedLineItems,
                timeEntryIds = uninvoicedTimeEntries.map { timeEntry -> timeEntry.id.value },
            )
        }

    private suspend fun createLightningInvoiceIfNeeded(
        preparedFreelanceInvoice: PreparedFreelanceInvoice,
        createFreelanceInvoiceRequest: CreateFreelanceInvoiceRequest,
    ): LightningFreelanceInvoiceData? {
        if (preparedFreelanceInvoice.paymentMethod != "lightning") return null

        val exchangeRate =
            createFreelanceInvoiceRequest.exchangeRate
                ?.takeIf { requestedExchangeRate -> requestedExchangeRate > 0 }
                ?: throw InvalidTimeEntryException("A positive exchangeRate is required for Lightning invoices")
        val exchangeRateCurrency =
            createFreelanceInvoiceRequest.exchangeRateCurrency
                ?.takeIf { requestedExchangeRateCurrency -> requestedExchangeRateCurrency.isNotBlank() }
                ?: throw InvalidTimeEntryException("exchangeRateCurrency is required for Lightning invoices")
        val fiatAmount = preparedFreelanceInvoice.totalCents.toDouble() / 100
        val satoshiAmount = calculateSatoshiAmount(preparedFreelanceInvoice.totalCents, exchangeRate)
        val createdLightningInvoice =
            lightningBackend.createInvoice(
                CreateInvoiceRequest(
                    description = "Freelance invoice ${preparedFreelanceInvoice.periodStart} to ${preparedFreelanceInvoice.periodEnd}",
                    amountSat = satoshiAmount,
                    exchangeRate = exchangeRate,
                    exchangeRateCurrency = exchangeRateCurrency,
                    fiatAmount = fiatAmount,
                ),
            )

        return LightningFreelanceInvoiceData(
            paymentHash = createdLightningInvoice.paymentHash,
            bolt11 = createdLightningInvoice.serialized,
            satoshiAmount = satoshiAmount,
            exchangeRate = exchangeRate,
            exchangeRateCurrency = exchangeRateCurrency,
            fiatAmount = fiatAmount,
        )
    }

    private fun persistDraftFreelanceInvoice(
        preparedFreelanceInvoice: PreparedFreelanceInvoice,
        lightningFreelanceInvoiceData: LightningFreelanceInvoiceData?,
    ): FreelanceInvoiceResponse =
        transaction {
            val currentTimestamp = LocalDateTime.now().toString()
            val draftFreelanceInvoice =
                InvoiceEntity.new(UUID.randomUUID()) {
                    invoiceYear = preparedFreelanceInvoice.invoiceYear
                    invoiceNumber = nextInvoiceNumber(preparedFreelanceInvoice.invoiceYear)
                    clientId = EntityID(preparedFreelanceInvoice.clientId, ClientsTable)
                    status = "draft"
                    currencyId = EntityID(preparedFreelanceInvoice.currencyId, CurrencyTable)
                    periodStart = preparedFreelanceInvoice.periodStart
                    periodEnd = preparedFreelanceInvoice.periodEnd
                    totalCents = preparedFreelanceInvoice.totalCents
                    payoutSnapshot = preparedFreelanceInvoice.payoutSnapshot
                    paymentMethod = preparedFreelanceInvoice.paymentMethod
                    paymentHash = lightningFreelanceInvoiceData?.paymentHash
                    bolt11 = lightningFreelanceInvoiceData?.bolt11
                    createdAt = currentTimestamp
                }

            val freelanceInvoiceLineItems =
                createInvoiceLineItems(
                    draftInvoice = draftFreelanceInvoice,
                    preparedLineItems = preparedFreelanceInvoice.lineItems,
                    createdAt = currentTimestamp,
                )
            val timeEntriesToLock =
                TimeEntryEntity
                    .find {
                        TimeEntriesTable.id inList
                            preparedFreelanceInvoice.timeEntryIds.map { timeEntryId ->
                                EntityID(timeEntryId, TimeEntriesTable)
                            }
                    }.toList()
            val hasAlreadyInvoicedTimeEntry =
                timeEntriesToLock.any { timeEntry -> timeEntry.invoiceId != null }
            if (timeEntriesToLock.size != preparedFreelanceInvoice.timeEntryIds.size || hasAlreadyInvoicedTimeEntry) {
                throw InvalidTimeEntryException("One or more time entries have already been invoiced")
            }
            timeEntriesToLock.forEach { timeEntry ->
                timeEntry.invoiceId = draftFreelanceInvoice.id
                timeEntry.isLocked = true
            }

            toFreelanceInvoiceResponse(draftFreelanceInvoice, freelanceInvoiceLineItems)
        }

    fun getFreelanceInvoices(): List<FreelanceInvoiceResponse> =
        transaction {
            InvoiceEntity
                .all()
                .orderBy(InvoicesTable.createdAt to SortOrder.DESC)
                .map { freelanceInvoice -> toFreelanceInvoiceResponse(freelanceInvoice) }
        }

    fun getFreelanceInvoiceById(freelanceInvoiceId: String): FreelanceInvoiceResponse? =
        transaction {
            InvoiceEntity
                .findById(parseUuid(freelanceInvoiceId, "freelanceInvoiceId"))
                ?.let { freelanceInvoice -> toFreelanceInvoiceResponse(freelanceInvoice) }
        }

    private fun createInvoiceLineItems(
        draftInvoice: InvoiceEntity,
        preparedLineItems: List<PreparedFreelanceInvoiceLineItem>,
        createdAt: String,
    ): List<InvoiceLineItemEntity> =
        preparedLineItems
            .map { preparedLineItem ->
                InvoiceLineItemEntity.new(UUID.randomUUID()) {
                    invoiceId = draftInvoice.id
                    projectId = EntityID(preparedLineItem.projectId, ProjectsTable)
                    taskId = EntityID(preparedLineItem.taskId, TasksTable)
                    quantityMinutes = preparedLineItem.quantityMinutes
                    rateCents = preparedLineItem.rateCents
                    amountCents = preparedLineItem.amountCents
                    this.createdAt = createdAt
                }
            }

    private fun buildPayoutSnapshot(
        client: ClientEntity,
        selectedPayoutAccountId: String?,
    ): String? {
        if (client.paymentMethod != "bank") return null
        val payoutAccountId = selectedPayoutAccountId ?: client.payoutAccountId?.value?.toString()
        val payoutAccount =
            payoutAccountId
                ?.let { payoutAccountIdValue -> parseUuid(payoutAccountIdValue, "payoutAccountId") }
                ?.let { payoutAccountUuid -> PayoutAccountEntity.findById(payoutAccountUuid) }
                ?.takeIf { payoutAccountEntity -> !payoutAccountEntity.isDeleted }
                ?: throw InvalidTimeEntryException("A valid bank payout account is required")
        if (payoutAccount.type != "bank") throw InvalidTimeEntryException("Payout account must be a bank account")

        return Json.encodeToString(
            FreelanceInvoicePayoutSnapshot(
                id = payoutAccount.id.value.toString(),
                type = payoutAccount.type,
                accountHolder = payoutAccount.accountHolder,
                bankName = payoutAccount.bankName,
                accountNumber = payoutAccount.accountNumber,
                currencyId = payoutAccount.currencyId?.value?.toString(),
                swift = payoutAccount.swift,
                iban = payoutAccount.iban,
                clabe = payoutAccount.clabe,
                lightningAddress = payoutAccount.lightningAddress,
            ),
        )
    }

    private fun toFreelanceInvoiceResponse(
        invoice: InvoiceEntity,
        freelanceInvoiceLineItems: List<InvoiceLineItemEntity>? = null,
    ): FreelanceInvoiceResponse {
        val client =
            ClientEntity.findById(invoice.clientId)
                ?: throw ResourceNotFoundException("Client not found")
        val currency =
            CurrencyEntity.findById(invoice.currencyId)
                ?: throw ResourceNotFoundException("Currency not found")
        val resolvedInvoiceLineItems =
            freelanceInvoiceLineItems
                ?: InvoiceLineItemEntity
                    .find { InvoiceLineItemsTable.invoiceId eq invoice.id }
                    .toList()
        val invoiceLineItemProjectIds = resolvedInvoiceLineItems.map { invoiceLineItem -> invoiceLineItem.projectId }.distinct()
        val invoiceLineItemTaskIds = resolvedInvoiceLineItems.map { invoiceLineItem -> invoiceLineItem.taskId }.distinct()
        val projectReferences =
            if (resolvedInvoiceLineItems.isEmpty()) {
                emptyMap()
            } else {
                ProjectEntity
                    .find { ProjectsTable.id inList invoiceLineItemProjectIds }
                    .associateBy { project -> project.id }
            }
        val taskReferences =
            if (resolvedInvoiceLineItems.isEmpty()) {
                emptyMap()
            } else {
                TaskEntity
                    .find { TasksTable.id inList invoiceLineItemTaskIds }
                    .associateBy { task -> task.id }
            }

        return FreelanceInvoiceResponse(
            id = invoice.id.value.toString(),
            invoiceYear = invoice.invoiceYear,
            invoiceNumber = invoice.invoiceNumber,
            clientId = client.id.value.toString(),
            clientName = client.name,
            status = invoice.status,
            currencyId = currency.id.value.toString(),
            currencyAcronym = currency.acronym,
            periodStart = invoice.periodStart,
            periodEnd = invoice.periodEnd,
            totalCents = invoice.totalCents,
            payoutSnapshot = invoice.payoutSnapshot,
            paymentMethod = invoice.paymentMethod,
            paymentHash = invoice.paymentHash,
            bolt11 = invoice.bolt11,
            createdAt = invoice.createdAt,
            lineItems =
                resolvedInvoiceLineItems.map { invoiceLineItem ->
                    val project = projectReferences.getValue(invoiceLineItem.projectId)
                    val task = taskReferences.getValue(invoiceLineItem.taskId)
                    FreelanceInvoiceLineItemResponse(
                        id = invoiceLineItem.id.value.toString(),
                        projectId = project.id.value.toString(),
                        projectName = project.name,
                        taskId = task.id.value.toString(),
                        taskName = task.name,
                        quantityMinutes = invoiceLineItem.quantityMinutes,
                        rateCents = invoiceLineItem.rateCents,
                        amountCents = invoiceLineItem.amountCents,
                        createdAt = invoiceLineItem.createdAt,
                    )
                },
        )
    }

    private fun nextInvoiceNumber(invoiceYear: Int): String {
        val invoiceCountForYear =
            InvoiceEntity
                .find { InvoicesTable.invoiceYear eq invoiceYear }
                .count()
        return "$invoiceYear-${(invoiceCountForYear + 1).toString().padStart(6, '0')}"
    }

    private data class FreelanceInvoiceLineItemKey(
        val projectId: EntityID<UUID>,
        val taskId: EntityID<UUID>,
        val rateCents: Int,
    )

    private data class PreparedFreelanceInvoice(
        val invoiceYear: Int,
        val clientId: UUID,
        val currencyId: UUID,
        val periodStart: String,
        val periodEnd: String,
        val totalCents: Int,
        val payoutSnapshot: String?,
        val paymentMethod: String,
        val lineItems: List<PreparedFreelanceInvoiceLineItem>,
        val timeEntryIds: List<UUID>,
    )

    private data class PreparedFreelanceInvoiceLineItem(
        val projectId: UUID,
        val projectName: String,
        val taskId: UUID,
        val taskName: String,
        val quantityMinutes: Int,
        val rateCents: Int,
        val amountCents: Int,
    )

    private data class LightningFreelanceInvoiceData(
        val paymentHash: String,
        val bolt11: String,
        val satoshiAmount: Long,
        val exchangeRate: Double,
        val exchangeRateCurrency: String,
        val fiatAmount: Double,
    )

    companion object {
        private val isoDatePattern = Regex("\\d{4}-\\d{2}-\\d{2}")

        private fun parseUuid(
            rawValue: String,
            fieldName: String,
        ): UUID =
            try {
                UUID.fromString(rawValue)
            } catch (_: IllegalArgumentException) {
                throw InvalidTimeEntryException("$fieldName must be a valid UUID")
            }

        private fun parseDate(
            rawValue: String,
            fieldName: String,
        ): LocalDate {
            if (!isoDatePattern.matches(rawValue)) {
                throw InvalidTimeEntryException("$fieldName must use YYYY-MM-DD format")
            }
            return try {
                LocalDate.parse(rawValue, DateTimeFormatter.ISO_LOCAL_DATE)
            } catch (_: DateTimeParseException) {
                throw InvalidTimeEntryException("$fieldName must use YYYY-MM-DD format")
            }
        }

        private fun calculateAmountCents(
            rateCents: Int,
            durationMinutes: Int,
        ): Int =
            try {
                BigDecimal
                    .valueOf(rateCents.toLong())
                    .multiply(BigDecimal.valueOf(durationMinutes.toLong()))
                    .divide(BigDecimal.valueOf(60L), 0, RoundingMode.HALF_UP)
                    .intValueExact()
            } catch (_: ArithmeticException) {
                throw InvalidTimeEntryException("Calculated amount exceeds the supported range")
            }

        private fun calculateSatoshiAmount(
            totalCents: Int,
            exchangeRate: Double,
        ): Long =
            try {
                BigDecimal
                    .valueOf(totalCents.toLong())
                    .divide(BigDecimal.valueOf(100L), 8, RoundingMode.HALF_UP)
                    .divide(BigDecimal.valueOf(exchangeRate), 8, RoundingMode.HALF_UP)
                    .multiply(BigDecimal.valueOf(100_000_000L))
                    .setScale(0, RoundingMode.HALF_UP)
                    .longValueExact()
                    .takeIf { satoshiAmount -> satoshiAmount > 0 }
                    ?: throw InvalidTimeEntryException("Lightning invoice amount must be greater than 0 sats")
            } catch (_: ArithmeticException) {
                throw InvalidTimeEntryException("Calculated Lightning invoice amount exceeds the supported range")
            }
    }
}
