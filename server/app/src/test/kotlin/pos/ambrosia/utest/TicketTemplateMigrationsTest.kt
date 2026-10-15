package pos.ambrosia.utest

import org.junit.Test
import java.nio.file.Files
import java.sql.DriverManager
import java.sql.SQLException
import java.sql.Statement
import kotlin.io.path.deleteIfExists
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class TicketTemplateMigrationsTest {
    @Test
    fun `V53 allows TOTAL_ROW elements and preserves existing elements`() {
        withTicketTemplateDatabase { databaseStatement ->
            applyMigration(databaseStatement, "V11__ticket_template.sql")
            applyMigration(databaseStatement, "V14__ticket_template_qrcode.sql")
            databaseStatement.execute("INSERT INTO ticket_templates (id, name) VALUES (X'01', 'alice')")
            databaseStatement.execute(insertElementSql(elementId = "02", elementType = "QRCODE"))

            applyMigration(databaseStatement, "V53__ticket_template_total_row.sql")
            databaseStatement.execute(insertElementSql(elementId = "03", elementType = "TOTAL_ROW"))

            assertEquals(listOf("QRCODE", "TOTAL_ROW"), storedElementTypes(databaseStatement))
        }
    }

    @Test
    fun `V53 still rejects unknown element types`() {
        withTicketTemplateDatabase { databaseStatement ->
            applyMigration(databaseStatement, "V11__ticket_template.sql")
            applyMigration(databaseStatement, "V14__ticket_template_qrcode.sql")
            applyMigration(databaseStatement, "V53__ticket_template_total_row.sql")
            databaseStatement.execute("INSERT INTO ticket_templates (id, name) VALUES (X'01', 'bob')")

            assertFailsWith<SQLException> {
                databaseStatement.execute(insertElementSql(elementId = "02", elementType = "UNKNOWN"))
            }
        }
    }

    @Test
    fun `V55 allows LOGO elements and preserves existing elements`() {
        withTicketTemplateDatabase { databaseStatement ->
            applyMigration(databaseStatement, "V11__ticket_template.sql")
            applyMigration(databaseStatement, "V14__ticket_template_qrcode.sql")
            applyMigration(databaseStatement, "V53__ticket_template_total_row.sql")
            databaseStatement.execute("INSERT INTO ticket_templates (id, name) VALUES (X'01', 'alice')")
            databaseStatement.execute(insertElementSql(elementId = "02", elementType = "TOTAL_ROW"))

            applyMigration(databaseStatement, "V55__ticket_template_logo.sql")
            databaseStatement.execute(insertElementSql(elementId = "03", elementType = "LOGO"))

            assertEquals(listOf("TOTAL_ROW", "LOGO"), storedElementTypes(databaseStatement))
        }
    }

    @Test
    fun `V54 gives existing templates the default date and time formats`() {
        withTicketTemplateDatabase { databaseStatement ->
            applyMigration(databaseStatement, "V11__ticket_template.sql")
            databaseStatement.execute("INSERT INTO ticket_templates (id, name) VALUES (X'01', 'alice')")

            applyMigration(databaseStatement, "V54__ticket_template_date_time_formats.sql")

            databaseStatement.executeQuery("SELECT date_format, time_format FROM ticket_templates").use { queryRows ->
                queryRows.next()
                assertEquals("DAY_MONTH_YEAR", queryRows.getString("date_format"))
                assertEquals("HOURS_24", queryRows.getString("time_format"))
            }
        }
    }

    @Test
    fun `V54 rejects unknown date and time formats`() {
        withTicketTemplateDatabase { databaseStatement ->
            applyMigration(databaseStatement, "V11__ticket_template.sql")
            applyMigration(databaseStatement, "V54__ticket_template_date_time_formats.sql")

            assertFailsWith<SQLException> {
                databaseStatement.execute("INSERT INTO ticket_templates (id, name, date_format) VALUES (X'01', 'bob', 'UNKNOWN')")
            }
            assertFailsWith<SQLException> {
                databaseStatement.execute("INSERT INTO ticket_templates (id, name, time_format) VALUES (X'02', 'eve', 'UNKNOWN')")
            }
        }
    }

    private fun withTicketTemplateDatabase(runAssertions: (Statement) -> Unit) {
        val databasePath = Files.createTempFile("ambrosia-ticket-template-test", ".db")
        try {
            DriverManager.getConnection("jdbc:sqlite:$databasePath").use { databaseConnection ->
                databaseConnection.createStatement().use(runAssertions)
            }
        } finally {
            databasePath.deleteIfExists()
        }
    }

    private fun applyMigration(
        databaseStatement: Statement,
        migrationFileName: String,
    ) {
        checkNotNull(javaClass.classLoader.getResource("db/migration/$migrationFileName"))
            .readText()
            .split(';')
            .map(String::trim)
            .filter(String::isNotEmpty)
            .forEach(databaseStatement::execute)
    }

    private fun insertElementSql(
        elementId: String,
        elementType: String,
    ): String =
        "INSERT INTO ticket_template_elements (id, template_id, element_order, type, value) " +
            "VALUES (X'$elementId', X'01', ${elementId.toInt()}, '$elementType', '')"

    private fun storedElementTypes(databaseStatement: Statement): List<String> =
        databaseStatement.executeQuery("SELECT type FROM ticket_template_elements ORDER BY element_order").use { queryRows ->
            buildList {
                while (queryRows.next()) add(queryRows.getString("type"))
            }
        }
}
