"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteAdminPushSubscription,
  getAdminPushVapidPublicKey,
  registerAdminPushSubscription,
} from "@/services/adminNotificationsService";

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
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
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
        nextPermission = await Notification.requestPermission();
      }
      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        return { ok: false, reason: nextPermission };
      }

      const registration = await navigator.serviceWorker.ready;
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ||
        await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array((await getAdminPushVapidPublicKey())?.publicKey || ""),
        });

      await registerAdminPushSubscription(getSerializedSubscription(subscription));
      setSubscriptionEndpoint(subscription.endpoint);
      setSubscriptionSummary(await summarizeEndpoint(subscription.endpoint));
      return { ok: true, subscription };
    } catch (subscribeError) {
      setError(subscribeError);
      return { ok: false, reason: "failed" };
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
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        setSubscriptionEndpoint(null);
        return { ok: true };
      }

      await deleteAdminPushSubscription(subscription.endpoint);
      await subscription.unsubscribe();
      setSubscriptionEndpoint(null);
      setSubscriptionSummary(null);
      return { ok: true };
    } catch (unsubscribeError) {
      setError(unsubscribeError);
      return { ok: false, reason: "failed" };
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
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification("Nueva actividad administrativa", {
        body: "Abre Ambrosia para ver detalles",
        tag: "admin-activity-test",
        data: {
          url: "/store/notifications",
        },
      });
      return { ok: true };
    } catch (notificationError) {
      setError(notificationError);
      return { ok: false, reason: "failed" };
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
