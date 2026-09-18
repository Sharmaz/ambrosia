package pos.ambrosia.utest

import kotlinx.serialization.json.Json
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.After
import org.junit.Before
import pos.ambrosia.db.tables.TimeEntriesTable
import pos.ambrosia.db.tables.TimeEntryEntity
import pos.ambrosia.models.CreateInvoiceRequest
import pos.ambrosia.models.InvoicePayoutSnapshot
import pos.ambrosia.services.InvoiceService
import pos.ambrosia.utils.ExposedTestDb
import pos.ambrosia.utils.InvalidTimeEntryException
import java.io.File
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class InvoiceServiceTest {
    private lateinit var databaseFile: File
    private val invoiceService = InvoiceService()

    @Before
    fun setUp() {
        databaseFile = ExposedTestDb.connect()
    }

    @After
    fun tearDown() {
        ExposedTestDb.cleanup(databaseFile)
    }

    @Test
    fun `creates draft invoice from uninvoiced billable time entries`() {
        val invoiceFixture = createInvoiceFixture()
        val firstTimeEntryId =
            ExposedTestDb.seedTimeEntry(
                invoiceFixture.projectId,
                invoiceFixture.developmentTaskId,
                entryDate = "2026-08-19",
                durationMinutes = 60,
            )
        val secondTimeEntryId =
            ExposedTestDb.seedTimeEntry(
                invoiceFixture.projectId,
                invoiceFixture.designTaskId,
                entryDate = "2026-08-20",
                durationMinutes = 30,
            )

        val createdInvoice =
            invoiceService.createDraftInvoice(
                CreateInvoiceRequest(
                    clientId = invoiceFixture.clientId,
                    periodStart = "2026-08-17",
                    periodEnd = "2026-08-23",
                ),
            )

        assertEquals("draft", createdInvoice.status)
        assertEquals("USD", createdInvoice.currencyAcronym)
        assertEquals(15_000, createdInvoice.totalCents)
        assertEquals("bank", createdInvoice.paymentMethod)
        assertNull(createdInvoice.paymentHash)
        assertNull(createdInvoice.bolt11)
        assertEquals(2, createdInvoice.lineItems.size)
        assertEquals(setOf(10_000, 5_000), createdInvoice.lineItems.map { invoiceLineItem -> invoiceLineItem.amountCents }.toSet())
        assertTrue(timeEntryIsLocked(firstTimeEntryId, createdInvoice.id))
        assertTrue(timeEntryIsLocked(secondTimeEntryId, createdInvoice.id))
    }

    @Test
    fun `freezes the selected bank payout account in the draft invoice`() {
        val currencyId = ExposedTestDb.seedCurrency("USD")
        val payoutAccountId = ExposedTestDb.seedPayoutAccount(currencyId = currencyId)
        val clientId = ExposedTestDb.seedFreelanceClient(currencyId = currencyId, payoutAccountId = payoutAccountId)
        val projectId = ExposedTestDb.seedFreelanceProject(clientId = clientId, hourlyRateCents = 8_000)
        val taskId = ExposedTestDb.seedTask("Development")
        ExposedTestDb.seedTimeEntry(projectId, taskId, entryDate = "2026-08-19", durationMinutes = 60)

        val createdInvoice =
            invoiceService.createDraftInvoice(
                CreateInvoiceRequest(
                    clientId = clientId,
                    periodStart = "2026-08-17",
                    periodEnd = "2026-08-23",
                ),
            )

        val payoutSnapshot =
            Json.decodeFromString<InvoicePayoutSnapshot>(assertNotNull(createdInvoice.payoutSnapshot))
        assertEquals(payoutAccountId, payoutSnapshot.id)
        assertEquals("bank", payoutSnapshot.type)
        assertEquals(currencyId, payoutSnapshot.currencyId)
    }

    @Test
    fun `ignores entries outside the invoice scope`() {
        val invoiceFixture = createInvoiceFixture()
        ExposedTestDb.seedTimeEntry(
            invoiceFixture.projectId,
            invoiceFixture.developmentTaskId,
            entryDate = "2026-08-19",
            durationMinutes = 60,
        )
        ExposedTestDb.seedTimeEntry(
            invoiceFixture.projectId,
            invoiceFixture.developmentTaskId,
            entryDate = "2026-08-30",
            durationMinutes = 60,
        )
        ExposedTestDb.seedTimeEntry(
            invoiceFixture.nonBillableProjectId,
            invoiceFixture.developmentTaskId,
            entryDate = "2026-08-19",
            durationMinutes = 60,
            isBillable = false,
        )
        ExposedTestDb.seedTimeEntry(
            invoiceFixture.otherProjectId,
            invoiceFixture.developmentTaskId,
            entryDate = "2026-08-19",
            durationMinutes = 60,
        )

        val createdInvoice =
            invoiceService.createDraftInvoice(
                CreateInvoiceRequest(
                    clientId = invoiceFixture.clientId,
                    periodStart = "2026-08-17",
                    periodEnd = "2026-08-23",
                ),
            )

        assertEquals(10_000, createdInvoice.totalCents)
        assertEquals(1, createdInvoice.lineItems.size)
    }

    @Test
    fun `does not invoice the same time entries twice`() {
        val invoiceFixture = createInvoiceFixture()
        ExposedTestDb.seedTimeEntry(
            invoiceFixture.projectId,
            invoiceFixture.developmentTaskId,
            entryDate = "2026-08-19",
            durationMinutes = 60,
        )

        invoiceService.createDraftInvoice(
            CreateInvoiceRequest(
                clientId = invoiceFixture.clientId,
                periodStart = "2026-08-17",
                periodEnd = "2026-08-23",
            ),
        )

        assertFailsWith<InvalidTimeEntryException> {
            invoiceService.createDraftInvoice(
                CreateInvoiceRequest(
                    clientId = invoiceFixture.clientId,
                    periodStart = "2026-08-17",
                    periodEnd = "2026-08-23",
                ),
            )
        }
    }

    private fun createInvoiceFixture(): InvoiceFixture {
        val currencyId = ExposedTestDb.seedCurrency("USD")
        val payoutAccountId = ExposedTestDb.seedPayoutAccount(currencyId = currencyId)
        val clientId = ExposedTestDb.seedFreelanceClient(currencyId = currencyId, payoutAccountId = payoutAccountId)
        val otherClientId = ExposedTestDb.seedFreelanceClient(name = "Other Client", currencyId = currencyId)
        val projectId = ExposedTestDb.seedFreelanceProject(clientId = clientId, hourlyRateCents = 10_000)
        val nonBillableProjectId =
            ExposedTestDb.seedFreelanceProject(clientId = clientId, name = "Internal", isBillable = false)
        val otherProjectId = ExposedTestDb.seedFreelanceProject(clientId = otherClientId, name = "Other")
        return InvoiceFixture(
            clientId = clientId,
            projectId = projectId,
            nonBillableProjectId = nonBillableProjectId,
            otherProjectId = otherProjectId,
            developmentTaskId = ExposedTestDb.seedTask("Development"),
            designTaskId = ExposedTestDb.seedTask("Design"),
        )
    }

    private fun timeEntryIsLocked(
        timeEntryId: String,
        invoiceId: String,
    ): Boolean =
        transaction {
            val timeEntry =
                TimeEntryEntity
                    .find {
                        TimeEntriesTable.id eq EntityID(UUID.fromString(timeEntryId), TimeEntriesTable)
                    }.single()
            timeEntry.isLocked && timeEntry.invoiceId?.value?.toString() == invoiceId
        }

    private data class InvoiceFixture(
        val clientId: String,
        val projectId: String,
        val nonBillableProjectId: String,
        val otherProjectId: String,
        val developmentTaskId: String,
        val designTaskId: String,
    )
}
