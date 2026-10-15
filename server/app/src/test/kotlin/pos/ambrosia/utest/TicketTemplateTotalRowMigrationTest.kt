package pos.ambrosia.utest

import org.junit.Test
import java.nio.file.Files
import java.sql.DriverManager
import java.sql.SQLException
import java.sql.Statement
import kotlin.io.path.deleteIfExists
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class TicketTemplateTotalRowMigrationTest {
    @Test
    fun `V53 allows TOTAL_ROW elements and preserves existing elements`() {
        withTicketTemplateDatabase { statement ->
            applyMigration(statement, "V11__ticket_template.sql")
            applyMigration(statement, "V14__ticket_template_qrcode.sql")
            statement.execute("INSERT INTO ticket_templates (id, name) VALUES (X'01', 'alice')")
            statement.execute(insertElementSql(elementId = "02", type = "QRCODE"))

            applyMigration(statement, "V53__ticket_template_total_row.sql")
            statement.execute(insertElementSql(elementId = "03", type = "TOTAL_ROW"))

            assertEquals(listOf("QRCODE", "TOTAL_ROW"), storedElementTypes(statement))
        }
    }

    @Test
    fun `V53 still rejects unknown element types`() {
        withTicketTemplateDatabase { statement ->
            applyMigration(statement, "V11__ticket_template.sql")
            applyMigration(statement, "V14__ticket_template_qrcode.sql")
            applyMigration(statement, "V53__ticket_template_total_row.sql")
            statement.execute("INSERT INTO ticket_templates (id, name) VALUES (X'01', 'bob')")

            assertFailsWith<SQLException> {
                statement.execute(insertElementSql(elementId = "02", type = "UNKNOWN"))
            }
        }
    }

    private fun withTicketTemplateDatabase(runAssertions: (Statement) -> Unit) {
        val databasePath = Files.createTempFile("ambrosia-ticket-template-test", ".db")
        try {
            DriverManager.getConnection("jdbc:sqlite:$databasePath").use { connection ->
                connection.createStatement().use(runAssertions)
            }
        } finally {
            databasePath.deleteIfExists()
        }
    }

    private fun applyMigration(
        statement: Statement,
        migrationFileName: String,
    ) {
        checkNotNull(javaClass.classLoader.getResource("db/migration/$migrationFileName"))
            .readText()
            .split(';')
            .map(String::trim)
            .filter(String::isNotEmpty)
            .forEach(statement::execute)
    }

    private fun insertElementSql(
        elementId: String,
        type: String,
    ): String =
        "INSERT INTO ticket_template_elements (id, template_id, element_order, type, value) " +
            "VALUES (X'$elementId', X'01', ${elementId.toInt()}, '$type', '')"

    private fun storedElementTypes(statement: Statement): List<String> =
        statement.executeQuery("SELECT type FROM ticket_template_elements ORDER BY element_order").use { resultSet ->
            buildList {
                while (resultSet.next()) add(resultSet.getString("type"))
            }
        }
}
