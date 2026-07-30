import { TextEncoder } from "node:util";

import { act, renderHook, waitFor } from "@testing-library/react";

import {
  ADMIN_ACTIVITY_NOTIFICATION_BADGE,
  ADMIN_ACTIVITY_NOTIFICATION_ICON,
  ADMIN_ACTIVITY_TEST_NOTIFICATION_TAG,
  getAdminActivityNotificationCopy,
} from "@/lib/adminNotifications";
import {
  deleteAdminPushSubscription,
  getAdminPushVapidPublicKey,
  registerAdminPushSubscription,
} from "@/services/adminNotificationsService";

import { useAdminWebPush } from "../useAdminWebPush";

jest.mock("@/services/adminNotificationsService", () => ({
  deleteAdminPushSubscription: jest.fn(),
  getAdminPushVapidPublicKey: jest.fn(),
  registerAdminPushSubscription: jest.fn(),
}));

function installWebPushGlobals({ permission = "granted", subscription = null } = {}) {
  const currentSubscription = { value: subscription };
  const showNotification = jest.fn(async () => undefined);
  const pushManager = {
    getSubscription: jest.fn(async () => currentSubscription.value),
    subscribe: jest.fn(async () => {
      currentSubscription.value = makeSubscription("https://push.example/new");
      return currentSubscription.value;
    }),
  };

  Object.defineProperty(window, "PushManager", {
    configurable: true,
    value: function PushManager() {},
  });
  Object.defineProperty(window, "Notification", {
    configurable: true,
    value: {
      permission,
      requestPermission: jest.fn(async () => "granted"),
    },
  });
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      ready: Promise.resolve({ pushManager, showNotification }),
      getRegistration: jest.fn(async () => ({ active: true })),
    },
  });
  Object.defineProperty(navigator, "userAgent", {
    configurable: true,
    value: "jest-agent",
  });
  Object.defineProperty(navigator, "language", {
    configurable: true,
    value: "en-US",
  });
  const cryptoMock = {
    subtle: {
      digest: jest.fn(async () => new Uint8Array([0xab, 0xcd, 0xef, 0x12, 0x34, 0x56]).buffer),
    },
  };
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: cryptoMock,
  });
  Object.defineProperty(globalThis, "TextEncoder", {
    configurable: true,
    value: TextEncoder,
  });
  Object.defineProperty(window, "crypto", {
    configurable: true,
    value: cryptoMock,
  });
  window.atob = jest.fn(() => "\u0001\u0002\u0003");

  return { pushManager, currentSubscription, showNotification };
}

function makeSubscription(endpoint) {
  return {
    endpoint,
    unsubscribe: jest.fn(async () => true),
    toJSON: () => ({
      endpoint,
      keys: {
        p256dh: "p256dh",
        auth: "auth",
      },
    }),
  };
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("useAdminWebPush", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getAdminPushVapidPublicKey.mockResolvedValue({ publicKey: "BElu" });
    registerAdminPushSubscription.mockResolvedValue({ id: "sub-1" });
    deleteAdminPushSubscription.mockResolvedValue({ revoked: true });
  });

  afterEach(() => {
    jest.useRealTimers();
    delete window.PushManager;
    delete window.Notification;
    delete globalThis.crypto;
    delete globalThis.TextEncoder;
    delete window.crypto;
    delete navigator.serviceWorker;
  });

  it("reports unsupported when Push APIs are unavailable", () => {
    delete window.PushManager;
    delete window.Notification;
    delete navigator.serviceWorker;

    const { result } = renderHook(() => useAdminWebPush());

    expect(result.current.isSupported).toBe(false);
    expect(result.current.permission).toBe("unsupported");
  });

  it("subscribes with VAPID public key and stores subscription in backend", async () => {
    const { pushManager } = installWebPushGlobals();
    const { result } = renderHook(() => useAdminWebPush());

    await act(async () => {
      const subscribeResult = await result.current.subscribe();
      expect(subscribeResult.ok).toBe(true);
    });

    expect(getAdminPushVapidPublicKey).toHaveBeenCalled();
    expect(pushManager.subscribe).toHaveBeenCalledWith(expect.objectContaining({ userVisibleOnly: true }));
    expect(registerAdminPushSubscription).toHaveBeenCalledWith({
      endpoint: "https://push.example/new",
      keys: { p256dh: "p256dh", auth: "auth" },
      userAgent: "jest-agent",
    });
  });

  it("does not subscribe when browser permission is denied", async () => {
    installWebPushGlobals({ permission: "denied" });
    const { result } = renderHook(() => useAdminWebPush());

    await act(async () => {
      const subscribeResult = await result.current.subscribe();
      expect(subscribeResult).toEqual({ ok: false, reason: "denied" });
    });

    expect(registerAdminPushSubscription).not.toHaveBeenCalled();
  });

  it("returns a VAPID unavailable reason when public key cannot be loaded", async () => {
    const { pushManager } = installWebPushGlobals();
    getAdminPushVapidPublicKey.mockRejectedValueOnce(new Error("admin-web-push-unavailable"));
    const { result } = renderHook(() => useAdminWebPush());

    await act(async () => {
      const subscribeResult = await result.current.subscribe();
      expect(subscribeResult).toEqual({ ok: false, reason: "vapidUnavailable" });
    });

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(registerAdminPushSubscription).not.toHaveBeenCalled();
  });

  it("does not subscribe when VAPID public key response is empty", async () => {
    const { pushManager } = installWebPushGlobals();
    getAdminPushVapidPublicKey.mockResolvedValueOnce(null);
    const { result } = renderHook(() => useAdminWebPush());

    await act(async () => {
      const subscribeResult = await result.current.subscribe();
      expect(subscribeResult).toEqual({ ok: false, reason: "vapidUnavailable" });
    });

    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(registerAdminPushSubscription).not.toHaveBeenCalled();
  });

  it("returns service worker unavailable when readiness hangs without registration during subscribe", async () => {
    jest.useFakeTimers();
    installWebPushGlobals();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: new Promise(() => {}),
        getRegistration: jest.fn(async () => null),
      },
    });
    const { result } = renderHook(() => useAdminWebPush());

    let subscribePromise;
    act(() => {
      subscribePromise = result.current.subscribe();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await flushPromises();
      jest.advanceTimersByTime(10000);
      await flushPromises();
    });
    await expect(subscribePromise).resolves.toEqual({ ok: false, reason: "serviceWorkerUnavailable" });

    expect(result.current.loading).toBe(false);
    expect(registerAdminPushSubscription).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it("returns timeout when service worker readiness hangs with an existing registration during subscribe", async () => {
    jest.useFakeTimers();
    installWebPushGlobals();
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        ready: new Promise(() => {}),
        getRegistration: jest.fn(async () => ({ installing: true })),
      },
    });
    const { result } = renderHook(() => useAdminWebPush());

    let subscribePromise;
    act(() => {
      subscribePromise = result.current.subscribe();
    });

    await act(async () => {
      await flushPromises();
      jest.advanceTimersByTime(10000);
      await flushPromises();
    });
    await expect(subscribePromise).resolves.toEqual({ ok: false, reason: "timeout" });

    expect(result.current.loading).toBe(false);
    jest.useRealTimers();
  });

  it("removes existing subscription from backend and browser", async () => {
    const existingSubscription = makeSubscription("https://push.example/existing");
    installWebPushGlobals({ subscription: existingSubscription });
    const { result } = renderHook(() => useAdminWebPush());

    await waitFor(() => expect(result.current.subscriptionEndpoint).toBe("https://push.example/existing"));
    await act(async () => {
      const unsubscribeResult = await result.current.unsubscribe();
      expect(unsubscribeResult.ok).toBe(true);
    });

    expect(deleteAdminPushSubscription).toHaveBeenCalledWith("https://push.example/existing");
    expect(existingSubscription.unsubscribe).toHaveBeenCalled();
    expect(result.current.subscriptionEndpoint).toBe(null);
  });

  it("returns timeout and clears loading when browser unsubscribe hangs", async () => {
    const existingSubscription = makeSubscription("https://push.example/existing");
    existingSubscription.unsubscribe = jest.fn(() => new Promise(() => {}));
    installWebPushGlobals({ subscription: existingSubscription });
    const { result } = renderHook(() => useAdminWebPush());

    await waitFor(() => expect(result.current.subscriptionEndpoint).toBe("https://push.example/existing"));

    jest.useFakeTimers();
    let unsubscribePromise;
    act(() => {
      unsubscribePromise = result.current.unsubscribe();
    });

    expect(result.current.loading).toBe(true);

    await act(async () => {
      await flushPromises();
    });
    expect(existingSubscription.unsubscribe).toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(10000);
      await flushPromises();
    });
    await expect(unsubscribePromise).resolves.toEqual({ ok: false, reason: "timeout" });

    expect(deleteAdminPushSubscription).toHaveBeenCalledWith("https://push.example/existing");
    expect(result.current.loading).toBe(false);
    jest.useRealTimers();
  });

  it("summarizes the current subscription endpoint without exposing the full URL", async () => {
    const existingSubscription = makeSubscription("https://push.example/existing-secret");
    installWebPushGlobals({ subscription: existingSubscription });
    const { result } = renderHook(() => useAdminWebPush());

    await waitFor(() => expect(result.current.subscriptionSummary).toEqual({
      endpointHost: "push.example",
      endpointHash: "abcdef123456",
    }));
  });

  it("shows a local test notification through the service worker", async () => {
    const { showNotification } = installWebPushGlobals();
    const { result } = renderHook(() => useAdminWebPush());

    await act(async () => {
      const notificationResult = await result.current.showTestNotification();
      expect(notificationResult.ok).toBe(true);
    });

    expect(showNotification).toHaveBeenCalledWith(
      getAdminActivityNotificationCopy("en-US").title,
      expect.objectContaining({
        body: getAdminActivityNotificationCopy("en-US").body,
        icon: ADMIN_ACTIVITY_NOTIFICATION_ICON,
        badge: ADMIN_ACTIVITY_NOTIFICATION_BADGE,
        tag: ADMIN_ACTIVITY_TEST_NOTIFICATION_TAG,
      }),
    );
  });
});
