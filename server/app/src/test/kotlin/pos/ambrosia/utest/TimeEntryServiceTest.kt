package pos.ambrosia.utest

import org.junit.After
import org.junit.Before
import pos.ambrosia.models.CreateTimeEntryRequest
import pos.ambrosia.models.UpdateTimeEntryRequest
import pos.ambrosia.services.TimeEntryService
import pos.ambrosia.utils.ExposedTestDb
import pos.ambrosia.utils.InvalidTimeEntryException
import pos.ambrosia.utils.ResourceNotFoundException
import pos.ambrosia.utils.TimeEntryLockedException
import pos.ambrosia.utils.TimeEntryRateNotFoundException
import java.io.File
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

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
    fun `rate resolver honors all precedence levels`() {
        assertEquals(12_000, TimeEntryService.resolveRateCents(12_000, 11_000, 10_000))
        assertEquals(11_000, TimeEntryService.resolveRateCents(null, 11_000, 10_000))
        assertEquals(10_000, TimeEntryService.resolveRateCents(null, null, 10_000))
    }

    @Test
    fun `rate resolver rejects when every rate is null`() {
        assertFailsWith<TimeEntryRateNotFoundException> {
            TimeEntryService.resolveRateCents(null, null, null)
        }
    }

    @Test
    fun `amount calculation supports arbitrary minutes and half up rounding`() {
        assertEquals(2_833, TimeEntryService.calculateAmountCents(10_000, 17))
        assertEquals(3_000, TimeEntryService.calculateAmountCents(10_000, 18))
        assertEquals(1, TimeEntryService.calculateAmountCents(1, 30))
    }

    @Test
    fun `amount calculation rejects zero negative and overflow`() {
        assertFailsWith<InvalidTimeEntryException> { TimeEntryService.calculateAmountCents(100, 0) }
        assertFailsWith<InvalidTimeEntryException> { TimeEntryService.calculateAmountCents(-1, 60) }
        assertFailsWith<InvalidTimeEntryException> {
            TimeEntryService.calculateAmountCents(Int.MAX_VALUE, Int.MAX_VALUE)
        }
    }

    @Test
    fun `create stores project rate snapshot and returns enriched response`() {
        val fixture = seedFixture(projectRateCents = 12_000, clientRateCents = 10_000)

        val result = service.createTimeEntry(fixture.userId, createRequest(fixture, durationMinutes = 17))

        assertEquals(12_000, result.rateCents)
        assertEquals(3_400, result.amountCents)
        assertEquals("Project Alpha", result.projectName)
        assertEquals("Development", result.taskName)
        assertEquals("Client Alpha", result.clientName)
        assertEquals("USD", result.currencyAcronym)
        assertEquals(fixture.userId, result.userId)
        assertNull(result.invoiceId)
    }

    @Test
    fun `create falls back to client rate and accepts explicit zero rate`() {
        val fixture = seedFixture(projectRateCents = null, clientRateCents = 10_000)
        val fallback = service.createTimeEntry(fixture.userId, createRequest(fixture))
        val explicitZero = service.createTimeEntry(fixture.userId, createRequest(fixture, rateCents = 0))

        assertEquals(10_000, fallback.rateCents)
        assertEquals(0, explicitZero.rateCents)
        assertEquals(0, explicitZero.amountCents)
    }

    @Test
    fun `put with null rate recalculates and persists project rate`() {
        val fixture = seedFixture(projectRateCents = 12_000, clientRateCents = 10_000)
        val created = service.createTimeEntry(fixture.userId, createRequest(fixture, rateCents = 20_000))

        val updated = service.updateTimeEntry(fixture.userId, created.id, updateRequest(fixture, rateCents = null))
        val fetched = service.getTimeEntryById(fixture.userId, created.id)

        assertEquals(12_000, updated.rateCents)
        assertEquals(12_000, fetched?.rateCents)
    }

    @Test
    fun `weekly query returns only owned entries in range and applies filters`() {
        val fixture = seedFixture()
        val otherUser = ExposedTestDb.seedUser("Other", ExposedTestDb.seedRole("other-role"))
        val included = service.createTimeEntry(fixture.userId, createRequest(fixture, entryDate = "2026-08-19"))
        service.createTimeEntry(fixture.userId, createRequest(fixture, entryDate = "2026-08-25"))
        ExposedTestDb.seedTimeEntry(otherUser, fixture.projectId, fixture.taskId, "2026-08-19")

        val result =
            service.getTimeEntries(
                userId = fixture.userId,
                from = "2026-08-17",
                to = "2026-08-23",
                projectId = fixture.projectId,
                taskId = fixture.taskId,
            )

        assertEquals(listOf(included.id), result.map { it.id })
    }

    @Test
    fun `another user cannot read update or delete an entry`() {
        val fixture = seedFixture()
        val otherUser = ExposedTestDb.seedUser("Other", ExposedTestDb.seedRole("other-role"))
        val created = service.createTimeEntry(fixture.userId, createRequest(fixture))

        assertNull(service.getTimeEntryById(otherUser, created.id))
        assertFailsWith<ResourceNotFoundException> {
            service.updateTimeEntry(otherUser, created.id, updateRequest(fixture))
        }
        assertFailsWith<ResourceNotFoundException> {
            service.deleteTimeEntry(otherUser, created.id)
        }
    }

    @Test
    fun `invoice linked entry rejects update and delete`() {
        val fixture = seedFixture()
        val invoiceId = ExposedTestDb.seedInvoice(fixture.clientId, fixture.currencyId)
        val entryId =
            ExposedTestDb.seedTimeEntry(
                userId = fixture.userId,
                projectId = fixture.projectId,
                taskId = fixture.taskId,
                invoiceId = invoiceId,
            )
        val before = service.getTimeEntryById(fixture.userId, entryId)

        assertFailsWith<TimeEntryLockedException> {
            service.updateTimeEntry(fixture.userId, entryId, updateRequest(fixture))
        }
        assertFailsWith<TimeEntryLockedException> {
            service.deleteTimeEntry(fixture.userId, entryId)
        }
        assertEquals(before, service.getTimeEntryById(fixture.userId, entryId))
    }

    @Test
    fun `explicitly locked entry rejects update and delete`() {
        val fixture = seedFixture()
        val entryId =
            ExposedTestDb.seedTimeEntry(
                userId = fixture.userId,
                projectId = fixture.projectId,
                taskId = fixture.taskId,
                isLocked = true,
            )
        val before = service.getTimeEntryById(fixture.userId, entryId)

        assertFailsWith<TimeEntryLockedException> {
            service.updateTimeEntry(fixture.userId, entryId, updateRequest(fixture))
        }
        assertFailsWith<TimeEntryLockedException> {
            service.deleteTimeEntry(fixture.userId, entryId)
        }
        assertEquals(before, service.getTimeEntryById(fixture.userId, entryId))
    }

    @Test
    fun `invalid identifiers dates duration and references are rejected clearly`() {
        val fixture = seedFixture()

        assertFailsWith<InvalidTimeEntryException> { service.getTimeEntryById(fixture.userId, "not-a-uuid") }
        assertFailsWith<InvalidTimeEntryException> {
            service.getTimeEntries(fixture.userId, "08-17-2026", "2026-08-23")
        }
        assertFailsWith<InvalidTimeEntryException> {
            service.createTimeEntry(fixture.userId, createRequest(fixture, entryDate = "+12026-08-19"))
        }
        assertFailsWith<InvalidTimeEntryException> {
            service.createTimeEntry(fixture.userId, createRequest(fixture, durationMinutes = 0))
        }
        assertFailsWith<InvalidTimeEntryException> {
            service.createTimeEntry(fixture.userId, createRequest(fixture).copy(startTime = "nine o'clock"))
        }
        assertFailsWith<InvalidTimeEntryException> {
            service.createTimeEntry(fixture.userId, createRequest(fixture, rateCents = -1))
        }
        assertFailsWith<ResourceNotFoundException> {
            service.createTimeEntry(
                fixture.userId,
                createRequest(fixture).copy(projectId = UUID.randomUUID().toString()),
            )
        }
        assertFailsWith<ResourceNotFoundException> {
            service.createTimeEntry(
                fixture.userId,
                createRequest(fixture).copy(taskId = UUID.randomUUID().toString()),
            )
        }
    }

    @Test
    fun `non-billable task produces zero rate and amount and is flagged as not billable`() {
        val roleId = ExposedTestDb.seedRole("freelancer-nb")
        val userId = ExposedTestDb.seedUser("Freelancer", roleId)
        val currencyId = ExposedTestDb.seedCurrency("USD")
        val clientId = ExposedTestDb.seedClient("Client", currencyId, 10_000)
        val projectId = ExposedTestDb.seedProject(clientId, hourlyRateCents = 12_000)
        val taskId = ExposedTestDb.seedTask("Internal", isBillable = false)

        val result = service.createTimeEntry(userId, CreateTimeEntryRequest(
            projectId = projectId,
            taskId = taskId,
            entryDate = "2026-08-19",
            durationMinutes = 60,
        ))

        assertFalse(result.isBillable)
        assertEquals(0, result.rateCents)
        assertEquals(0, result.amountCents)
        assertNull(result.invoiceId)
    }

    @Test
    fun `non-billable project produces zero rate and amount regardless of task billability`() {
        val roleId = ExposedTestDb.seedRole("freelancer-np")
        val userId = ExposedTestDb.seedUser("Freelancer", roleId)
        val currencyId = ExposedTestDb.seedCurrency("USD")
        val clientId = ExposedTestDb.seedClient("Client", currencyId, 10_000)
        val projectId = ExposedTestDb.seedProject(clientId, hourlyRateCents = 12_000, isBillable = false)
        val taskId = ExposedTestDb.seedTask("Development", isBillable = true)

        val result = service.createTimeEntry(userId, CreateTimeEntryRequest(
            projectId = projectId,
            taskId = taskId,
            entryDate = "2026-08-19",
            durationMinutes = 60,
        ))

        assertFalse(result.isBillable)
        assertEquals(0, result.rateCents)
        assertEquals(0, result.amountCents)
        assertNull(result.invoiceId)
    }

    @Test
    fun `billable task in billable project exposes isBillable true with correct amount`() {
        val fixture = seedFixture(projectRateCents = 12_000, clientRateCents = 10_000)

        val result = service.createTimeEntry(fixture.userId, createRequest(fixture, durationMinutes = 60))

        assertTrue(result.isBillable)
        assertEquals(12_000, result.rateCents)
        assertEquals(12_000, result.amountCents)
    }

    @Test
    fun `non-billable entry update preserves zero rate and amount`() {
        val roleId = ExposedTestDb.seedRole("freelancer-nu")
        val userId = ExposedTestDb.seedUser("Freelancer", roleId)
        val currencyId = ExposedTestDb.seedCurrency("USD")
        val clientId = ExposedTestDb.seedClient("Client", currencyId, 10_000)
        val projectId = ExposedTestDb.seedProject(clientId, hourlyRateCents = 12_000)
        val taskId = ExposedTestDb.seedTask("Internal", isBillable = false)

        val created = service.createTimeEntry(userId, CreateTimeEntryRequest(
            projectId = projectId,
            taskId = taskId,
            entryDate = "2026-08-19",
            durationMinutes = 60,
        ))
        val updated = service.updateTimeEntry(userId, created.id, UpdateTimeEntryRequest(
            projectId = projectId,
            taskId = taskId,
            entryDate = "2026-08-20",
            durationMinutes = 90,
            rateCents = 99_999,
        ))

        assertFalse(updated.isBillable)
        assertEquals(0, updated.rateCents)
        assertEquals(0, updated.amountCents)
    }

    private fun seedFixture(
        projectRateCents: Int? = 12_000,
        clientRateCents: Int = 10_000,
    ): Fixture {
        val roleId = ExposedTestDb.seedRole("freelancer")
        val userId = ExposedTestDb.seedUser("Freelancer", roleId)
        val currencyId = ExposedTestDb.seedCurrency("USD")
        val clientId = ExposedTestDb.seedClient("Client Alpha", currencyId, clientRateCents)
        val projectId = ExposedTestDb.seedProject(clientId, "Project Alpha", projectRateCents)
        val taskId = ExposedTestDb.seedTask("Development")
        return Fixture(userId, currencyId, clientId, projectId, taskId)
    }

    private fun createRequest(
        fixture: Fixture,
        entryDate: String = "2026-08-19",
        durationMinutes: Int = 60,
        rateCents: Int? = null,
    ) = CreateTimeEntryRequest(
        projectId = fixture.projectId,
        taskId = fixture.taskId,
        entryDate = entryDate,
        startTime = "09:00",
        endTime = "10:00",
        description = "Implemented the API",
        durationMinutes = durationMinutes,
        rateCents = rateCents,
    )

    private fun updateRequest(
        fixture: Fixture,
        rateCents: Int? = null,
    ) = UpdateTimeEntryRequest(
        projectId = fixture.projectId,
        taskId = fixture.taskId,
        entryDate = "2026-08-20",
        startTime = "10:00",
        endTime = "11:00",
        description = "Updated detail",
        durationMinutes = 60,
        rateCents = rateCents,
    )

    private data class Fixture(
        val userId: String,
        val currencyId: String,
        val clientId: String,
        val projectId: String,
        val taskId: String,
    )
}
