"use client";

import { useTranslations } from "next-intl";

import { PageHeader } from "@/components/shared/PageHeader";
import { useNavigation } from "@hooks/useNavigation";
import { isElectron } from "@lib/isElectron";

import { Currency } from "./Currency";
import { Display } from "./Display";
import { ExportData } from "./ExportData";
import { ImportData } from "./ImportData";
import { InstallPWA } from "./InstallPWA";
import { Language } from "./Language";
import { LightningCard } from "./Lightning/LightningCard";
import { NotificationPreferencesCard } from "./Notifications";
import { NwcConnectionCard } from "./NwcConnection/NwcConnectionCard";
import { Printers } from "./Printers";
import { QRUrl } from "./QRUrl";
import { Seed } from "./Seed";
import { StoreInfo } from "./StoreInfo";
import { TicketTemplates } from "./TicketTemplates";
import { Tutorials } from "./Tutorials";

export function Settings() {
  const settingsTranslations = useTranslations("settings");
  const { isAdmin } = useNavigation();

  return (
    <>
      <PageHeader title={settingsTranslations("title")} subtitle={settingsTranslations("subtitle")} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="flex flex-col gap-6">
          <StoreInfo />
          <Currency />
          <Language />
          <Display />
          {isAdmin && (
            <>
              <Seed />
              <ExportData />
              <ImportData />
              <NwcConnectionCard />
              <Tutorials />
            </>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <QRUrl />
          <Printers />
          <TicketTemplates />
          {isAdmin && <NotificationPreferencesCard />}

          {isElectron && <LightningCard />}
          {!isElectron && <InstallPWA />}
        </div>
      </div>
    </>
  );
}
