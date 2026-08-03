package pos.ambrosia.utest

import kotlinx.io.files.Path
import pos.ambrosia.config.readConfValues
import pos.ambrosia.config.writeConfValues
import java.io.File
import kotlin.test.Test
import kotlin.test.assertEquals

class ConfigFileTest {
    @Test
    fun `writeConfValues replaces target keys and preserves unrelated lines`() {
        val confFile = File.createTempFile("ambrosia-test", ".conf")
        try {
            confFile.writeText(
                """
                http-bind-ip=127.0.0.1
                web-push-enabled=false
                secret=existing-secret
                web-push-vapid-public-key=old-public-key
                """.trimIndent() + "\n",
            )

            writeConfValues(
                Path(confFile.absolutePath),
                mapOf(
                    "web-push-enabled" to "true",
                    "web-push-vapid-public-key" to "new-public-key",
                ),
            )

            assertEquals(
                listOf(
                    "http-bind-ip=127.0.0.1",
                    "secret=existing-secret",
                    "web-push-enabled=true",
                    "web-push-vapid-public-key=new-public-key",
                ),
                confFile.readLines(),
            )
            assertEquals(
                "true",
                readConfValues(Path(confFile.absolutePath)).getValue("web-push-enabled"),
            )
        } finally {
            confFile.delete()
        }
    }
}
