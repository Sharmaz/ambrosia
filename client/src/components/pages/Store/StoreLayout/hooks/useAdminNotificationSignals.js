"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAdminNotificationsWebsocket } from "@/hooks/useAdminNotificationsWebsocket";
import {
  ADMIN_NOTIFICATIONS_NEW_EVENT,
  ADMIN_NOTIFICATIONS_REFRESH_UNREAD_COUNT_EVENT,
  ADMIN_NOTIFICATIONS_ROUTE,
  getNotificationIdSet,
} from "@/lib/adminNotifications";
import { getAdminNotifications } from "@/services/adminNotificationsService";

import { showAdminNotificationToast } from "../adminNotificationToast";

const UNREAD_NOTIFICATION_POLL_INTERVAL_MS = 10000;

function findNewUnreadNotifications(unreadNotifications, knownUnreadNotificationIds) {
  return unreadNotifications.filter(
    (notification) => notification.id && !knownUnreadNotificationIds.has(notification.id),
  );
}

export function useAdminNotificationSignals({
  enabled,
  pathname,
  notificationsTranslations,
}) {
  const [notificationUnreadCount, setNotificationUnreadCount] = useState(0);
  const knownUnreadNotificationIdsRef = useRef(new Set());
  const { connected: areLiveNotificationsConnected, onNotification } = useAdminNotificationsWebsocket({
    enabled,
  });

  const fetchUnreadNotifications = useCallback(async () => {
    if (!enabled) {
      return [];
    }

    const unreadNotifications = await getAdminNotifications({ unreadOnly: true, limit: 100 });
    return Array.isArray(unreadNotifications) ? unreadNotifications : [];
  }, [enabled]);

  const applyUnreadNotifications = useCallback((unreadNotifications) => {
    knownUnreadNotificationIdsRef.current = getNotificationIdSet(unreadNotifications);
    setNotificationUnreadCount(unreadNotifications.length);
  }, []);

  const refreshNotificationUnreadCount = useCallback(() => {
    fetchUnreadNotifications()
      .then(applyUnreadNotifications)
      .catch(() => setNotificationUnreadCount(0));
  }, [applyUnreadNotifications, fetchUnreadNotifications]);

  useEffect(() => {
    let isSubscribed = true;
    fetchUnreadNotifications()
      .then((unreadNotifications) => {
        if (!isSubscribed) return;
        applyUnreadNotifications(unreadNotifications);
      })
      .catch(() => {
        if (isSubscribed) setNotificationUnreadCount(0);
      });
    return () => {
      isSubscribed = false;
    };
  }, [applyUnreadNotifications, fetchUnreadNotifications]);

  useEffect(() => {
    if (!enabled) return undefined;
    const handleRefreshUnreadCount = () => {
      refreshNotificationUnreadCount();
    };
    window.addEventListener(ADMIN_NOTIFICATIONS_REFRESH_UNREAD_COUNT_EVENT, handleRefreshUnreadCount);
    return () => window.removeEventListener(ADMIN_NOTIFICATIONS_REFRESH_UNREAD_COUNT_EVENT, handleRefreshUnreadCount);
  }, [enabled, refreshNotificationUnreadCount]);

  useEffect(() => onNotification((notification) => {
    if (notification?.id) {
      knownUnreadNotificationIdsRef.current.add(notification.id);
    }
    setNotificationUnreadCount((currentCount) => currentCount + 1);
    if (pathname !== ADMIN_NOTIFICATIONS_ROUTE) {
      showAdminNotificationToast(notification, notificationsTranslations);
    }
  }), [onNotification, pathname, notificationsTranslations]);

  useEffect(() => {
    if (!enabled || areLiveNotificationsConnected) return undefined;

    const pollUnreadNotifications = () => {
      fetchUnreadNotifications()
        .then((unreadNotifications) => {
          const currentUnreadNotificationIds = getNotificationIdSet(unreadNotifications);
          const newUnreadNotifications = findNewUnreadNotifications(
            unreadNotifications,
            knownUnreadNotificationIdsRef.current,
          );

          knownUnreadNotificationIdsRef.current = currentUnreadNotificationIds;
          setNotificationUnreadCount(unreadNotifications.length);

          if (newUnreadNotifications.length > 0 && pathname !== ADMIN_NOTIFICATIONS_ROUTE) {
            showAdminNotificationToast(newUnreadNotifications[0], notificationsTranslations);
            window.dispatchEvent(
              new CustomEvent(ADMIN_NOTIFICATIONS_NEW_EVENT, {
                detail: { notification: newUnreadNotifications[0] },
              }),
            );
          }
        })
        .catch(() => undefined);
    };

    const intervalId = window.setInterval(pollUnreadNotifications, UNREAD_NOTIFICATION_POLL_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [
    areLiveNotificationsConnected,
    enabled,
    fetchUnreadNotifications,
    pathname,
    notificationsTranslations,
  ]);

  return { notificationUnreadCount };
}
