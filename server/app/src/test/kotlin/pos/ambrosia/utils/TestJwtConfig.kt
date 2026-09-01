package pos.ambrosia.utils

import io.ktor.server.config.MapApplicationConfig

private const val TEST_SECRET = "test-secret"
private const val TEST_ISSUER = "test-issuer"
private const val TEST_AUDIENCE = "test-audience"

fun testJwtConfig(): MapApplicationConfig =
    MapApplicationConfig(
        "secret" to TEST_SECRET,
        "jwt.issuer" to TEST_ISSUER,
        "jwt.audience" to TEST_AUDIENCE,
    )
