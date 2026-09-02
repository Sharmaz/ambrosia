package pos.ambrosia.utest

import io.ktor.client.request.forms.MultiPartFormDataContent
import io.ktor.client.request.forms.formData
import io.ktor.client.request.post
import io.ktor.client.request.setBody
import io.ktor.http.HttpStatusCode
import io.ktor.serialization.kotlinx.json.json
import io.ktor.server.application.install
import io.ktor.server.plugins.contentnegotiation.ContentNegotiation
import io.ktor.server.testing.testApplication
import org.junit.After
import org.junit.Before
import pos.ambrosia.api.configureInitialSetup
import pos.ambrosia.api.handler
import pos.ambrosia.utils.ExposedTestDb
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class InitialSetupRestoreRouteTest {
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
    fun `restore returns conflict when initial setup is already completed`() =
        testApplication {
            ExposedTestDb.seedConfig("America/Mexico_City")
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureInitialSetup()
            }

            val response =
                client.post("/initial-setup/restore") {
                    setBody(
                        MultiPartFormDataContent(
                            formData {
                                append("password", "some-password")
                                append("backup", "irrelevant-bytes".toByteArray())
                            },
                        ),
                    )
                }

            assertEquals(HttpStatusCode.Conflict, response.status)
        }

    @Test
    fun `restore returns bad request when the password is missing`() =
        testApplication {
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureInitialSetup()
            }

            val response =
                client.post("/initial-setup/restore") {
                    setBody(
                        MultiPartFormDataContent(
                            formData {
                                append("backup", "irrelevant-bytes".toByteArray())
                            },
                        ),
                    )
                }

            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

    @Test
    fun `restore returns bad request when the backup file is missing`() =
        testApplication {
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureInitialSetup()
            }

            val response =
                client.post("/initial-setup/restore") {
                    setBody(
                        MultiPartFormDataContent(
                            formData {
                                append("password", "some-password")
                            },
                        ),
                    )
                }

            assertEquals(HttpStatusCode.BadRequest, response.status)
        }

    @Test
    fun `restore returns bad request when the backup file is not a valid Ambrosia backup`() =
        testApplication {
            application {
                install(ContentNegotiation) { json() }
                handler()
                configureInitialSetup()
            }

            val response =
                client.post("/initial-setup/restore") {
                    setBody(
                        MultiPartFormDataContent(
                            formData {
                                append("password", "some-password")
                                append("backup", "this is not a real ambrosia backup file".toByteArray())
                            },
                        ),
                    )
                }

            assertEquals(HttpStatusCode.BadRequest, response.status)
        }
}
