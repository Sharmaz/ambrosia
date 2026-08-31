package pos.ambrosia.utest

import org.junit.After
import org.junit.Before
import pos.ambrosia.models.CreateTimeEntryRequest
import pos.ambrosia.models.UpdateTimeEntryRequest
import pos.ambrosia.services.TimeEntryService
import pos.ambrosia.utils.ExposedTestDb
import pos.ambrosia.utils.TimeEntryLockedException
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull

class TimeEntryServiceTest {
    private lateinit var testDatabaseFile: File
    private val timeEntryService = TimeEntryService()

    @Before
    fun setUp() {
        testDatabaseFile = ExposedTestDb.connect()
    }

    @After
    fun tearDown() {
        ExposedTestDb.cleanup(testDatabaseFile)
    }

    @Test
    fun `creates a time entry without user or price`() {
        val timeEntryFixture = createTimeEntryFixture()
        val createdTimeEntry = timeEntryService.createTimeEntry(createTimeEntryRequest(timeEntryFixture))

        assertEquals(timeEntryFixture.projectId, createdTimeEntry.projectId)
        assertEquals(timeEntryFixture.taskId, createdTimeEntry.taskId)
        assertEquals(60, createdTimeEntry.durationMinutes)
        assertNull(createdTimeEntry.invoiceId)
    }

    @Test
    fun `lists entries by date and project`() {
        val timeEntryFixture = createTimeEntryFixture()
        val inRangeTimeEntry = timeEntryService.createTimeEntry(createTimeEntryRequest(timeEntryFixture, "2026-08-19"))
        timeEntryService.createTimeEntry(createTimeEntryRequest(timeEntryFixture, "2026-08-25"))

        val retrievedTimeEntries = timeEntryService.getTimeEntries("2026-08-17", "2026-08-23", timeEntryFixture.projectId)

        assertEquals(listOf(inRangeTimeEntry.id), retrievedTimeEntries.map { timeEntry -> timeEntry.id })
    }

    @Test
    fun `preserves whether an entry is billable`() {
        val timeEntryFixture = createTimeEntryFixture(isBillable = false)

        assertFalse(timeEntryService.createTimeEntry(createTimeEntryRequest(timeEntryFixture)).isBillable)
    }

    @Test
    fun `invoice linked entries cannot be changed or deleted`() {
        val timeEntryFixture = createTimeEntryFixture()
        val invoiceId = ExposedTestDb.seedInvoice(timeEntryFixture.clientId, timeEntryFixture.currencyId)
        val invoiceLinkedTimeEntryId =
            ExposedTestDb.seedTimeEntry(timeEntryFixture.projectId, timeEntryFixture.taskId, invoiceId = invoiceId)

        assertFailsWith<TimeEntryLockedException> {
            timeEntryService.updateTimeEntry(invoiceLinkedTimeEntryId, updateTimeEntryRequest(timeEntryFixture))
        }
        assertFailsWith<TimeEntryLockedException> { timeEntryService.deleteTimeEntry(invoiceLinkedTimeEntryId) }
    }

    private fun createTimeEntryFixture(isBillable: Boolean = true): TimeEntryFixture {
        val currencyId = ExposedTestDb.seedCurrency("USD")
        val clientId = ExposedTestDb.seedClient("Client", currencyId, 10_000)
        val projectId = ExposedTestDb.seedProject(clientId, isBillable = isBillable)
        return TimeEntryFixture(currencyId, clientId, projectId, ExposedTestDb.seedTask("Development"))
    }

    private fun createTimeEntryRequest(
        timeEntryFixture: TimeEntryFixture,
        entryDate: String = "2026-08-19",
    ): CreateTimeEntryRequest =
        CreateTimeEntryRequest(
            projectId = timeEntryFixture.projectId,
            taskId = timeEntryFixture.taskId,
            entryDate = entryDate,
            durationMinutes = 60,
        )

    private fun updateTimeEntryRequest(timeEntryFixture: TimeEntryFixture): UpdateTimeEntryRequest =
        UpdateTimeEntryRequest(
            projectId = timeEntryFixture.projectId,
            taskId = timeEntryFixture.taskId,
            entryDate = "2026-08-20",
            durationMinutes = 60,
        )

    private data class TimeEntryFixture(
        val currencyId: String,
        val clientId: String,
        val projectId: String,
        val taskId: String,
    )
}
