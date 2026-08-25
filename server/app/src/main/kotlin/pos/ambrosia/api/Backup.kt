package pos.ambrosia.api

import io.ktor.http.ContentDisposition
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.auth.authenticate
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.principal
import io.ktor.server.request.receive
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondOutputStream
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import pos.ambrosia.models.RolePassword
import pos.ambrosia.services.AuthService
import pos.ambrosia.services.BackupService
import pos.ambrosia.services.ConfigService
import pos.ambrosia.utils.InvalidCredentialsException
import java.time.LocalDate

fun Application.configureBackup() {
    val authService = AuthService(environment)
    val backupService = BackupService()
    val configService = ConfigService()

    routing {
        route("/backup") {
            backup(authService, backupService, configService)
        }
    }
}

fun Route.backup(
    authService: AuthService,
    backupService: BackupService,
    configService: ConfigService,
) {
    authenticate("auth-jwt-wallet") {
        post("/export") {
            val userId = call.backupActorUserId() ?: throw InvalidCredentialsException()
            val rolePassword = call.receive<RolePassword>()
            val isAuthenticated = authService.authenticateByRole(userId, rolePassword.password.toCharArray())
            if (isAuthenticated != true) {
                call.respond(HttpStatusCode.Unauthorized)
                return@post
            }

            val businessName = configService.getConfig()?.businessName ?: "ambrosia"
            val fileName = buildBackupFileName(businessName)

            call.response.header(
                HttpHeaders.ContentDisposition,
                ContentDisposition.Attachment.withParameter(ContentDisposition.Parameters.FileName, fileName).toString(),
            )
            call.respondOutputStream(ContentType.Application.OctetStream, HttpStatusCode.OK) {
                backupService.exportBackup(businessName, rolePassword.password.toCharArray(), this)
            }
        }
    }
}

private fun buildBackupFileName(businessName: String): String {
    val sanitizedBusinessName = businessName.replace(Regex("[^A-Za-z0-9-]+"), "-").trim('-').ifBlank { "ambrosia" }
    val today = LocalDate.now().toString()
    return "ambrosia-backup-$sanitizedBusinessName-$today.zip"
}

private fun ApplicationCall.backupActorUserId(): String? = principal<JWTPrincipal>()?.getClaim("userId", String::class)
