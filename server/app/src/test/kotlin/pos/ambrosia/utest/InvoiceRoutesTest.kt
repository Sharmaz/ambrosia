package pos.ambrosia.utest

import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.testing.testApplication
import kotlinx.serialization.json.Json
import org.junit.After
import org.junit.Before
import pos.ambrosia.api.configureInvoices
import pos.ambrosia.api.handler
import pos.ambrosia.models.InvoiceResponse
import pos.ambrosia.utils.ExposedTestDb
import pos.ambrosia.utils.grantPermissions
import pos.ambrosia.utils.installNonAdminAuth
import pos.ambrosia.utils.withAuthCookies
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class InvoiceRoutesTest {
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
    fun `invoice routes require matching permissions`() =
        testApplication {
            val authWithoutPermission = installNonAdminAuth("invoice-no-permission", "invoice-no-permission-user")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureInvoices()
            }

            assertEquals(HttpStatusCode.Unauthorized, client.get("/freelance/invoices").status)
            assertEquals(
                HttpStatusCode.Forbidden,
                client.get("/freelance/invoices") { withAuthCookies(authWithoutPermission) }.status,
            )
        }

    @Test
    fun `post creates draft invoice and get returns the invoice detail`() =
        testApplication {
            val authWithPermission = installNonAdminAuth("invoice-create-read", "invoice-create-read-user")
            grantPermissions("invoice-create-read", "invoices_create", "invoices_read")
            val invoiceFixture = createInvoiceFixture()
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureInvoices()
            }

            val createInvoiceResponse =
                client.post("/freelance/invoices") {
                    withAuthCookies(authWithPermission)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody(
                        """{
                            "clientId":"${invoiceFixture.clientId}",
                            "periodStart":"2026-08-17",
                            "periodEnd":"2026-08-23"
                        }""",
                    )
                }
            val createdInvoice = Json.decodeFromString<InvoiceResponse>(createInvoiceResponse.bodyAsText())
            val listInvoicesResponse = client.get("/freelance/invoices") { withAuthCookies(authWithPermission) }
            val listedInvoices = Json.decodeFromString<List<InvoiceResponse>>(listInvoicesResponse.bodyAsText())
            val getInvoiceResponse = client.get("/freelance/invoices/${createdInvoice.id}") { withAuthCookies(authWithPermission) }
            val retrievedInvoice = Json.decodeFromString<InvoiceResponse>(getInvoiceResponse.bodyAsText())

            assertEquals(HttpStatusCode.Created, createInvoiceResponse.status)
            assertEquals(HttpStatusCode.OK, listInvoicesResponse.status)
            assertEquals(HttpStatusCode.OK, getInvoiceResponse.status)
            assertEquals(createdInvoice.id, listedInvoices.single().id)
            assertEquals(createdInvoice.id, retrievedInvoice.id)
            assertEquals(10_000, retrievedInvoice.totalCents)
            assertEquals(1, retrievedInvoice.lineItems.size)
        }

    @Test
    fun `missing invoice returns not found`() =
        testApplication {
            val authWithPermission = installNonAdminAuth("invoice-read", "invoice-read-user")
            grantPermissions("invoice-read", "invoices_read")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureInvoices()
            }

            val missingInvoiceResponse =
                client.get("/freelance/invoices/00000000-0000-0000-0000-000000000000") {
                    withAuthCookies(authWithPermission)
                }

            assertEquals(HttpStatusCode.NotFound, missingInvoiceResponse.status)
        }

    @Test
    fun `invalid invoice payload returns bad request`() =
        testApplication {
            val authWithPermission = installNonAdminAuth("invoice-create", "invoice-create-user")
            grantPermissions("invoice-create", "invoices_create")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureInvoices()
            }

            val invalidInvoiceResponse =
                client.post("/freelance/invoices") {
                    withAuthCookies(authWithPermission)
                    header(HttpHeaders.ContentType, "application/json")
                    setBody("""{"clientId":"not-a-uuid"}""")
                }

            assertEquals(HttpStatusCode.BadRequest, invalidInvoiceResponse.status)
        }

    private fun createInvoiceFixture(): InvoiceRouteFixture {
        val currencyId = ExposedTestDb.seedCurrency("USD")
        val payoutAccountId = ExposedTestDb.seedPayoutAccount(currencyId = currencyId)
        val clientId = ExposedTestDb.seedFreelanceClient(currencyId = currencyId, payoutAccountId = payoutAccountId)
        val projectId = ExposedTestDb.seedFreelanceProject(clientId = clientId, hourlyRateCents = 10_000)
        val taskId = ExposedTestDb.seedTask("Development")
        ExposedTestDb.seedTimeEntry(projectId, taskId, entryDate = "2026-08-19", durationMinutes = 60)
        return InvoiceRouteFixture(clientId = clientId)
    }

    private data class InvoiceRouteFixture(
        val clientId: String,
    )
}
