package pos.ambrosia.services

object AdminNotificationCategories {
    const val WALLET = "wallet"
}

object AdminNotificationStatuses {
    const val SUCCESS = "success"
    const val FAILED = "failed"
}

object WalletAdminNotificationTypes {
    const val PAYMENT_SENT = "wallet.payment.sent"
    const val PAYMENT_FAILED = "wallet.payment.failed"
    const val PAYMENT_RECEIVED = "wallet.payment.received"
    const val CHANNEL_CLOSED = "wallet.channel.closed"
    const val FEE_BUMPED = "wallet.fee.bumped"
}

object WebPushPayloads {
    const val ADMIN_ACTIVITY = """{"type":"admin_activity"}"""
}

object WebPushStatusCodes {
    const val NOT_FOUND = 404
    const val GONE = 410
}
