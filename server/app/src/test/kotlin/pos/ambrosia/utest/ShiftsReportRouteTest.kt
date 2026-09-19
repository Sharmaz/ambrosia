package pos.ambrosia.utest

import io.ktor.client.request.get
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.testing.testApplication
import org.junit.After
import org.junit.Before
import pos.ambrosia.api.configureShifts
import pos.ambrosia.api.handler
import pos.ambrosia.utils.ExposedTestDb
import pos.ambrosia.utils.grantPermission
import pos.ambrosia.utils.installAdminAuth
import pos.ambrosia.utils.installNonAdminAuth
import pos.ambrosia.utils.withAuthCookies
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class ShiftsReportRouteTest {
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
    fun `admin with shifts_report_read permission can fetch the shifts report`() =
        testApplication {
            val adminAuthCookies = installAdminAuth()
            grantPermission("admin-test-role", "shifts_report_read")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureShifts()
            }

            val response =
                client.get("/shifts/report?period=month") { withAuthCookies(adminAuthCookies) }

            assertEquals(HttpStatusCode.OK, response.status)
        }

    @Test
    fun `admin without shifts_report_read permission is denied`() =
        testApplication {
            val adminAuthCookies = installAdminAuth()
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureShifts()
            }

            val response =
                client.get("/shifts/report?period=month") { withAuthCookies(adminAuthCookies) }

            assertEquals(HttpStatusCode.Forbidden, response.status)
        }

    @Test
    fun `non admin with shifts_report_read permission is still denied`() =
        testApplication {
            val nonAdminAuthCookies = installNonAdminAuth()
            grantPermission("non-admin-test-role", "shifts_report_read")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureShifts()
            }

            val response =
                client.get("/shifts/report?period=month") { withAuthCookies(nonAdminAuthCookies) }

            assertEquals(HttpStatusCode.Forbidden, response.status)
        }

    @Test
    fun `shifts report rejects an invalid period`() =
        testApplication {
            val adminAuthCookies = installAdminAuth()
            grantPermission("admin-test-role", "shifts_report_read")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureShifts()
            }

            val response =
                client.get("/shifts/report?period=decade") { withAuthCookies(adminAuthCookies) }

            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

    @Test
    fun `shifts report requires either period or a full date range`() =
        testApplication {
            val adminAuthCookies = installAdminAuth()
            grantPermission("admin-test-role", "shifts_report_read")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureShifts()
            }

            val response = client.get("/shifts/report") { withAuthCookies(adminAuthCookies) }

            assertEquals(HttpStatusCode.BadRequest, response.status)
        }
}
