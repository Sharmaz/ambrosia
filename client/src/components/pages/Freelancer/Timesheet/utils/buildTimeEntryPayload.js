import { snapToQuarterHour } from "./quarterHour";

export function buildTimeEntryPayload({ projectId, taskId, entryDate, description, durationMinutes, startTime, endTime }) {
  const trimmedDescription = description?.trim();
  return {
    projectId,
    taskId,
    entryDate,
    description: trimmedDescription || null,
    durationMinutes: snapToQuarterHour(durationMinutes),
    startTime: startTime ?? null,
    endTime: endTime ?? null,
  };
}
