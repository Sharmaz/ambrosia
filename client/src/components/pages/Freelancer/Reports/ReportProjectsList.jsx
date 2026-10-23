"use client";

import { useTranslations } from "next-intl";

import { ReportProjectsCard } from "./ReportProjectsCard";
import { ReportProjectsTable } from "./ReportProjectsTable";

export function ReportProjectsList({ projectGroups, projectRows }) {
  const reportTranslations = useTranslations("freelanceReports");

  if (projectGroups.length === 0) {
    return <p className="text-center text-gray-500 py-12">{reportTranslations("emptyState")}</p>;
  }

  return (
    <section className="w-full">
      <div className="md:hidden space-y-3">
        {projectGroups.map(({ projectRow, taskRows }) => (
          <ReportProjectsCard key={projectRow.rowKey} projectRow={projectRow} taskRows={taskRows} />
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <ReportProjectsTable projectRows={projectRows} />
      </div>
    </section>
  );
}
