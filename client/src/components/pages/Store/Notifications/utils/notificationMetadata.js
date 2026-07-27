export function parseNotificationMetadata(notification) {
  if (!notification?.metadataJson) return {};
  try {
    return JSON.parse(notification.metadataJson) ?? {};
  } catch {
    return {};
  }
}

export function getNotificationAmount(notificationMetadata) {
  return (
    notificationMetadata.amountSats ??
    notificationMetadata.recipientAmountSats ??
    notificationMetadata.requestedAmountSats ??
    null
  );
}

export function formatNotificationAmountSats(amount) {
  if (amount === null || amount === undefined || amount === "") return null;
  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount)) return null;
  return `${numericAmount.toLocaleString()} sats`;
}
