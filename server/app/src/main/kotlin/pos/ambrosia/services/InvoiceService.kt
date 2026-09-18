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
import pos.ambrosia.db.tables.CurrencyEntity
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
import pos.ambrosia.models.CreateInvoiceRequest
import pos.ambrosia.models.InvoiceLineItemResponse
import pos.ambrosia.models.InvoicePayoutSnapshot
import pos.ambrosia.models.InvoiceResponse
import pos.ambrosia.utils.InvalidTimeEntryException
import pos.ambrosia.utils.ResourceNotFoundException
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.UUID

class InvoiceService {
    fun createDraftInvoice(createInvoiceRequest: CreateInvoiceRequest): InvoiceResponse =
        transaction {
            val periodStartDate = parseDate(createInvoiceRequest.periodStart, "periodStart")
            val periodEndDate = parseDate(createInvoiceRequest.periodEnd, "periodEnd")
            if (periodStartDate > periodEndDate) {
                throw InvalidTimeEntryException("periodStart must be before or equal to periodEnd")
            }

            val requestedClient =
                ClientEntity
                    .findById(parseUuid(createInvoiceRequest.clientId, "clientId"))
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

            val currentTimestamp = LocalDateTime.now().toString()
            val projectReferences = clientProjects.associateBy { project -> project.id }
            val taskReferences =
                TaskEntity
                    .find { TasksTable.id inList uninvoicedTimeEntries.map { timeEntry -> timeEntry.taskId }.distinct() }
                    .associateBy { task -> task.id }
            val draftInvoice =
                InvoiceEntity.new(UUID.randomUUID()) {
                    invoiceYear = periodStartDate.year
                    invoiceNumber = nextInvoiceNumber(periodStartDate.year)
                    clientId = requestedClient.id
                    status = "draft"
                    currencyId = requestedClient.currencyId
                    periodStart = periodStartDate.toString()
                    periodEnd = periodEndDate.toString()
                    totalCents =
                        uninvoicedTimeEntries.sumOf { timeEntry ->
                            val project = projectReferences.getValue(timeEntry.projectId)
                            val rateCents = project.hourlyRateCents ?: requestedClient.hourlyRateCents
                            calculateAmountCents(rateCents, timeEntry.durationMinutes)
                        }
                    payoutSnapshot = buildPayoutSnapshot(requestedClient, createInvoiceRequest.payoutAccountId)
                    paymentMethod = requestedClient.paymentMethod
                    paymentHash = null
                    bolt11 = null
                    createdAt = currentTimestamp
                }

            val invoiceLineItems =
                buildInvoiceLineItems(
                    draftInvoice = draftInvoice,
                    timeEntries = uninvoicedTimeEntries,
                    projectReferences = projectReferences,
                    taskReferences = taskReferences,
                    clientHourlyRateCents = requestedClient.hourlyRateCents,
                    createdAt = currentTimestamp,
                )
            uninvoicedTimeEntries.forEach { timeEntry ->
                timeEntry.invoiceId = draftInvoice.id
                timeEntry.isLocked = true
            }

            toInvoiceResponse(draftInvoice, invoiceLineItems)
        }

    fun getInvoices(): List<InvoiceResponse> =
        transaction {
            InvoiceEntity
                .all()
                .orderBy(InvoicesTable.createdAt to SortOrder.DESC)
                .map { invoice -> toInvoiceResponse(invoice) }
        }

    fun getInvoiceById(invoiceId: String): InvoiceResponse? =
        transaction {
            InvoiceEntity
                .findById(parseUuid(invoiceId, "invoiceId"))
                ?.let { invoice -> toInvoiceResponse(invoice) }
        }

    private fun buildInvoiceLineItems(
        draftInvoice: InvoiceEntity,
        timeEntries: List<TimeEntryEntity>,
        projectReferences: Map<EntityID<UUID>, ProjectEntity>,
        taskReferences: Map<EntityID<UUID>, TaskEntity>,
        clientHourlyRateCents: Int,
        createdAt: String,
    ): List<InvoiceLineItemEntity> =
        timeEntries
            .groupBy { timeEntry ->
                val project = projectReferences.getValue(timeEntry.projectId)
                InvoiceLineItemKey(
                    projectId = timeEntry.projectId,
                    taskId = timeEntry.taskId,
                    rateCents = project.hourlyRateCents ?: clientHourlyRateCents,
                )
            }.map { (invoiceLineItemKey, timeEntriesForLineItem) ->
                val quantityMinutes = timeEntriesForLineItem.sumOf { timeEntry -> timeEntry.durationMinutes }
                InvoiceLineItemEntity.new(UUID.randomUUID()) {
                    invoiceId = draftInvoice.id
                    projectId = invoiceLineItemKey.projectId
                    taskId = invoiceLineItemKey.taskId
                    this.quantityMinutes = quantityMinutes
                    rateCents = invoiceLineItemKey.rateCents
                    amountCents =
                        timeEntriesForLineItem.sumOf { timeEntry ->
                            calculateAmountCents(invoiceLineItemKey.rateCents, timeEntry.durationMinutes)
                        }
                    this.createdAt = createdAt
                }
            }.sortedWith(
                compareBy<InvoiceLineItemEntity> { invoiceLineItem ->
                    projectReferences.getValue(invoiceLineItem.projectId).name
                }.thenBy { invoiceLineItem ->
                    taskReferences.getValue(invoiceLineItem.taskId).name
                },
            )

    private fun buildPayoutSnapshot(
        client: ClientEntity,
        selectedPayoutAccountId: String?,
    ): String? {
        if (client.paymentMethod != "bank") return null
        val payoutAccountId = selectedPayoutAccountId ?: client.payoutAccountId?.value?.toString()
        val payoutAccount =
            payoutAccountId
                ?.let { parseUuid(it, "payoutAccountId") }
                ?.let { payoutAccountUuid -> PayoutAccountEntity.findById(payoutAccountUuid) }
                ?.takeIf { payoutAccountEntity -> !payoutAccountEntity.isDeleted }
                ?: throw InvalidTimeEntryException("A valid bank payout account is required")
        if (payoutAccount.type != "bank") throw InvalidTimeEntryException("Payout account must be a bank account")

        return Json.encodeToString(
            InvoicePayoutSnapshot(
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

    private fun toInvoiceResponse(
        invoice: InvoiceEntity,
        invoiceLineItems: List<InvoiceLineItemEntity>? = null,
    ): InvoiceResponse {
        val client =
            ClientEntity.findById(invoice.clientId)
                ?: throw ResourceNotFoundException("Client not found")
        val currency =
            CurrencyEntity.findById(invoice.currencyId)
                ?: throw ResourceNotFoundException("Currency not found")
        val resolvedInvoiceLineItems =
            invoiceLineItems
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

        return InvoiceResponse(
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
                    InvoiceLineItemResponse(
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

    private data class InvoiceLineItemKey(
        val projectId: EntityID<UUID>,
        val taskId: EntityID<UUID>,
        val rateCents: Int,
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
    }
}
