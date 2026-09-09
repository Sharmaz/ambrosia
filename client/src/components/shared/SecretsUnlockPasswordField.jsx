"use client";

import { Input } from "@heroui/react";
import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

export function SecretsUnlockPasswordField({ unlockPassword, onUnlockPasswordChange }) {
  const secretsUnlockPasswordTranslations = useTranslations("secretsUnlockPassword");

  return (
    <div className="space-y-3">
      <Input
        label={secretsUnlockPasswordTranslations("passwordLabel")}
        type="password"
        value={unlockPassword}
        onValueChange={onUnlockPasswordChange}
        description={secretsUnlockPasswordTranslations("passwordDescription")}
      />
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">{secretsUnlockPasswordTranslations("passwordWarning")}</p>
      </div>
    </div>
  );
}
