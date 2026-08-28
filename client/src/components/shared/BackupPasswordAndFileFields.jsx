"use client";

import { useState } from "react";

import { Input } from "@heroui/react";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

export function BackupPasswordAndFileFields({ backupPassword, onBackupPasswordChange, onFileChange }) {
  const backupFieldsTranslations = useTranslations("backupPasswordField");
  const [showBackupPassword, setShowBackupPassword] = useState(false);

  const handleFileChange = (event) => {
    onFileChange(event.target.files?.[0] ?? null);
  };

  return (
    <>
      <Input
        aria-label="hide-show-backup-password"
        label={backupFieldsTranslations("passwordLabel")}
        type={showBackupPassword ? "text" : "password"}
        placeholder={backupFieldsTranslations("passwordPlaceholder")}
        value={backupPassword}
        onChange={(event) => onBackupPasswordChange(event.target.value)}
        endContent={(
          <button
            type="button"
            onClick={() => setShowBackupPassword(!showBackupPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showBackupPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        )}
      />

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          {backupFieldsTranslations("fileLabel")}
        </label>
        <input type="file" accept=".zip,application/zip" onChange={handleFileChange} />
        <p className="text-sm text-gray-500 mt-1">
          {backupFieldsTranslations("fileHint")}
        </p>
      </div>
    </>
  );
}
