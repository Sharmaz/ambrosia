package pos.ambrosia.services

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import pos.ambrosia.api.PhoenixWebhookPayload
import pos.ambrosia.db.tables.RolesTable
import pos.ambrosia.db.tables.UsersTable
import pos.ambrosia.logger
import pos.ambrosia.models.AdminNotificationEvent
import pos.ambrosia.models.phoenix.CloseChannelRequest
import pos.ambrosia.models.phoenix.CloseChannelResponse
import pos.ambrosia.models.phoenix.PayInvoiceRequest
import pos.ambrosia.models.phoenix.PayOfferRequest
import pos.ambrosia.models.phoenix.PayOnchainRequest
import pos.ambrosia.models.phoenix.PaymentResponse
import pos.ambrosia.utils.PhoenixServiceException
import java.util.UUID

class WalletAdminNotificationService(
    private val adminNotificationService: AdminNotificationService = AdminNotificationService(),
) {
    fun notifyInvoicePaymentSent(
        actorUserId: String?,
        request: PayInvoiceRequest,
        response: PaymentResponse,
    ) {
        val actor = resolveActor(actorUserId)
        createWalletNotification(
            AdminNotificationEvent(
                category = AdminNotificationCategories.WALLET,
                type = WalletAdminNotificationTypes.PAYMENT_SENT,
                title = "Wallet payment sent",
                body = walletActorLabel(actor) + " sent ${response.recipientAmountSat} sats",
                actorUserId = actor?.userId,
                actorUserName = actor?.userName,
                actorRole = actor?.role,
                status = AdminNotificationStatuses.SUCCESS,
                dedupeKey = "${WalletAdminNotificationTypes.PAYMENT_SENT}:${response.paymentHash}",
                metadataJson =
                    buildJsonObject {
                        put("paymentKind", "lightning_invoice")
                        putPaymentResponse(response)
                        putOptional("requestedAmountSats", request.amountSat)
                        putOptional("exchangeRate", request.exchangeRate)
                        putOptional("exchangeRateCurrency", request.exchangeRateCurrency)
                    }.toString(),
            ),
        )
    }

    fun notifyOfferPaymentSent(
        actorUserId: String?,
        request: PayOfferRequest,
        response: PaymentResponse,
    ) {
        val actor = resolveActor(actorUserId)
        createWalletNotification(
            AdminNotificationEvent(
                category = AdminNotificationCategories.WALLET,
                type = WalletAdminNotificationTypes.PAYMENT_SENT,
                title = "Wallet offer payment sent",
                body = walletActorLabel(actor) + " sent ${response.recipientAmountSat} sats",
                actorUserId = actor?.userId,
                actorUserName = actor?.userName,
                actorRole = actor?.role,
                status = AdminNotificationStatuses.SUCCESS,
                dedupeKey = "${WalletAdminNotificationTypes.PAYMENT_SENT}:${response.paymentHash}",
                metadataJson =
                    buildJsonObject {
                        put("paymentKind", "bolt12_offer")
                        putPaymentResponse(response)
                        putOptional("requestedAmountSats", request.amountSat)
                    }.toString(),
            ),
        )
    }

    fun notifyOnchainPaymentSent(
        actorUserId: String?,
        request: PayOnchainRequest,
        response: PaymentResponse,
    ) {
        val actor = resolveActor(actorUserId)
        createWalletNotification(
            AdminNotificationEvent(
                category = AdminNotificationCategories.WALLET,
                type = WalletAdminNotificationTypes.PAYMENT_SENT,
                title = "Wallet on-chain payment sent",
                body = walletActorLabel(actor) + " sent ${response.recipientAmountSat} sats on-chain",
                actorUserId = actor?.userId,
                actorUserName = actor?.userName,
                actorRole = actor?.role,
                status = AdminNotificationStatuses.SUCCESS,
                dedupeKey = "${WalletAdminNotificationTypes.PAYMENT_SENT}:${response.paymentId}",
                metadataJson =
                    buildJsonObject {
                        put("paymentKind", "onchain")
                        putPaymentResponse(response)
                        put("requestedAmountSats", request.amountSat)
                        put("feerateSatByte", request.feerateSatByte)
                    }.toString(),
            ),
        )
    }

    fun notifyPaymentFailed(
        actorUserId: String?,
        actionType: String,
        requestedAmountSats: Long?,
        error: PhoenixServiceException,
    ) {
        val actor = resolveActor(actorUserId)
        createWalletNotification(
            AdminNotificationEvent(
                category = AdminNotificationCategories.WALLET,
                type = WalletAdminNotificationTypes.PAYMENT_FAILED,
                title = "Wallet payment failed",
                body = walletActorLabel(actor) + " attempted a wallet payment that failed",
                actorUserId = actor?.userId,
                actorUserName = actor?.userName,
                actorRole = actor?.role,
                status = AdminNotificationStatuses.FAILED,
                metadataJson =
                    buildJsonObject {
                        put("paymentKind", actionType)
                        putOptional("requestedAmountSats", requestedAmountSats)
                        put("code", error.code)
                        putOptional("statusCode", error.statusCode)
                        put("source", error.source)
                    }.toString(),
            ),
        )
    }

    fun notifyChannelClosed(
        actorUserId: String?,
        request: CloseChannelRequest,
        response: CloseChannelResponse,
    ) {
        val actor = resolveActor(actorUserId)
        createWalletNotification(
            AdminNotificationEvent(
                category = AdminNotificationCategories.WALLET,
                type = WalletAdminNotificationTypes.CHANNEL_CLOSED,
                title = "Wallet channel closed",
                body = walletActorLabel(actor) + " closed a wallet channel",
                actorUserId = actor?.userId,
                actorUserName = actor?.userName,
                actorRole = actor?.role,
                status = AdminNotificationStatuses.SUCCESS,
                dedupeKey = "${WalletAdminNotificationTypes.CHANNEL_CLOSED}:${response.txId}",
                metadataJson =
                    buildJsonObject {
                        put("channelId", request.channelId)
                        put("txId", response.txId)
                        put("feerateSatByte", request.feerateSatByte)
                    }.toString(),
            ),
        )
    }

    fun notifyFeesBumped(
        actorUserId: String?,
        feerateSatByte: Long,
        response: String,
    ) {
        val actor = resolveActor(actorUserId)
        createWalletNotification(
            AdminNotificationEvent(
                category = AdminNotificationCategories.WALLET,
                type = WalletAdminNotificationTypes.FEE_BUMPED,
                title = "Wallet on-chain fees bumped",
                body = walletActorLabel(actor) + " bumped pending on-chain fees",
                actorUserId = actor?.userId,
                actorUserName = actor?.userName,
                actorRole = actor?.role,
                status = AdminNotificationStatuses.SUCCESS,
                metadataJson =
                    buildJsonObject {
                        put("feerateSatByte", feerateSatByte)
                        put("response", response.take(MAX_METADATA_TEXT_LENGTH))
                    }.toString(),
            ),
        )
    }

    fun notifyIncomingPaymentReceived(payload: PhoenixWebhookPayload) {
        if (payload.type != PHOENIX_PAYMENT_RECEIVED_TYPE) return

        createWalletNotification(
            AdminNotificationEvent(
                category = AdminNotificationCategories.WALLET,
                type = WalletAdminNotificationTypes.PAYMENT_RECEIVED,
                title = "Wallet payment received",
                body = "Wallet received ${payload.amountSat ?: 0} sats",
                actorUserName = "Phoenix webhook",
                actorRole = "system",
                status = AdminNotificationStatuses.SUCCESS,
                dedupeKey = payload.paymentHash?.let { "${WalletAdminNotificationTypes.PAYMENT_RECEIVED}:$it" },
                metadataJson =
                    buildJsonObject {
                        putOptional("amountSats", payload.amountSat)
                        putOptional("paymentHash", payload.paymentHash)
                        putOptional("externalId", payload.externalId)
                        putOptional("phoenixTimestamp", payload.timestamp)
                    }.toString(),
            ),
        )
    }

    private fun createWalletNotification(event: AdminNotificationEvent) {
        runCatching { adminNotificationService.createNotification(event) }
            .onFailure { logger.warn("Failed to create wallet admin notification: ${it.message}") }
    }

    private fun resolveActor(actorUserId: String?): WalletNotificationActor? {
        val parsedActorId =
            actorUserId
                ?.let { runCatching { UUID.fromString(it) }.getOrNull() }
                ?: return null

        return transaction {
            (UsersTable innerJoin RolesTable)
                .selectAll()
                .where {
                    (UsersTable.id eq parsedActorId) and
                        (UsersTable.isDeleted eq false) and
                        (RolesTable.isDeleted eq false)
                }.map { row ->
                    WalletNotificationActor(
                        userId = row[UsersTable.id].value.toString(),
                        userName = row[UsersTable.name],
                        role = row[RolesTable.role],
                    )
                }.firstOrNull()
        }
    }

    private fun walletActorLabel(actor: WalletNotificationActor?): String = actor?.userName ?: actor?.userId ?: "A wallet user"

    private fun JsonObjectBuilder.putPaymentResponse(response: PaymentResponse) {
        put("recipientAmountSats", response.recipientAmountSat)
        put("routingFeeSats", response.routingFeeSat)
        put("paymentId", response.paymentId)
        put("paymentHash", response.paymentHash)
    }

    private fun JsonObjectBuilder.putOptional(
        key: String,
        value: Any?,
    ) {
        when (value) {
            null -> return
            is String -> put(key, value)
            is Long -> put(key, value)
            is Int -> put(key, value)
            is Double -> put(key, value)
        }
    }

    private data class WalletNotificationActor(
        val userId: String,
        val userName: String,
        val role: String,
    )

    private companion object {
        const val MAX_METADATA_TEXT_LENGTH = 500
        const val PHOENIX_PAYMENT_RECEIVED_TYPE = "payment_received"
    }
}

private typealias JsonObjectBuilder = kotlinx.serialization.json.JsonObjectBuilder
