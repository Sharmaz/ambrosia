import { getLocalTimeZone, startOfMonth, startOfWeek, startOfYear, today } from "@internationalized/date";
import { act, renderHook } from "@testing-library/react";

import { defaultFilters, useDateRangeFilters, useFiltersState } from "../useFilters";

let mockFetch;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch = jest.fn().mockResolvedValue({});
});

async function setupHook() {
  const hook = renderHook(() => useFiltersState(mockFetch));
  await act(async () => {});
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({});
  return hook;
}

describe("useFiltersState", () => {
  it("initial filters match defaultFilters", async () => {
    const { result: filtersStateHook } = renderHook(() => useFiltersState(mockFetch));
    await act(async () => {});
    expect(filtersStateHook.current.filters).toEqual(defaultFilters);
  });

  it("auto-fetches the computed date range for the default period on mount", async () => {
    renderHook(() => useFiltersState(mockFetch));
    await act(async () => {});
    const endDate = today(getLocalTimeZone());
    const startDate = startOfMonth(endDate);
    expect(mockFetch).toHaveBeenCalledWith({
      startDate: startDate.toString(),
      endDate: endDate.toString(),
      utcOffsetMinutes: expect.any(Number),
    });
  });

  it("handleFilters with activePeriod and computed dates fetches immediately", async () => {
    const { result: filtersStateHook } = await setupHook();

    await act(async () => {
      filtersStateHook.current.handleFilters({ activePeriod: "week", startDate: "2026-08-03", endDate: "2026-08-07" });
    });

    expect(mockFetch).toHaveBeenCalledWith({
      startDate: "2026-08-03",
      endDate: "2026-08-07",
      utcOffsetMinutes: expect.any(Number),
    });
  });

  it("handleFilters with activePeriod updates filters state", async () => {
    const { result: filtersStateHook } = await setupHook();

    await act(async () => {
      filtersStateHook.current.handleFilters({ activePeriod: "year", startDate: "2026-01-01", endDate: "2026-08-07" });
    });

    expect(filtersStateHook.current.filters.activePeriod).toBe("year");
  });

  it("handleFilters with only startDate does not fetch", async () => {
    const { result: filtersStateHook } = await setupHook();

    act(() => {
      filtersStateHook.current.handleFilters({ startDate: "2024-01-01", activePeriod: null });
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handleFilters with only endDate does not fetch", async () => {
    const { result: filtersStateHook } = await setupHook();

    act(() => {
      filtersStateHook.current.handleFilters({ endDate: "2024-12-31", activePeriod: null });
    });

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("handleFilters fetches when both startDate and endDate are valid", async () => {
    const { result: filtersStateHook } = await setupHook();

    await act(async () => {
      filtersStateHook.current.handleFilters({ startDate: "2024-01-01", activePeriod: null });
    });
    await act(async () => {
      filtersStateHook.current.handleFilters({ endDate: "2024-01-31", activePeriod: null });
    });

    const calls = mockFetch.mock.calls.map((call) => call[0]);
    expect(calls.some((fetchParams) => fetchParams.startDate === "2024-01-01")).toBe(true);
    expect(calls.some((fetchParams) => fetchParams.endDate === "2024-01-31")).toBe(true);
  });

  it("refetch calls fetchReport with current filter state", async () => {
    const { result: filtersStateHook } = await setupHook();

    await act(async () => {
      filtersStateHook.current.handleFilters({ activePeriod: "year", startDate: "2026-01-01", endDate: "2026-08-07" });
    });
    jest.clearAllMocks();

    await act(async () => {
      filtersStateHook.current.refetch();
    });

    expect(mockFetch).toHaveBeenCalledWith({
      startDate: "2026-01-01",
      endDate: "2026-08-07",
      utcOffsetMinutes: expect.any(Number),
    });
  });
});

describe("useDateRangeFilters", () => {
  const baseFilters = { activePeriod: "", startDate: "", endDate: "", productName: "", paymentMethod: "" };

  it("dateRangeValue is null when dates are missing", () => {
    const { result: dateRangeFiltersHook } = renderHook(() => useDateRangeFilters(baseFilters, jest.fn()));
    expect(dateRangeFiltersHook.current.dateRangeValue).toBeNull();
  });

  it("dateRangeValue returns CalendarDate objects when both dates are set", () => {
    const { result: dateRangeFiltersHook } = renderHook(() => useDateRangeFilters({ ...baseFilters, startDate: "2024-01-01", endDate: "2024-01-31" }, jest.fn()),
    );
    expect(dateRangeFiltersHook.current.dateRangeValue.start.toString()).toBe("2024-01-01");
    expect(dateRangeFiltersHook.current.dateRangeValue.end.toString()).toBe("2024-01-31");
  });

  it("handlePeriodChange calls onFiltersChange with activePeriod and the computed date range", () => {
    const onFiltersChange = jest.fn();
    const { result: dateRangeFiltersHook } = renderHook(() => useDateRangeFilters(baseFilters, onFiltersChange));
    const endDate = today(getLocalTimeZone());
    const startDate = startOfWeek(endDate, "en-US", "mon");

    dateRangeFiltersHook.current.handlePeriodChange("week");

    expect(onFiltersChange).toHaveBeenCalledWith({
      activePeriod: "week",
      startDate: startDate.toString(),
      endDate: endDate.toString(),
    });
  });

  it("handlePeriodChange with 'year' computes a range from the first day of the current year", () => {
    const onFiltersChange = jest.fn();
    const { result: dateRangeFiltersHook } = renderHook(() => useDateRangeFilters(baseFilters, onFiltersChange));
    const endDate = today(getLocalTimeZone());
    const startDate = startOfYear(endDate);

    dateRangeFiltersHook.current.handlePeriodChange("year");

    expect(onFiltersChange).toHaveBeenCalledWith({
      activePeriod: "year",
      startDate: startDate.toString(),
      endDate: endDate.toString(),
    });
  });

  it("handlePeriodChange with 'day' computes a range where start equals end", () => {
    const onFiltersChange = jest.fn();
    const { result: dateRangeFiltersHook } = renderHook(() => useDateRangeFilters(baseFilters, onFiltersChange));
    const todayDate = today(getLocalTimeZone()).toString();

    dateRangeFiltersHook.current.handlePeriodChange("day");

    expect(onFiltersChange).toHaveBeenCalledWith({ activePeriod: "day", startDate: todayDate, endDate: todayDate });
  });

  it("dateRangeValue is null when activePeriod is set, even with dates present", () => {
    const { result: dateRangeFiltersHook } = renderHook(() => useDateRangeFilters(
      { ...baseFilters, activePeriod: "month", startDate: "2024-01-01", endDate: "2024-01-31" },
      jest.fn(),
    ));
    expect(dateRangeFiltersHook.current.dateRangeValue).toBeNull();
  });

  it("handleDateRangeChange with a range calls onFiltersChange with stringified dates", () => {
    const onFiltersChange = jest.fn();
    const { result: dateRangeFiltersHook } = renderHook(() => useDateRangeFilters(baseFilters, onFiltersChange));
    dateRangeFiltersHook.current.handleDateRangeChange({
      start: { toString: () => "2024-03-01" },
      end: { toString: () => "2024-03-31" },
    });
    expect(onFiltersChange).toHaveBeenCalledWith({ startDate: "2024-03-01", endDate: "2024-03-31", activePeriod: null });
  });

  it("handleDateRangeChange with null clears dates and activePeriod", () => {
    const onFiltersChange = jest.fn();
    const { result: dateRangeFiltersHook } = renderHook(() => useDateRangeFilters(baseFilters, onFiltersChange));
    dateRangeFiltersHook.current.handleDateRangeChange(null);
    expect(onFiltersChange).toHaveBeenCalledWith({ startDate: "", endDate: "", activePeriod: null });
  });
});
