import { httpClient, parseJsonResponse } from "@/lib/http";

export async function getAdminNotifications(filters = {}) {
  const queryParams = new URLSearchParams();

  if (filters.limit) queryParams.set("limit", String(filters.limit));
  if (filters.offset) queryParams.set("offset", String(filters.offset));
  if (filters.unreadOnly) queryParams.set("unreadOnly", "true");
  if (filters.category) queryParams.set("category", filters.category);

  const queryString = queryParams.toString();
  const response = await httpClient(`/admin/notifications${queryString ? `?${queryString}` : ""}`);
  return await parseJsonResponse(response, []);
}

export async function markAdminNotificationRead(notificationId) {
  const response = await httpClient(`/admin/notifications/${notificationId}/read`, {
    method: "POST",
  });
  return await parseJsonResponse(response, null);
}

export async function markAllAdminNotificationsRead(category) {
  const queryString = category ? `?category=${encodeURIComponent(category)}` : "";
  const response = await httpClient(`/admin/notifications/read-all${queryString}`, {
    method: "POST",
  });
  return await parseJsonResponse(response, { updated: 0 });
}

export async function getAdminNotificationPreferences() {
  const response = await httpClient("/admin/notification-preferences");
  return await parseJsonResponse(response, []);
}

export async function updateAdminNotificationPreference(preference) {
  const preferenceRequest = {
    category: preference.category,
    inAppEnabled: preference.inAppEnabled,
    pushEnabled: preference.pushEnabled,
  };
  const response = await httpClient("/admin/notification-preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(preferenceRequest),
  });
  return await parseJsonResponse(response, null);
}

export async function getAdminPushVapidPublicKey() {
  const response = await httpClient("/admin/push/vapid-public-key");
  return await parseJsonResponse(response, null);
}

export async function registerAdminPushSubscription(subscription) {
  const response = await httpClient("/admin/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(subscription),
  });
  return await parseJsonResponse(response, null);
}

export async function deleteAdminPushSubscription(endpoint) {
  const queryString = `?endpoint=${encodeURIComponent(endpoint)}`;
  const response = await httpClient(`/admin/push/subscriptions${queryString}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  return await parseJsonResponse(response, null);
}
