package pos.ambrosia.utest

import com.github.anastaciocintra.escpos.EscPos
import com.github.anastaciocintra.escpos.Style
import org.mockito.kotlin.any
import org.mockito.kotlin.argumentCaptor
import org.mockito.kotlin.eq
import org.mockito.kotlin.mock
import org.mockito.kotlin.times
import org.mockito.kotlin.verify
import pos.ambrosia.models.Config
import pos.ambrosia.models.ElementStyle
import pos.ambrosia.models.ElementType
import pos.ambrosia.models.FontSize
import pos.ambrosia.models.Justification
import pos.ambrosia.models.TicketData
import pos.ambrosia.models.TicketDataItem
import pos.ambrosia.models.TicketElement
import pos.ambrosia.models.TicketTemplate
import pos.ambrosia.services.TicketFactory
import pos.ambrosia.utils.formatTicketLine
import kotlin.test.Test
import kotlin.test.assertEquals

class TicketFactoryTest {
    @Test
    fun `build should process a simple text element`() {
        // Arrange
        val mockEscpos: EscPos = mock()
        val template =
            TicketTemplate(
                id = "template-1",
                name = "Test Template",
                elements =
                    listOf(
                        TicketElement(
                            id = "elem-1",
                            templateId = "template-1",
                            order = 0,
                            type = ElementType.TEXT,
                            value = "Welcome to {{config.businessName}}",
                        ),
                    ),
            )
        val ticketData =
            TicketData(
                ticketId = "123",
                tableName = "Table 1",
                roomName = "Main Room",
                date = "2025-10-31",
                items = emptyList(),
                total = 0.0,
            )
        val config =
            Config(
                businessType = "restaurant",
                businessName = "Ambrosia",
                businessAddress = null,
                businessPhone = null,
                businessEmail = null,
                businessTaxId = null,
                businessLogoUrl = null,
            )

        val ticketFactory = TicketFactory(template)

        // Act
        ticketFactory.build(mockEscpos, ticketData, config)

        // Assert
        verify(mockEscpos).writeLF(any<Style>(), eq("Welcome to Ambrosia"))
    }

    @Test
    fun `build should process table row elements`() {
        // Arrange
        val mockEscpos: EscPos = mock()
        val stringCaptor = argumentCaptor<String>()
        val template =
            TicketTemplate(
                id = "template-2",
                name = "Table Row Template",
                elements =
                    listOf(
                        TicketElement(
                            id = "elem-2",
                            templateId = "template-2",
                            order = 0,
                            type = ElementType.TABLE_ROW,
                            value = "", // Value is ignored for TABLE_ROW
                            style = ElementStyle(bold = false, justification = Justification.LEFT, fontSize = FontSize.NORMAL),
                        ),
                    ),
            )
        val ticketData =
            TicketData(
                ticketId = "456",
                tableName = "Table 2",
                roomName = "Patio",
                date = "2025-10-31",
                items =
                    listOf(
                        TicketDataItem(quantity = 1, name = "Burger", price = 12.50, comments = listOf("No pickles", "Well done")),
                        TicketDataItem(quantity = 2, name = "Fries", price = 3.00),
                    ),
                total = 18.50,
            )
        val config =
            Config(
                businessType = "restaurant",
                businessName = "Ambrosia",
                businessAddress = null,
                businessPhone = null,
                businessEmail = null,
                businessTaxId = null,
                businessLogoUrl = null,
            )

        val ticketFactory = TicketFactory(template)

        // Act
        ticketFactory.build(mockEscpos, ticketData, config)

        // Assert
        verify(mockEscpos, times(4)).writeLF(any<Style>(), stringCaptor.capture())
        val capturedStrings = stringCaptor.allValues

        assert(capturedStrings[0].startsWith("1x Burger"))
        assert(capturedStrings[0].endsWith("12.5"))
        assertEquals("  - No pickles", capturedStrings[1])
        assertEquals("  - Well done", capturedStrings[2])
        assert(capturedStrings[3].startsWith("2x Fries"))
        assert(capturedStrings[3].endsWith("3.0"))
    }

    @Test
    fun `build should process separator element`() {
        // Arrange
        val mockEscpos: EscPos = mock()
        val template =
            TicketTemplate(
                id = "template-3",
                name = "Separator Template",
                elements =
                    listOf(
                        TicketElement(
                            id = "elem-3",
                            templateId = "template-3",
                            order = 0,
                            type = ElementType.SEPARATOR,
                            value = "-",
                        ),
                    ),
            )
        val ticketData =
            TicketData(
                ticketId = "789",
                tableName = "Table 3",
                roomName = "Bar",
                date = "2025-10-31",
                items = emptyList(),
                total = 0.0,
            )
        val config =
            Config(
                businessType = "restaurant",
                businessName = "Ambrosia",
                businessAddress = null,
                businessPhone = null,
                businessEmail = null,
                businessTaxId = null,
                businessLogoUrl = null,
            )

        val ticketFactory = TicketFactory(template)

        // Act
        ticketFactory.build(mockEscpos, ticketData, config)

        // Assert
        verify(mockEscpos).writeLF(any<Style>(), eq("-".repeat(48)))
    }

    @Test
    fun `build should process table header element`() {
        // Arrange
        val mockEscpos: EscPos = mock()
        val template =
            TicketTemplate(
                id = "template-4",
                name = "Table Header Template",
                elements =
                    listOf(
                        TicketElement(
                            id = "elem-4",
                            templateId = "template-4",
                            order = 0,
                            type = ElementType.TABLE_HEADER,
                            value = "Item             Qty     Price",
                        ),
                    ),
            )
        val ticketData =
            TicketData(
                ticketId = "101",
                tableName = "Table 4",
                roomName = "Kitchen",
                date = "2025-10-31",
                items = emptyList(),
                total = 0.0,
            )
        val config =
            Config(
                businessType = "restaurant",
                businessName = "Ambrosia",
                businessAddress = null,
                businessPhone = null,
                businessEmail = null,
                businessTaxId = null,
                businessLogoUrl = null,
            )

        val ticketFactory = TicketFactory(template)

        // Act
        ticketFactory.build(mockEscpos, ticketData, config)

        // Assert
        verify(mockEscpos).writeLF(any<Style>(), eq("Item             Qty     Price"))
    }

    @Test
    fun `build should process TOTAL_ROW with discount and tip amount`() {
        val mockEscpos: EscPos = mock()
        val ticketTemplate =
            TicketTemplate(
                id = "template-tip",
                name = "Tip Template",
                elements =
                    listOf(
                        TicketElement(
                            id = "elem-total",
                            templateId = "template-tip",
                            order = 0,
                            type = ElementType.TOTAL_ROW,
                            value = "TOTAL",
                        ),
                    ),
            )
        val ticketData =
            TicketData(
                ticketId = "tip-001",
                tableName = "Table 1",
                roomName = "Salón",
                date = "2026-08-28",
                items = emptyList(),
                total = 115.0,
                discountAmount = 10.0,
                tipAmount = 15.0,
            )
        val businessConfig =
            Config(
                businessType = "restaurant",
                businessName = "Ambrosia",
                businessAddress = null,
                businessPhone = null,
                businessEmail = null,
                businessTaxId = null,
                businessLogoUrl = null,
            )

        val ticketFactory = TicketFactory(ticketTemplate)
        ticketFactory.build(mockEscpos, ticketData, businessConfig)

        val captor = argumentCaptor<String>()
        verify(mockEscpos, times(4)).writeLF(any<Style>(), captor.capture())
        val lines = captor.allValues
        assertEquals("-".repeat(TicketFactory.DEFAULT_TICKET_WIDTH), lines[0])
        assertEquals(formatTicketLine("DISCOUNT", "-10.0"), lines[1])
        assertEquals(formatTicketLine("TIP", "+15.0"), lines[2])
        assertEquals(formatTicketLine("TOTAL", "115.0"), lines[3])
    }

    @Test
    fun `build should resolve ticket tipAmount placeholder`() {
        val mockEscpos: EscPos = mock()
        val template =
            TicketTemplate(
                id = "template-ph",
                name = "Placeholder Template",
                elements =
                    listOf(
                        TicketElement(
                            id = "elem-ph",
                            templateId = "template-ph",
                            order = 0,
                            type = ElementType.TEXT,
                            value = "Tip: {{ticket.tipAmount}}",
                        ),
                    ),
            )
        val ticketData =
            TicketData(
                ticketId = "tip-002",
                tableName = "Table 2",
                roomName = "Bar",
                date = "2026-08-28",
                items = emptyList(),
                total = 50.0,
                tipAmount = 5.0,
            )

        val ticketFactory = TicketFactory(template)
        ticketFactory.build(mockEscpos, ticketData, null)

        verify(mockEscpos).writeLF(any<Style>(), eq("Tip: 5.0"))
    }
}
