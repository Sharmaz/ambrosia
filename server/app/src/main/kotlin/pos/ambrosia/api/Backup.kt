package pos.ambrosia.api

import io.ktor.http.ContentDisposition
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.PartData
import io.ktor.http.content.forEachPart
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.auth.authenticate
import io.ktor.server.auth.jwt.JWTPrincipal
import io.ktor.server.auth.principal
import io.ktor.server.request.receive
import io.ktor.server.request.receiveMultipart
import io.ktor.server.response.header
import io.ktor.server.response.respond
import io.ktor.server.response.respondOutputStream
import io.ktor.server.routing.Route
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import io.ktor.utils.io.ByteReadChannel
import io.ktor.utils.io.copyTo
import kotlinx.coroutines.runBlocking
import pos.ambrosia.logger
import pos.ambrosia.models.RolePassword
import pos.ambrosia.services.AuthService
import pos.ambrosia.services.BackupService
import pos.ambrosia.services.ConfigService
import pos.ambrosia.utils.InvalidCredentialsException
import java.nio.channels.Channels
import java.nio.file.Files
import java.nio.file.Path
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
            val databaseSnapshot = backupService.prepareExportSnapshot()
            val totalExportBytes = backupService.calculateExportTotalBytes(databaseSnapshot)

            call.response.header(
                HttpHeaders.ContentDisposition,
                ContentDisposition.Attachment.withParameter(ContentDisposition.Parameters.FileName, fileName).toString(),
            )
            call.response.header("X-Backup-Total-Bytes", totalExportBytes.toString())
            call.respondOutputStream(ContentType.Application.OctetStream, HttpStatusCode.OK) {
                backupService.exportBackup(businessName, rolePassword.password.toCharArray(), databaseSnapshot, this)
            }
        }

        post("/import") {
            val userId = call.backupActorUserId() ?: throw InvalidCredentialsException()

            var backupPassword: String? = null
            var temporaryBackupFile: Path? = null
            try {
                call.receiveMultipart().forEachPart { part ->
                    when (part) {
                        is PartData.FormItem -> {
                            if (part.name == "password") backupPassword = part.value
                        }

                        is PartData.FileItem -> {
                            if (part.name == "backup") temporaryBackupFile = receiveChannelToTempFile(part.provider)
                        }

                        else -> {}
                    }
                    part.release()
                }

                val password = backupPassword
                val backupFile = temporaryBackupFile
                if (password.isNullOrEmpty() || backupFile == null) {
                    call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Missing password or backup file"))
                    return@post
                }

                val isAuthenticated = authService.authenticateByRole(userId, password.toCharArray())
                if (isAuthenticated != true) {
                    call.respond(HttpStatusCode.Unauthorized)
                    return@post
                }

                val importedManifest =
                    Files.newInputStream(backupFile).use { backupInputStream ->
                        backupService.importBackup(backupInputStream, password.toCharArray())
                    }

                call.respond(
                    HttpStatusCode.OK,
                    mapOf("message" to "Backup imported", "businessName" to importedManifest.businessName),
                )
            } catch (invalidBackup: IllegalArgumentException) {
                call.respond(
                    HttpStatusCode.BadRequest,
                    mapOf("message" to (invalidBackup.message ?: "Invalid backup file")),
                )
            } catch (unsafeBackup: SecurityException) {
                logger.warn("Rejected backup import with an unsafe path: ${unsafeBackup.message}")
                call.respond(HttpStatusCode.BadRequest, mapOf("message" to "Invalid backup file"))
            } finally {
                temporaryBackupFile?.let { Files.deleteIfExists(it) }
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

private fun receiveChannelToTempFile(channelProvider: () -> ByteReadChannel): Path {
    val temporaryFile = Files.createTempFile("ambrosia-import-upload-", ".zip")
    val uploadChannel = channelProvider()
    Files.newOutputStream(temporaryFile).use { temporaryFileOutputStream ->
        runBlocking { uploadChannel.copyTo(Channels.newChannel(temporaryFileOutputStream)) }
    }
    uploadChannel.cancel(null)
    return temporaryFile
}
