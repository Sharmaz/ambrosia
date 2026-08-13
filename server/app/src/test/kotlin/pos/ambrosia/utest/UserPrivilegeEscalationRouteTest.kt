package pos.ambrosia.utest

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
import pos.ambrosia.api.configureRoles
import pos.ambrosia.api.configureUsers
import pos.ambrosia.api.handler
import pos.ambrosia.utils.ExposedTestDb
import pos.ambrosia.utils.grantPermission
import pos.ambrosia.utils.installAdminAuth
import pos.ambrosia.utils.installNonAdminAuth
import pos.ambrosia.utils.withAuthCookies
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class UserPrivilegeEscalationRouteTest {
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
    fun `user list remains public while user by id requires authentication`() =
        testApplication {
            installAdminAuth()
            val targetRoleId = ExposedTestDb.seedRole("target-role")
            val targetUserId = ExposedTestDb.seedUser("target-user", targetRoleId)
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureUsers()
            }

            assertEquals(HttpStatusCode.OK, client.get("/users").status)
            assertEquals(HttpStatusCode.Unauthorized, client.get("/users/$targetUserId").status)
        }

    @Test
    fun `non admin with users update cannot assign an admin role`() =
        testApplication {
            val auth = installNonAdminAuth()
            grantPermission("non-admin-test-role", "users_update")
            val adminRoleId = ExposedTestDb.seedRole("target-admin-role", isAdmin = true)
            val targetUserId = ExposedTestDb.seedUser("target-user", ExposedTestDb.seedRole("target-role"))
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureUsers()
            }

            val response =
                client.put("/users/$targetUserId") {
                    withAuthCookies(auth)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody("""{"roleId":"$adminRoleId"}""")
                }

            assertEquals(HttpStatusCode.Forbidden, response.status)
        }

    @Test
    fun `non admin with roles update cannot promote a role to admin`() =
        testApplication {
            val auth = installNonAdminAuth()
            grantPermission("non-admin-test-role", "roles_update")
            val targetRoleId = ExposedTestDb.seedRole("target-role")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureRoles()
            }

            val response =
                client.put("/roles/$targetRoleId") {
                    withAuthCookies(auth)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody("""{"role":"Promoted role","isAdmin":true}""")
                }

            assertEquals(HttpStatusCode.Forbidden, response.status)
        }

    @Test
    fun `non admin with users create cannot create a user with an admin role`() =
        testApplication {
            val auth = installNonAdminAuth()
            grantPermission("non-admin-test-role", "users_create")
            val adminRoleId = ExposedTestDb.seedRole("target-admin-role", isAdmin = true)
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureUsers()
            }

            val response =
                client.post("/users") {
                    withAuthCookies(auth)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody("""{"name":"new-admin","pin":"1234","role":"$adminRoleId"}""")
                }

            assertEquals(HttpStatusCode.Forbidden, response.status)
        }

    @Test
    fun `non admin with roles create cannot create an admin role`() =
        testApplication {
            val auth = installNonAdminAuth()
            grantPermission("non-admin-test-role", "roles_create")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureRoles()
            }

            val response =
                client.post("/roles") {
                    withAuthCookies(auth)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody("""{"role":"new-admin-role","isAdmin":true}""")
                }

            assertEquals(HttpStatusCode.Forbidden, response.status)
        }
}
