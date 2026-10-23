"use client";

import { useMemo } from "react";

import { addToast, Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";

import { PageHeader } from "@/components/shared/PageHeader";
import { PermissionBlockedMessage } from "@/components/shared/PermissionBlockedMessage";
import { printHtmlDocument } from "@/utils/printHtmlDocument";
import { useConfigurations } from "@providers/configurations/configurationsProvider";

import { PeriodFilter } from "../../Store/Reports/Filters";
import { useFiltersState } from "../../Store/Reports/hooks/useFilters";
import { SummaryCard } from "../../Store/Reports/Summary";
import { useFreelanceReport, useReportSatsTotal } from "../hooks";

import { ReportProjectsDetailCard } from "./ReportProjectsDetailCard";
import { buildFreelanceReportCsv, downloadFreelanceReportCsv } from "./utils/reportCsv";
import { buildFreelanceReportHtmlDocument } from "./utils/reportDocument";
import { buildReportProjectGroups, buildReportSummaryStats, flattenReportProjectGroups } from "./utils/reportRows";

export function Reports() {
  const reportTranslations = useTranslations("freelanceReports");
  const { config: businessConfig } = useConfigurations();
  const { report, loading, error: loadError, forbidden, fetchReport } = useFreelanceReport({ skipForbiddenRedirect: true });
  const { filters, handleFilters } = useFiltersState(fetchReport);
  const { totalSatoshis, loading: satsLoading, unavailable: satsUnavailable } = useReportSatsTotal(report?.currencies);

  const projectGroups = useMemo(() => buildReportProjectGroups(report), [report]);
  const projectRows = useMemo(() => flattenReportProjectGroups(projectGroups), [projectGroups]);
  const summaryStats = useMemo(() => buildReportSummaryStats(
    report,
    { totalSatoshis, loading: satsLoading, unavailable: satsUnavailable },
    {
      currencyTotal: (currencyAcronym) => reportTranslations("summary.currencyTotal", { currency: currencyAcronym }),
      totalDuration: reportTranslations("summary.totalDuration"),
      totalSatoshis: reportTranslations("summary.totalSatoshis"),
      satsCalculating: reportTranslations("summary.satsCalculating"),
      satsUnavailable: reportTranslations("summary.satsUnavailable"),
    },
  ), [report, totalSatoshis, satsLoading, satsUnavailable, reportTranslations]);

  const hasProjectRows = projectRows.length > 0;
  const isExportDisabled = loading || !hasProjectRows || satsLoading;

  const handleExportCsv = () => {
    try {
      const csvContent = buildFreelanceReportCsv({
        projectRows,
        summaryStats,
        csvTranslations: {
          project: reportTranslations("project"),
          task: reportTranslations("task"),
          client: reportTranslations("client"),
          duration: reportTranslations("duration"),
          amount: reportTranslations("amount"),
        },
      });
      downloadFreelanceReportCsv(csvContent, report);
    } catch {
      addToast({ color: "danger", description: reportTranslations("toasts.exportCsvError") });
    }
  };

  const handleExportPdf = () => {
    try {
      const reportHtmlDocument = buildFreelanceReportHtmlDocument({
        report,
        projectRows,
        summaryStats,
        businessConfig,
        documentTranslations: {
          reportTitle: reportTranslations("document.reportTitle"),
          businessFallbackName: reportTranslations("document.businessFallbackName"),
          period: reportTranslations("document.period"),
          projects: reportTranslations("document.projects"),
          projectTask: reportTranslations("projectTask"),
          duration: reportTranslations("duration"),
          amount: reportTranslations("amount"),
          noProjects: reportTranslations("emptyState"),
        },
      });
      printHtmlDocument({ htmlContent: reportHtmlDocument, title: reportTranslations("document.reportTitle") });
    } catch {
      addToast({ color: "danger", description: reportTranslations("toasts.exportPdfError") });
    }
  };

  if (forbidden) {
    return (
      <>
        <PageHeader title={reportTranslations("title")} subtitle={reportTranslations("subtitle")} />
        <PermissionBlockedMessage
          title={reportTranslations("permissionBlocked.title")}
          subtitle={reportTranslations("permissionBlocked.subtitle")}
        />
      </>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={reportTranslations("title")}
        subtitle={reportTranslations("subtitle")}
        actions={(
          <PeriodFilter
            filters={filters}
            onFiltersChange={handleFilters}
            disabled={loading}
            subtitle={reportTranslations("periodFilterSubtitle")}
          />
        )}
      />

      {loadError && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {reportTranslations("loadError")}
        </p>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <>
          {hasProjectRows && <SummaryCard stats={summaryStats} />}
          <ReportProjectsDetailCard
            projectGroups={projectGroups}
            projectRows={projectRows}
            isExportDisabled={isExportDisabled}
            onExportCsv={handleExportCsv}
            onExportPdf={handleExportPdf}
          />
        </>
      )}
    </div>
  );
}
