import { act, renderHook } from "@testing-library/react";

import { useAdminNotificationsWebsocket } from "../useAdminNotificationsWebsocket";

class MockEventSource {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 2;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = MockEventSource.CONNECTING;
    MockEventSource.instances.push(this);
  }

  close() {
    this.readyState = MockEventSource.CLOSED;
  }

  static latest() {
    return MockEventSource.instances[MockEventSource.instances.length - 1];
  }

  static reset() {
    MockEventSource.instances = [];
  }
}

describe("useAdminNotificationsWebsocket", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    MockEventSource.reset();
    global.EventSource = MockEventSource;
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    window.dispatchEvent = jest.fn();
    window.electron = undefined;
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    delete global.EventSource;
    delete global.fetch;
    delete window.electron;
  });

  it("connects to admin notifications SSE bridge", () => {
    renderHook(() => useAdminNotificationsWebsocket());

    expect(MockEventSource.latest().url).toBe("/api/ws-admin-notifications");
  });

  it("sets connected when EventSource opens", () => {
    const { result } = renderHook(() => useAdminNotificationsWebsocket());

    act(() => {
      MockEventSource.latest().readyState = MockEventSource.OPEN;
      MockEventSource.latest().onopen?.();
    });

    expect(result.current.connected).toBe(true);
  });

  it("notifies listeners and dispatches browser event for admin notifications", () => {
    const listener = jest.fn();
    const notification = {
      id: "notification-1",
      category: "wallet",
      type: "wallet.payment.sent",
      title: "Wallet payment sent",
    };
    const { result } = renderHook(() => useAdminNotificationsWebsocket());

    act(() => {
      result.current.onNotification(listener);
      MockEventSource.latest().onmessage?.({
        data: JSON.stringify({ type: "admin_notification", notification }),
      });
    });

    expect(listener).toHaveBeenCalledWith(notification);
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.any(CustomEvent));
  });

  it("sends a generic native notification IPC event in Electron", () => {
    window.electron = { ipc: { send: jest.fn() } };
    const notification = {
      id: "notification-1",
      category: "wallet",
      type: "wallet.payment.sent",
      title: "Wallet payment sent",
    };
    renderHook(() => useAdminNotificationsWebsocket());

    act(() => {
      MockEventSource.latest().onmessage?.({
        data: JSON.stringify({ type: "admin_notification", notification }),
      });
    });

    expect(window.electron.ipc.send).toHaveBeenCalledWith("notifications:admin-activity");
  });

  it("ignores connection message events", () => {
    const listener = jest.fn();
    const { result } = renderHook(() => useAdminNotificationsWebsocket());

    act(() => {
      result.current.onNotification(listener);
      MockEventSource.latest().onmessage?.({ data: JSON.stringify({ type: "connected" }) });
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("refreshes auth and reconnects after errors", async () => {
    renderHook(() => useAdminNotificationsWebsocket());

    act(() => {
      MockEventSource.latest().readyState = MockEventSource.OPEN;
      MockEventSource.latest().onopen?.();
      MockEventSource.latest().onerror?.();
    });

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
    });

    expect(fetch).toHaveBeenCalledWith("/api/auth/refresh", { method: "POST" });
    expect(MockEventSource.instances).toHaveLength(2);
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = renderHook(() => useAdminNotificationsWebsocket());
    const eventSource = MockEventSource.latest();

    unmount();

    expect(eventSource.readyState).toBe(MockEventSource.CLOSED);
  });
});
