import { act, renderHook, waitFor } from "@testing-library/react";

import {
  getAdminNotificationPreferences,
  getAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  updateAdminNotificationPreference,
} from "@/services/adminNotificationsService";
import { useAdminNotificationsWebsocket } from "@hooks/useAdminNotificationsWebsocket";

import { useAdminNotifications } from "../useAdminNotifications";

jest.mock("@/services/adminNotificationsService", () => ({
  getAdminNotificationPreferences: jest.fn(),
  getAdminNotifications: jest.fn(),
  markAdminNotificationRead: jest.fn(),
  markAllAdminNotificationsRead: jest.fn(),
  updateAdminNotificationPreference: jest.fn(),
}));

jest.mock("@hooks/useAdminNotificationsWebsocket", () => ({
  useAdminNotificationsWebsocket: jest.fn(),
}));

describe("useAdminNotifications", () => {
  let liveListener;

  beforeEach(() => {
    jest.clearAllMocks();
    liveListener = null;
    getAdminNotifications.mockResolvedValue([
      {
        id: "notification-1",
        category: "wallet",
        title: "Wallet payment sent",
        readAt: null,
      },
    ]);
    getAdminNotificationPreferences.mockResolvedValue([
      {
        category: "wallet",
        inAppEnabled: true,
        pushEnabled: true,
      },
    ]);
    markAdminNotificationRead.mockResolvedValue({ read: true });
    markAllAdminNotificationsRead.mockResolvedValue({ updated: 1 });
    updateAdminNotificationPreference.mockResolvedValue({
      category: "wallet",
      inAppEnabled: false,
      pushEnabled: true,
    });
    useAdminNotificationsWebsocket.mockReturnValue({
      connected: true,
      onNotification: (listener) => {
        liveListener = listener;
        return jest.fn();
      },
    });
  });

  it("loads notifications and preferences", async () => {
    const { result } = renderHook(() => useAdminNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getAdminNotifications).toHaveBeenCalledWith({ category: "wallet", unreadOnly: false, limit: 100 });
    expect(getAdminNotificationPreferences).toHaveBeenCalled();
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.preferences).toHaveLength(1);
    expect(result.current.unreadCount).toBe(1);
  });

  it("marks one notification as read locally after backend success", async () => {
    const { result } = renderHook(() => useAdminNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markRead("notification-1");
    });

    expect(markAdminNotificationRead).toHaveBeenCalledWith("notification-1");
    expect(result.current.notifications[0].readAt).toBeTruthy();
  });

  it("marks all filtered notifications as read", async () => {
    const { result } = renderHook(() => useAdminNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.markAllRead();
    });

    expect(markAllAdminNotificationsRead).toHaveBeenCalledWith("wallet");
    expect(result.current.unreadCount).toBe(0);
  });

  it("merges live notifications at the top of the feed", async () => {
    const { result } = renderHook(() => useAdminNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      liveListener({
        id: "notification-2",
        category: "wallet",
        title: "Wallet payment received",
        readAt: null,
      });
    });

    expect(result.current.notifications.map((notification) => notification.id)).toEqual([
      "notification-2",
      "notification-1",
    ]);
  });

  it("updates preferences in local state", async () => {
    const { result } = renderHook(() => useAdminNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.updatePreference({ category: "wallet", inAppEnabled: false, pushEnabled: true });
    });

    expect(updateAdminNotificationPreference).toHaveBeenCalledWith({
      category: "wallet",
      inAppEnabled: false,
      pushEnabled: true,
    });
    expect(result.current.preferences[0].inAppEnabled).toBe(false);
  });
});
