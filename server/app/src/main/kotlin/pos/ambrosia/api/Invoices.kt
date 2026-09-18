package pos.ambrosia.api

import io.ktor.http.HttpStatusCode
import io.ktor.serialization.ContentConvertException
import io.ktor.server.application.Application
import io.ktor.server.application.ApplicationCall
import io.ktor.server.plugins.BadRequestException
import io.ktor.server.plugins.ContentTransformationException
import io.ktor.server.request.receive
import io.ktor.server.response.respond
import io.ktor.server.routing.Route
import io.ktor.server.routing.get
import io.ktor.server.routing.post
import io.ktor.server.routing.route
import io.ktor.server.routing.routing
import pos.ambrosia.models.CreateInvoiceRequest
import pos.ambrosia.services.InvoiceService
import pos.ambrosia.utils.InvalidTimeEntryException
import pos.ambrosia.utils.ResourceNotFoundException
import pos.ambrosia.utils.authorizePermission

fun Application.configureInvoices() {
    val invoiceService = InvoiceService()
    routing { route("/freelance/invoices") { invoices(invoiceService) } }
}

fun Route.invoices(invoiceService: InvoiceService) {
    authorizePermission("invoices_read") {
        get("") {
            call.respond(HttpStatusCode.OK, invoiceService.getInvoices())
        }

        get("/{id}") {
            val invoiceId = call.parameters["id"] ?: throw InvalidTimeEntryException("Missing invoice ID")
            val invoice =
                invoiceService.getInvoiceById(invoiceId)
                    ?: throw ResourceNotFoundException("Invoice not found")
            call.respond(HttpStatusCode.OK, invoice)
        }
    }

    authorizePermission("invoices_create") {
        post("") {
            val createInvoiceRequest = call.receiveCreateInvoiceRequest()
            call.respond(HttpStatusCode.Created, invoiceService.createDraftInvoice(createInvoiceRequest))
        }
    }
}

private suspend fun ApplicationCall.receiveCreateInvoiceRequest(): CreateInvoiceRequest =
    try {
        receive<CreateInvoiceRequest>()
    } catch (_: BadRequestException) {
        throw InvalidTimeEntryException("Invalid invoice request body")
    } catch (_: ContentTransformationException) {
        throw InvalidTimeEntryException("Invalid invoice request body")
    } catch (_: ContentConvertException) {
        throw InvalidTimeEntryException("Invalid invoice request body")
    }
