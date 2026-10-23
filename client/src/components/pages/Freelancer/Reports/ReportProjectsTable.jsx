"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@heroui/react";
import { useTranslations } from "next-intl";

import { REPORT_ROW_TYPES } from "./utils/reportRows";

export function ReportProjectsTable({ projectRows }) {
  const reportTranslations = useTranslations("freelanceReports");

  return (
    <Table className="min-w-[640px]" removeWrapper aria-label={reportTranslations("tableAriaLabel")}>
      <TableHeader>
        <TableColumn className="py-2 px-3">{reportTranslations("projectTask")}</TableColumn>
        <TableColumn className="py-2 px-3">{reportTranslations("client")}</TableColumn>
        <TableColumn className="py-2 px-3">{reportTranslations("duration")}</TableColumn>
        <TableColumn className="py-2 px-3 text-right">{reportTranslations("amount")}</TableColumn>
      </TableHeader>
      <TableBody>
        {projectRows.map((projectRow) => {
          const isProjectRow = projectRow.rowType === REPORT_ROW_TYPES.project;

          return (
            <TableRow key={projectRow.rowKey} className={isProjectRow ? "bg-green-50" : ""}>
              <TableCell className={isProjectRow ? "max-w-[240px] truncate font-semibold text-green-900" : "max-w-[240px] truncate pl-8"}>
                {isProjectRow ? projectRow.projectName : projectRow.taskName}
              </TableCell>
              <TableCell className="max-w-[180px] truncate">{isProjectRow ? projectRow.clientName : ""}</TableCell>
              <TableCell className={isProjectRow ? "font-medium" : ""}>{projectRow.duration}</TableCell>
              <TableCell className={isProjectRow ? "text-right font-semibold" : "text-right"}>{projectRow.amount}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
