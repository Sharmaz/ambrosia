package pos.ambrosia.utest

import org.junit.After
import org.junit.Before
import pos.ambrosia.services.BackupService
import pos.ambrosia.utils.ExposedTestDb
import java.io.ByteArrayOutputStream
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.util.zip.ZipInputStream
import javax.crypto.BadPaddingException
import javax.crypto.Cipher
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import kotlin.test.Test
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class BackupServiceTest {
    private lateinit var databaseFile: File
    private lateinit var uploadsRoot: Path

    @Before
    fun setUp() {
        databaseFile = ExposedTestDb.connect()
        uploadsRoot = Files.createTempDirectory("backupServiceTestUploads")
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
    fun `exportBackup produces a zip decryptable with the same password, containing manifest and db snapshot`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath)
        val output = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), output)

        val decryptedZip = decryptBackup(output.toByteArray(), "correct-password".toCharArray())
        val entries = zipEntryNames(decryptedZip)

        assertTrue(entries.contains("manifest.json"))
        assertTrue(entries.contains("ambrosia.db"))
    }

    @Test
    fun `exportBackup manifest contains the business name`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath)
        val output = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), output)

        val decryptedZip = decryptBackup(output.toByteArray(), "correct-password".toCharArray())
        val manifestJson = readZipEntry(decryptedZip, "manifest.json")

        assertTrue(manifestJson.contains("\"businessName\":\"My Test Store\""))
    }

    @Test
    fun `exportBackup includes files from the uploads directory`() {
        val dateDir = Files.createDirectory(uploadsRoot.resolve("2026-08-24"))
        Files.write(dateDir.resolve("logo.png"), "fake-image-bytes".toByteArray())
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath)
        val output = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), output)

        val decryptedZip = decryptBackup(output.toByteArray(), "correct-password".toCharArray())
        val entries = zipEntryNames(decryptedZip)

        assertTrue(entries.contains("uploads/2026-08-24/logo.png"))
    }

    @Test
    fun `exportBackup produces no uploads entries when the uploads directory does not exist`() {
        val backupService = BackupService(uploadsRoot.resolve("does-not-exist"), databaseFile.absolutePath)
        val output = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), output)

        val decryptedZip = decryptBackup(output.toByteArray(), "correct-password".toCharArray())
        val entries = zipEntryNames(decryptedZip)

        assertTrue(entries.none { it.startsWith("uploads/") })
    }

    @Test
    fun `decrypting the backup with the wrong password fails`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath)
        val output = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), output)

        assertFailsWith<BadPaddingException> {
            decryptBackup(output.toByteArray(), "wrong-password".toCharArray())
        }
    }

    @Test
    fun `exportBackup clears the password array after use`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath)
        val output = ByteArrayOutputStream()
        val password = "correct-password".toCharArray()

        backupService.exportBackup("My Test Store", password, output)

        assertTrue(password.all { it == Char(0) })
    }

    @Test
    fun `exportBackup produces a different salt and initialization vector on each call`() {
        val backupService = BackupService(uploadsRoot, databaseFile.absolutePath)
        val firstOutput = ByteArrayOutputStream()
        val secondOutput = ByteArrayOutputStream()

        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), firstOutput)
        backupService.exportBackup("My Test Store", "correct-password".toCharArray(), secondOutput)

        val magicHeaderSize = "AMBROSIA-BACKUP-1".toByteArray(Charsets.UTF_8).size
        val firstSaltAndInitializationVector =
            firstOutput.toByteArray().copyOfRange(magicHeaderSize, magicHeaderSize + 28)
        val secondSaltAndInitializationVector =
            secondOutput.toByteArray().copyOfRange(magicHeaderSize, magicHeaderSize + 28)

        assertTrue(!firstSaltAndInitializationVector.contentEquals(secondSaltAndInitializationVector))
    }
}
