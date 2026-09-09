package pos.ambrosia.services

import kotlinx.io.files.Path
import org.bouncycastle.util.encoders.Hex
import pos.ambrosia.config.readConfValues
import pos.ambrosia.config.replaceConfFileProperty
import pos.ambrosia.config.writeConfValues
import pos.ambrosia.datadir
import pos.ambrosia.utils.SecretsCipher
import pos.ambrosia.utils.SecretsLockedException
import java.security.SecureRandom
import java.util.concurrent.atomic.AtomicReference
import javax.crypto.spec.SecretKeySpec

object SecretsStore {
    private const val ENCRYPTION_ACTIVE_CONF = "secrets-encrypted"
    private const val KDF_SALT_CONF = "secrets-kdf-salt"
    private const val KDF_SALT_LENGTH_BYTES = 32
    private val ENCRYPTABLE_CONF_KEYS = setOf("phoenixd-password", "nwc-uri", "web-push-vapid-private-key")

    var ambrosiaConfigFile: Path = Path(datadir, "ambrosia.conf")
    private val unlockKeyReference = AtomicReference<SecretKeySpec?>(null)
    private val unlockCallbacks = mutableListOf<() -> Unit>()
    private val secureRandom = SecureRandom()

    fun resetForTesting() {
        ambrosiaConfigFile = Path(datadir, "ambrosia.conf")
        unlockKeyReference.set(null)
        unlockCallbacks.clear()
    }

    fun lockForTesting() {
        unlockKeyReference.set(null)
    }

    fun isEncryptionActive(): Boolean = readConfValues(ambrosiaConfigFile)[ENCRYPTION_ACTIVE_CONF] == "true"

    fun isLocked(): Boolean = isEncryptionActive() && unlockKeyReference.get() == null

    fun onUnlock(callback: () -> Unit) {
        unlockCallbacks.add(callback)
    }

    fun unlock(unlockPassword: CharArray): Boolean {
        val storedValues = readConfValues(ambrosiaConfigFile)
        val kdfSaltHex = storedValues[KDF_SALT_CONF] ?: return false
        val candidateEnvelope = ENCRYPTABLE_CONF_KEYS.firstNotNullOfOrNull { storedValues[it] } ?: return false

        val candidateKey = SecretsCipher.deriveKey(unlockPassword, Hex.decode(kdfSaltHex))
        val unlockSucceeded = runCatching { SecretsCipher.decrypt(candidateEnvelope, candidateKey) }.isSuccess

        if (unlockSucceeded) {
            unlockKeyReference.set(candidateKey)
            unlockCallbacks.forEach { it() }
        }
        return unlockSucceeded
    }

    fun getSecretOrNull(key: String): String? {
        val storedValue = readConfValues(ambrosiaConfigFile)[key] ?: return null
        if (key !in ENCRYPTABLE_CONF_KEYS || !isEncryptionActive()) return storedValue

        val secretKey = unlockKeyReference.get() ?: throw SecretsLockedException()
        return SecretsCipher.decrypt(storedValue, secretKey)
    }

    fun setSecret(
        key: String,
        plaintextValue: String,
    ) {
        if (key !in ENCRYPTABLE_CONF_KEYS || !isEncryptionActive()) {
            replaceConfFileProperty(ambrosiaConfigFile, key, plaintextValue)
            return
        }

        val secretKey = unlockKeyReference.get() ?: throw SecretsLockedException()
        replaceConfFileProperty(ambrosiaConfigFile, key, SecretsCipher.encrypt(plaintextValue, secretKey))
    }

    fun activateEncryption(
        unlockPassword: CharArray,
        plaintextValues: Map<String, String>,
    ) {
        val kdfSalt = ByteArray(KDF_SALT_LENGTH_BYTES).also { secureRandom.nextBytes(it) }
        val secretKey = SecretsCipher.deriveKey(unlockPassword, kdfSalt)

        val encryptedValues =
            plaintextValues
                .filterKeys { it in ENCRYPTABLE_CONF_KEYS }
                .mapValues { (_, plaintextValue) -> SecretsCipher.encrypt(plaintextValue, secretKey) }

        writeConfValues(
            ambrosiaConfigFile,
            encryptedValues + mapOf(KDF_SALT_CONF to Hex.toHexString(kdfSalt), ENCRYPTION_ACTIVE_CONF to "true"),
        )

        unlockKeyReference.set(secretKey)
        unlockCallbacks.forEach { it() }
    }
}
