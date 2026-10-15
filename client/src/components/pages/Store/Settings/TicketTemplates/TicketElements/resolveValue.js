import { DEFAULT_PRINT_FORMATS } from "../defaults";

import { formatPrintDate, formatPrintTime } from "./formatPrintDateTime";
import { sampleConfig, sampleTicket } from "./sampleData";

export function resolveValue(templateText, businessConfig, printFormats = DEFAULT_PRINT_FORMATS, printedAt = new Date()) {
  if (!templateText) return "";
  const resolvedBusinessConfig = businessConfig ?? sampleConfig;
  const printDate = formatPrintDate(printedAt, printFormats.dateFormat);
  const printTime = formatPrintTime(printedAt, printFormats.timeFormat);
  return templateText
    .replaceAll("{{config.businessName}}", resolvedBusinessConfig.businessName ?? "")
    .replaceAll("{{config.businessAddress}}", resolvedBusinessConfig.businessAddress ?? "")
    .replaceAll("{{config.businessPhone}}", resolvedBusinessConfig.businessPhone ?? "")
    .replaceAll("{{config.businessEmail}}", resolvedBusinessConfig.businessEmail ?? "")
    .replaceAll("{{ticket.id}}", sampleTicket.ticketId)
    .replaceAll("{{ticket.tableName}}", sampleTicket.tableName)
    .replaceAll("{{ticket.roomName}}", sampleTicket.roomName)
    .replaceAll("{{ticket.date}}", sampleTicket.date)
    .replaceAll("{{ticket.total}}", sampleTicket.total.toString())
    .replaceAll("{{ticket.invoice}}", sampleTicket.invoice)
    .replaceAll("{{print.dateTime}}", `${printDate} ${printTime}`)
    .replaceAll("{{print.date}}", printDate)
    .replaceAll("{{print.time}}", printTime);
}
