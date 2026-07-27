"use client";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ADMIN_ACTIVITY_ELECTRON_IPC,
  ADMIN_NOTIFICATION_LIVE_EVENT_TYPE,
  ADMIN_NOTIFICATIONS_CONNECTION_CHANGED_EVENT,
  ADMIN_NOTIFICATIONS_LIVE_CONNECTED_STATE_KEY,
  ADMIN_NOTIFICATIONS_NEW_EVENT,
  getAdminActivityNotificationCopy,
} from "@/lib/adminNotifications";

function createElectronNotificationPayload(notification) {
  const notificationCopy = getAdminActivityNotificationCopy(navigator.language);
  return {
    systemTitle: notificationCopy.title,
    systemBody: notificationCopy.body,
    fallbackActivityTitle: notificationCopy.fallbackActivityTitle,
    title: notification.title,
    category: notification.category,
    status: notification.status,
  };
}

function getAdminNotificationFromLiveMessage(liveMessage) {
  if (!liveMessage?.notification) return null;
  if (liveMessage.type && liveMessage.type !== ADMIN_NOTIFICATION_LIVE_EVENT_TYPE) return null;
  return liveMessage.notification;
}

function publishConnectionState(isConnected) {
  window[ADMIN_NOTIFICATIONS_LIVE_CONNECTED_STATE_KEY] = isConnected;
  window.dispatchEvent(
    new CustomEvent(ADMIN_NOTIFICATIONS_CONNECTION_CHANGED_EVENT, {
      detail: { connected: isConnected },
    }),
  );
}

export function useAdminNotificationsWebsocket({ enabled = true } = {}) {
  const [connected, setConnected] = useState(false);
  const notificationListenersRef = useRef(new Set());

  const onNotification = useCallback((listener) => {
    notificationListenersRef.current.add(listener);
    return () => notificationListenersRef.current.delete(listener);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;

    let eventSource;
    let shouldReconnect = true;

    const connect = () => {
      eventSource = new EventSource("/api/ws-admin-notifications");

      eventSource.onopen = () => {
        setConnected(true);
        publishConnectionState(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const liveMessage = JSON.parse(event.data);
          const notification = getAdminNotificationFromLiveMessage(liveMessage);
          if (notification) {
            notificationListenersRef.current.forEach((listener) => listener(notification));
            window.electron?.ipc?.send?.(
              ADMIN_ACTIVITY_ELECTRON_IPC,
              createElectronNotificationPayload(notification),
            );
            window.dispatchEvent(
              new CustomEvent(ADMIN_NOTIFICATIONS_NEW_EVENT, {
                detail: { notification },
              }),
            );
          }
        } catch {
          return;
        }
      };

      eventSource.onerror = () => {
        setConnected(false);
        publishConnectionState(false);
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
  }, [enabled]);

  return { connected, onNotification };
}
