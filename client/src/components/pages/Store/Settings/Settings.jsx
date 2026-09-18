"use client";

import { useState } from "react";

import { Tab, Tabs } from "@heroui/react";
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
import { PhoenixdRemoteCard } from "./PhoenixdRemote/PhoenixdRemoteCard";
import { Printers } from "./Printers";
import { QRUrl } from "./QRUrl";
import { SecretsEncryptionCard } from "./SecretsEncryption/SecretsEncryptionCard";
import { SecureConnection } from "./SecureConnection/SecureConnection";
import { Seed } from "./Seed";
import { StoreInfo } from "./StoreInfo";
import { SystemCard } from "./System/SystemCard";
import { TicketTemplates } from "./TicketTemplates";
import { Tips } from "./Tips";
import { Tutorials } from "./Tutorials";

function TabPanel({ children }) {
  return <div className="flex flex-col gap-6">{children}</div>;
}

export function Settings() {
  const settingsTranslations = useTranslations("settings");
  const { isAdmin } = useNavigation();
  const [activeTab, setActiveTab] = useState("business");

  const availableTabs = [
    { key: "business", label: settingsTranslations("categories.business") },
    { key: "preferences", label: settingsTranslations("categories.preferences") },
    (isAdmin || isElectron) && { key: "wallet", label: settingsTranslations("categories.wallet") },
    isAdmin && { key: "backup", label: settingsTranslations("categories.backup") },
    { key: "devices", label: settingsTranslations("categories.devices") },
    { key: "printing", label: settingsTranslations("categories.printing") },
    isAdmin && { key: "system", label: settingsTranslations("categories.system") },
    isAdmin && { key: "help", label: settingsTranslations("categories.help") },
  ].filter(Boolean);

  return (
    <>
      <PageHeader title={settingsTranslations("title")} subtitle={settingsTranslations("subtitle")} />

      <Tabs
        selectedKey={activeTab}
        onSelectionChange={setActiveTab}
        aria-label={settingsTranslations("title")}
        variant="solid"
        classNames={{
          base: "bg-white rounded-xl p-1 shadow-sm w-full",
          tabList: "gap-0 bg-transparent p-0 overflow-x-auto flex-nowrap",
          cursor: "bg-forest shadow-none rounded-lg",
          tab: "px-4 py-2 h-auto w-auto! rounded-lg shrink-0 data-[hover=true]:bg-forest/10",
          tabContent: "group-data-[selected=true]:text-white text-gray-500 group-data-[hover=true]:text-forest text-sm font-medium",
          panel: "hidden",
        }}
      >
        {availableTabs.map(({ key, label }) => (
          <Tab key={key} title={label} />
        ))}
      </Tabs>

      <div className="flex flex-col lg:flex-row-reverse gap-6 lg:items-start mt-6">
        <div className="hidden lg:block lg:w-80 lg:shrink-0">
          <QRUrl />
        </div>

        <div className="flex-1 min-w-0">
          {activeTab === "business" && (
            <TabPanel>
              <StoreInfo />
              <Currency />
              <Tips />
            </TabPanel>
          )}

          {activeTab === "preferences" && (
            <TabPanel>
              <Language />
              <Display />
            </TabPanel>
          )}

          {activeTab === "wallet" && (isAdmin || isElectron) && (
            <TabPanel>
              {isAdmin && <Seed />}
              {isElectron && <LightningCard />}
              {isAdmin && <NwcConnectionCard />}
              {isAdmin && <PhoenixdRemoteCard />}
              {isAdmin && <SecretsEncryptionCard />}
            </TabPanel>
          )}

          {activeTab === "backup" && isAdmin && (
            <TabPanel>
              <ExportData />
              <ImportData />
            </TabPanel>
          )}

          {activeTab === "devices" && (
            <TabPanel>
              <SecureConnection />
              {!isElectron && <InstallPWA />}
            </TabPanel>
          )}

          {activeTab === "printing" && (
            <TabPanel>
              <Printers />
              <TicketTemplates />
            </TabPanel>
          )}

          {activeTab === "system" && isAdmin && (
            <TabPanel>
              <SystemCard />
              <NotificationPreferencesCard />
            </TabPanel>
          )}

          {activeTab === "help" && isAdmin && (
            <TabPanel>
              <Tutorials />
            </TabPanel>
          )}
        </div>
      </div>
    </>
  );
}
