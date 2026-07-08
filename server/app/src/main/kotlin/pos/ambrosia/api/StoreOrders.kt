package pos.ambrosia.api

import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.delete
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import pos.ambrosia.models.Message
import pos.ambrosia.services.CheckoutService
import pos.ambrosia.utils.authorizePermission

fun Application.configureStoreOrders() {
    val checkoutService = CheckoutService()
    routing { route("/store/orders") { storeOrders(checkoutService) } }
}

fun Route.storeOrders(checkoutService: CheckoutService) {
    authorizePermission("orders_delete") {
        delete("/{id}") {
            val id =
                call.parameters["id"]
                    ?: return@delete call.respond(HttpStatusCode.BadRequest, Message("Missing order ID"))
            val cancelled = checkoutService.cancelStoreOrder(id)
            if (!cancelled) {
                return@delete call.respond(
                    HttpStatusCode.NotFound,
                    Message("Order not found or already closed"),
                )
            }
            call.respond(HttpStatusCode.OK, Message("Order cancelled successfully"))
        }
    }
}
