"use client";

import { Card, CardBody } from "@heroui/react";

export function ReportProjectsCard({ projectRow, taskRows }) {
  return (
    <Card shadow="none" className="border border-gray-200 rounded-lg">
      <CardBody className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-sm truncate">{projectRow.projectName}</p>
            <p className="text-xs text-gray-500 truncate">{projectRow.clientName}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold text-green-900">{projectRow.amount}</p>
            <p className="text-xs text-gray-500">{projectRow.duration}</p>
          </div>
        </div>
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {taskRows.map((taskRow) => (
            <div key={taskRow.rowKey} className="flex items-center justify-between gap-3 pt-2 text-xs">
              <span className="min-w-0 truncate text-gray-700">{taskRow.taskName}</span>
              <span className="shrink-0 text-gray-500">{taskRow.duration} · {taskRow.amount}</span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
