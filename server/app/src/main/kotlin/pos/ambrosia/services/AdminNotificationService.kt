package pos.ambrosia.services

import org.jetbrains.exposed.v1.core.SortOrder
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.isNull
import org.jetbrains.exposed.v1.jdbc.Query
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import pos.ambrosia.db.tables.AdminNotificationEntity
import pos.ambrosia.db.tables.AdminNotificationPreferencesTable
import pos.ambrosia.db.tables.AdminNotificationReceiptsTable
import pos.ambrosia.db.tables.AdminNotificationsTable
import pos.ambrosia.db.tables.PushSubscriptionEntity
import pos.ambrosia.db.tables.PushSubscriptionsTable
import pos.ambrosia.db.tables.RolesTable
import pos.ambrosia.db.tables.UsersTable
import pos.ambrosia.logger
import pos.ambrosia.models.AdminNotification
import pos.ambrosia.models.AdminNotificationEvent
import pos.ambrosia.models.AdminNotificationPreferences
import pos.ambrosia.models.AdminNotificationPreferencesResponse
import pos.ambrosia.models.WebPushSubscriptionRequest
import pos.ambrosia.models.WebPushSubscriptionResponse
import java.time.Instant
import java.util.UUID

data class AdminNotificationCreateResult(
    val notificationId: String,
    val recipientCount: Int,
    val created: Boolean,
)

interface AdminNotificationLivePublisher {
    fun publish(
        adminUserId: String,
        notification: AdminNotification,
    )
}

object NoopAdminNotificationLivePublisher : AdminNotificationLivePublisher {
    override fun publish(
        adminUserId: String,
        notification: AdminNotification,
    ) = Unit
}

class AdminNotificationService(
    private val webPushDispatchClient: WebPushDispatchClient = NoopWebPushDispatchClient,
    private val livePublisher: AdminNotificationLivePublisher = NoopAdminNotificationLivePublisher,
) {
    private val defaultNotificationCategories = listOf(AdminNotificationCategories.WALLET)

    fun createNotification(event: AdminNotificationEvent): AdminNotificationCreateResult {
        val notificationCreation =
            transaction {
                event.dedupeKey?.let { dedupeKey ->
                    val existingNotification =
                        AdminNotificationEntity
                            .find { AdminNotificationsTable.dedupeKey eq dedupeKey }
                            .firstOrNull()

                    if (existingNotification != null) {
                        logger.info("Skipping duplicate admin notification with dedupeKey=$dedupeKey")
                        return@transaction AdminNotificationCreation(
                            result =
                                AdminNotificationCreateResult(
                                    notificationId = existingNotification.id.value.toString(),
                                    recipientCount = 0,
                                    created = false,
                                ),
                            pushSubscriptions = emptyList(),
                        )
                    }
                }

                val now = Instant.now().toString()
                val notification =
                    AdminNotificationEntity.new(UUID.randomUUID()) {
                        category = event.category
                        type = event.type
                        title = event.title
                        body = event.body
                        actorUserId = event.actorUserId?.let { EntityID(UUID.fromString(it), UsersTable) }
                        actorUserName = event.actorUserName
                        actorRole = event.actorRole
                        status = event.status
                        occurredAt = event.occurredAt
                        createdAt = now
                        dedupeKey = event.dedupeKey
                        metadataJson = event.metadataJson
                    }

                val activeAdminUserIds = activeAdminUserIds()
                val liveDeliveries = mutableListOf<AdminNotificationLiveDelivery>()
                val recipientCount =
                    activeAdminUserIds
                        .filter { adminUserId -> isInAppEnabled(adminUserId, event.category, now) }
                        .onEach { adminUserId ->
                            AdminNotificationReceiptsTable.insert {
                                it[notificationId] = notification.id
                                it[AdminNotificationReceiptsTable.adminUserId] = adminUserId
                                it[readAt] = null
                                it[createdAt] = now
                            }
                            liveDeliveries.add(
                                AdminNotificationLiveDelivery(
                                    adminUserId = adminUserId.value.toString(),
                                    notification =
                                        notification.toNotification(
                                            readAt = null,
                                        ),
                                ),
                            )
                        }.size
                val pushSubscriptions =
                    activeAdminUserIds
                        .filter { adminUserId -> isPushEnabled(adminUserId, event.category, now) }
                        .flatMap { adminUserId -> activePushSubscriptions(adminUserId) }

                logger.info(
                    "Created admin notification id=${notification.id.value}, category=${event.category}, type=${event.type}, recipients=$recipientCount",
                )

                AdminNotificationCreation(
                    result =
                        AdminNotificationCreateResult(
                            notificationId = notification.id.value.toString(),
                            recipientCount = recipientCount,
                            created = true,
                        ),
                    pushSubscriptions = pushSubscriptions,
                    liveDeliveries = liveDeliveries,
                )
            }

        dispatchPushNotifications(notificationCreation.pushSubscriptions)
        publishLiveNotifications(notificationCreation.liveDeliveries)
        return notificationCreation.result
    }

    fun getNotifications(
        adminUserId: String,
        limit: Int = 50,
        offset: Long = 0L,
        unreadOnly: Boolean = false,
        category: String? = null,
    ): List<AdminNotification> =
        transaction {
            val adminEntityId = EntityID(UUID.fromString(adminUserId), UsersTable)
            val boundedLimit = limit.coerceIn(1, 100)
            val boundedOffset = offset.coerceIn(0, Int.MAX_VALUE.toLong()).toInt()
            val baseCondition =
                if (unreadOnly) {
                    (AdminNotificationReceiptsTable.adminUserId eq adminEntityId) and
                        AdminNotificationReceiptsTable.readAt.isNull()
                } else {
                    AdminNotificationReceiptsTable.adminUserId eq adminEntityId
                }
            val condition =
                category
                    ?.takeIf { it.isNotBlank() }
                    ?.let { baseCondition and (AdminNotificationsTable.category eq it) }
                    ?: baseCondition

            (AdminNotificationReceiptsTable innerJoin AdminNotificationsTable)
                .selectAll()
                .where { condition }
                .orderBy(AdminNotificationsTable.createdAt, SortOrder.DESC)
                .map { row ->
                    AdminNotification(
                        id = row[AdminNotificationsTable.id].value.toString(),
                        category = row[AdminNotificationsTable.category],
                        type = row[AdminNotificationsTable.type],
                        title = row[AdminNotificationsTable.title],
                        body = row[AdminNotificationsTable.body],
                        actorUserId = row[AdminNotificationsTable.actorUserId]?.value?.toString(),
                        actorUserName = row[AdminNotificationsTable.actorUserName],
                        actorRole = row[AdminNotificationsTable.actorRole],
                        status = row[AdminNotificationsTable.status],
                        occurredAt = row[AdminNotificationsTable.occurredAt],
                        createdAt = row[AdminNotificationsTable.createdAt],
                        readAt = row[AdminNotificationReceiptsTable.readAt],
                        metadataJson = row[AdminNotificationsTable.metadataJson],
                    )
                }.drop(boundedOffset)
                .take(boundedLimit)
        }

    fun markRead(
        adminUserId: String,
        notificationId: String,
    ): Boolean =
        transaction {
            val now = Instant.now().toString()
            val adminEntityId = EntityID(UUID.fromString(adminUserId), UsersTable)
            val notificationEntityId = EntityID(UUID.fromString(notificationId), AdminNotificationsTable)
            val updated =
                AdminNotificationReceiptsTable.update({
                    (AdminNotificationReceiptsTable.adminUserId eq adminEntityId) and
                        (AdminNotificationReceiptsTable.notificationId eq notificationEntityId) and
                        AdminNotificationReceiptsTable.readAt.isNull()
                }) {
                    it[readAt] = now
                }
            updated > 0
        }

    fun markAllRead(
        adminUserId: String,
        category: String? = null,
    ): Int =
        transaction {
            val adminEntityId = EntityID(UUID.fromString(adminUserId), UsersTable)
            val unreadNotificationIds =
                unreadReceiptQuery(adminEntityId, category)
                    .map { it[AdminNotificationReceiptsTable.notificationId] }

            unreadNotificationIds.sumOf { notificationId ->
                AdminNotificationReceiptsTable.update({
                    (AdminNotificationReceiptsTable.adminUserId eq adminEntityId) and
                        (AdminNotificationReceiptsTable.notificationId eq notificationId) and
                        AdminNotificationReceiptsTable.readAt.isNull()
                }) {
                    it[readAt] = Instant.now().toString()
                }
            }
        }

    fun getPreferences(adminUserId: String): List<AdminNotificationPreferencesResponse> =
        transaction {
            val adminEntityId = EntityID(UUID.fromString(adminUserId), UsersTable)
            defaultNotificationCategories.forEach { category ->
                ensurePreference(adminEntityId, category, Instant.now().toString())
            }

            AdminNotificationPreferencesTable
                .selectAll()
                .where { AdminNotificationPreferencesTable.adminUserId eq adminEntityId }
                .map {
                    AdminNotificationPreferencesResponse(
                        adminUserId = adminUserId,
                        category = it[AdminNotificationPreferencesTable.category],
                        inAppEnabled = it[AdminNotificationPreferencesTable.inAppEnabled],
                        pushEnabled = it[AdminNotificationPreferencesTable.pushEnabled],
                        createdAt = it[AdminNotificationPreferencesTable.createdAt],
                        updatedAt = it[AdminNotificationPreferencesTable.updatedAt],
                    )
                }
        }

    fun updatePreference(
        adminUserId: String,
        preference: AdminNotificationPreferences,
    ): AdminNotificationPreferencesResponse =
        transaction {
            val now = Instant.now().toString()
            val adminEntityId = EntityID(UUID.fromString(adminUserId), UsersTable)
            ensurePreference(adminEntityId, preference.category, now)

            AdminNotificationPreferencesTable.update({
                (AdminNotificationPreferencesTable.adminUserId eq adminEntityId) and
                    (AdminNotificationPreferencesTable.category eq preference.category)
            }) {
                it[inAppEnabled] = preference.inAppEnabled
                it[pushEnabled] = preference.pushEnabled
                it[updatedAt] = now
            }

            AdminNotificationPreferencesTable
                .selectAll()
                .where {
                    (AdminNotificationPreferencesTable.adminUserId eq adminEntityId) and
                        (AdminNotificationPreferencesTable.category eq preference.category)
                }.map {
                    AdminNotificationPreferencesResponse(
                        adminUserId = adminUserId,
                        category = it[AdminNotificationPreferencesTable.category],
                        inAppEnabled = it[AdminNotificationPreferencesTable.inAppEnabled],
                        pushEnabled = it[AdminNotificationPreferencesTable.pushEnabled],
                        createdAt = it[AdminNotificationPreferencesTable.createdAt],
                        updatedAt = it[AdminNotificationPreferencesTable.updatedAt],
                    )
                }.single()
        }

    fun registerPushSubscription(
        adminUserId: String,
        request: WebPushSubscriptionRequest,
    ): WebPushSubscriptionResponse =
        transaction {
            val now = Instant.now().toString()
            val adminEntityId = EntityID(UUID.fromString(adminUserId), UsersTable)
            val existingSubscription =
                PushSubscriptionEntity
                    .find { PushSubscriptionsTable.endpoint eq request.endpoint }
                    .firstOrNull()

            val subscription =
                if (existingSubscription == null) {
                    PushSubscriptionEntity.new(UUID.randomUUID()) {
                        this.adminUserId = adminEntityId
                        endpoint = request.endpoint
                        p256dh = request.keys.p256dh
                        auth = request.keys.auth
                        userAgent = request.userAgent
                        createdAt = now
                        updatedAt = now
                        revokedAt = null
                    }
                } else {
                    existingSubscription.apply {
                        this.adminUserId = adminEntityId
                        endpoint = request.endpoint
                        p256dh = request.keys.p256dh
                        auth = request.keys.auth
                        userAgent = request.userAgent
                        updatedAt = now
                        revokedAt = null
                    }
                }

            subscription.toResponse()
        }

    fun revokePushSubscription(
        adminUserId: String,
        endpoint: String,
    ): Boolean =
        transaction {
            val adminEntityId = EntityID(UUID.fromString(adminUserId), UsersTable)
            revokePushSubscriptionByEndpoint(endpoint, adminEntityId)
        }

    private fun activeAdminUserIds(): List<EntityID<UUID>> =
        (UsersTable innerJoin RolesTable)
            .selectAll()
            .where {
                (UsersTable.isDeleted eq false) and
                    (RolesTable.isDeleted eq false) and
                    (RolesTable.isAdmin eq true)
            }.map { it[UsersTable.id] }

    private fun isInAppEnabled(
        adminUserId: EntityID<UUID>,
        category: String,
        now: String,
    ): Boolean {
        val existingPreference = findPreference(adminUserId, category)

        if (existingPreference == null) {
            insertDefaultPreference(adminUserId, category, now)
            return true
        }

        return existingPreference[AdminNotificationPreferencesTable.inAppEnabled]
    }

    private fun isPushEnabled(
        adminUserId: EntityID<UUID>,
        category: String,
        now: String,
    ): Boolean {
        val existingPreference = findPreference(adminUserId, category)

        if (existingPreference == null) {
            insertDefaultPreference(adminUserId, category, now)
            return true
        }

        return existingPreference[AdminNotificationPreferencesTable.pushEnabled]
    }

    private fun ensurePreference(
        adminUserId: EntityID<UUID>,
        category: String,
        now: String,
    ) {
        if (findPreference(adminUserId, category) == null) {
            insertDefaultPreference(adminUserId, category, now)
        }
    }

    private fun findPreference(
        adminUserId: EntityID<UUID>,
        category: String,
    ) = AdminNotificationPreferencesTable
        .selectAll()
        .where {
            (AdminNotificationPreferencesTable.adminUserId eq adminUserId) and
                (AdminNotificationPreferencesTable.category eq category)
        }.firstOrNull()

    private fun insertDefaultPreference(
        adminUserId: EntityID<UUID>,
        category: String,
        now: String,
    ) {
        AdminNotificationPreferencesTable.insert {
            it[AdminNotificationPreferencesTable.adminUserId] = adminUserId
            it[AdminNotificationPreferencesTable.category] = category
            it[inAppEnabled] = true
            it[pushEnabled] = true
            it[createdAt] = now
            it[updatedAt] = now
        }
    }

    private fun unreadReceiptQuery(
        adminUserId: EntityID<UUID>,
        category: String?,
    ): Query {
        val baseCondition =
            (AdminNotificationReceiptsTable.adminUserId eq adminUserId) and
                AdminNotificationReceiptsTable.readAt.isNull()
        val condition =
            category
                ?.takeIf { it.isNotBlank() }
                ?.let { baseCondition and (AdminNotificationsTable.category eq it) }
                ?: baseCondition

        return (AdminNotificationReceiptsTable innerJoin AdminNotificationsTable)
            .selectAll()
            .where { condition }
    }

    private fun activePushSubscriptions(adminUserId: EntityID<UUID>): List<WebPushDispatchSubscription> =
        PushSubscriptionsTable
            .selectAll()
            .where {
                (PushSubscriptionsTable.adminUserId eq adminUserId) and
                    PushSubscriptionsTable.revokedAt.isNull()
            }.map {
                WebPushDispatchSubscription(
                    endpoint = it[PushSubscriptionsTable.endpoint],
                    p256dh = it[PushSubscriptionsTable.p256dh],
                    auth = it[PushSubscriptionsTable.auth],
                )
            }

    private fun dispatchPushNotifications(pushSubscriptions: List<WebPushDispatchSubscription>) {
        pushSubscriptions.forEach { subscription ->
            val dispatchResult = webPushDispatchClient.send(subscription)
            if (dispatchResult.shouldRevokeSubscription) {
                transaction { revokePushSubscriptionByEndpoint(subscription.endpoint) }
            }
        }
    }

    private fun publishLiveNotifications(liveDeliveries: List<AdminNotificationLiveDelivery>) {
        liveDeliveries.forEach { delivery ->
            livePublisher.publish(
                adminUserId = delivery.adminUserId,
                notification = delivery.notification,
            )
        }
    }

    private fun revokePushSubscriptionByEndpoint(
        endpoint: String,
        adminUserId: EntityID<UUID>? = null,
    ): Boolean {
        val now = Instant.now().toString()
        val baseCondition =
            (PushSubscriptionsTable.endpoint eq endpoint) and
                PushSubscriptionsTable.revokedAt.isNull()
        val condition =
            adminUserId?.let { baseCondition and (PushSubscriptionsTable.adminUserId eq it) } ?: baseCondition

        return PushSubscriptionsTable.update({ condition }) {
            it[revokedAt] = now
            it[updatedAt] = now
        } > 0
    }

    private fun PushSubscriptionEntity.toResponse(): WebPushSubscriptionResponse =
        WebPushSubscriptionResponse(
            id = id.value.toString(),
            endpoint = endpoint,
            userAgent = userAgent,
            createdAt = createdAt,
            updatedAt = updatedAt,
            revokedAt = revokedAt,
        )

    private fun AdminNotificationEntity.toNotification(readAt: String?): AdminNotification =
        AdminNotification(
            id = id.value.toString(),
            category = category,
            type = type,
            title = title,
            body = body,
            actorUserId = actorUserId?.value?.toString(),
            actorUserName = actorUserName,
            actorRole = actorRole,
            status = status,
            occurredAt = occurredAt,
            createdAt = createdAt,
            readAt = readAt,
            metadataJson = metadataJson,
        )

    private data class AdminNotificationCreation(
        val result: AdminNotificationCreateResult,
        val pushSubscriptions: List<WebPushDispatchSubscription>,
        val liveDeliveries: List<AdminNotificationLiveDelivery> = emptyList(),
    )

    private data class AdminNotificationLiveDelivery(
        val adminUserId: String,
        val notification: AdminNotification,
    )
}
