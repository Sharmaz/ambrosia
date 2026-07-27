"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useAdminNotificationsWebsocket() {
  const [connected, setConnected] = useState(false);
  const notificationListenersRef = useRef(new Set());

  const onNotification = useCallback((listener) => {
    notificationListenersRef.current.add(listener);
    return () => notificationListenersRef.current.delete(listener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let eventSource;
    let shouldReconnect = true;

    const connect = () => {
      eventSource = new EventSource("/api/ws-admin-notifications");

      eventSource.onopen = () => {
        setConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.type === "admin_notification" && data.notification) {
            notificationListenersRef.current.forEach((listener) => listener(data.notification));
            window.electron?.ipc?.send?.("notifications:admin-activity");
            window.dispatchEvent(
              new CustomEvent("adminNotifications:new", {
                detail: { notification: data.notification },
              }),
            );
          }
        } catch (err) {
          console.warn("SSE admin notifications mensaje no procesado", err);
        }
      };

      eventSource.onerror = () => {
        setConnected(false);
        eventSource.close();
        if (shouldReconnect) {
          setTimeout(async () => {
            try {
              await fetch("/api/auth/refresh", { method: "POST" });
            } catch {}
            connect();
          }, 3000);
        }
      };
    };

    connect();

    return () => {
      shouldReconnect = false;
      if (eventSource) eventSource.close();
    };
  }, []);

  return { connected, onNotification };
}
