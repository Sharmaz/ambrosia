import { act, renderHook, waitFor } from "@testing-library/react";

import { ADMIN_NOTIFICATION_CATEGORY_WALLET } from "@/lib/adminNotifications";
import {
  deleteAdminNotification,
  deleteAllAdminNotifications,
  getAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "@/services/adminNotificationsService";

import { useAdminNotifications } from "../useAdminNotifications";

jest.mock("@/services/adminNotificationsService", () => ({
  deleteAdminNotification: jest.fn(),
  deleteAllAdminNotifications: jest.fn(),
  getAdminNotifications: jest.fn(),
  markAdminNotificationRead: jest.fn(),
  markAllAdminNotificationsRead: jest.fn(),
}));

describe("useAdminNotifications", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.__adminNotificationsLiveConnected = true;
    getAdminNotifications.mockResolvedValue([
      {
        id: "notification-1",
        category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
        title: "Wallet payment sent",
        readAt: null,
      },
    ]);
    deleteAdminNotification.mockResolvedValue({ deleted: true });
    deleteAllAdminNotifications.mockResolvedValue({ deleted: 1 });
    markAdminNotificationRead.mockResolvedValue({ read: true });
    markAllAdminNotificationsRead.mockResolvedValue({ updated: 1 });
  });

  afterEach(() => {
    delete window.__adminNotificationsLiveConnected;
  });

  it("loads notifications", async () => {
    const { result } = renderHook(() => useAdminNotifications());

    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(getAdminNotifications).toHaveBeenCalledWith({
      category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
      unreadOnly: false,
      limit: 100,
    });
    expect(result.current.notifications).toHaveLength(1);
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

    expect(markAllAdminNotificationsRead).toHaveBeenCalledWith(ADMIN_NOTIFICATION_CATEGORY_WALLET);
    expect(result.current.unreadCount).toBe(0);
  });

  it("deletes one notification locally after backend success", async () => {
    const { result } = renderHook(() => useAdminNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteNotification("notification-1");
    });

    expect(deleteAdminNotification).toHaveBeenCalledWith("notification-1");
    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it("deletes all filtered notifications locally after backend success", async () => {
    const { result } = renderHook(() => useAdminNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.deleteAllNotifications();
    });

    expect(deleteAllAdminNotifications).toHaveBeenCalledWith(ADMIN_NOTIFICATION_CATEGORY_WALLET);
    expect(result.current.notifications).toHaveLength(0);
    expect(result.current.unreadCount).toBe(0);
  });

  it("merges live notifications at the top of the feed", async () => {
    const { result } = renderHook(() => useAdminNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("adminNotifications:new", {
          detail: {
            notification: {
              id: "notification-2",
              category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
              title: "Wallet payment received",
              readAt: null,
            },
          },
        }),
      );
    });

    expect(result.current.notifications.map((notification) => notification.id)).toEqual([
      "notification-2",
      "notification-1",
    ]);
  });

  it("tracks global live connection state changes", async () => {
    window.__adminNotificationsLiveConnected = false;
    const { result } = renderHook(() => useAdminNotifications());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.liveConnected).toBe(false);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("adminNotifications:connectionChanged", {
          detail: { connected: true },
        }),
      );
    });

    expect(result.current.liveConnected).toBe(true);
  });
});
