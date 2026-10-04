package pos.ambrosia.utest

import io.ktor.server.engine.applicationEnvironment
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Before
import pos.ambrosia.models.User
import pos.ambrosia.services.AuthService
import pos.ambrosia.services.UsersService
import pos.ambrosia.utils.ExposedTestDb
import pos.ambrosia.utils.testJwtConfig
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

class AuthServiceTest {
    private val environment = applicationEnvironment { config = testJwtConfig() }
    private val usersService = UsersService(environment)
    private val service = AuthService(environment)
    private lateinit var dbFile: File

    @Before
    fun setUp() {
        dbFile = ExposedTestDb.connect()
    }

    @After
    fun tearDown() {
        ExposedTestDb.cleanup(dbFile)
    }

    @Test
    fun `authenticateUser returns the original email and phone, not the stored ciphertext`() {
        runBlocking {
            val roleId = ExposedTestDb.seedRole("Cashier", isAdmin = false)
            usersService.addUser(
                User(name = "cashier-user", pin = "1234", role = roleId, email = "cashier@example.com", phone = "+1-555-0100"),
            )

            val authenticatedUser = service.authenticateUser("cashier-user", "1234".toCharArray())

            assertNotNull(authenticatedUser)
            assertEquals("cashier@example.com", authenticatedUser.email)
            assertEquals("+1-555-0100", authenticatedUser.phone)
        }
    }

    @Test
    fun `authenticateUser returns null email and phone for a user that never set them`() {
        runBlocking {
            val roleId = ExposedTestDb.seedRole("Cashier", isAdmin = false)
            usersService.addUser(User(name = "cashier-user", pin = "1234", role = roleId))

            val authenticatedUser = service.authenticateUser("cashier-user", "1234".toCharArray())

            assertNotNull(authenticatedUser)
            assertNull(authenticatedUser.email)
            assertNull(authenticatedUser.phone)
        }
    }
}
