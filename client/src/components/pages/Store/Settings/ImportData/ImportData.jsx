"use client";

import { useState } from "react";

import { addToast } from "@heroui/react";
import { useTranslations } from "next-intl";

import { importBackup } from "@/services/backupService";
import { restartBackendAfterImport } from "@/utils/restartBackendAfterImport";

import { ImportDataCardLocked } from "./ImportDataCardLocked";
import { ImportDataCardUnlocked } from "./ImportDataCardUnlocked";

export function ImportData() {
  const importDataTranslations = useTranslations("settings");
  const [showAccess, setShowAccess] = useState(false);

  const handleImport = async (rolePassword, backupPassword, backupFile, onProgress) => {
    await importBackup(rolePassword, backupPassword, backupFile, onProgress);
    addToast({ color: "success", description: importDataTranslations("cardImportData.success") });

    const restartTriggeredAutomatically = await restartBackendAfterImport();
    addToast({
      description: restartTriggeredAutomatically
        ? importDataTranslations("cardImportData.restartRequiredElectron")
        : importDataTranslations("cardImportData.restartRequiredManual"),
      color: restartTriggeredAutomatically ? "primary" : "warning",
    });
  };

  if (showAccess) {
    return (
      <ImportDataCardUnlocked
        onImport={handleImport}
        onHide={() => setShowAccess(false)}
        importDataTranslations={importDataTranslations}
      />
    );
  }

  return (
    <ImportDataCardLocked
      onReveal={() => setShowAccess(true)}
      importDataTranslations={importDataTranslations}
    />
  );
}
