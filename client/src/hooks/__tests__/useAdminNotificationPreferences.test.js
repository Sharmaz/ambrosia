import { act, renderHook, waitFor } from "@testing-library/react";

import { ADMIN_NOTIFICATION_CATEGORY_WALLET } from "@/lib/adminNotifications";
import {
  getAdminNotificationPreferences,
  updateAdminNotificationPreference,
} from "@/services/adminNotificationsService";

import { useAdminNotificationPreferences } from "../useAdminNotificationPreferences";

jest.mock("@/services/adminNotificationsService", () => ({
  getAdminNotificationPreferences: jest.fn(),
  updateAdminNotificationPreference: jest.fn(),
}));

describe("useAdminNotificationPreferences", () => {
  const walletPreference = {
    category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
    inAppEnabled: true,
    pushEnabled: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    getAdminNotificationPreferences.mockResolvedValue([walletPreference]);
    updateAdminNotificationPreference.mockImplementation(async (preferenceUpdate) => preferenceUpdate);
  });

  it("loads notification preferences and exposes the wallet preference", async () => {
    const renderedNotificationPreferencesHook = renderHook(() => useAdminNotificationPreferences());

    expect(renderedNotificationPreferencesHook.result.current.loading).toBe(true);

    await waitFor(() => expect(renderedNotificationPreferencesHook.result.current.loading).toBe(false));

    expect(getAdminNotificationPreferences).toHaveBeenCalled();
    expect(renderedNotificationPreferencesHook.result.current.preferences).toEqual([walletPreference]);
    expect(renderedNotificationPreferencesHook.result.current.walletPreference).toEqual(walletPreference);
    expect(renderedNotificationPreferencesHook.result.current.error).toBeNull();
  });

  it("uses an empty preference list when backend response is not an array", async () => {
    getAdminNotificationPreferences.mockResolvedValueOnce(null);

    const renderedNotificationPreferencesHook = renderHook(() => useAdminNotificationPreferences());

    await waitFor(() => expect(renderedNotificationPreferencesHook.result.current.loading).toBe(false));

    expect(renderedNotificationPreferencesHook.result.current.preferences).toEqual([]);
    expect(renderedNotificationPreferencesHook.result.current.walletPreference).toBeUndefined();
  });

  it("stores fetch errors and clears preferences", async () => {
    const fetchError = new Error("failed");
    getAdminNotificationPreferences.mockRejectedValueOnce(fetchError);

    const renderedNotificationPreferencesHook = renderHook(() => useAdminNotificationPreferences());

    await waitFor(() => expect(renderedNotificationPreferencesHook.result.current.loading).toBe(false));

    expect(renderedNotificationPreferencesHook.result.current.preferences).toEqual([]);
    expect(renderedNotificationPreferencesHook.result.current.error).toBe(fetchError);
  });

  it("updates an existing preference", async () => {
    const updatedWalletPreference = {
      category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
      inAppEnabled: false,
      pushEnabled: true,
    };
    updateAdminNotificationPreference.mockResolvedValueOnce(updatedWalletPreference);
    const renderedNotificationPreferencesHook = renderHook(() => useAdminNotificationPreferences());

    await waitFor(() => expect(renderedNotificationPreferencesHook.result.current.loading).toBe(false));

    await act(async () => {
      await renderedNotificationPreferencesHook.result.current.updatePreference(updatedWalletPreference);
    });

    expect(updateAdminNotificationPreference).toHaveBeenCalledWith(updatedWalletPreference);
    expect(renderedNotificationPreferencesHook.result.current.preferences).toEqual([updatedWalletPreference]);
    expect(renderedNotificationPreferencesHook.result.current.walletPreference).toEqual(updatedWalletPreference);
  });

  it("adds a new preference returned by the backend", async () => {
    const reportsPreference = {
      category: "reports",
      inAppEnabled: true,
      pushEnabled: false,
    };
    updateAdminNotificationPreference.mockResolvedValueOnce(reportsPreference);
    const renderedNotificationPreferencesHook = renderHook(() => useAdminNotificationPreferences());

    await waitFor(() => expect(renderedNotificationPreferencesHook.result.current.loading).toBe(false));

    await act(async () => {
      await renderedNotificationPreferencesHook.result.current.updatePreference(reportsPreference);
    });

    expect(renderedNotificationPreferencesHook.result.current.preferences).toEqual([walletPreference, reportsPreference]);
  });

  it("returns null and stores errors when update fails", async () => {
    const updateError = new Error("failed");
    updateAdminNotificationPreference.mockRejectedValueOnce(updateError);
    const renderedNotificationPreferencesHook = renderHook(() => useAdminNotificationPreferences());

    await waitFor(() => expect(renderedNotificationPreferencesHook.result.current.loading).toBe(false));

    let updatedPreference;
    await act(async () => {
      updatedPreference = await renderedNotificationPreferencesHook.result.current.updatePreference({
        category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
        inAppEnabled: false,
        pushEnabled: true,
      });
    });

    expect(updatedPreference).toBeNull();
    expect(renderedNotificationPreferencesHook.result.current.error).toBe(updateError);
    expect(renderedNotificationPreferencesHook.result.current.savingPreference).toBe(false);
  });
});
