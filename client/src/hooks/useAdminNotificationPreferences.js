"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ADMIN_NOTIFICATION_CATEGORY_WALLET } from "@/lib/adminNotifications";
import {
  getAdminNotificationPreferences,
  updateAdminNotificationPreference,
} from "@/services/adminNotificationsService";

export function useAdminNotificationPreferences() {
  const [preferences, setPreferences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingPreference, setSavingPreference] = useState(false);
  const [error, setError] = useState(null);

  const walletPreference = useMemo(
    () => preferences.find((preference) => preference.category === ADMIN_NOTIFICATION_CATEGORY_WALLET),
    [preferences],
  );

  const fetchPreferences = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await getAdminNotificationPreferences();
      setPreferences(Array.isArray(response) ? response : []);
    } catch (fetchError) {
      setError(fetchError);
      setPreferences([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const updatePreference = useCallback(async (preferenceUpdate) => {
    setSavingPreference(true);
    setError(null);
    try {
      const updatedPreference = await updateAdminNotificationPreference(preferenceUpdate);
      if (updatedPreference) {
        setPreferences((currentPreferences) => {
          const hasPreference = currentPreferences.some(
            (preference) => preference.category === updatedPreference.category,
          );
          if (!hasPreference) return [...currentPreferences, updatedPreference];
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
    fetchPreferences();
  }, [fetchPreferences]);

  return {
    preferences,
    walletPreference,
    loading,
    savingPreference,
    error,
    updatePreference,
    refetch: fetchPreferences,
  };
}
