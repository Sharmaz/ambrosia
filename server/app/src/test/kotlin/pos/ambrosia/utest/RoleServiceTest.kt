package pos.ambrosia.utest

import io.ktor.server.config.MapApplicationConfig
import io.ktor.server.engine.applicationEnvironment
import kotlinx.coroutines.runBlocking
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.After
import org.junit.Before
import pos.ambrosia.db.tables.UserEntity
import pos.ambrosia.models.Role
import pos.ambrosia.services.PermissionsService
import pos.ambrosia.services.RolesService
import pos.ambrosia.utils.ExposedTestDb
import pos.ambrosia.utils.LastAdminRemovalException
import java.io.File
import java.util.UUID
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class RoleServiceTest {
    private val env = applicationEnvironment { config = MapApplicationConfig("secret" to "test-secret") }
    private val service = RolesService(env)
    private val permissionsService = PermissionsService()
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
    fun `addRole returns null if role name is blank`() {
        runBlocking {
            val result = service.addRole(Role(role = "  "))
            assertNull(result)
        }
    }

    @Test
    fun `addRole returns null if role name already exists`() {
        runBlocking {
            ExposedTestDb.seedRole("Cashier")
            val result = service.addRole(Role(role = "Cashier"))
            assertNull(result)
        }
    }

    @Test
    fun `addRole returns new ID on success`() {
        runBlocking {
            val result = service.addRole(Role(role = "Cashier", password = "1234", isAdmin = false))
            assertNotNull(result)
        }
    }

    @Test
    fun `addRole assigns all enabled permissions when isAdmin is true`() {
        runBlocking {
            ExposedTestDb.seedPermission("perm.read", "Read")
            ExposedTestDb.seedPermission("perm.write", "Write")

            val roleId = service.addRole(Role(role = "Admin", password = "1234", isAdmin = true))

            assertNotNull(roleId)
            val names = permissionsService.getByRole(roleId!!)!!.map { it.name }
            assertEquals(listOf("perm.read", "perm.write"), names)
        }
    }

    @Test
    fun `addRole does not assign permissions when isAdmin is false`() {
        runBlocking {
            ExposedTestDb.seedPermission("perm.read", "Read")

            val roleId = service.addRole(Role(role = "Cashier", password = "1234", isAdmin = false))

            assertNotNull(roleId)
            assertTrue(permissionsService.getByRole(roleId!!)!!.isEmpty())
        }
    }

    @Test
    fun `updateRole returns false if role name is blank`() {
        runBlocking {
            val result = service.updateRole("some-id", Role(role = "  "))
            assertFalse(result)
        }
    }

    @Test
    fun `updateRole returns false if id is null`() {
        runBlocking {
            val result = service.updateRole(null, Role(role = "Cashier"))
            assertFalse(result)
        }
    }

    @Test
    fun `updateRole returns false if role name already exists`() {
        runBlocking {
            ExposedTestDb.seedRole("Manager")
            val roleId = ExposedTestDb.seedRole("Cashier")
            val result = service.updateRole(roleId, Role(role = "Manager"))
            assertFalse(result)
        }
    }

    @Test
    fun `updateRole returns false when not found`() {
        runBlocking {
            val result = service.updateRole(UUID.randomUUID().toString(), Role(role = "Cashier"))
            assertFalse(result)
        }
    }

    @Test
    fun `updateRole returns true on success`() {
        runBlocking {
            val roleId = ExposedTestDb.seedRole("Cashier", isAdmin = false)
            val result = service.updateRole(roleId, Role(role = "Manager", isAdmin = false))
            assertTrue(result)

            val updated = service.getRoleById(roleId)
            assertEquals("Manager", updated?.role)
        }
    }

    @Test
    fun `updateRole assigns all enabled permissions when isAdmin becomes true`() {
        runBlocking {
            val roleId = ExposedTestDb.seedRole("Cashier", isAdmin = false)
            ExposedTestDb.seedPermission("perm.read", "Read")
            ExposedTestDb.seedPermission("perm.write", "Write")

            val result = service.updateRole(roleId, Role(role = "Manager", isAdmin = true))

            assertTrue(result)
            val names = permissionsService.getByRole(roleId)!!.map { it.name }
            assertEquals(listOf("perm.read", "perm.write"), names)
        }
    }

    @Test
    fun `getRoles returns list of roles when found`() {
        runBlocking {
            ExposedTestDb.seedRole("Admin", isAdmin = true)
            ExposedTestDb.seedRole("Cashier", isAdmin = false)

            val result = service.getRoles()
            assertEquals(2, result.size)
            assertTrue(result.any { it.role == "Admin" && it.isAdmin == true })
            assertTrue(result.any { it.role == "Cashier" && it.isAdmin == false })
            assertTrue(result.all { it.password == "********" })
        }
    }

    @Test
    fun `getRoles returns empty list when none found`() {
        runBlocking {
            val result = service.getRoles()
            assertTrue(result.isEmpty())
        }
    }

    @Test
    fun `getRoleById returns role when found`() {
        runBlocking {
            val roleId = ExposedTestDb.seedRole("Admin", isAdmin = true)
            val result = service.getRoleById(roleId)
            assertNotNull(result)
            assertEquals(roleId, result.id)
            assertEquals("Admin", result.role)
            assertEquals(true, result.isAdmin)
        }
    }

    @Test
    fun `getRoleById returns null when not found`() {
        runBlocking {
            val result = service.getRoleById(UUID.randomUUID().toString())
            assertNull(result)
        }
    }

    @Test
    fun `deleteRole unassigns users and returns true on success`() {
        runBlocking {
            val roleId = ExposedTestDb.seedRole("Cashier", isAdmin = false)
            val userId = ExposedTestDb.seedUser("Bob", roleId)

            val result = service.deleteRole(roleId)
            assertTrue(result)
            assertNull(service.getRoleById(roleId))

            transaction {
                val user = UserEntity.findById(UUID.fromString(userId))!!
                assertNull(user.roleId)
            }
        }
    }

    @Test
    fun `deleteRole returns false when role not found`() {
        runBlocking {
            val roleId = UUID.randomUUID().toString()
            val result = service.deleteRole(roleId)
            assertFalse(result)
        }
    }

    @Test
    fun `deleteRole blocks deleting last admin role in use`() {
        runBlocking {
            val roleId = ExposedTestDb.seedRole("Admin", isAdmin = true)
            ExposedTestDb.seedUser("admin-user", roleId = roleId)

            assertFailsWith<LastAdminRemovalException> {
                service.deleteRole(roleId)
            }
            assertNotNull(service.getRoleById(roleId))
        }
    }

    @Test
    fun `updateRole blocks removing admin from last admin role in use`() {
        runBlocking {
            val roleId = ExposedTestDb.seedRole("Admin", isAdmin = true)
            ExposedTestDb.seedUser("admin-user", roleId = roleId)

            assertFailsWith<LastAdminRemovalException> {
                service.updateRole(roleId, Role(role = "Cashier", isAdmin = false))
            }
        }
    }
}
