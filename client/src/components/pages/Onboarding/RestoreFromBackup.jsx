"use client";

import { useState } from "react";

import { Button, addToast } from "@heroui/react";
import { useTranslations } from "next-intl";

import { restartBackendAfterImport } from "@/utils/restartBackendAfterImport";
import { BackupPasswordAndFileFields } from "@components/shared/BackupPasswordAndFileFields";
import { restoreFromBackup } from "@services/initialSetupService";

export function RestoreFromBackupStep({ onBack }) {
  const restoreTranslations = useTranslations();
  const [backupPassword, setBackupPassword] = useState("");
  const [backupFile, setBackupFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async () => {
    if (!backupPassword || !backupFile) {
      setErrorMessage(restoreTranslations("restore.missingFields"));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const restoreResponse = await restoreFromBackup(backupPassword, backupFile);
      if (!restoreResponse.ok) {
        setErrorMessage(restoreTranslations("restore.genericError"));
        return;
      }

      addToast({
        title: restoreTranslations("restore.successTitle"),
        description: restoreTranslations("restore.successDescription"),
        color: "success",
      });

      const restartTriggeredAutomatically = await restartBackendAfterImport();
      addToast({
        description: restartTriggeredAutomatically
          ? restoreTranslations("restore.restartRequiredElectron")
          : restoreTranslations("restore.restartRequiredManual"),
        color: restartTriggeredAutomatically ? "primary" : "warning",
      });
    } catch {
      setErrorMessage(restoreTranslations("restore.genericError"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-green-900 mb-2">{restoreTranslations("restore.title")}</h2>
      <p className="text-gray-500 mb-4 md:mb-8">{restoreTranslations("restore.subtitle")}</p>

      <div className="flex flex-col gap-4">
        <BackupPasswordAndFileFields
          backupPassword={backupPassword}
          onBackupPasswordChange={setBackupPassword}
          onFileChange={setBackupFile}
        />

        {errorMessage && <p className="text-sm text-danger">{errorMessage}</p>}
      </div>

      <div className="flex justify-between mt-8">
        <Button variant="bordered" onPress={onBack} isDisabled={isSubmitting}>
          {restoreTranslations("restore.backToSetup")}
        </Button>
        <Button
          color="primary"
          onPress={handleSubmit}
          isDisabled={isSubmitting}
          isLoading={isSubmitting}
          className="bg-green-800"
        >
          {isSubmitting ? restoreTranslations("restore.submitting") : restoreTranslations("restore.submitButton")}
        </Button>
      </div>
    </div>
  );
}
