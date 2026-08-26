"use client";

import { useState } from "react";

import { Button, Input, addToast } from "@heroui/react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

import { restartBackendAfterImport } from "@/utils/restartBackendAfterImport";
import { restoreFromBackup } from "@services/initialSetupService";

export function RestoreFromBackupStep({ onBack }) {
  const restoreTranslations = useTranslations();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [backupFile, setBackupFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleFileChange = (event) => {
    setBackupFile(event.target.files?.[0] ?? null);
  };

  const handleSubmit = async () => {
    if (!password || !backupFile) {
      setErrorMessage(restoreTranslations("restore.missingFields"));
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    try {
      const restoreResponse = await restoreFromBackup(password, backupFile);
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
        <Input
          aria-label="hide-show-backup-password"
          label={restoreTranslations("restore.passwordLabel")}
          type={showPassword ? "text" : "password"}
          placeholder={restoreTranslations("restore.passwordPlaceholder")}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          endContent={(
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          )}
        />

        <div>
          <label className="block text-sm font-medium text-foreground mb-1">{restoreTranslations("restore.fileLabel")}</label>
          <input type="file" accept=".zip,application/zip" onChange={handleFileChange} />
          <p className="text-sm text-gray-500 mt-1">{restoreTranslations("restore.fileHint")}</p>
        </div>

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
