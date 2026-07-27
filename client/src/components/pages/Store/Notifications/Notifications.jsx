"use client";
import { useMemo } from "react";

import { Button, Card, CardBody, Chip, Switch, Tab, Tabs } from "@heroui/react";
import { Bell, Check, Circle, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { PageHeader } from "@/components/shared/PageHeader";
import { useAdminWebPush } from "@/hooks/useAdminWebPush";

import { useAdminNotifications } from "./hooks/useAdminNotifications";

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function notificationSummary(notification) {
  const metadata = notification.metadataJson ? JSON.parse(notification.metadataJson) : null;
  const amount = metadata?.amountSats ?? metadata?.recipientAmountSats ?? metadata?.requestedAmountSats;
  if (!amount) return null;
  return `${Number(amount).toLocaleString()} sats`;
}

function safeNotificationSummary(notification) {
  try {
    return notificationSummary(notification);
  } catch {
    return null;
  }
}

export function isWebPushActiveOnDevice(preference, webPushState) {
  return Boolean(
    preference?.pushEnabled &&
    webPushState.isSupported &&
    webPushState.permission === "granted" &&
    webPushState.subscriptionEndpoint,
  );
}

export function getWebPushStatusKey(webPushState, isPushActiveOnDevice) {
  if (!webPushState.isSupported) return "unsupported";
  if (webPushState.loading) return "saving";
  if (isPushActiveOnDevice) return "active";
  if (webPushState.permission === "denied") return "denied";
  return "permissionRequired";
}

function PreferenceRow({
  preference,
  label,
  disabled,
  isPushActiveOnDevice,
  webPushStatusKey,
  webPushState,
  onInAppChange,
  onPushChange,
  onTestPush,
  t,
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-gray-900">{label}</p>
        <p className="text-sm text-gray-500">{t(`webPush.${webPushStatusKey}`)}</p>
        {webPushState.subscriptionSummary && (
          <p className="mt-1 text-xs text-gray-400">
            {t("webPush.endpoint")}:
            {" "}
            <span className="font-mono">
              {webPushState.subscriptionSummary.endpointHost}
              {" · "}
              {webPushState.subscriptionSummary.endpointHash}
            </span>
          </p>
        )}
      </div>
      <div className="flex items-center gap-4">
        <Switch
          size="sm"
          isSelected={preference.inAppEnabled}
          isDisabled={disabled}
          onValueChange={(inAppEnabled) => onInAppChange({ ...preference, inAppEnabled })}
        >
          {t("preferences.inApp")}
        </Switch>
        <Switch
          size="sm"
          isSelected={isPushActiveOnDevice}
          isDisabled={disabled || webPushState.loading || !webPushState.isSupported}
          onValueChange={(pushEnabled) => onPushChange({ ...preference, pushEnabled })}
        >
          {t("preferences.push")}
        </Switch>
        <Button
          size="sm"
          variant="flat"
          isDisabled={!isPushActiveOnDevice || disabled || webPushState.loading}
          onPress={onTestPush}
        >
          {t("actions.testPush")}
        </Button>
      </div>
    </div>
  );
}

function NotificationItem({ notification, onMarkRead, t }) {
  const isUnread = !notification.readAt;
  const amountSummary = safeNotificationSummary(notification);

  return (
    <Card shadow="none" className={`rounded-lg border ${isUnread ? "border-forest/40 bg-green-50" : "border-gray-200 bg-white"}`}>
      <CardBody className="gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Chip
                size="sm"
                variant={isUnread ? "solid" : "flat"}
                color={isUnread ? "success" : "default"}
                startContent={isUnread ? <Circle className="h-3 w-3 fill-current" /> : <Check className="h-3 w-3" />}
              >
                {t(isUnread ? "statuses.unread" : "statuses.read")}
              </Chip>
              <Chip size="sm" variant="flat">{notification.category}</Chip>
              {notification.status && <Chip size="sm" variant="flat">{notification.status}</Chip>}
              {amountSummary && <Chip size="sm" variant="flat">{amountSummary}</Chip>}
            </div>
            <h2 className="mt-3 text-lg font-semibold text-gray-900">{notification.title}</h2>
            <p className="mt-1 text-sm text-gray-700">{notification.body}</p>
          </div>
          {isUnread && (
            <Button
              size="sm"
              variant="flat"
              color="success"
              startContent={<Check className="h-4 w-4" />}
              onPress={() => onMarkRead(notification.id)}
            >
              {t("actions.markRead")}
            </Button>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-3 text-sm text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="font-medium text-gray-500">{t("fields.actor")}</dt>
            <dd className="truncate">{notification.actorUserName || notification.actorUserId || "-"}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">{t("fields.role")}</dt>
            <dd className="truncate">{notification.actorRole || "-"}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">{t("fields.occurredAt")}</dt>
            <dd>{formatTimestamp(notification.occurredAt || notification.createdAt)}</dd>
          </div>
          <div>
            <dt className="font-medium text-gray-500">{t("fields.category")}</dt>
            <dd>{notification.type}</dd>
          </div>
        </dl>
      </CardBody>
    </Card>
  );
}

export function Notifications() {
  const t = useTranslations("notifications");
  const {
    notifications,
    preferences,
    filters,
    loading,
    savingPreference,
    error,
    unreadCount,
    liveConnected,
    updateFilters,
    markRead,
    markAllRead,
    updatePreference,
    refetch,
  } = useAdminNotifications();
  const webPush = useAdminWebPush();

  const walletPreference = useMemo(
    () => preferences.find((preference) => preference.category === "wallet"),
    [preferences],
  );
  const isWalletPushActiveOnDevice = isWebPushActiveOnDevice(walletPreference, webPush);
  const walletWebPushStatusKey = getWebPushStatusKey(webPush, isWalletPushActiveOnDevice);

  const handlePushPreferenceChange = async (preferenceUpdate) => {
    if (preferenceUpdate.pushEnabled) {
      const result = await webPush.subscribe();
      if (!result.ok) return;
    } else {
      const result = await webPush.unsubscribe();
      if (!result.ok) return;
    }
    await updatePreference(preferenceUpdate);
  };

  const handleTestPush = async () => {
    await webPush.showTestNotification();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        actions={(
          <div className="flex flex-wrap items-center gap-2">
            <Chip
              variant="flat"
              color={liveConnected ? "success" : "warning"}
              startContent={liveConnected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
            >
              {t(liveConnected ? "live" : "offline")}
            </Chip>
            <Button
              variant="flat"
              startContent={<RefreshCw className="h-4 w-4" />}
              onPress={() => refetch()}
            >
              {t("actions.refresh")}
            </Button>
          </div>
        )}
      />

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
            <Tabs
              selectedKey={filters.category || "all"}
              onSelectionChange={(key) => updateFilters({ category: key === "all" ? null : key })}
              aria-label={t("title")}
              variant="solid"
            >
              <Tab key="wallet" title={t("filters.wallet")} />
              <Tab key="all" title={t("filters.all")} />
            </Tabs>
            <div className="flex flex-wrap items-center gap-3">
              <Switch
                size="sm"
                isSelected={filters.unreadOnly}
                onValueChange={(unreadOnly) => updateFilters({ unreadOnly })}
              >
                {t("filters.unreadOnly")}
              </Switch>
              <Button
                variant="flat"
                color="success"
                isDisabled={unreadCount === 0}
                startContent={<Check className="h-4 w-4" />}
                onPress={markAllRead}
              >
                {t("actions.markAllRead")}
              </Button>
            </div>
          </div>

          {error && (
            <Card shadow="none" className="rounded-lg border border-red-200 bg-red-50">
              <CardBody>
                <p className="text-sm font-medium text-red-700">{t("statuses.error")}</p>
              </CardBody>
            </Card>
          )}

          {loading ? (
            <Card shadow="none" className="rounded-lg border border-gray-200 bg-white">
              <CardBody>
                <p className="text-sm text-gray-500">{t("actions.refresh")}</p>
              </CardBody>
            </Card>
          ) : notifications.length === 0 ? (
            <Card shadow="none" className="rounded-lg border border-gray-200 bg-white">
              <CardBody className="items-center gap-3 py-12 text-center">
                <Bell className="h-10 w-10 text-gray-400" />
                <h2 className="text-lg font-semibold text-gray-900">{t("empty.title")}</h2>
                <p className="text-sm text-gray-500">{t("empty.description")}</p>
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onMarkRead={markRead}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Card shadow="none" className="rounded-lg border border-gray-200 bg-white">
            <CardBody className="gap-4">
              <h2 className="text-lg font-semibold text-gray-900">{t("preferences.title")}</h2>
              {walletPreference && (
                <PreferenceRow
                  preference={walletPreference}
                  label={t("preferences.wallet")}
                  disabled={savingPreference}
                  isPushActiveOnDevice={isWalletPushActiveOnDevice}
                  webPushStatusKey={walletWebPushStatusKey}
                  webPushState={webPush}
                  onInAppChange={updatePreference}
                  onPushChange={handlePushPreferenceChange}
                  onTestPush={handleTestPush}
                  t={t}
                />
              )}
            </CardBody>
          </Card>
        </aside>
      </section>
    </div>
  );
}
