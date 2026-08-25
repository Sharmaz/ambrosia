"use client";

import { useState } from "react";

import { addToast } from "@heroui/react";
import { useTranslations } from "next-intl";

import { exportBackup } from "@/services/backupService";

import { ExportDataCardLocked } from "./ExportDataCardLocked";
import { ExportDataCardUnlocked } from "./ExportDataCardUnlocked";

export function ExportData() {
  const exportDataTranslations = useTranslations("settings");
  const [showAccess, setShowAccess] = useState(false);

  const handleAuthorized = async (password) => {
    try {
      await exportBackup(password);
      addToast({ color: "success", description: exportDataTranslations("cardExportData.success") });
    } catch {
      addToast({ color: "danger", description: exportDataTranslations("cardExportData.errorDescription") });
    } finally {
      setShowAccess(false);
    }
  };

  if (showAccess) {
    return (
      <ExportDataCardUnlocked
        onAuthorized={handleAuthorized}
        onHide={() => setShowAccess(false)}
        exportDataTranslations={exportDataTranslations}
      />
    );
  }

  return (
    <ExportDataCardLocked
      onReveal={() => setShowAccess(true)}
      exportDataTranslations={exportDataTranslations}
    />
  );
}
