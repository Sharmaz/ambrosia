package pos.ambrosia.utest

import kotlinx.serialization.json.Json
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.junit.After
import org.junit.Before
import pos.ambrosia.models.BackupManifest
import pos.ambrosia.services.BackupService
import pos.ambrosia.utils.ExposedTestDb
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.security.SecureRandom
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream
import javax.crypto.BadPaddingException
import javax.crypto.Cipher
import javax.crypto.CipherOutputStream
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertFalse
import kotlin.test.assertTrue

private const val TEST_SECRET = "test-secret-value"

class BackupServiceTest {
    private lateinit var databaseFile: File
    private lateinit var uploadsRoot: Path
    private lateinit var configFile: File
    private lateinit var importStagingRoot: Path

    @Before
    fun setUp() {
        databaseFile = ExposedTestDb.connect()
        uploadsRoot = Files.createTempDirectory("backupServiceTestUploads")
        configFile = Files.createTempFile("backupServiceTestConfig", ".conf").toFile()
        configFile.writeText("secret=$TEST_SECRET\n")
        importStagingRoot = Files.createTempDirectory("backupServiceTestStagingParent").resolve("import-staging")
    }

    @After
    fun tearDown() {
        ExposedTestDb.cleanup(databaseFile)
    }

    private fun decryptBackup(
        encryptedBackup: ByteArray,
        password: CharArray,
    ): ByteArray {
        val magicHeader = "AMBROSIA-BACKUP-1".toByteArray(Charsets.UTF_8)
        val salt = encryptedBackup.copyOfRange(magicHeader.size, magicHeader.size + 16)
        val initializationVector = encryptedBackup.copyOfRange(magicHeader.size + 16, magicHeader.size + 16 + 12)
        val ciphertext = encryptedBackup.copyOfRange(magicHeader.size + 16 + 12, encryptedBackup.size)

        val secretKeyFactory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val keyDerivationSpec = PBEKeySpec(password, salt, 10000, 256)
        val secretKey = SecretKeySpec(secretKeyFactory.generateSecret(keyDerivationSpec).encoded, "AES")

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, secretKey, GCMParameterSpec(128, initializationVector))
        return cipher.doFinal(ciphertext)
    }

    private fun zipEntryNames(zipBytes: ByteArray): List<String> {
        val entryNames = mutableListOf<String>()
        ZipInputStream(zipBytes.inputStream()).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                entryNames.add(entry.name)
                entry = zip.nextEntry
            }
        }
        return entryNames
    }

    private fun readZipEntry(
        zipBytes: ByteArray,
        entryName: String,
    ): String {
        ZipInputStream(zipBytes.inputStream()).use { zip ->
            var entry = zip.nextEntry
            while (entry != null) {
                if (entry.name == entryName) return zip.readBytes().toString(Charsets.UTF_8)
                entry = zip.nextEntry
            }
        }
        throw NoSuchElementException("Zip entry not found: $entryName")
    }

    @Test
    fun `prepareExportSnapshot creates a readable database snapshot file`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath)

        val databaseSnapshot = backupService.prepareExportSnapshot()

        assertTrue(Files.exists(databaseSnapshot))
        assertTrue(Files.size(databaseSnapshot) > 0)
        Files.deleteIfExists(databaseSnapshot)
    }

    @Test
    fun `calculateExportTotalBytes sums the database snapshot size and every file under uploads`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath)
        Files.write(uploadsRoot.resolve("product-1.jpg"), ByteArray(100))
        val nestedDirectory = Files.createDirectory(uploadsRoot.resolve("nested"))
        Files.write(nestedDirectory.resolve("product-2.jpg"), ByteArray(50))

        val databaseSnapshot = backupService.prepareExportSnapshot()
        val totalExportBytes = backupService.calculateExportTotalBytes(databaseSnapshot)

        assertEquals(Files.size(databaseSnapshot) + 150, totalExportBytes)
        Files.deleteIfExists(databaseSnapshot)
    }

    @Test
    fun `calculateExportTotalBytes counts only the database snapshot when uploads is empty`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath)

        val databaseSnapshot = backupService.prepareExportSnapshot()
        val totalExportBytes = backupService.calculateExportTotalBytes(databaseSnapshot)

        assertEquals(Files.size(databaseSnapshot), totalExportBytes)
        Files.deleteIfExists(databaseSnapshot)
    }

    @Test
    fun `exportBackup produces a zip decryptable with the same password, containing manifest and db snapshot`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath)
        val output = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), output)

        val decryptedZip = decryptBackup(output.toByteArray(), "correct-password".toCharArray())
        val entries = zipEntryNames(decryptedZip)

        assertTrue(entries.contains("manifest.json"))
        assertTrue(entries.contains("ambrosia.db"))
    }

    @Test
    fun `exportBackup manifest contains the business name`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath)
        val output = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), output)

        val decryptedZip = decryptBackup(output.toByteArray(), "correct-password".toCharArray())
        val manifestJson = readZipEntry(decryptedZip, "manifest.json")

        assertTrue(manifestJson.contains("\"businessName\":\"My Test Store\""))
    }

    @Test
    fun `exportBackup manifest contains the secret from ambrosia conf`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath)
        val output = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), output)

        val decryptedZip = decryptBackup(output.toByteArray(), "correct-password".toCharArray())
        val manifestJson = readZipEntry(decryptedZip, "manifest.json")

        assertTrue(manifestJson.contains("\"secret\":\"$TEST_SECRET\""))
    }

    @Test
    fun `exportBackup throws when ambrosia conf has no secret`() {
        configFile.writeText("nwc-uri=nostr+walletconnect://example\n")
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath)
        val output = ByteArrayOutputStream()

        assertFailsWith<IllegalStateException> {
            backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), output)
        }
    }

    @Test
    fun `exportBackup includes files from the uploads directory`() {
        val dateDir = Files.createDirectory(uploadsRoot.resolve("2026-08-24"))
        Files.write(dateDir.resolve("logo.png"), "fake-image-bytes".toByteArray())
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath)
        val output = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), output)

        val decryptedZip = decryptBackup(output.toByteArray(), "correct-password".toCharArray())
        val entries = zipEntryNames(decryptedZip)

        assertTrue(entries.contains("uploads/2026-08-24/logo.png"))
    }

    @Test
    fun `exportBackup produces no uploads entries when the uploads directory does not exist`() {
        val backupService =
            BackupService(uploadsRoot.resolve("does-not-exist"), databaseFile.absolutePath, configFile.absolutePath)
        val output = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), output)

        val decryptedZip = decryptBackup(output.toByteArray(), "correct-password".toCharArray())
        val entries = zipEntryNames(decryptedZip)

        assertTrue(entries.none { it.startsWith("uploads/") })
    }

    @Test
    fun `decrypting the backup with the wrong password fails`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath)
        val output = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), output)

        assertFailsWith<BadPaddingException> {
            decryptBackup(output.toByteArray(), "wrong-password".toCharArray())
        }
    }

    @Test
    fun `exportBackup clears the password array after use`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath)
        val output = ByteArrayOutputStream()
        val password = "correct-password".toCharArray()

        backupService.exportBackup("My Test Store", password, backupService.prepareExportSnapshot(), output)

        assertTrue(password.all { it == Char(0) })
    }

    @Test
    fun `exportBackup produces a different salt and initialization vector on each call`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath)
        val firstOutput = ByteArrayOutputStream()
        val secondOutput = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), firstOutput)
        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), secondOutput)

        val magicHeaderSize = "AMBROSIA-BACKUP-1".toByteArray(Charsets.UTF_8).size
        val firstSaltAndInitializationVector =
            firstOutput.toByteArray().copyOfRange(magicHeaderSize, magicHeaderSize + 28)
        val secondSaltAndInitializationVector =
            secondOutput.toByteArray().copyOfRange(magicHeaderSize, magicHeaderSize + 28)

        assertTrue(!firstSaltAndInitializationVector.contentEquals(secondSaltAndInitializationVector))
    }

    private fun buildEncryptedBackup(
        password: CharArray,
        zipEntries: Map<String, ByteArray>,
    ): ByteArray {
        val magicHeader = "AMBROSIA-BACKUP-1".toByteArray(Charsets.UTF_8)
        val salt = ByteArray(16).also { SecureRandom().nextBytes(it) }
        val initializationVector = ByteArray(12).also { SecureRandom().nextBytes(it) }

        val secretKeyFactory = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
        val keyDerivationSpec = PBEKeySpec(password, salt, 10000, 256)
        val secretKey = SecretKeySpec(secretKeyFactory.generateSecret(keyDerivationSpec).encoded, "AES")

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, secretKey, GCMParameterSpec(128, initializationVector))

        val output = ByteArrayOutputStream()
        output.write(magicHeader)
        output.write(salt)
        output.write(initializationVector)

        CipherOutputStream(output, cipher).use { encryptedOutput ->
            ZipOutputStream(encryptedOutput).use { zip ->
                zipEntries.forEach { (entryName, entryBytes) ->
                    zip.putNextEntry(ZipEntry(entryName))
                    zip.write(entryBytes)
                    zip.closeEntry()
                }
            }
        }
        return output.toByteArray()
    }

    private fun manifestZipEntry(manifest: BackupManifest): ByteArray =
        Json.encodeToString(BackupManifest.serializer(), manifest).toByteArray(Charsets.UTF_8)

    private fun sampleImportedManifest(schemaInstalledRank: Int? = null): BackupManifest =
        BackupManifest(
            appVersion = "dev",
            schemaInstalledRank = schemaInstalledRank,
            businessName = "Imported Test Store",
            secret = "imported-secret-value",
        )

    private fun seedFlywaySchemaHistory(installedRank: Int) {
        transaction {
            exec("CREATE TABLE flyway_schema_history (installed_rank INTEGER)")
            exec("INSERT INTO flyway_schema_history (installed_rank) VALUES ($installedRank)")
        }
    }

    @Test
    fun `importBackup returns the manifest from a real exportBackup output`() {
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val exportedBackup = ByteArrayOutputStream()
        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), exportedBackup)

        val importedManifest =
            backupService.importBackup(
                exportedBackup.toByteArray().inputStream(),
                "correct-password".toCharArray(),
            )

        assertEquals("My Test Store", importedManifest.businessName)
        assertEquals(TEST_SECRET, importedManifest.secret)
    }

    @Test
    fun `importBackup stages the database snapshot`() {
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val exportedBackup = ByteArrayOutputStream()
        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), exportedBackup)

        backupService.importBackup(
            exportedBackup.toByteArray().inputStream(),
            "correct-password".toCharArray(),
        )

        assertTrue(Files.exists(importStagingRoot.resolve("ambrosia.db")))
    }

    @Test
    fun `importBackup stages files from the uploads directory`() {
        val dateDir = Files.createDirectory(uploadsRoot.resolve("2026-08-24"))
        Files.write(dateDir.resolve("logo.png"), "fake-image-bytes".toByteArray())
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val exportedBackup = ByteArrayOutputStream()
        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), exportedBackup)

        backupService.importBackup(
            exportedBackup.toByteArray().inputStream(),
            "correct-password".toCharArray(),
        )

        assertTrue(Files.exists(importStagingRoot.resolve("uploads/2026-08-24/logo.png")))
    }

    @Test
    fun `importBackup stages the secret from the manifest`() {
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val exportedBackup = ByteArrayOutputStream()
        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), exportedBackup)

        backupService.importBackup(
            exportedBackup.toByteArray().inputStream(),
            "correct-password".toCharArray(),
        )

        val stagedSecret = Files.readString(importStagingRoot.resolve("imported-secret"))
        assertEquals(TEST_SECRET, stagedSecret)
    }

    @Test
    fun `importBackup throws when the password is wrong`() {
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val exportedBackup = ByteArrayOutputStream()
        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), exportedBackup)

        assertFailsWith<IllegalArgumentException> {
            backupService.importBackup(
                exportedBackup.toByteArray().inputStream(),
                "wrong-password".toCharArray(),
            )
        }
    }

    @Test
    fun `importBackup throws when the file does not start with the Ambrosia backup magic header`() {
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val notABackup = "this is not an ambrosia backup file".toByteArray(Charsets.UTF_8)

        assertFailsWith<IllegalArgumentException> {
            backupService.importBackup(notABackup.inputStream(), "correct-password".toCharArray())
        }
    }

    @Test
    fun `importBackup throws when the encrypted stream is truncated`() {
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val exportedBackup = ByteArrayOutputStream()
        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), exportedBackup)
        val truncatedBackup = exportedBackup.toByteArray().copyOfRange(0, 10)

        assertFailsWith<IllegalArgumentException> {
            backupService.importBackup(truncatedBackup.inputStream(), "correct-password".toCharArray())
        }
    }

    @Test
    fun `importBackup throws when the backup is missing manifest json`() {
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val password = "correct-password".toCharArray()
        val backupWithoutManifest =
            buildEncryptedBackup(password, mapOf("ambrosia.db" to "fake-database-bytes".toByteArray()))

        assertFailsWith<IllegalArgumentException> {
            backupService.importBackup(backupWithoutManifest.inputStream(), password)
        }
    }

    @Test
    fun `importBackup throws when the backup schema is newer than this installation supports`() {
        seedFlywaySchemaHistory(installedRank = 5)
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val password = "correct-password".toCharArray()
        val newerSchemaManifest = sampleImportedManifest(schemaInstalledRank = 10)
        val backupWithNewerSchema =
            buildEncryptedBackup(password, mapOf("manifest.json" to manifestZipEntry(newerSchemaManifest)))

        assertFailsWith<IllegalArgumentException> {
            backupService.importBackup(backupWithNewerSchema.inputStream(), password)
        }
    }

    @Test
    fun `importBackup succeeds when the backup schema is not newer than this installation`() {
        seedFlywaySchemaHistory(installedRank = 5)
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val password = "correct-password".toCharArray()
        val sameSchemaManifest = sampleImportedManifest(schemaInstalledRank = 5)
        val backupWithSameSchema =
            buildEncryptedBackup(password, mapOf("manifest.json" to manifestZipEntry(sameSchemaManifest)))

        val importedManifest = backupService.importBackup(backupWithSameSchema.inputStream(), password)

        assertEquals(5, importedManifest.schemaInstalledRank)
    }

    @Test
    fun `importBackup does not leave a partial staging directory when rejected for an incompatible schema`() {
        seedFlywaySchemaHistory(installedRank = 5)
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val password = "correct-password".toCharArray()
        val newerSchemaManifest = sampleImportedManifest(schemaInstalledRank = 10)
        val backupWithNewerSchema =
            buildEncryptedBackup(password, mapOf("manifest.json" to manifestZipEntry(newerSchemaManifest)))

        assertFailsWith<IllegalArgumentException> {
            backupService.importBackup(backupWithNewerSchema.inputStream(), password)
        }

        assertFalse(Files.exists(importStagingRoot))
    }

    @Test
    fun `importBackup rejects a zip entry that tries to escape the staging directory`() {
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val password = "correct-password".toCharArray()
        val maliciousEntryName = "../../../etc/escaped-file"
        val backupWithZipSlipEntry =
            buildEncryptedBackup(
                password,
                mapOf(
                    "manifest.json" to manifestZipEntry(sampleImportedManifest()),
                    maliciousEntryName to "malicious-bytes".toByteArray(),
                ),
            )

        assertFailsWith<SecurityException> {
            backupService.importBackup(backupWithZipSlipEntry.inputStream(), password)
        }
    }

    @Test
    fun `importBackup replaces an existing staging directory from a previous import`() {
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val firstExport = ByteArrayOutputStream()
        backupService.exportBackup("First Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), firstExport)
        backupService.importBackup(
            firstExport.toByteArray().inputStream(),
            "correct-password".toCharArray(),
        )
        Files.write(importStagingRoot.resolve("leftover-from-previous-import"), "stale".toByteArray())

        val secondExport = ByteArrayOutputStream()
        backupService.exportBackup("Second Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), secondExport)
        val importedManifest =
            backupService.importBackup(
                secondExport.toByteArray().inputStream(),
                "correct-password".toCharArray(),
            )

        assertEquals("Second Store", importedManifest.businessName)
        assertFalse(Files.exists(importStagingRoot.resolve("leftover-from-previous-import")))
    }

    @Test
    fun `importBackup clears the password array after use`() {
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val exportedBackup = ByteArrayOutputStream()
        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), backupService.prepareExportSnapshot(), exportedBackup)
        val password = "correct-password".toCharArray()

        backupService.importBackup(exportedBackup.toByteArray().inputStream(), password)

        assertTrue(password.all { it == Char(0) })
    }

    private fun prepareStagedImport(
        destinationUploadsRoot: Path,
        destinationDatabaseFile: Path,
        destinationConfigFile: File,
    ): BackupService {
        val exportingService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)
        val exportedBackup = ByteArrayOutputStream()
        exportingService.exportBackup(
            "My Test Store",
            "correct-password".toCharArray(),
            exportingService.prepareExportSnapshot(),
            exportedBackup,
        )

        val destinationService =
            BackupService(
                destinationUploadsRoot,
                destinationDatabaseFile.toString(),
                destinationConfigFile.absolutePath,
                importStagingRoot,
            )
        destinationService.importBackup(
            exportedBackup.toByteArray().inputStream(),
            "correct-password".toCharArray(),
        )
        return destinationService
    }

    @Test
    fun `applyPendingImport returns false when nothing is staged`() {
        val backupService =
            BackupService(uploadsRoot, databaseFile.absolutePath, configFile.absolutePath, importStagingRoot)

        assertFalse(backupService.applyPendingImport())
    }

    @Test
    fun `applyPendingImport returns true after applying a staged import`() {
        val destinationDatabaseFile = Files.createTempFile("backupServiceTestDestinationDb", ".db")
        val destinationUploadsRoot = Files.createTempDirectory("backupServiceTestDestinationUploads")
        val destinationConfigFile = Files.createTempFile("backupServiceTestDestinationConfig", ".conf").toFile()
        destinationConfigFile.writeText("secret=old-destination-secret\n")
        val destinationService =
            prepareStagedImport(destinationUploadsRoot, destinationDatabaseFile, destinationConfigFile)

        assertTrue(destinationService.applyPendingImport())
    }

    @Test
    fun `applyPendingImport replaces the live database file with the staged one`() {
        val destinationDatabaseFile = Files.createTempFile("backupServiceTestDestinationDb", ".db")
        Files.writeString(destinationDatabaseFile, "old-destination-database-placeholder")
        val originalDestinationDatabaseSize = Files.size(destinationDatabaseFile)
        val destinationUploadsRoot = Files.createTempDirectory("backupServiceTestDestinationUploads")
        val destinationConfigFile = Files.createTempFile("backupServiceTestDestinationConfig", ".conf").toFile()
        destinationConfigFile.writeText("secret=old-destination-secret\n")
        val destinationService =
            prepareStagedImport(destinationUploadsRoot, destinationDatabaseFile, destinationConfigFile)

        destinationService.applyPendingImport()

        assertTrue(Files.size(destinationDatabaseFile) != originalDestinationDatabaseSize)
    }

    @Test
    fun `applyPendingImport replaces the live uploads directory with the staged one`() {
        val dateDir = Files.createDirectory(uploadsRoot.resolve("2026-08-24"))
        Files.write(dateDir.resolve("logo.png"), "fake-image-bytes".toByteArray())
        val destinationDatabaseFile = Files.createTempFile("backupServiceTestDestinationDb", ".db")
        val destinationUploadsRoot = Files.createTempDirectory("backupServiceTestDestinationUploads")
        Files.write(destinationUploadsRoot.resolve("stale-destination-file.png"), "stale-bytes".toByteArray())
        val destinationConfigFile = Files.createTempFile("backupServiceTestDestinationConfig", ".conf").toFile()
        destinationConfigFile.writeText("secret=old-destination-secret\n")
        val destinationService =
            prepareStagedImport(destinationUploadsRoot, destinationDatabaseFile, destinationConfigFile)

        destinationService.applyPendingImport()

        assertTrue(Files.exists(destinationUploadsRoot.resolve("2026-08-24/logo.png")))
        assertFalse(Files.exists(destinationUploadsRoot.resolve("stale-destination-file.png")))
    }

    @Test
    fun `applyPendingImport removes the live uploads directory when the staged backup had none`() {
        val destinationDatabaseFile = Files.createTempFile("backupServiceTestDestinationDb", ".db")
        val destinationUploadsRoot = Files.createTempDirectory("backupServiceTestDestinationUploads")
        Files.write(destinationUploadsRoot.resolve("stale-destination-file.png"), "stale-bytes".toByteArray())
        val destinationConfigFile = Files.createTempFile("backupServiceTestDestinationConfig", ".conf").toFile()
        destinationConfigFile.writeText("secret=old-destination-secret\n")
        val destinationService =
            prepareStagedImport(destinationUploadsRoot, destinationDatabaseFile, destinationConfigFile)

        destinationService.applyPendingImport()

        assertFalse(Files.exists(destinationUploadsRoot))
    }

    @Test
    fun `applyPendingImport patches the secret in the live ambrosia conf`() {
        val destinationDatabaseFile = Files.createTempFile("backupServiceTestDestinationDb", ".db")
        val destinationUploadsRoot = Files.createTempDirectory("backupServiceTestDestinationUploads")
        val destinationConfigFile = Files.createTempFile("backupServiceTestDestinationConfig", ".conf").toFile()
        destinationConfigFile.writeText("secret=old-destination-secret\n")
        val destinationService =
            prepareStagedImport(destinationUploadsRoot, destinationDatabaseFile, destinationConfigFile)

        destinationService.applyPendingImport()

        assertEquals("secret=$TEST_SECRET", destinationConfigFile.readText().trim())
    }

    @Test
    fun `applyPendingImport removes the staging directory after applying`() {
        val destinationDatabaseFile = Files.createTempFile("backupServiceTestDestinationDb", ".db")
        val destinationUploadsRoot = Files.createTempDirectory("backupServiceTestDestinationUploads")
        val destinationConfigFile = Files.createTempFile("backupServiceTestDestinationConfig", ".conf").toFile()
        destinationConfigFile.writeText("secret=old-destination-secret\n")
        val destinationService =
            prepareStagedImport(destinationUploadsRoot, destinationDatabaseFile, destinationConfigFile)

        destinationService.applyPendingImport()

        assertFalse(Files.exists(importStagingRoot))
    }
}
