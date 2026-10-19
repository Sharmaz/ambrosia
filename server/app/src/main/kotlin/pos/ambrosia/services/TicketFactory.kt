package pos.ambrosia.services

import com.github.anastaciocintra.escpos.EscPos
import com.github.anastaciocintra.escpos.EscPosConst
import com.github.anastaciocintra.escpos.Style
import com.github.anastaciocintra.escpos.image.BitonalThreshold
import com.github.anastaciocintra.escpos.image.CoffeeImageImpl
import com.github.anastaciocintra.escpos.image.EscPosImage
import com.github.anastaciocintra.escpos.image.RasterBitImageWrapper
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import com.google.zxing.qrcode.decoder.ErrorCorrectionLevel
import pos.ambrosia.logger
import pos.ambrosia.models.Config
import pos.ambrosia.models.ElementStyle
import pos.ambrosia.models.ElementType
import pos.ambrosia.models.FontSize
import pos.ambrosia.models.ImageSize
import pos.ambrosia.models.Justification
import pos.ambrosia.models.TicketData
import pos.ambrosia.models.TicketTemplate
import pos.ambrosia.utils.formatTicketLine
import java.awt.image.BufferedImage
import java.time.Clock
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.EnumMap
import java.util.Locale

class TicketFactory(
    private val template: TicketTemplate,
    private val clock: Clock = Clock.systemUTC(),
    private val logoLoader: TicketLogoLoader? = null,
) {
    companion object {
        const val DEFAULT_TICKET_WIDTH = 48
        const val DEFAULT_FEED_LINES = 5
        const val DEFAULT_CHARSET = "cp850"
        private val SEPARATOR_LINE = "-".repeat(DEFAULT_TICKET_WIDTH)

        private val QR_IMAGE_SIZE_BY_FONT_SIZE =
            mapOf(
                FontSize.NORMAL to ImageSize.SMALL,
                FontSize.LARGE to ImageSize.MEDIUM,
                FontSize.EXTRA_LARGE to ImageSize.LARGE,
            )
        private val QR_TARGET_WIDTH_DOTS =
            mapOf(
                ImageSize.SMALL to 160,
                ImageSize.MEDIUM to 240,
                ImageSize.LARGE to 320,
            )
        private val LOGO_TARGET_WIDTH_DOTS =
            mapOf(
                FontSize.NORMAL to 192,
                FontSize.LARGE to 288,
                FontSize.EXTRA_LARGE to 384,
            )
        private const val QR_MIN_DOTS_PER_MODULE = 3
        private const val PRINTABLE_WIDTH_DOTS = 576
        const val JOB_START_PADDING_BYTES = 1024
    }

    fun build(
        escpos: EscPos,
        ticketData: TicketData,
        businessConfig: Config?,
    ) {
        escpos.write(ByteArray(JOB_START_PADDING_BYTES), 0, JOB_START_PADDING_BYTES)
        escpos.initializePrinter()
        template.elements.forEach { templateElement ->
            val escPosStyle = convertToEscPosStyle(templateElement.style)
            val resolvedContent = resolveTemplateVariables(templateElement.value, ticketData, businessConfig)

            when (templateElement.type) {
                ElementType.SEPARATOR -> {
                    escpos.writeLF(escPosStyle, SEPARATOR_LINE)
                }

                ElementType.TABLE_HEADER -> {
                    escpos.writeLF(escPosStyle, resolvedContent)
                }

                ElementType.TABLE_ROW -> {
                    ticketData.items.forEach { ticketItem ->
                        val itemText = "${ticketItem.quantity}x ${ticketItem.name}"
                        val priceText = ticketItem.price.toString()
                        val itemRow = formatTicketLine(itemText, priceText)
                        escpos.writeLF(escPosStyle, itemRow)
                        ticketItem.comments.forEach { comment ->
                            escpos.writeLF(escPosStyle, "  - $comment")
                        }
                    }
                }

                ElementType.TOTAL_ROW -> {
                    val totalLabel = resolvedContent.ifEmpty { ticketData.labels.total }
                    escpos.writeLF(escPosStyle, SEPARATOR_LINE)
                    if (ticketData.discountAmount > 0) {
                        val discountRow = formatTicketLine(ticketData.labels.discount, "-${ticketData.discountAmount}")
                        escpos.writeLF(escPosStyle, discountRow)
                    }
                    if (ticketData.tipAmount > 0) {
                        val tipRow = formatTicketLine(ticketData.labels.tip, "+${ticketData.tipAmount}")
                        escpos.writeLF(escPosStyle, tipRow)
                    }
                    val totalRow = formatTicketLine(totalLabel, ticketData.total.toString())
                    escpos.writeLF(escPosStyle, totalRow)
                }

                ElementType.PAYMENT_METHOD -> {
                    val paymentMethodName = ticketData.paymentMethod.orEmpty()
                    if (paymentMethodName.isNotBlank()) {
                        val paymentMethodLabel = resolvedContent.ifEmpty { ticketData.labels.paymentMethod }
                        escpos.writeLF(escPosStyle, formatTicketLine(paymentMethodLabel, paymentMethodName))
                    }
                }

                ElementType.QRCODE -> {
                    val qrContent = if (resolvedContent.isNotBlank()) resolvedContent else (ticketData.invoice ?: "")
                    if (qrContent.isNotBlank()) {
                        writeQrCode(escpos, qrContent, templateElement.style)
                    }
                }

                ElementType.LOGO -> {
                    val storedLogoUrl = templateElement.value.ifBlank { businessConfig?.businessLogoUrl.orEmpty() }
                    if (storedLogoUrl.isNotBlank()) {
                        writeLogo(escpos, storedLogoUrl, templateElement.style)
                    }
                }

                else -> {
                    escpos.writeLF(escPosStyle, resolvedContent)
                }
            }
        }
    }

    private fun writeQrCode(
        escpos: EscPos,
        qrContent: String,
        elementStyle: ElementStyle?,
    ) {
        val fontSize = elementStyle?.fontSize ?: FontSize.NORMAL
        val imageSize = QR_IMAGE_SIZE_BY_FONT_SIZE[fontSize] ?: ImageSize.SMALL
        val targetWidthDots = QR_TARGET_WIDTH_DOTS.getValue(imageSize)

        logger.info("Printing QR image: targetWidthDots=$targetWidthDots, contentLength=${qrContent.length}")
        try {
            val qrEncodeHints = EnumMap<EncodeHintType, Any>(EncodeHintType::class.java)
            qrEncodeHints[EncodeHintType.ERROR_CORRECTION] = ErrorCorrectionLevel.M
            qrEncodeHints[EncodeHintType.MARGIN] = 1
            val moduleMatrix = QRCodeWriter().encode(qrContent, BarcodeFormat.QR_CODE, 0, 0, qrEncodeHints)
            val moduleCount = moduleMatrix.width
            val dotsPerModule = resolveQrDotsPerModule(moduleCount, targetWidthDots)
            val imageWidthDots = moduleCount * dotsPerModule
            val qrImage = BufferedImage(imageWidthDots, imageWidthDots, BufferedImage.TYPE_INT_RGB)
            for (pixelX in 0 until imageWidthDots) {
                for (pixelY in 0 until imageWidthDots) {
                    val isDarkModule = moduleMatrix.get(pixelX / dotsPerModule, pixelY / dotsPerModule)
                    qrImage.setRGB(pixelX, pixelY, if (isDarkModule) 0x000000 else 0xFFFFFF)
                }
            }
            writeRasterImage(escpos, qrImage, elementStyle?.justification ?: Justification.LEFT)
        } catch (qrException: Exception) {
            logger.error("Failed to print QR image: ${qrException.message}", qrException)
            val fallbackStyle = convertToEscPosStyle(elementStyle)
            escpos.writeLF(fallbackStyle, qrContent)
        }
    }

    private fun writeLogo(
        escpos: EscPos,
        storedLogoUrl: String,
        elementStyle: ElementStyle?,
    ) {
        val targetWidthDots = LOGO_TARGET_WIDTH_DOTS.getValue(elementStyle?.fontSize ?: FontSize.NORMAL)
        val logoImage =
            try {
                logoLoader?.loadScaledLogo(storedLogoUrl, targetWidthDots)
            } catch (logoException: Exception) {
                logger.error("Failed to load logo image: ${logoException.message}", logoException)
                null
            } ?: return
        writeRasterImage(escpos, logoImage, elementStyle?.justification ?: Justification.LEFT)
    }

    private fun writeRasterImage(
        escpos: EscPos,
        rasterImage: BufferedImage,
        justification: Justification,
    ) {
        val escPosImage = EscPosImage(CoffeeImageImpl(rasterImage), BitonalThreshold())
        val rasterImageWrapper = RasterBitImageWrapper()
        rasterImageWrapper.setJustification(
            when (justification) {
                Justification.LEFT -> EscPosConst.Justification.Left_Default
                Justification.CENTER -> EscPosConst.Justification.Center
                Justification.RIGHT -> EscPosConst.Justification.Right
            },
        )
        escpos.write(rasterImageWrapper, escPosImage)
        escpos.feed(1)
    }

    private fun resolveQrDotsPerModule(
        moduleCount: Int,
        targetWidthDots: Int,
    ): Int {
        val readableDotsPerModule = maxOf(targetWidthDots / moduleCount, QR_MIN_DOTS_PER_MODULE)
        val maxDotsPerModule = maxOf(PRINTABLE_WIDTH_DOTS / moduleCount, 1)
        return minOf(readableDotsPerModule, maxDotsPerModule)
    }

    private fun resolveTemplateVariables(
        templateText: String,
        ticketData: TicketData,
        businessConfig: Config?,
    ): String {
        val replacements = buildReplacementMap(ticketData, businessConfig)
        var resolvedText = templateText
        replacements.forEach { (placeholder, replacement) ->
            resolvedText = resolvedText.replace(placeholder, replacement)
        }
        return resolvedText
    }

    private fun buildReplacementMap(
        ticketData: TicketData,
        businessConfig: Config?,
    ): Map<String, String> =
        buildMap {
            put("{{ticket.id}}", ticketData.ticketId)
            put("{{ticket.tableName}}", ticketData.tableName)
            put("{{ticket.roomName}}", ticketData.roomName)
            put("{{ticket.date}}", ticketData.date)
            put("{{ticket.total}}", ticketData.total.toString())
            put("{{ticket.discountAmount}}", ticketData.discountAmount.toString())
            put("{{ticket.tipAmount}}", ticketData.tipAmount.toString())
            put("{{ticket.invoice}}", ticketData.invoice ?: "")
            val printedAt = resolvePrintedAt(businessConfig)
            val printDate = printedAt.format(DateTimeFormatter.ofPattern(template.dateFormat.pattern, Locale.US))
            val printTime = printedAt.format(DateTimeFormatter.ofPattern(template.timeFormat.pattern, Locale.US))
            put("{{print.date}}", printDate)
            put("{{print.time}}", printTime)
            put("{{print.dateTime}}", "$printDate $printTime")
            if (businessConfig != null) {
                put("{{config.businessName}}", businessConfig.businessName)
                put("{{config.businessAddress}}", businessConfig.businessAddress ?: "")
                put("{{config.businessPhone}}", businessConfig.businessPhone ?: "")
                put("{{config.businessEmail}}", businessConfig.businessEmail ?: "")
            }
        }

    private fun resolvePrintedAt(businessConfig: Config?): ZonedDateTime {
        val businessZone = businessConfig?.timezone?.let(ZoneId::of) ?: clock.zone
        return ZonedDateTime.now(clock).withZoneSameInstant(businessZone)
    }

    private fun convertToEscPosStyle(elementStyle: ElementStyle?): Style {
        val escposStyle = Style()
        if (elementStyle != null) {
            if (elementStyle.bold) {
                escposStyle.setBold(true)
            }
            escposStyle.setJustification(
                when (elementStyle.justification) {
                    Justification.LEFT -> EscPosConst.Justification.Left_Default
                    Justification.CENTER -> EscPosConst.Justification.Center
                    Justification.RIGHT -> EscPosConst.Justification.Right
                },
            )
            val printedFontSize =
                when (elementStyle.fontSize) {
                    FontSize.NORMAL -> Style.FontSize.`_1`
                    FontSize.LARGE -> Style.FontSize.`_2`
                    FontSize.EXTRA_LARGE -> Style.FontSize.`_3`
                }
            escposStyle.setFontSize(printedFontSize, printedFontSize)
        }
        return escposStyle
    }
}
