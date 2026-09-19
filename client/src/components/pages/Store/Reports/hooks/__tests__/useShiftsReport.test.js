import { act, renderHook } from "@testing-library/react";

import { getShiftsReport } from "@/services/shiftsService";

import { useShiftsReport } from "../useShiftsReport";

jest.mock("@/services/shiftsService", () => ({
  getShiftsReport: jest.fn(),
}));

const SHIFTS_REPORT_FIXTURE = {
  shifts: [],
  totalInitialAmount: 0,
  totalFinalAmount: 0,
  totalExpectedAmount: 0,
  totalDifference: 0,
  byPaymentMethod: [],
};

describe("useShiftsReport", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("starts with no data, not loading, no error", () => {
    const { result } = renderHook(() => useShiftsReport());
    expect(result.current.shiftsReportData).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it("sets shiftsReportData after a successful fetch", async () => {
    getShiftsReport.mockResolvedValue(SHIFTS_REPORT_FIXTURE);
    const { result } = renderHook(() => useShiftsReport());

    await act(async () => {
      await result.current.fetchShiftsReport({ period: "month" });
    });

    expect(getShiftsReport).toHaveBeenCalledWith({ period: "month" });
    expect(result.current.shiftsReportData).toEqual(SHIFTS_REPORT_FIXTURE);
    expect(result.current.loading).toBe(false);
  });

  it("sets error and re-throws when the fetch fails", async () => {
    const fetchError = new Error("Network error");
    getShiftsReport.mockRejectedValue(fetchError);
    const { result } = renderHook(() => useShiftsReport());

    await act(async () => {
      await result.current.fetchShiftsReport({ period: "month" }).catch(() => {});
    });

    expect(result.current.error).toBe(fetchError);
    expect(result.current.loading).toBe(false);
  });

  it("fetchShiftsReport re-throws the error for the caller to handle", async () => {
    getShiftsReport.mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() => useShiftsReport());

    await expect(
      act(async () => result.current.fetchShiftsReport({ period: "month" })),
    ).rejects.toThrow("Network error");
  });

  it("loading is true while the fetch is in flight", async () => {
    let resolveFetch;
    getShiftsReport.mockReturnValue(new Promise((resolve) => { resolveFetch = resolve; }));
    const { result } = renderHook(() => useShiftsReport());

    act(() => {
      result.current.fetchShiftsReport({ period: "month" });
    });
    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolveFetch(SHIFTS_REPORT_FIXTURE);
    });
    expect(result.current.loading).toBe(false);
  });

  it("fetchShiftsReport returns the same value it stores in shiftsReportData", async () => {
    getShiftsReport.mockResolvedValue(SHIFTS_REPORT_FIXTURE);
    const { result } = renderHook(() => useShiftsReport());

    let returned;
    await act(async () => {
      returned = await result.current.fetchShiftsReport({ period: "month" });
    });

    expect(returned).toEqual(SHIFTS_REPORT_FIXTURE);
  });
});
