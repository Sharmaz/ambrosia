package pos.ambrosia.services

import org.jetbrains.exposed.v1.core.Op
import org.jetbrains.exposed.v1.core.SortOrder
import org.jetbrains.exposed.v1.core.and
import org.jetbrains.exposed.v1.core.dao.id.EntityID
import org.jetbrains.exposed.v1.core.eq
import org.jetbrains.exposed.v1.core.greaterEq
import org.jetbrains.exposed.v1.core.inList
import org.jetbrains.exposed.v1.core.lessEq
import org.jetbrains.exposed.v1.jdbc.transactions.transaction
import pos.ambrosia.db.tables.ClientEntity
import pos.ambrosia.db.tables.ClientsTable
import pos.ambrosia.db.tables.CurrencyEntity
import pos.ambrosia.db.tables.CurrencyTable
import pos.ambrosia.db.tables.ProjectEntity
import pos.ambrosia.db.tables.ProjectsTable
import pos.ambrosia.db.tables.TaskEntity
import pos.ambrosia.db.tables.TasksTable
import pos.ambrosia.db.tables.TimeEntriesTable
import pos.ambrosia.db.tables.TimeEntryEntity
import pos.ambrosia.models.CreateTimeEntryRequest
import pos.ambrosia.models.TimeEntryResponse
import pos.ambrosia.models.UpdateTimeEntryRequest
import pos.ambrosia.utils.InvalidTimeEntryException
import pos.ambrosia.utils.ResourceNotFoundException
import pos.ambrosia.utils.TimeEntryLockedException
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.util.UUID

class TimeEntryService {
    fun getTimeEntries(
        from: String,
        to: String,
        projectId: String? = null,
        taskId: String? = null,
    ): List<TimeEntryResponse> =
        transaction {
            val fromDate = parseDate(from, "from")
            val toDate = parseDate(to, "to")
            if (fromDate > toDate) throw InvalidTimeEntryException("from must be before or equal to to")

            var condition: Op<Boolean> =
                (TimeEntriesTable.entryDate greaterEq fromDate.toString()) and
                        (TimeEntriesTable.entryDate lessEq toDate.toString())
            projectId?.let {
                condition =
                    condition and
                            (TimeEntriesTable.projectId eq EntityID(parseUuid(it, "project_id"), ProjectsTable))
            }
            taskId?.let {
                condition =
                    condition and
                            (TimeEntriesTable.taskId eq EntityID(parseUuid(it, "task_id"), TasksTable))
            }

            val entries =
                TimeEntryEntity
                    .find { condition }
                    .orderBy(
                        TimeEntriesTable.entryDate to SortOrder.ASC,
                        TimeEntriesTable.startTime to SortOrder.ASC,
                        TimeEntriesTable.createdAt to SortOrder.ASC,
                    ).toList()
            val references = loadResponseReferences(entries)
            entries.map { toResponse(it, references) }
        }

    fun getTimeEntryById(id: String): TimeEntryResponse? =
        transaction {
            findEntry(id)?.let(::toResponse)
        }

    fun createTimeEntry(request: CreateTimeEntryRequest): TimeEntryResponse =
        transaction {
            val validated =
                validateInput(
                    projectId = request.projectId,
                    taskId = request.taskId,
                    entryDate = request.entryDate,
                    startTime = request.startTime,
                    endTime = request.endTime,
                    description = request.description,
                    durationMinutes = request.durationMinutes,
                )
            val entity =
                TimeEntryEntity.new(UUID.randomUUID()) {
                    projectId = validated.project.id
                    taskId = validated.task.id
                    entryDate = validated.entryDate
                    startTime = validated.startTime
                    endTime = validated.endTime
                    description = validated.description
                    durationMinutes = validated.durationMinutes
                    isBillable = validated.isBillable
                    invoiceId = null
                    isLocked = false
                    createdAt = currentTimestamp()
                }
            toResponse(entity)
        }

    fun updateTimeEntry(
        id: String,
        request: UpdateTimeEntryRequest,
    ): TimeEntryResponse =
        transaction {
            val entity = findEntry(id) ?: throw ResourceNotFoundException("Time entry not found")
            ensureUnlocked(entity)
            val validated =
                validateInput(
                    projectId = request.projectId,
                    taskId = request.taskId,
                    entryDate = request.entryDate,
                    startTime = request.startTime,
                    endTime = request.endTime,
                    description = request.description,
                    durationMinutes = request.durationMinutes,
                )

            entity.projectId = validated.project.id
            entity.taskId = validated.task.id
            entity.entryDate = validated.entryDate
            entity.startTime = validated.startTime
            entity.endTime = validated.endTime
            entity.description = validated.description
            entity.durationMinutes = validated.durationMinutes
            entity.isBillable = validated.isBillable
            toResponse(entity)
        }

    fun deleteTimeEntry(id: String) {
        transaction {
            val entity = findEntry(id) ?: throw ResourceNotFoundException("Time entry not found")
            ensureUnlocked(entity)
            entity.delete()
        }
    }

    private fun findEntry(id: String): TimeEntryEntity? {
        val entryUuid = parseUuid(id, "id")
        return TimeEntryEntity
            .find { TimeEntriesTable.id eq EntityID(entryUuid, TimeEntriesTable) }
            .firstOrNull()
    }

    private fun validateInput(
        projectId: String,
        taskId: String,
        entryDate: String,
        startTime: String?,
        endTime: String?,
        description: String?,
        durationMinutes: Int,
    ): ValidatedTimeEntry {
        if (durationMinutes <= 0) throw InvalidTimeEntryException("durationMinutes must be greater than 0")
        val project =
            ProjectEntity.findById(parseUuid(projectId, "projectId"))?.takeIf { !it.isDeleted }
                ?: throw ResourceNotFoundException("Project not found")

        if (project.status != "in_progress") {
            throw InvalidTimeEntryException("Invalid project status. Time tracking is only allowed in the 'in_progress' state.")
        }

        val task =
            TaskEntity.findById(parseUuid(taskId, "taskId"))?.takeIf { !it.isDeleted }
                ?: throw ResourceNotFoundException("Task not found")
        val isBillable = task.isBillable && project.isBillable

        return ValidatedTimeEntry(
            project = project,
            task = task,
            entryDate = parseDate(entryDate, "entryDate").toString(),
            startTime = parseTime(startTime, "startTime"),
            endTime = parseTime(endTime, "endTime"),
            description = description,
            durationMinutes = durationMinutes,
            isBillable = isBillable,
        )
    }

    private fun ensureUnlocked(entity: TimeEntryEntity) {
        if (entity.invoiceId != null || entity.isLocked) throw TimeEntryLockedException()
    }

    private fun toResponse(
        entity: TimeEntryEntity,
        references: ResponseReferences? = null,
    ): TimeEntryResponse {
        val project =
            references?.projects?.get(entity.projectId)
                ?: ProjectEntity.findById(entity.projectId)
                ?: throw ResourceNotFoundException("Project not found")
        val client =
            references?.clients?.get(project.clientId)
                ?: ClientEntity.findById(project.clientId)
                ?: throw ResourceNotFoundException("Client not found")
        val task =
            references?.tasks?.get(entity.taskId)
                ?: TaskEntity.findById(entity.taskId)
                ?: throw ResourceNotFoundException("Task not found")
        val currency =
            references?.currencies?.get(client.currencyId)
                ?: CurrencyEntity.findById(client.currencyId)
                ?: throw ResourceNotFoundException("Currency not found")
        return TimeEntryResponse(
            id = entity.id.value.toString(),
            projectId = project.id.value.toString(),
            projectName = project.name,
            taskId = task.id.value.toString(),
            taskName = task.name,
            isBillable = entity.isBillable,
            clientId = client.id.value.toString(),
            clientName = client.name,
            currencyId = currency.id.value.toString(),
            currencyAcronym = currency.acronym,
            entryDate = entity.entryDate,
            startTime = entity.startTime,
            endTime = entity.endTime,
            description = entity.description,
            durationMinutes = entity.durationMinutes,
            invoiceId = entity.invoiceId?.value?.toString(),
            isLocked = entity.isLocked || entity.invoiceId != null,
            createdAt = entity.createdAt,
        )
    }

    private fun loadResponseReferences(entries: List<TimeEntryEntity>): ResponseReferences {
        if (entries.isEmpty()) return ResponseReferences()

        val projects =
            ProjectEntity
                .find { ProjectsTable.id inList entries.map { it.projectId }.distinct() }
                .associateBy { it.id }
        val clients =
            ClientEntity
                .find { ClientsTable.id inList projects.values.map { it.clientId }.distinct() }
                .associateBy { it.id }
        val tasks =
            TaskEntity
                .find { TasksTable.id inList entries.map { it.taskId }.distinct() }
                .associateBy { it.id }
        val currencies =
            CurrencyEntity
                .find { CurrencyTable.id inList clients.values.map { it.currencyId }.distinct() }
                .associateBy { it.id }
        return ResponseReferences(projects, clients, tasks, currencies)
    }

    private data class ResponseReferences(
        val projects: Map<EntityID<UUID>, ProjectEntity> = emptyMap(),
        val clients: Map<EntityID<UUID>, ClientEntity> = emptyMap(),
        val tasks: Map<EntityID<UUID>, TaskEntity> = emptyMap(),
        val currencies: Map<EntityID<UUID>, CurrencyEntity> = emptyMap(),
    )

    private data class ValidatedTimeEntry(
        val project: ProjectEntity,
        val task: TaskEntity,
        val entryDate: String,
        val startTime: String?,
        val endTime: String?,
        val description: String?,
        val durationMinutes: Int,
        val isBillable: Boolean,
    )

    companion object {
        private val isoDatePattern = Regex("\\d{4}-\\d{2}-\\d{2}")
        private val timestampFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")

        private fun parseUuid(
            value: String,
            field: String,
        ): UUID =
            try {
                UUID.fromString(value)
            } catch (_: IllegalArgumentException) {
                throw InvalidTimeEntryException("$field must be a valid UUID")
            }

        private fun parseDate(
            value: String,
            field: String,
        ): LocalDate {
            if (!isoDatePattern.matches(value)) {
                throw InvalidTimeEntryException("$field must use YYYY-MM-DD format")
            }
            return try {
                LocalDate.parse(value, DateTimeFormatter.ISO_LOCAL_DATE)
            } catch (_: DateTimeParseException) {
                throw InvalidTimeEntryException("$field must use YYYY-MM-DD format")
            }
        }

        private fun parseTime(
            value: String?,
            field: String,
        ): String? =
            value?.let {
                try {
                    LocalTime.parse(it, DateTimeFormatter.ISO_LOCAL_TIME).toString()
                } catch (_: DateTimeParseException) {
                    throw InvalidTimeEntryException("$field must use ISO local time format")
                }
            }

        private fun currentTimestamp(): String = LocalDateTime.now(ZoneOffset.UTC).format(timestampFormatter)
    }
}
