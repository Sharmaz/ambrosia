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
    private lateinit var databaseFile: File
    private val service = TimeEntryService()

    @Before
    fun setUp() {
        databaseFile = ExposedTestDb.connect()
    }

    @After
    fun tearDown() {
        ExposedTestDb.cleanup(databaseFile)
    }

    @Test
    fun `creates a time entry without user or price`() {
        val fixture = seedFixture()
        val entry = service.createTimeEntry(request(fixture))

        assertEquals(fixture.projectId, entry.projectId)
        assertEquals(fixture.taskId, entry.taskId)
        assertEquals(60, entry.durationMinutes)
        assertNull(entry.invoiceId)
    }

    @Test
    fun `lists entries by date and project`() {
        val fixture = seedFixture()
        val included = service.createTimeEntry(request(fixture, "2026-08-19"))
        service.createTimeEntry(request(fixture, "2026-08-25"))

        val entries = service.getTimeEntries("2026-08-17", "2026-08-23", fixture.projectId)

        assertEquals(listOf(included.id), entries.map { it.id })
    }

    @Test
    fun `preserves whether an entry is billable`() {
        val fixture = seedFixture(isBillable = false)

        assertFalse(service.createTimeEntry(request(fixture)).isBillable)
    }

    @Test
    fun `invoice linked entries cannot be changed or deleted`() {
        val fixture = seedFixture()
        val invoiceId = ExposedTestDb.seedInvoice(fixture.clientId, fixture.currencyId)
        val entryId = ExposedTestDb.seedTimeEntry(fixture.projectId, fixture.taskId, invoiceId = invoiceId)

        assertFailsWith<TimeEntryLockedException> { service.updateTimeEntry(entryId, updateRequest(fixture)) }
        assertFailsWith<TimeEntryLockedException> { service.deleteTimeEntry(entryId) }
    }

    private fun seedFixture(isBillable: Boolean = true): Fixture {
        val currencyId = ExposedTestDb.seedCurrency("USD")
        val clientId = ExposedTestDb.seedClient("Client", currencyId, 10_000)
        val projectId = ExposedTestDb.seedProject(clientId, isBillable = isBillable)
        return Fixture(currencyId, clientId, projectId, ExposedTestDb.seedTask("Development"))
    }

    private fun request(
        fixture: Fixture,
        entryDate: String = "2026-08-19",
    ): CreateTimeEntryRequest =
        CreateTimeEntryRequest(
            projectId = fixture.projectId,
            taskId = fixture.taskId,
            entryDate = entryDate,
            durationMinutes = 60,
        )

    private fun updateRequest(fixture: Fixture): UpdateTimeEntryRequest =
        UpdateTimeEntryRequest(
            projectId = fixture.projectId,
            taskId = fixture.taskId,
            entryDate = "2026-08-20",
            durationMinutes = 60,
        )

    private data class Fixture(
        val currencyId: String,
        val clientId: String,
        val projectId: String,
        val taskId: String,
    )
}
