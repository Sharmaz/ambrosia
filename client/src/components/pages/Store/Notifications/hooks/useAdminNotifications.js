"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  getAdminNotificationPreferences,
  getAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
  updateAdminNotificationPreference,
} from "@/services/adminNotificationsService";
import { useAdminNotificationsWebsocket } from "@hooks/useAdminNotificationsWebsocket";

const DEFAULT_FILTERS = {
  category: "wallet",
  unreadOnly: false,
};

function mergeIncomingNotification(notifications, incomingNotification) {
  if (!incomingNotification?.id) return notifications;
  const exists = notifications.some((notification) => notification.id === incomingNotification.id);
  if (exists) {
    return notifications.map((notification) => (
      notification.id === incomingNotification.id ? { ...notification, ...incomingNotification } : notification
    ));
  }
  return [incomingNotification, ...notifications];
}

export function useAdminNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [preferences, setPreferences] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [loading, setLoading] = useState(true);
  const [savingPreference, setSavingPreference] = useState(false);
  const [error, setError] = useState(null);
  const { connected, onNotification } = useAdminNotificationsWebsocket();

  const unreadCount = useMemo(
    () => notifications.filter((notification) => !notification.readAt).length,
    [notifications],
  );

  const fetchNotifications = useCallback(async (nextFilters = filters) => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAdminNotifications({
        ...nextFilters,
        limit: 100,
      });
      setNotifications(Array.isArray(response) ? response : []);
    } catch (fetchError) {
      setError(fetchError);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  const fetchPreferences = useCallback(async () => {
    try {
      const response = await getAdminNotificationPreferences();
      setPreferences(Array.isArray(response) ? response : []);
    } catch (fetchError) {
      setError(fetchError);
      setPreferences([]);
    }
  }, []);

  const updateFilters = useCallback((nextFilters) => {
    setFilters((currentFilters) => ({ ...currentFilters, ...nextFilters }));
  }, []);

  const markRead = useCallback(async (notificationId) => {
    await markAdminNotificationRead(notificationId);
    setNotifications((currentNotifications) => (
      currentNotifications.map((notification) => (
        notification.id === notificationId
          ? { ...notification, readAt: notification.readAt || new Date().toISOString() }
          : notification
      ))
    ));
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllAdminNotificationsRead(filters.category);
    const readAt = new Date().toISOString();
    setNotifications((currentNotifications) => (
      currentNotifications.map((notification) => (
        filters.category && notification.category !== filters.category
          ? notification
          : { ...notification, readAt: notification.readAt || readAt }
      ))
    ));
  }, [filters.category]);

  const updatePreference = useCallback(async (preferenceUpdate) => {
    setSavingPreference(true);
    setError(null);
    try {
      const updatedPreference = await updateAdminNotificationPreference(preferenceUpdate);
      if (updatedPreference) {
        setPreferences((currentPreferences) => {
          const exists = currentPreferences.some((preference) => preference.category === updatedPreference.category);
          if (!exists) return [...currentPreferences, updatedPreference];
          return currentPreferences.map((preference) => (
            preference.category === updatedPreference.category ? updatedPreference : preference
          ));
        });
      }
    } catch (updateError) {
      setError(updateError);
    } finally {
      setSavingPreference(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  useEffect(() => onNotification((notification) => {
    setNotifications((currentNotifications) => mergeIncomingNotification(currentNotifications, notification));
  }), [onNotification]);

  return {
    notifications,
    preferences,
    filters,
    loading,
    savingPreference,
    error,
    unreadCount,
    liveConnected: connected,
    updateFilters,
    markRead,
    markAllRead,
    updatePreference,
    refetch: fetchNotifications,
  };
}
