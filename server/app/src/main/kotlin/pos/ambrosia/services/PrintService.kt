package pos.ambrosia.services

import com.github.anastaciocintra.escpos.EscPos
import com.github.anastaciocintra.output.PrinterOutputStream
import pos.ambrosia.datadir
import pos.ambrosia.logger
import pos.ambrosia.models.Config
import pos.ambrosia.models.PrintRequest
import pos.ambrosia.models.PrinterType
import pos.ambrosia.models.TicketData
import pos.ambrosia.models.TicketTemplate
import java.io.IOException
import java.nio.file.Paths

class PrintService(
    private val ticketTemplateService: TicketTemplateService,
    private val printerConfigService: PrinterConfigService,
    private val logoLoader: TicketLogoLoader = TicketLogoLoader(Paths.get(datadir.toString(), "uploads")),
) {
    fun getAvailablePrinters(): Array<String> {
        val printerNames = PrinterOutputStream.getListPrintServicesNames()
        logger.info("Found ${printerNames.size} available printers: ${printerNames.joinToString(", ")}")
        return printerNames
    }

    fun setPrinter(
        type: PrinterType,
        printerName: String,
    ): String? {
        logger.info("Setting default printer '$printerName' for $type")
        val printService = PrinterOutputStream.getPrintServiceByName(printerName)
        if (printService == null) {
            logger.error("Printer '$printerName' not found on this system.")
        }
        return printerConfigService.upsertDefaultByTypeName(type, printerName)
    }

    fun printTicket(
        printRequest: PrintRequest,
        businessConfig: Config?,
    ) {
        val printerConfigs =
            when {
                printRequest.printerId != null -> {
                    val configById = printerConfigService.getPrinterConfigById(printRequest.printerId)
                    if (configById == null) {
                        throw IOException("Printer configuration not found for id '${printRequest.printerId}'.")
                    }
                    listOf(configById)
                }

                printRequest.broadcast -> {
                    printerConfigService.getEnabledByType(printRequest.printerType)
                }

                else -> {
                    val defaultConfig = printerConfigService.getDefaultByType(printRequest.printerType)
                    if (defaultConfig == null) {
                        throw IOException("Default printer for type ${printRequest.printerType} not configured.")
                    }
                    listOf(defaultConfig)
                }
            }

        if (printerConfigs.isEmpty()) {
            throw IOException("No printers configured for type ${printRequest.printerType}.")
        }

        val resolvedConfigs =
            printerConfigs.mapNotNull { printerConfig ->
                val printerService = PrinterOutputStream.getPrintServiceByName(printerConfig.printerName)
                if (printerService == null) {
                    logger.error("Printer '${printerConfig.printerName}' not found on this system.")
                    null
                } else {
                    printerConfig to printerService
                }
            }

        if (resolvedConfigs.isEmpty()) {
            throw IOException("No configured printers found on this system for type ${printRequest.printerType}.")
        }

        val templateCache = mutableMapOf<String, TicketTemplate>()
        var successCount = 0

        resolvedConfigs.forEach { (printerConfig, printerService) ->
            try {
                val resolvedTemplateName =
                    if (printRequest.forceTemplateName && !printRequest.templateName.isNullOrBlank()) {
                        printRequest.templateName
                    } else {
                        printerConfig.templateName ?: printRequest.templateName
                    }
                val effectiveTemplateName =
                    resolvedTemplateName
                        ?.takeIf { templateName -> templateName.isNotBlank() && !templateName.equals("none", ignoreCase = true) }
                if (effectiveTemplateName == null) {
                    logger.warn("No template configured for printer ${printerConfig.printerName}, skipping.")
                    successCount++
                    return@forEach
                }
                val template =
                    templateCache.getOrPut(effectiveTemplateName) {
                        ticketTemplateService.getTemplateByName(effectiveTemplateName)
                            ?: throw IOException("Template '$effectiveTemplateName' not found.")
                    }

                val printerOutputStream = PrinterOutputStream(printerService)
                val escpos = EscPos(printerOutputStream)
                escpos.setCharsetName(TicketFactory.DEFAULT_CHARSET)
                val ticketFactory = TicketFactory(template, logoLoader = logoLoader)
                ticketFactory.build(escpos, printRequest.ticketData, businessConfig)
                escpos.feed(TicketFactory.DEFAULT_FEED_LINES).cut(EscPos.CutMode.FULL)
                escpos.close()
                successCount += 1
            } catch (printException: Exception) {
                logger.error("Failed to print ticket to ${printerService.name}: ${printException.message}", printException)
                if (printRequest.printerId != null || !printRequest.broadcast) {
                    throw printException
                }
            }
        }

        if (successCount == 0) {
            throw IOException("Failed to print ticket to any configured printer.")
        }

        logger.info("Successfully sent print job to ${printRequest.printerType} printer(s).")
    }
}
