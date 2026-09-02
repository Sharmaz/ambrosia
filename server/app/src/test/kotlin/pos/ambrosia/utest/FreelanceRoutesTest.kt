package pos.ambrosia.utest

import io.ktor.client.request.delete
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.put
import io.ktor.client.request.setBody
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.testing.testApplication
import org.junit.After
import org.junit.Before
import pos.ambrosia.api.configureClients
import pos.ambrosia.api.configureProjects
import pos.ambrosia.api.handler
import pos.ambrosia.services.PermissionsService
import pos.ambrosia.utils.ExposedTestDb
import pos.ambrosia.utils.installAdminAuth
import pos.ambrosia.utils.withAuthCookies
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class FreelanceRoutesTest {
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
    fun `client routes create list get update and soft delete clients`() =
        testApplication {
            val authCookies = installAdminAuth()
            grantFreelancePermissions("admin-test-role", clientPermissions)
            val currencyId = ExposedTestDb.seedCurrency("USD")
            val clientId = ExposedTestDb.seedFreelanceClient(currencyId = currencyId)
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureClients()
            }

            val createClientResponse =
                client.post("/clients") {
                    withAuthCookies(authCookies)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody(
                        """{
                            "name":"Acme",
                            "currencyId":"$currencyId",
                            "hourlyRateCents":7500,
                            "billingCycle":"monthly",
                            "paymentMethod":"bank"
                        }""",
                    )
                }
            val listClientsResponse = client.get("/clients") { withAuthCookies(authCookies) }
            val getClientResponse = client.get("/clients/$clientId") { withAuthCookies(authCookies) }
            val updateClientResponse =
                client.put("/clients/$clientId") {
                    withAuthCookies(authCookies)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody(
                        """{
                            "name":"Updated",
                            "currencyId":"$currencyId",
                            "hourlyRateCents":9000,
                            "billingCycle":"weekly",
                            "paymentMethod":"lightning"
                        }""",
                    )
                }
            val deleteClientResponse = client.delete("/clients/$clientId") { withAuthCookies(authCookies) }
            val getDeletedClientResponse = client.get("/clients/$clientId") { withAuthCookies(authCookies) }

            assertEquals(HttpStatusCode.Created, createClientResponse.status)
            assertEquals(HttpStatusCode.OK, listClientsResponse.status)
            assertEquals(HttpStatusCode.OK, getClientResponse.status)
            assertEquals(HttpStatusCode.OK, updateClientResponse.status)
            assertEquals(HttpStatusCode.NoContent, deleteClientResponse.status)
            assertEquals(HttpStatusCode.NotFound, getDeletedClientResponse.status)
        }

    @Test
    fun `client project routes create and list projects under a client`() =
        testApplication {
            val authCookies = installAdminAuth()
            grantFreelancePermissions("admin-test-role", clientPermissions + projectPermissions)
            val clientId = ExposedTestDb.seedFreelanceClient()
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureClients()
            }

            val createProjectResponse =
                client.post("/clients/$clientId/projects") {
                    withAuthCookies(authCookies)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody(
                        """{
                            "name":"Website",
                            "status":"in_progress",
                            "hourlyRateCents":8000,
                            "isBillable":true
                        }""",
                    )
                }
            val listProjectsResponse = client.get("/clients/$clientId/projects") { withAuthCookies(authCookies) }
            val missingClientProjectsResponse =
                client.get("/clients/00000000-0000-0000-0000-000000000000/projects") {
                    withAuthCookies(authCookies)
                }

            assertEquals(HttpStatusCode.Created, createProjectResponse.status)
            assertEquals(HttpStatusCode.OK, listProjectsResponse.status)
            assertEquals(HttpStatusCode.NotFound, missingClientProjectsResponse.status)
        }

    @Test
    fun `project routes get update and soft delete projects`() =
        testApplication {
            val authCookies = installAdminAuth()
            grantFreelancePermissions("admin-test-role", projectPermissions)
            val projectId = ExposedTestDb.seedFreelanceProject()
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureProjects()
            }

            val getProjectResponse = client.get("/projects/$projectId") { withAuthCookies(authCookies) }
            val updateProjectResponse =
                client.put("/projects/$projectId") {
                    withAuthCookies(authCookies)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody(
                        """{
                            "name":"Updated",
                            "status":"done",
                            "hourlyRateCents":8500,
                            "isBillable":false
                        }""",
                    )
                }
            val deleteProjectResponse = client.delete("/projects/$projectId") { withAuthCookies(authCookies) }
            val getDeletedProjectResponse = client.get("/projects/$projectId") { withAuthCookies(authCookies) }

            assertEquals(HttpStatusCode.OK, getProjectResponse.status)
            assertEquals(HttpStatusCode.OK, updateProjectResponse.status)
            assertEquals(HttpStatusCode.NoContent, deleteProjectResponse.status)
            assertEquals(HttpStatusCode.NotFound, getDeletedProjectResponse.status)
        }

    @Test
    fun `freelance routes require matching permissions`() =
        testApplication {
            val authCookies = installAdminAuth()
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureClients()
                configureProjects()
            }
            val projectId = ExposedTestDb.seedFreelanceProject()

            assertEquals(HttpStatusCode.Forbidden, client.get("/clients") { withAuthCookies(authCookies) }.status)
            assertEquals(
                HttpStatusCode.Forbidden,
                client.get("/projects/$projectId") { withAuthCookies(authCookies) }.status,
            )
        }

    private fun grantFreelancePermissions(
        roleName: String,
        permissions: List<String>,
    ) {
        val roleId = ExposedTestDb.seedRole(roleName, isAdmin = true)
        permissions.forEach { permissionName -> ExposedTestDb.seedPermission(permissionName) }
        PermissionsService().replaceRolePermissions(roleId, permissions)
    }

    private companion object {
        val clientPermissions =
            listOf(
                "clients_read",
                "clients_create",
                "clients_update",
                "clients_delete",
            )
        val projectPermissions =
            listOf(
                "projects_read",
                "projects_create",
                "projects_update",
                "projects_delete",
            )
    }
}
