"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getLocalTimeZone, parseDate, startOfMonth, startOfWeek, startOfYear, today } from "@internationalized/date";

export const defaultFilters = {
  activePeriod: "month",
  startDate: "",
  endDate: "",
};

function getUtcOffsetMinutes() {
  return new Date().getTimezoneOffset();
}

function resolvePeriodRange(period) {
  const endDate = today(getLocalTimeZone());
  const startDateByPeriod = {
    day: endDate,
    week: startOfWeek(endDate, "en-US", "mon"),
    month: startOfMonth(endDate),
    year: startOfYear(endDate),
  };
  return { startDate: startDateByPeriod[period].toString(), endDate: endDate.toString() };
}

export function useDateRangeFilters(filters, onFiltersChange) {
  const dateRangeValue = useMemo(() => {
    if (filters.activePeriod || !filters.startDate || !filters.endDate) return null;
    return { start: parseDate(filters.startDate), end: parseDate(filters.endDate) };
  }, [filters.activePeriod, filters.startDate, filters.endDate]);

  const handlePeriodChange = (period) => onFiltersChange({ activePeriod: period, ...resolvePeriodRange(period) });

  const handleDateRangeChange = (range) => onFiltersChange({
    startDate: range?.start?.toString() ?? "",
    endDate: range?.end?.toString() ?? "",
    activePeriod: null,
  });

  return { dateRangeValue, handlePeriodChange, handleDateRangeChange };
}

export function useFiltersState(fetchReport) {
  const [filters, setFilters] = useState(defaultFilters);
  const latestFiltersRef = useRef(defaultFilters);

  useEffect(() => { latestFiltersRef.current = filters; }, [filters]);

  useEffect(() => {
    fetchReport({ ...resolvePeriodRange(defaultFilters.activePeriod), utcOffsetMinutes: getUtcOffsetMinutes() });
  }, [fetchReport]);

  const handleFiltersChange = useCallback(
    (patch) => {
      const prev = latestFiltersRef.current;
      const next = { ...prev, ...patch };
      setFilters(next);

      if (!next.startDate || !next.endDate) return;
      return fetchReport({
        startDate: next.startDate,
        endDate: next.endDate,
        utcOffsetMinutes: getUtcOffsetMinutes(),
      });
    },
    [fetchReport],
  );

  const refetch = useCallback(() => {
    const snapshotFilters = latestFiltersRef.current;
    if (!snapshotFilters.startDate || !snapshotFilters.endDate) return;
    return fetchReport({
      startDate: snapshotFilters.startDate,
      endDate: snapshotFilters.endDate,
      utcOffsetMinutes: getUtcOffsetMinutes(),
    });
  }, [fetchReport]);

  return { filters, handleFilters: handleFiltersChange, refetch };
}
