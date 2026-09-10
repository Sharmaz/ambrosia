"use client";

import { useState } from "react";

import { Input } from "@heroui/react";
import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";

export function SecretsUnlockPasswordField({
  unlockPassword,
  onUnlockPasswordChange,
  unlockPasswordConfirmation,
  onUnlockPasswordConfirmationChange,
}) {
  const secretsUnlockPasswordTranslations = useTranslations("secretsUnlockPassword");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordsMatch = unlockPassword === unlockPasswordConfirmation;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          label={secretsUnlockPasswordTranslations("passwordLabel")}
          type={showPassword ? "text" : "password"}
          value={unlockPassword}
          onValueChange={onUnlockPasswordChange}
          description={secretsUnlockPasswordTranslations("passwordDescription")}
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
      </div>
      <div className="relative">
        <Input
          label={secretsUnlockPasswordTranslations("confirmPasswordLabel")}
          type={showConfirmPassword ? "text" : "password"}
          value={unlockPasswordConfirmation}
          onValueChange={onUnlockPasswordConfirmationChange}
          isInvalid={Boolean(unlockPasswordConfirmation) && !passwordsMatch}
          errorMessage={
            Boolean(unlockPasswordConfirmation) && !passwordsMatch
              ? secretsUnlockPasswordTranslations("passwordsDoNotMatch")
              : ""
          }
          endContent={(
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          )}
        />
      </div>
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">{secretsUnlockPasswordTranslations("passwordWarning")}</p>
      </div>
    </div>
  );
}
