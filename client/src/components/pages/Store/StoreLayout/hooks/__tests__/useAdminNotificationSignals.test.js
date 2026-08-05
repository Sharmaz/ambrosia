import { act, renderHook, waitFor } from "@testing-library/react";

import { useAdminNotificationsWebsocket } from "@/hooks/useAdminNotificationsWebsocket";
import {
  ADMIN_NOTIFICATION_CATEGORY_WALLET,
  ADMIN_NOTIFICATION_PREFERENCES_CHANGED_EVENT,
  ADMIN_NOTIFICATIONS_NEW_EVENT,
  ADMIN_NOTIFICATIONS_REFRESH_UNREAD_COUNT_EVENT,
  ADMIN_NOTIFICATIONS_ROUTE,
} from "@/lib/adminNotifications";
import {
  getAdminNotificationPreferences,
  getAdminNotifications,
} from "@/services/adminNotificationsService";

import { showAdminNotificationToast } from "../../adminNotificationToast";
import { useAdminNotificationSignals } from "../useAdminNotificationSignals";

jest.mock("@/hooks/useAdminNotificationsWebsocket", () => ({
  useAdminNotificationsWebsocket: jest.fn(),
}));

jest.mock("@/services/adminNotificationsService", () => ({
  getAdminNotificationPreferences: jest.fn(),
  getAdminNotifications: jest.fn(),
}));

jest.mock("../../adminNotificationToast", () => ({
  showAdminNotificationToast: jest.fn(),
}));

const notificationsTranslations = (translationKey) => translationKey;

let liveNotificationListener;
let areLiveNotificationsConnected;

function renderAdminNotificationSignals(options = {}) {
  return renderHook(() => useAdminNotificationSignals({
    enabled: options.enabled ?? true,
    pathname: options.pathname ?? "/store",
    notificationsTranslations,
  }));
}

describe("useAdminNotificationSignals", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    liveNotificationListener = null;
    areLiveNotificationsConnected = true;
    getAdminNotifications.mockResolvedValue([
      { id: "notification-1", category: ADMIN_NOTIFICATION_CATEGORY_WALLET },
    ]);
    getAdminNotificationPreferences.mockResolvedValue([
      {
        category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
        inAppEnabled: true,
        pushEnabled: true,
      },
    ]);
    useAdminNotificationsWebsocket.mockImplementation(() => ({
      connected: areLiveNotificationsConnected,
      onNotification: (listener) => {
        liveNotificationListener = listener;
        return jest.fn();
      },
    }));
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: undefined,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("loads unread notification count when enabled", async () => {
    const { result } = renderAdminNotificationSignals();

    await waitFor(() => expect(result.current.notificationUnreadCount).toBe(1));

    expect(getAdminNotifications).toHaveBeenCalledWith({ unreadOnly: true, limit: 100 });
    expect(getAdminNotificationPreferences).toHaveBeenCalled();
  });

  it("does not fetch notifications or preferences when disabled", async () => {
    renderAdminNotificationSignals({ enabled: false });

    await act(async () => {
      await Promise.resolve();
    });

    expect(getAdminNotifications).not.toHaveBeenCalled();
    expect(getAdminNotificationPreferences).not.toHaveBeenCalled();
  });

  it("increments unread count and shows toast for live notifications", async () => {
    const { result } = renderAdminNotificationSignals();

    await waitFor(() => expect(liveNotificationListener).toBeTruthy());
    await waitFor(() => expect(getAdminNotificationPreferences).toHaveBeenCalled());

    act(() => {
      liveNotificationListener({
        id: "notification-2",
        category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
      });
    });

    expect(result.current.notificationUnreadCount).toBe(2);
    expect(showAdminNotificationToast).toHaveBeenCalledWith(
      { id: "notification-2", category: ADMIN_NOTIFICATION_CATEGORY_WALLET },
      notificationsTranslations,
    );
  });

  it("increments unread count without toast when in-app preference is disabled", async () => {
    getAdminNotificationPreferences.mockResolvedValueOnce([
      {
        category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
        inAppEnabled: false,
        pushEnabled: true,
      },
    ]);
    const { result } = renderAdminNotificationSignals();

    await waitFor(() => expect(liveNotificationListener).toBeTruthy());
    await waitFor(() => expect(getAdminNotificationPreferences).toHaveBeenCalled());

    act(() => {
      liveNotificationListener({
        id: "notification-2",
        category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
      });
    });

    expect(result.current.notificationUnreadCount).toBe(2);
    expect(showAdminNotificationToast).not.toHaveBeenCalled();
  });

  it("does not show toast while the admin is already viewing notifications", async () => {
    renderAdminNotificationSignals({ pathname: ADMIN_NOTIFICATIONS_ROUTE });

    await waitFor(() => expect(liveNotificationListener).toBeTruthy());
    await waitFor(() => expect(getAdminNotificationPreferences).toHaveBeenCalled());

    act(() => {
      liveNotificationListener({
        id: "notification-2",
        category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
      });
    });

    expect(showAdminNotificationToast).not.toHaveBeenCalled();
  });

  it("refreshes unread count from the global refresh event", async () => {
    getAdminNotifications
      .mockResolvedValueOnce([{ id: "notification-1" }])
      .mockResolvedValueOnce([{ id: "notification-1" }, { id: "notification-2" }]);
    const { result } = renderAdminNotificationSignals();

    await waitFor(() => expect(result.current.notificationUnreadCount).toBe(1));

    act(() => {
      window.dispatchEvent(new Event(ADMIN_NOTIFICATIONS_REFRESH_UNREAD_COUNT_EVENT));
    });

    await waitFor(() => expect(result.current.notificationUnreadCount).toBe(2));
  });

  it("refreshes unread count from service worker messages", async () => {
    let serviceWorkerMessageListener;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        addEventListener: jest.fn((eventName, listener) => {
          if (eventName === "message") serviceWorkerMessageListener = listener;
        }),
        removeEventListener: jest.fn(),
      },
    });
    getAdminNotifications
      .mockResolvedValueOnce([{ id: "notification-1" }])
      .mockResolvedValueOnce([{ id: "notification-1" }, { id: "notification-2" }]);
    const { result } = renderAdminNotificationSignals();

    await waitFor(() => expect(result.current.notificationUnreadCount).toBe(1));

    act(() => {
      serviceWorkerMessageListener({
        data: { type: ADMIN_NOTIFICATIONS_REFRESH_UNREAD_COUNT_EVENT },
      });
    });

    await waitFor(() => expect(result.current.notificationUnreadCount).toBe(2));
  });

  it("reloads in-app toast preferences when preferences change", async () => {
    getAdminNotificationPreferences
      .mockResolvedValueOnce([
        {
          category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
          inAppEnabled: false,
          pushEnabled: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
          inAppEnabled: true,
          pushEnabled: true,
        },
      ]);
    renderAdminNotificationSignals();

    await waitFor(() => expect(liveNotificationListener).toBeTruthy());
    await waitFor(() => expect(getAdminNotificationPreferences).toHaveBeenCalledTimes(1));

    act(() => {
      window.dispatchEvent(new Event(ADMIN_NOTIFICATION_PREFERENCES_CHANGED_EVENT));
    });

    await waitFor(() => expect(getAdminNotificationPreferences).toHaveBeenCalledTimes(2));

    act(() => {
      liveNotificationListener({
        id: "notification-2",
        category: ADMIN_NOTIFICATION_CATEGORY_WALLET,
      });
    });

    expect(showAdminNotificationToast).toHaveBeenCalled();
  });

  it("polls unread notifications and publishes new notifications when live channel is disconnected", async () => {
    jest.useFakeTimers();
    areLiveNotificationsConnected = false;
    getAdminNotifications
      .mockResolvedValueOnce([{ id: "notification-1" }])
      .mockResolvedValueOnce([
        { id: "notification-2", category: ADMIN_NOTIFICATION_CATEGORY_WALLET },
        { id: "notification-1", category: ADMIN_NOTIFICATION_CATEGORY_WALLET },
      ]);
    const dispatchedEvents = [];
    jest.spyOn(window, "dispatchEvent").mockImplementation((event) => {
      dispatchedEvents.push(event);
      return true;
    });
    const { result } = renderAdminNotificationSignals();

    await waitFor(() => expect(result.current.notificationUnreadCount).toBe(1));
    await waitFor(() => expect(getAdminNotificationPreferences).toHaveBeenCalled());

    await act(async () => {
      jest.advanceTimersByTime(10000);
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.notificationUnreadCount).toBe(2));
    expect(dispatchedEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: ADMIN_NOTIFICATIONS_NEW_EVENT,
        detail: {
          notification: { id: "notification-2", category: ADMIN_NOTIFICATION_CATEGORY_WALLET },
        },
      }),
    ]));
    expect(showAdminNotificationToast).toHaveBeenCalledWith(
      { id: "notification-2", category: ADMIN_NOTIFICATION_CATEGORY_WALLET },
      notificationsTranslations,
    );
  });
});
