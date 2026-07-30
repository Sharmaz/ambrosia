package pos.ambrosia.services

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greaterEq
import org.jetbrains.exposed.v1.core.minus
import org.jetbrains.exposed.v1.jdbc.insert
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import pos.ambrosia.db.tables.CurrencyTable
import pos.ambrosia.db.tables.OrderEntity
import pos.ambrosia.db.tables.OrderProductsTable
import pos.ambrosia.db.tables.OrdersTable
import pos.ambrosia.db.tables.PaymentEntity
import pos.ambrosia.db.tables.PaymentMethodsTable
import pos.ambrosia.db.tables.PaymentsTable
import pos.ambrosia.db.tables.ProductBundleComponentsTable
import pos.ambrosia.db.tables.ProductEntity
import pos.ambrosia.db.tables.ProductVariantsTable
import pos.ambrosia.db.tables.ProductsTable
import pos.ambrosia.db.tables.TicketEntity
import pos.ambrosia.db.tables.TicketPaymentsTable
import pos.ambrosia.db.tables.UsersTable
import pos.ambrosia.logger
import pos.ambrosia.models.StoreCheckoutRequest
import pos.ambrosia.models.StoreCheckoutResponse
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.UUID

private class InsufficientStockException : Exception()

sealed interface CheckoutResult {
    data class Success(
        val response: StoreCheckoutResponse,
        val alreadyExisted: Boolean,
    ) : CheckoutResult

    data object NotPaid : CheckoutResult

    data object Invalid : CheckoutResult
}

class CheckoutService(
    private val paymentVerifier: PaymentVerifier? = null,
) {
    companion object {
        private val checkoutMutex = Mutex()
    }

    private fun firstActiveVariantId(productEntityId: EntityID<UUID>): UUID? =
        ProductVariantsTable
            .selectAll()
            .where {
                (ProductVariantsTable.productId eq productEntityId) and
                    (ProductVariantsTable.isActive eq true)
            }.firstOrNull()
            ?.get(ProductVariantsTable.id)
            ?.value

    private fun decrementVariantStock(
        productEntityId: EntityID<UUID>,
        variantId: UUID,
        quantity: Int,
    ): Boolean {
        val variantEntityId = EntityID(variantId, ProductVariantsTable)
        val stockRowsUpdated =
            ProductVariantsTable.update({
                (ProductVariantsTable.id eq variantEntityId) and
                    (ProductVariantsTable.productId eq productEntityId) and
                    (ProductVariantsTable.isActive eq true) and
                    (ProductVariantsTable.quantity greaterEq quantity)
            }) {
                it[ProductVariantsTable.quantity] = ProductVariantsTable.quantity - quantity
            }
        return stockRowsUpdated > 0
    }

    private fun decrementProductStock(
        productEntityId: EntityID<UUID>,
        quantity: Int,
    ): Boolean {
        var remainingQuantity = quantity
        val activeVariantRows =
            ProductVariantsTable
                .selectAll()
                .where {
                    (ProductVariantsTable.productId eq productEntityId) and
                        (ProductVariantsTable.isActive eq true) and
                        (ProductVariantsTable.quantity greaterEq 1)
                }.toList()

        for (variantRow in activeVariantRows) {
            if (remainingQuantity == 0) return true
            val availableQuantity = variantRow[ProductVariantsTable.quantity]
            val quantityToDeduct = minOf(availableQuantity, remainingQuantity)
            val stockWasDeducted =
                decrementVariantStock(
                    productEntityId = productEntityId,
                    variantId = variantRow[ProductVariantsTable.id].value,
                    quantity = quantityToDeduct,
                )
            if (!stockWasDeducted) return false
            remainingQuantity -= quantityToDeduct
        }

        return remainingQuantity == 0
    }

    fun cancelStoreOrder(id: String): Boolean =
        transaction {
            val orderUuid =
                try {
                    UUID.fromString(id)
                } catch (_: IllegalArgumentException) {
                    return@transaction false
                }
            val orderEntity = OrderEntity.findById(orderUuid) ?: return@transaction false
            if (orderEntity.status != "open" || orderEntity.tableId != null) return@transaction false
            orderEntity.status = "closed"
            logger.info("Store order cancelled: $id")
            true
        }

    fun findCheckoutByPaymentHash(paymentHash: String): Map<String, String>? =
        transaction {
            val payment = PaymentEntity.find { PaymentsTable.paymentHash eq paymentHash }.firstOrNull() ?: return@transaction null
            val ticketPayment =
                TicketPaymentsTable
                    .selectAll()
                    .where { TicketPaymentsTable.paymentId eq payment.id }
                    .firstOrNull() ?: return@transaction null
            val ticket = TicketEntity.findById(ticketPayment[TicketPaymentsTable.ticketId]) ?: return@transaction null
            mapOf(
                "status" to "completed",
                "paymentId" to payment.id.value.toString(),
                "ticketId" to ticket.id.value.toString(),
                "orderId" to ticket.orderId.value.toString(),
            )
        }

    suspend fun checkout(request: StoreCheckoutRequest): CheckoutResult {
        if (request.items.isEmpty()) return CheckoutResult.Invalid
        if (request.items.any { it.quantity <= 0 }) return CheckoutResult.Invalid

        return checkoutMutex.withLock {
            val paymentHash = request.paymentHash
            if (!paymentHash.isNullOrBlank()) {
                findCheckoutByPaymentHash(paymentHash)?.let { existing ->
                    return@withLock CheckoutResult.Success(
                        StoreCheckoutResponse(
                            orderId = existing.getValue("orderId"),
                            ticketId = existing.getValue("ticketId"),
                            paymentId = existing.getValue("paymentId"),
                        ),
                        alreadyExisted = true,
                    )
                }

                val incomingPayment =
                    paymentVerifier?.let { verifier ->
                        runCatching { verifier.getIncomingPayment(paymentHash) }.getOrNull()
                    }
                if (incomingPayment?.isPaid != true) {
                    return@withLock CheckoutResult.NotPaid
                }
            }

            val response = performCheckout(request) ?: return@withLock CheckoutResult.Invalid
            CheckoutResult.Success(response, alreadyExisted = false)
        }
    }

    private fun performCheckout(request: StoreCheckoutRequest): StoreCheckoutResponse? {
        try {
            UUID.fromString(request.userId)
            UUID.fromString(request.paymentMethodId)
            UUID.fromString(request.currencyId)
            request.items.forEach { UUID.fromString(it.productId) }
            request.items.mapNotNull { it.variantId }.forEach { UUID.fromString(it) }
        } catch (_: IllegalArgumentException) {
            return null
        }

        return try {
            transaction {
                val now = LocalDateTime.now(ZoneOffset.UTC).toString()
                val order =
                    OrderEntity.new(UUID.randomUUID()) {
                        this.userId = EntityID(UUID.fromString(request.userId), UsersTable)
                        this.tableId = null
                        this.status = "paid"
                        this.total = request.amount
                        this.discountAmount = request.discountAmount
                        this.createdAt = now
                    }

                for (item in request.items) {
                    val productEntityId = EntityID(UUID.fromString(item.productId), ProductsTable)
                    val productEntity = ProductEntity.findById(productEntityId) ?: throw InsufficientStockException()
                    val orderVariantId = item.variantId?.let { UUID.fromString(it) } ?: firstActiveVariantId(productEntityId)

                    if (orderVariantId == null) throw InsufficientStockException()

                    if (productEntity.trackStock) {
                        if (productEntity.isBundle) {
                            val componentRows =
                                ProductBundleComponentsTable
                                    .selectAll()
                                    .where { ProductBundleComponentsTable.bundleId eq productEntityId }
                                    .toList()
                            if (componentRows.isEmpty()) throw InsufficientStockException()
                            for (componentRow in componentRows) {
                                val componentProductId = componentRow[ProductBundleComponentsTable.componentId]
                                val componentVariantId = componentRow[ProductBundleComponentsTable.componentVariantId]?.value
                                val componentQuantity = componentRow[ProductBundleComponentsTable.quantity] * item.quantity
                                val componentStockWasDeducted =
                                    componentVariantId
                                        ?.let { decrementVariantStock(componentProductId, it, componentQuantity) }
                                        ?: decrementProductStock(componentProductId, componentQuantity)
                                if (!componentStockWasDeducted) {
                                    throw InsufficientStockException()
                                }
                            }
                        } else {
                            val stockWasDeducted =
                                item.variantId
                                    ?.let { decrementVariantStock(productEntityId, UUID.fromString(it), item.quantity) }
                                    ?: decrementProductStock(productEntityId, item.quantity)
                            if (!stockWasDeducted) throw InsufficientStockException()
                        }
                    }

                    OrderProductsTable.insert {
                        it[orderId] = order.id
                        it[OrderProductsTable.productId] = productEntityId
                        it[variantId] = orderVariantId.toString()
                        it[quantity] = item.quantity
                        it[priceAtOrder] = item.priceAtOrder
                    }
                }

                val ticket =
                    TicketEntity.new(UUID.randomUUID()) {
                        this.orderId = order.id
                        this.userId = EntityID(UUID.fromString(request.userId), UsersTable)
                        this.ticketDate = now
                        this.totalAmount = request.amount
                        this.notes = request.ticketNotes
                    }

                val payment =
                    PaymentEntity.new(UUID.randomUUID()) {
                        this.methodId = EntityID(UUID.fromString(request.paymentMethodId), PaymentMethodsTable)
                        this.currencyId = EntityID(UUID.fromString(request.currencyId), CurrencyTable)
                        this.transactionId = request.transactionId ?: ""
                        this.amount = request.amount
                        this.date = now
                        this.satoshiAmount = request.satoshiAmount
                        this.exchangeRateAtPayment = request.exchangeRateAtPayment
                        this.paymentHash = request.paymentHash
                        this.exchangeRateCurrency = request.exchangeRateCurrency
                        this.fiatAmountAtPayment = request.fiatAmountAtPayment
                    }

                TicketPaymentsTable.insert {
                    it[paymentId] = payment.id
                    it[ticketId] = ticket.id
                }

                logger.info("Store checkout: order=${order.id.value} ticket=${ticket.id.value} payment=${payment.id.value}")
                StoreCheckoutResponse(order.id.value.toString(), ticket.id.value.toString(), payment.id.value.toString())
            }
        } catch (_: InsufficientStockException) {
            null
        }
    }
}
