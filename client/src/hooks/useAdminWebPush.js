"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  ADMIN_ACTIVITY_NOTIFICATION_BADGE,
  ADMIN_ACTIVITY_NOTIFICATION_ICON,
  ADMIN_ACTIVITY_TEST_NOTIFICATION_TAG,
  ADMIN_NOTIFICATIONS_ROUTE,
  getAdminActivityNotificationCopy,
} from "@/lib/adminNotifications";
import {
  deleteAdminPushSubscription,
  getAdminPushVapidPublicKey,
  registerAdminPushSubscription,
} from "@/services/adminNotificationsService";

const WEB_PUSH_OPERATION_TIMEOUT_MS = 10000;
const WEB_PUSH_TIMEOUT_ERROR = "admin-web-push-timeout";
const WEB_PUSH_SERVICE_WORKER_UNAVAILABLE_ERROR = "admin-web-push-service-worker-unavailable";

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((character) => character.charCodeAt(0)));
}

function getSerializedSubscription(subscription) {
  const serialized = subscription.toJSON();
  return {
    endpoint: serialized.endpoint,
    keys: {
      p256dh: serialized.keys.p256dh,
      auth: serialized.keys.auth,
    },
    userAgent: navigator.userAgent,
  };
}

async function summarizeEndpoint(endpoint) {
  const cryptoSubtle = globalThis.crypto?.subtle;
  if (!endpoint || !cryptoSubtle || typeof TextEncoder === "undefined") {
    return null;
  }

  let endpointHost = "invalid";
  try {
    endpointHost = new URL(endpoint).host;
  } catch {}

  const endpointBytes = new TextEncoder().encode(endpoint);
  const endpointHashBuffer = await cryptoSubtle.digest("SHA-256", endpointBytes);
  const endpointHash = [...new Uint8Array(endpointHashBuffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 12);

  return { endpointHost, endpointHash };
}

function hasWebPushSupport() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  );
}

function withWebPushTimeout(promise) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(WEB_PUSH_TIMEOUT_ERROR)), WEB_PUSH_OPERATION_TIMEOUT_MS);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
}

function getWebPushFailureReason(error) {
  if (error?.message === "admin-web-push-unavailable") return "vapidUnavailable";
  if (error?.message === WEB_PUSH_SERVICE_WORKER_UNAVAILABLE_ERROR) return "serviceWorkerUnavailable";
  if (error?.message === WEB_PUSH_TIMEOUT_ERROR) return "timeout";
  return "failed";
}

async function getReadyServiceWorkerRegistration() {
  try {
    return await withWebPushTimeout(navigator.serviceWorker.ready);
  } catch (error) {
    const existingRegistration = await navigator.serviceWorker.getRegistration?.();
    if (!existingRegistration) {
      throw new Error(WEB_PUSH_SERVICE_WORKER_UNAVAILABLE_ERROR);
    }
    throw error;
  }
}

export function useAdminWebPush() {
  const isSupported = useMemo(() => hasWebPushSupport(), []);
  const [permission, setPermission] = useState(() => (
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "unsupported"
  ));
  const [subscriptionEndpoint, setSubscriptionEndpoint] = useState(null);
  const [subscriptionSummary, setSubscriptionSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshSubscription = useCallback(async () => {
    if (!isSupported) return null;
    const registration = await getReadyServiceWorkerRegistration();
    const subscription = await withWebPushTimeout(registration.pushManager.getSubscription());
    setSubscriptionEndpoint(subscription?.endpoint ?? null);
    setSubscriptionSummary(await summarizeEndpoint(subscription?.endpoint));
    return subscription;
  }, [isSupported]);

  useEffect(() => {
    refreshSubscription().catch(() => setSubscriptionEndpoint(null));
  }, [refreshSubscription]);

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      return { ok: false, reason: "unsupported" };
    }

    setLoading(true);
    setError(null);
    try {
      let nextPermission = Notification.permission;
      if (nextPermission === "default") {
        nextPermission = await withWebPushTimeout(Notification.requestPermission());
      }
      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        return { ok: false, reason: nextPermission };
      }

      const registration = await getReadyServiceWorkerRegistration();
      const existingSubscription = await withWebPushTimeout(registration.pushManager.getSubscription());
      const vapidPublicKeyResponse = await withWebPushTimeout(getAdminPushVapidPublicKey());
      const vapidPublicKey = vapidPublicKeyResponse?.publicKey;
      if (!vapidPublicKey) {
        return { ok: false, reason: "vapidUnavailable" };
      }

      const subscription =
        existingSubscription ||
        await withWebPushTimeout(
          registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
          }),
        );

      await withWebPushTimeout(registerAdminPushSubscription(getSerializedSubscription(subscription)));
      setSubscriptionEndpoint(subscription.endpoint);
      setSubscriptionSummary(await summarizeEndpoint(subscription.endpoint));
      return { ok: true, subscription };
    } catch (subscribeError) {
      setError(subscribeError);
      return {
        ok: false,
        reason: getWebPushFailureReason(subscribeError),
      };
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported) {
      return { ok: true };
    }

    setLoading(true);
    setError(null);
    try {
      const registration = await getReadyServiceWorkerRegistration();
      const subscription = await withWebPushTimeout(registration.pushManager.getSubscription());
      if (!subscription) {
        setSubscriptionEndpoint(null);
        setSubscriptionSummary(null);
        return { ok: true };
      }

      await withWebPushTimeout(deleteAdminPushSubscription(subscription.endpoint));
      await withWebPushTimeout(subscription.unsubscribe());
      setSubscriptionEndpoint(null);
      setSubscriptionSummary(null);
      return { ok: true };
    } catch (unsubscribeError) {
      setError(unsubscribeError);
      return { ok: false, reason: getWebPushFailureReason(unsubscribeError) };
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  const showTestNotification = useCallback(async () => {
    if (!isSupported) {
      return { ok: false, reason: "unsupported" };
    }
    if (Notification.permission !== "granted") {
      return { ok: false, reason: Notification.permission };
    }

    setLoading(true);
    setError(null);
    try {
      const registration = await getReadyServiceWorkerRegistration();
      const notificationCopy = getAdminActivityNotificationCopy(navigator.language);
      await withWebPushTimeout(
        registration.showNotification(notificationCopy.title, {
          body: notificationCopy.body,
          icon: ADMIN_ACTIVITY_NOTIFICATION_ICON,
          badge: ADMIN_ACTIVITY_NOTIFICATION_BADGE,
          tag: ADMIN_ACTIVITY_TEST_NOTIFICATION_TAG,
          data: {
            url: ADMIN_NOTIFICATIONS_ROUTE,
          },
        }),
      );
      return { ok: true };
    } catch (notificationError) {
      setError(notificationError);
      return { ok: false, reason: getWebPushFailureReason(notificationError) };
    } finally {
      setLoading(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    permission,
    subscriptionEndpoint,
    subscriptionSummary,
    loading,
    error,
    subscribe,
    unsubscribe,
    showTestNotification,
    refreshSubscription,
  };
}
