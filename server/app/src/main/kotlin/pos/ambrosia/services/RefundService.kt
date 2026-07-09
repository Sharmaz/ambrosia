package pos.ambrosia.services

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.jetbrains.exposed.v1.core.ResultRow
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.plus
import org.jetbrains.exposed.v1.jdbc.selectAll
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import org.jetbrains.exposed.v1.jdbc.update
import pos.ambrosia.db.tables.OrderEntity
import pos.ambrosia.db.tables.OrderProductsTable
import pos.ambrosia.db.tables.ProductBundleComponentsTable
import pos.ambrosia.db.tables.ProductEntity
import pos.ambrosia.db.tables.ProductVariantsTable
import pos.ambrosia.db.tables.RefundEntity
import pos.ambrosia.models.RefundRequest
import pos.ambrosia.models.StoreRefund
import pos.ambrosia.models.phoenix.PayInvoiceRequest
import pos.ambrosia.utils.OrderAlreadyRefundedException
import pos.ambrosia.utils.OrderNotRefundableException
import pos.ambrosia.utils.ResourceNotFoundException
import java.time.LocalDateTime
import java.util.UUID

class RefundService(
    private val phoenixService: PhoenixService,
) {
    companion object {
        private val refundMutex = Mutex()
    }

    private fun restoreVariantStock(
        variantId: UUID,
        quantity: Int,
    ) {
        val variantEntityId = EntityID(variantId, ProductVariantsTable)
        ProductVariantsTable.update({ ProductVariantsTable.id eq variantEntityId }) {
            it[ProductVariantsTable.quantity] = ProductVariantsTable.quantity + quantity
        }
    }

    private fun restoreProductStock(
        productEntityId: EntityID<UUID>,
        quantity: Int,
    ) {
        val defaultVariantId =
            ProductVariantsTable
                .selectAll()
                .where { ProductVariantsTable.productId eq productEntityId }
                .firstOrNull()
                ?.get(ProductVariantsTable.id) ?: return
        restoreVariantStock(defaultVariantId.value, quantity)
    }

    private fun restoreBundleStock(
        bundleEntityId: EntityID<UUID>,
        orderedQuantity: Int,
    ) {
        val bundleComponents =
            ProductBundleComponentsTable
                .selectAll()
                .where { ProductBundleComponentsTable.bundleId eq bundleEntityId }
                .toList()
        for (component in bundleComponents) {
            val restoreQuantity = component[ProductBundleComponentsTable.quantity] * orderedQuantity
            val componentVariantId = component[ProductBundleComponentsTable.componentVariantId]?.value
            if (componentVariantId != null) {
                restoreVariantStock(componentVariantId, restoreQuantity)
            } else {
                restoreProductStock(component[ProductBundleComponentsTable.componentId], restoreQuantity)
            }
        }
    }

    private fun restoreOrderLineStock(row: ResultRow) {
        val productEntityId = row[OrderProductsTable.productId]
        val orderedQuantity = row[OrderProductsTable.quantity]
        val productEntity = ProductEntity.findById(productEntityId) ?: return

        if (productEntity.isBundle) {
            restoreBundleStock(productEntityId, orderedQuantity)
            return
        }

        val variantIdString = row[OrderProductsTable.variantId]
        if (variantIdString != null) {
            restoreVariantStock(UUID.fromString(variantIdString), orderedQuantity)
        } else {
            restoreProductStock(productEntityId, orderedQuantity)
        }
    }

    suspend fun processRefund(
        orderId: String,
        request: RefundRequest,
    ): StoreRefund =
        refundMutex.withLock {
            val orderUuid =
                try {
                    UUID.fromString(orderId)
                } catch (_: IllegalArgumentException) {
                    throw ResourceNotFoundException("Order not found")
                }

            val (order, items) =
                transaction {
                    val entity = OrderEntity.findById(orderUuid) ?: throw ResourceNotFoundException("Order not found")
                    if (entity.status == "refunded") throw OrderAlreadyRefundedException()
                    if (entity.status != "paid") throw OrderNotRefundableException("Only paid orders can be refunded")
                    val orderItems =
                        OrderProductsTable
                            .selectAll()
                            .where { OrderProductsTable.orderId eq entity.id }
                            .toList()
                    entity to orderItems
                }

            var satoshiAmount = 0L
            if (request.invoice.isNotBlank()) {
                val paymentResponse = phoenixService.payInvoice(PayInvoiceRequest(invoice = request.invoice))
                satoshiAmount = paymentResponse.recipientAmountSat
            }

            transaction {
                items.forEach { restoreOrderLineStock(it) }

                order.status = "refunded"

                val refundedAt = LocalDateTime.now().toString()
                val refundEntity =
                    RefundEntity.new(UUID.randomUUID()) {
                        this.orderId = order.id
                        this.refundInvoice = request.invoice
                        this.satoshiAmount = satoshiAmount
                        this.refundedAt = refundedAt
                    }

                StoreRefund(
                    id = refundEntity.id.value.toString(),
                    orderId = orderId,
                    refundInvoice = request.invoice,
                    satoshiAmount = satoshiAmount,
                    refundedAt = refundedAt,
                )
            }
        }
}
