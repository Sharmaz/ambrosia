"use client";

import { addToast, Button, Card, CardBody, CardHeader, Switch } from "@heroui/react";
import { useTranslations } from "next-intl";

import { useAdminNotificationPreferences } from "@/hooks/useAdminNotificationPreferences";
import { useAdminWebPush } from "@/hooks/useAdminWebPush";
import {
  getWebPushStatusKey,
  isWebPushActiveOnDevice,
} from "@/lib/adminNotifications";

function EndpointSummary({ endpointSummary, label }) {
  if (!endpointSummary) return null;

  return (
    <p className="break-words text-xs text-gray-500">
      {label}
      {": "}
      <span className="font-mono">
        {endpointSummary.endpointHost}
        {" · "}
        {endpointSummary.endpointHash}
      </span>
    </p>
  );
}

function showWebPushToggleErrorToast(t, reason) {
  const descriptionKey = reason ? `cardNotifications.pushErrors.${reason}` : "cardNotifications.pushErrors.failed";
  addToast({
    color: "danger",
    title: t("cardNotifications.pushErrorTitle"),
    description: t(descriptionKey),
  });
}

export function NotificationPreferencesCard() {
  const t = useTranslations("settings");
  const tNotifications = useTranslations("notifications");
  const {
    walletPreference,
    loading,
    savingPreference,
    error,
    updatePreference,
  } = useAdminNotificationPreferences();
  const webPush = useAdminWebPush();

  if (!loading && !walletPreference && !error) return null;

  const isWalletPushActiveOnDevice = isWebPushActiveOnDevice(walletPreference, webPush);
  const walletWebPushStatusKey = getWebPushStatusKey(webPush, isWalletPushActiveOnDevice);
  const disabled = loading || savingPreference;

  const handlePushPreferenceChange = async (pushEnabled) => {
    if (!walletPreference) return;

    const pushResult = pushEnabled ? await webPush.subscribe() : await webPush.unsubscribe();
    if (!pushResult.ok) {
      showWebPushToggleErrorToast(t, pushResult.reason);
      return;
    }

    await updatePreference({ ...walletPreference, pushEnabled });
  };

  const handleInAppPreferenceChange = async (inAppEnabled) => {
    if (!walletPreference) return;
    await updatePreference({ ...walletPreference, inAppEnabled });
  };

  return (
    <Card shadow="none" className="rounded-lg p-6 shadow-lg">
      <CardHeader className="flex flex-col items-start pb-0">
        <h2 className="text-lg sm:text-xl xl:text-2xl font-semibold text-green-900">
          {t("cardNotifications.title")}
        </h2>
        <p className="text-xs sm:text-sm text-gray-600 mt-1">
          {t("cardNotifications.subtitle")}
        </p>
      </CardHeader>

      <CardBody>
        {error && (
          <p className="text-sm text-red-600">
            {t("cardNotifications.error")}
          </p>
        )}

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <p className="text-sm sm:text-base font-semibold text-gray-700">
              {t("cardNotifications.walletTitle")}
            </p>
            <p className="text-xs sm:text-sm text-gray-500">
              {tNotifications(`webPush.${walletWebPushStatusKey}`)}
            </p>
            <EndpointSummary
              endpointSummary={webPush.subscriptionSummary}
              label={tNotifications("webPush.endpoint")}
            />
          </div>

          <div className="flex flex-col gap-4">
            <div>
              <Switch
                isSelected={Boolean(walletPreference?.inAppEnabled)}
                isDisabled={disabled || !walletPreference}
                onValueChange={handleInAppPreferenceChange}
                aria-label={t("cardNotifications.inApp")}
              >
                <span className="text-sm font-medium">{t("cardNotifications.inApp")}</span>
              </Switch>
            </div>

            <div>
              <Switch
                isSelected={isWalletPushActiveOnDevice}
                isDisabled={disabled || webPush.loading || !webPush.isSupported || !walletPreference}
                onValueChange={handlePushPreferenceChange}
                aria-label={t("cardNotifications.push")}
              >
                <span className="text-sm font-medium">{t("cardNotifications.push")}</span>
              </Switch>
            </div>

            <Button
              color="primary"
              className="h-8 min-w-16 px-3 rounded-small bg-green-800 sm:h-10 sm:min-w-20 sm:px-4 sm:rounded-medium"
              isDisabled={!isWalletPushActiveOnDevice || disabled || webPush.loading}
              onPress={webPush.showTestNotification}
            >
              {t("cardNotifications.testPush")}
            </Button>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
