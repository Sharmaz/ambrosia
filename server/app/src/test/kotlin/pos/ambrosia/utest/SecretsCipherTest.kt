package pos.ambrosia.utest

import pos.ambrosia.utils.SecretsCipher
import java.security.SecureRandom
import javax.crypto.BadPaddingException
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue

class SecretsCipherTest {
    private val secureRandom = SecureRandom()

    private fun randomSalt(): ByteArray = ByteArray(32).also { secureRandom.nextBytes(it) }

    @Test
    fun `encrypt then decrypt with the same key returns the original plaintext`() {
        val secretKey = SecretsCipher.deriveKey("correct-unlock-password".toCharArray(), randomSalt())

        val envelope = SecretsCipher.encrypt("http://100.1.1.1:9740-password", secretKey)

        assertEquals("http://100.1.1.1:9740-password", SecretsCipher.decrypt(envelope, secretKey))
    }

    @Test
    fun `decrypting with a key derived from the wrong password fails`() {
        val salt = randomSalt()
        val correctKey = SecretsCipher.deriveKey("correct-unlock-password".toCharArray(), salt)
        val wrongKey = SecretsCipher.deriveKey("wrong-unlock-password".toCharArray(), salt)

        val envelope = SecretsCipher.encrypt("remote-password", correctKey)

        assertFailsWith<BadPaddingException> {
            SecretsCipher.decrypt(envelope, wrongKey)
        }
    }

    @Test
    fun `decrypting a malformed envelope fails`() {
        val secretKey = SecretsCipher.deriveKey("correct-unlock-password".toCharArray(), randomSalt())

        assertFailsWith<IllegalArgumentException> {
            SecretsCipher.decrypt("not-a-valid-envelope", secretKey)
        }
    }

    @Test
    fun `encrypting the same plaintext twice produces different envelopes`() {
        val secretKey = SecretsCipher.deriveKey("correct-unlock-password".toCharArray(), randomSalt())

        assertNotEquals(
            SecretsCipher.encrypt("remote-password", secretKey),
            SecretsCipher.encrypt("remote-password", secretKey),
        )
    }

    @Test
    fun `deriving a key from the same password and salt produces the same key`() {
        val salt = randomSalt()

        val firstKey = SecretsCipher.deriveKey("correct-unlock-password".toCharArray(), salt)
        val secondKey = SecretsCipher.deriveKey("correct-unlock-password".toCharArray(), salt)

        assertEquals(firstKey, secondKey)
    }

    @Test
    fun `deriveKey clears the unlock password array after use`() {
        val unlockPassword = "correct-unlock-password".toCharArray()

        SecretsCipher.deriveKey(unlockPassword, randomSalt())

        assertTrue(unlockPassword.all { it == Char(0) })
    }
}
