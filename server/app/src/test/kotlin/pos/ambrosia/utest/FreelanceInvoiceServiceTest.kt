package pos.ambrosia.utest

import kotlinx.serialization.json.Json
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.After
import org.junit.Before
import pos.ambrosia.db.tables.TimeEntriesTable
import pos.ambrosia.db.tables.TimeEntryEntity
import pos.ambrosia.models.CreateFreelanceInvoiceRequest
import pos.ambrosia.models.FreelanceInvoicePayoutSnapshot
import pos.ambrosia.services.FreelanceInvoiceService
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

class FreelanceInvoiceServiceTest {
    private lateinit var databaseFile: File
    private val freelanceInvoiceService = FreelanceInvoiceService()

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
        val freelanceInvoiceFixture = createFreelanceInvoiceFixture()
        val firstTimeEntryId =
            ExposedTestDb.seedTimeEntry(
                freelanceInvoiceFixture.projectId,
                freelanceInvoiceFixture.developmentTaskId,
                entryDate = "2026-08-19",
                durationMinutes = 60,
            )
        val secondTimeEntryId =
            ExposedTestDb.seedTimeEntry(
                freelanceInvoiceFixture.projectId,
                freelanceInvoiceFixture.designTaskId,
                entryDate = "2026-08-20",
                durationMinutes = 30,
            )

        val createdFreelanceInvoice =
            freelanceInvoiceService.createDraftInvoice(
                CreateFreelanceInvoiceRequest(
                    clientId = freelanceInvoiceFixture.clientId,
                    periodStart = "2026-08-17",
                    periodEnd = "2026-08-23",
                ),
            )

        assertEquals("draft", createdFreelanceInvoice.status)
        assertEquals("USD", createdFreelanceInvoice.currencyAcronym)
        assertEquals(15_000, createdFreelanceInvoice.totalCents)
        assertEquals("bank", createdFreelanceInvoice.paymentMethod)
        assertNull(createdFreelanceInvoice.paymentHash)
        assertNull(createdFreelanceInvoice.bolt11)
        assertEquals(2, createdFreelanceInvoice.lineItems.size)
        assertEquals(setOf(10_000, 5_000), createdFreelanceInvoice.lineItems.map { invoiceLineItem -> invoiceLineItem.amountCents }.toSet())
        assertTrue(timeEntryIsLocked(firstTimeEntryId, createdFreelanceInvoice.id))
        assertTrue(timeEntryIsLocked(secondTimeEntryId, createdFreelanceInvoice.id))
    }

    @Test
    fun `freezes the selected bank payout account in the draft invoice`() {
        val currencyId = ExposedTestDb.seedCurrency("USD")
        val payoutAccountId = ExposedTestDb.seedPayoutAccount(currencyId = currencyId)
        val clientId = ExposedTestDb.seedFreelanceClient(currencyId = currencyId, payoutAccountId = payoutAccountId)
        val projectId = ExposedTestDb.seedFreelanceProject(clientId = clientId, hourlyRateCents = 8_000)
        val taskId = ExposedTestDb.seedTask("Development")
        ExposedTestDb.seedTimeEntry(projectId, taskId, entryDate = "2026-08-19", durationMinutes = 60)

        val createdFreelanceInvoice =
            freelanceInvoiceService.createDraftInvoice(
                CreateFreelanceInvoiceRequest(
                    clientId = clientId,
                    periodStart = "2026-08-17",
                    periodEnd = "2026-08-23",
                ),
            )

        val payoutSnapshot =
            Json.decodeFromString<FreelanceInvoicePayoutSnapshot>(assertNotNull(createdFreelanceInvoice.payoutSnapshot))
        assertEquals(payoutAccountId, payoutSnapshot.id)
        assertEquals("bank", payoutSnapshot.type)
        assertEquals(currencyId, payoutSnapshot.currencyId)
    }

    @Test
    fun `ignores entries outside the invoice scope`() {
        val freelanceInvoiceFixture = createFreelanceInvoiceFixture()
        ExposedTestDb.seedTimeEntry(
            freelanceInvoiceFixture.projectId,
            freelanceInvoiceFixture.developmentTaskId,
            entryDate = "2026-08-19",
            durationMinutes = 60,
        )
        ExposedTestDb.seedTimeEntry(
            freelanceInvoiceFixture.projectId,
            freelanceInvoiceFixture.developmentTaskId,
            entryDate = "2026-08-30",
            durationMinutes = 60,
        )
        ExposedTestDb.seedTimeEntry(
            freelanceInvoiceFixture.nonBillableProjectId,
            freelanceInvoiceFixture.developmentTaskId,
            entryDate = "2026-08-19",
            durationMinutes = 60,
            isBillable = false,
        )
        ExposedTestDb.seedTimeEntry(
            freelanceInvoiceFixture.otherProjectId,
            freelanceInvoiceFixture.developmentTaskId,
            entryDate = "2026-08-19",
            durationMinutes = 60,
        )

        val createdFreelanceInvoice =
            freelanceInvoiceService.createDraftInvoice(
                CreateFreelanceInvoiceRequest(
                    clientId = freelanceInvoiceFixture.clientId,
                    periodStart = "2026-08-17",
                    periodEnd = "2026-08-23",
                ),
            )

        assertEquals(10_000, createdFreelanceInvoice.totalCents)
        assertEquals(1, createdFreelanceInvoice.lineItems.size)
    }

    @Test
    fun `does not invoice the same time entries twice`() {
        val freelanceInvoiceFixture = createFreelanceInvoiceFixture()
        ExposedTestDb.seedTimeEntry(
            freelanceInvoiceFixture.projectId,
            freelanceInvoiceFixture.developmentTaskId,
            entryDate = "2026-08-19",
            durationMinutes = 60,
        )

        freelanceInvoiceService.createDraftInvoice(
            CreateFreelanceInvoiceRequest(
                clientId = freelanceInvoiceFixture.clientId,
                periodStart = "2026-08-17",
                periodEnd = "2026-08-23",
            ),
        )

        assertFailsWith<InvalidTimeEntryException> {
            freelanceInvoiceService.createDraftInvoice(
                CreateFreelanceInvoiceRequest(
                    clientId = freelanceInvoiceFixture.clientId,
                    periodStart = "2026-08-17",
                    periodEnd = "2026-08-23",
                ),
            )
        }
    }

    private fun createFreelanceInvoiceFixture(): FreelanceInvoiceFixture {
        val currencyId = ExposedTestDb.seedCurrency("USD")
        val payoutAccountId = ExposedTestDb.seedPayoutAccount(currencyId = currencyId)
        val clientId = ExposedTestDb.seedFreelanceClient(currencyId = currencyId, payoutAccountId = payoutAccountId)
        val otherClientId = ExposedTestDb.seedFreelanceClient(name = "Other Client", currencyId = currencyId)
        val projectId = ExposedTestDb.seedFreelanceProject(clientId = clientId, hourlyRateCents = 10_000)
        val nonBillableProjectId =
            ExposedTestDb.seedFreelanceProject(clientId = clientId, name = "Internal", isBillable = false)
        val otherProjectId = ExposedTestDb.seedFreelanceProject(clientId = otherClientId, name = "Other")
        return FreelanceInvoiceFixture(
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

    private data class FreelanceInvoiceFixture(
        val clientId: String,
        val projectId: String,
        val nonBillableProjectId: String,
        val otherProjectId: String,
        val developmentTaskId: String,
        val designTaskId: String,
    )
}
