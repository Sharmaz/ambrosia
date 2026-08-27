package pos.ambrosia.utest

import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.After
import org.junit.Before
import pos.ambrosia.api.configureTimeEntries
import pos.ambrosia.api.handler
import pos.ambrosia.db.tables.TimeEntryEntity
import pos.ambrosia.db.tables.UserEntity
import pos.ambrosia.db.tables.UsersTable
import pos.ambrosia.models.TimeEntryResponse
import pos.ambrosia.utils.ExposedTestDb
import pos.ambrosia.utils.grantPermission
import pos.ambrosia.utils.grantPermissions
import pos.ambrosia.utils.installNonAdminAuth
import pos.ambrosia.utils.withAuthCookies
import java.io.File
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

class TimeEntriesRouteTest {
    private lateinit var databaseFile: File

    @Before
    fun setUp() {
        databaseFile = ExposedTestDb.connect()
    }

    @After
    fun tearDown() {
        ExposedTestDb.cleanup(databaseFile)
    }

    @Test
    fun `routes require authentication and the matching permission`() =
        testApplication {
            val auth = installNonAdminAuth("time-no-permission", "time-no-permission-user")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureTimeEntries()
            }

            assertEquals(
                HttpStatusCode.Unauthorized,
                client.get("/time-entries?from=2026-08-17&to=2026-08-23").status,
            )
            assertEquals(HttpStatusCode.Unauthorized, client.post("/time-entries").status)
            assertEquals(HttpStatusCode.Unauthorized, client.put("/time-entries/${UUID.randomUUID()}").status)
            assertEquals(HttpStatusCode.Unauthorized, client.delete("/time-entries/${UUID.randomUUID()}").status)

            assertEquals(
                HttpStatusCode.Forbidden,
                client
                    .get("/time-entries?from=2026-08-17&to=2026-08-23") {
                        withAuthCookies(auth)
                    }.status,
            )
            assertEquals(
                HttpStatusCode.Forbidden,
                client.post("/time-entries") { withAuthCookies(auth) }.status,
            )
            assertEquals(
                HttpStatusCode.Forbidden,
                client.put("/time-entries/${UUID.randomUUID()}") { withAuthCookies(auth) }.status,
            )
            assertEquals(
                HttpStatusCode.Forbidden,
                client.delete("/time-entries/${UUID.randomUUID()}") { withAuthCookies(auth) }.status,
            )
        }

    @Test
    fun `post uses authenticated user and returns enriched entry`() =
        testApplication {
            val auth = installNonAdminAuth("time-create-role", "time-create-user")
            grantPermission("time-create-role", "time_entries_create")
            val fixture = seedFixture()
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureTimeEntries()
            }

            val response =
                client.post("/time-entries") {
                    withAuthCookies(auth)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody(requestBody(fixture.projectId, fixture.taskId))
                }

            assertEquals(HttpStatusCode.Created, response.status)
            val body = Json.decodeFromString<TimeEntryResponse>(response.bodyAsText())
            assertEquals(authenticatedUserId("time-create-user"), body.userId)
            assertEquals("Project Alpha", body.projectName)
            assertEquals("Development", body.taskName)
            assertEquals(12_000, body.rateCents)
            assertEquals(3_400, body.amountCents)
        }

    @Test
    fun `get requires from and to and returns weekly entries`() =
        testApplication {
            val auth = installNonAdminAuth("time-read-role", "time-read-user")
            grantPermission("time-read-role", "time_entries_read")
            val fixture = seedFixture()
            val userId = authenticatedUserId("time-read-user")
            ExposedTestDb.seedTimeEntry(userId, fixture.projectId, fixture.taskId, "2026-08-19")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureTimeEntries()
            }

            assertEquals(
                HttpStatusCode.BadRequest,
                client.get("/time-entries?from=2026-08-17") { withAuthCookies(auth) }.status,
            )
            val response =
                client.get("/time-entries?from=2026-08-17&to=2026-08-23") {
                    withAuthCookies(auth)
                }
            assertEquals(HttpStatusCode.OK, response.status)
            assertEquals(1, Json.decodeFromString<List<TimeEntryResponse>>(response.bodyAsText()).size)
        }

    @Test
    fun `put rejects an invoice linked entry with conflict`() =
        testApplication {
            val auth = installNonAdminAuth("time-update-role", "time-update-user")
            grantPermission("time-update-role", "time_entries_update")
            val fixture = seedFixture()
            val userId = authenticatedUserId("time-update-user")
            val invoiceId = ExposedTestDb.seedInvoice(fixture.clientId, fixture.currencyId)
            val entryId =
                ExposedTestDb.seedTimeEntry(userId, fixture.projectId, fixture.taskId, invoiceId = invoiceId)
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureTimeEntries()
            }

            val response =
                client.put("/time-entries/$entryId") {
                    withAuthCookies(auth)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody(requestBody(fixture.projectId, fixture.taskId))
                }

            assertEquals(HttpStatusCode.Conflict, response.status)
        }

    @Test
    fun `delete removes an unlocked entry and rejects a locked entry`() =
        testApplication {
            val auth = installNonAdminAuth("time-delete-role", "time-delete-user")
            grantPermission("time-delete-role", "time_entries_delete")
            val fixture = seedFixture()
            val userId = authenticatedUserId("time-delete-user")
            val unlockedId = ExposedTestDb.seedTimeEntry(userId, fixture.projectId, fixture.taskId)
            val lockedId = ExposedTestDb.seedTimeEntry(userId, fixture.projectId, fixture.taskId, isLocked = true)
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureTimeEntries()
            }

            assertEquals(
                HttpStatusCode.NoContent,
                client.delete("/time-entries/$unlockedId") { withAuthCookies(auth) }.status,
            )
            assertEquals(
                HttpStatusCode.Conflict,
                client.delete("/time-entries/$lockedId") { withAuthCookies(auth) }.status,
            )
        }

    @Test
    fun `malformed id and invalid request return bad request`() =
        testApplication {
            val auth = installNonAdminAuth("time-invalid-role", "time-invalid-user")
            grantPermissions("time-invalid-role", "time_entries_read", "time_entries_create")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureTimeEntries()
            }

            assertEquals(
                HttpStatusCode.BadRequest,
                client.get("/time-entries/not-a-uuid") { withAuthCookies(auth) }.status,
            )
            assertEquals(
                HttpStatusCode.BadRequest,
                client.get("/time-entries?from=2026-08-24&to=2026-08-17") { withAuthCookies(auth) }.status,
            )
            val malformedBodyResponse =
                client.post("/time-entries") {
                    withAuthCookies(auth)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody("{")
                }
            assertEquals(HttpStatusCode.BadRequest, malformedBodyResponse.status)
        }

    @Test
    fun `routes complete create read update and physical delete`() =
        testApplication {
            val auth = installNonAdminAuth("time-crud-role", "time-crud-user")
            grantPermissions(
                "time-crud-role",
                "time_entries_read",
                "time_entries_create",
                "time_entries_update",
                "time_entries_delete",
            )
            val fixture = seedFixture()
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureTimeEntries()
            }

            val createdResponse =
                client.post("/time-entries") {
                    withAuthCookies(auth)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody(requestBody(fixture.projectId, fixture.taskId))
                }
            assertEquals(HttpStatusCode.Created, createdResponse.status)
            val created = Json.decodeFromString<TimeEntryResponse>(createdResponse.bodyAsText())

            val getResponse = client.get("/time-entries/${created.id}") { withAuthCookies(auth) }
            assertEquals(HttpStatusCode.OK, getResponse.status)
            assertEquals(created.id, Json.decodeFromString<TimeEntryResponse>(getResponse.bodyAsText()).id)

            val putResponse =
                client.put("/time-entries/${created.id}") {
                    withAuthCookies(auth)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody(
                        requestBody(
                            fixture.projectId,
                            fixture.taskId,
                            entryDate = "2026-08-20",
                            description = "Updated detail",
                            durationMinutes = 18,
                        ),
                    )
                }
            assertEquals(HttpStatusCode.OK, putResponse.status)
            val updated = Json.decodeFromString<TimeEntryResponse>(putResponse.bodyAsText())
            assertEquals("2026-08-20", updated.entryDate)
            assertEquals("Updated detail", updated.description)
            assertEquals(18, updated.durationMinutes)

            assertEquals(
                HttpStatusCode.NoContent,
                client.delete("/time-entries/${created.id}") { withAuthCookies(auth) }.status,
            )
            assertEquals(
                HttpStatusCode.NotFound,
                client.get("/time-entries/${created.id}") { withAuthCookies(auth) }.status,
            )
            transaction {
                assertNull(TimeEntryEntity.findById(UUID.fromString(created.id)))
            }
        }

    private fun seedFixture(): Fixture {
        val currencyId = ExposedTestDb.seedCurrency("USD")
        val clientId = ExposedTestDb.seedClient("Client Alpha", currencyId, 10_000)
        val projectId = ExposedTestDb.seedProject(clientId, "Project Alpha", 12_000)
        val taskId = ExposedTestDb.seedTask("Development")
        return Fixture(currencyId, clientId, projectId, taskId)
    }

    private fun authenticatedUserId(name: String): String =
        transaction {
            UserEntity
                .find { UsersTable.name eq name }
                .single()
                .id.value
                .toString()
        }

    private fun requestBody(
        projectId: String,
        taskId: String,
        entryDate: String = "2026-08-19",
        description: String = "Implemented the API",
        durationMinutes: Int = 17,
    ): String =
        """
        {
            "projectId":"$projectId",
            "taskId":"$taskId",
            "entryDate":"$entryDate",
            "startTime":"09:00",
            "endTime":"10:00",
            "description":"$description",
            "durationMinutes":$durationMinutes,
            "rateCents":null
        }
        """.trimIndent()

    private data class Fixture(
        val currencyId: String,
        val clientId: String,
        val projectId: String,
        val taskId: String,
    )
}
