package pos.ambrosia.services

import kotlinx.serialization.json.Json
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import pos.ambrosia.datadir
import pos.ambrosia.models.BackupManifest
import java.io.OutputStream
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.security.SecureRandom
import java.sql.DriverManager
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import javax.crypto.Cipher
import javax.crypto.CipherOutputStream
import javax.crypto.SecretKeyFactory
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.PBEKeySpec
import javax.crypto.spec.SecretKeySpec
import kotlin.io.path.exists
import kotlin.io.path.isRegularFile
import kotlin.streams.asSequence

class BackupService(
    private val uploadsRoot: Path = Paths.get(datadir.toString(), "uploads"),
    private val databasePath: String = Paths.get(datadir.toString(), "ambrosia.db").toString(),
) {
    companion object {
        private const val KEY_DERIVATION_ALGORITHM = "PBKDF2WithHmacSHA256"
        private const val KEY_DERIVATION_ITERATIONS = 10000
        private const val KEY_LENGTH_BITS = 256
        private const val SALT_LENGTH_BYTES = 16
        private const val INITIALIZATION_VECTOR_LENGTH_BYTES = 12
        private const val AUTHENTICATION_TAG_LENGTH_BITS = 128
        private val MAGIC_HEADER = "AMBROSIA-BACKUP-1".toByteArray(Charsets.UTF_8)
    }

    fun exportBackup(
        businessName: String,
        rolePassword: CharArray,
        backupOutputStream: OutputStream,
    ) {
        val databaseSnapshot = Files.createTempFile("ambrosia-backup-db-", ".sqlite")
        try {
            snapshotDatabase(databaseSnapshot)

            val salt = ByteArray(SALT_LENGTH_BYTES).also { SecureRandom().nextBytes(it) }
            val initializationVector =
                ByteArray(INITIALIZATION_VECTOR_LENGTH_BYTES).also { SecureRandom().nextBytes(it) }
            val secretKey = deriveKey(rolePassword, salt)

            backupOutputStream.write(MAGIC_HEADER)
            backupOutputStream.write(salt)
            backupOutputStream.write(initializationVector)

            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.ENCRYPT_MODE,
                secretKey,
                GCMParameterSpec(AUTHENTICATION_TAG_LENGTH_BITS, initializationVector),
            )

            CipherOutputStream(backupOutputStream, cipher).use { encryptedOutput ->
                ZipOutputStream(encryptedOutput).use { zip ->
                    writeManifestEntry(zip, businessName)
                    writeFileEntry(zip, databaseSnapshot, "ambrosia.db")
                    writeUploadsEntries(zip)
                }
            }
        } finally {
            Files.deleteIfExists(databaseSnapshot)
            rolePassword.fill(Char(0))
        }
    }

    private fun snapshotDatabase(destination: Path) {
        DriverManager.getConnection("jdbc:sqlite:$databasePath").use { connection ->
            connection.createStatement().use { statement ->
                statement.execute("VACUUM INTO '${destination.toAbsolutePath()}'")
            }
        }
    }

    private fun deriveKey(
        password: CharArray,
        salt: ByteArray,
    ): SecretKeySpec {
        val secretKeyFactory = SecretKeyFactory.getInstance(KEY_DERIVATION_ALGORITHM)
        val keyDerivationSpec = PBEKeySpec(password, salt, KEY_DERIVATION_ITERATIONS, KEY_LENGTH_BITS)
        val keyBytes = secretKeyFactory.generateSecret(keyDerivationSpec).encoded
        return SecretKeySpec(keyBytes, "AES")
    }

    private fun writeManifestEntry(
        zip: ZipOutputStream,
        businessName: String,
    ) {
        val manifest =
            BackupManifest(
                appVersion = readAppVersion(),
                schemaInstalledRank = highestInstalledRank(),
                businessName = businessName,
            )
        zip.putNextEntry(ZipEntry("manifest.json"))
        zip.write(Json.encodeToString(BackupManifest.serializer(), manifest).toByteArray(Charsets.UTF_8))
        zip.closeEntry()
    }

    private fun writeFileEntry(
        zip: ZipOutputStream,
        source: Path,
        entryName: String,
    ) {
        zip.putNextEntry(ZipEntry(entryName))
        Files.newInputStream(source).use { it.copyTo(zip) }
        zip.closeEntry()
    }

    private fun writeUploadsEntries(zip: ZipOutputStream) {
        if (!uploadsRoot.exists()) return

        Files.walk(uploadsRoot).use { paths ->
            paths
                .asSequence()
                .filter { it.isRegularFile() }
                .forEach { file ->
                    val relativeUploadPath = uploadsRoot.relativize(file).toString().replace('\\', '/')
                    writeFileEntry(zip, file, "uploads/$relativeUploadPath")
                }
        }
    }

    private fun highestInstalledRank(): Int? =
        try {
            transaction {
                var rank: Int? = null
                exec("SELECT MAX(installed_rank) as max_rank FROM flyway_schema_history") { resultSet ->
                    if (resultSet.next()) {
                        rank = resultSet.getInt("max_rank")
                    }
                }
                rank
            }
        } catch (missingHistoryTable: Exception) {
            null
        }

    private fun readAppVersion(): String = BackupService::class.java.`package`?.implementationVersion ?: "dev"
}
