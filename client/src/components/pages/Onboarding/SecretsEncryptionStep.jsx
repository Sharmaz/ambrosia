"use client";

import { Checkbox } from "@heroui/react";
import { useTranslations } from "next-intl";

import { SecretsUnlockPasswordField } from "@components/shared/SecretsUnlockPasswordField";

export function SecretsEncryptionStep({ secretsEncryptionData, onChange }) {
  const secretsEncryptionTranslations = useTranslations();

  const handleActivateToggle = (activateSecretsEncryption) => {
    onChange({
      activateSecretsEncryption,
      secretsUnlockPassword: activateSecretsEncryption ? secretsEncryptionData.secretsUnlockPassword : "",
    });
  };

  return (
    <div>
      <h2 className="text-xl md:text-2xl font-bold text-green-900 mb-2">
        {secretsEncryptionTranslations("stepSecretsEncryption.title")}
      </h2>
      <p className="text-gray-500 mb-4 md:mb-8">{secretsEncryptionTranslations("stepSecretsEncryption.subtitle")}</p>

      <Checkbox isSelected={Boolean(secretsEncryptionData.activateSecretsEncryption)} onValueChange={handleActivateToggle}>
        {secretsEncryptionTranslations("stepSecretsEncryption.activateLabel")}
      </Checkbox>

      {secretsEncryptionData.activateSecretsEncryption && (
        <div className="mt-4 space-y-2">
          <SecretsUnlockPasswordField
            unlockPassword={secretsEncryptionData.secretsUnlockPassword || ""}
            onUnlockPasswordChange={(secretsUnlockPassword) => onChange({ secretsUnlockPassword })}
          />
          <p className="text-xs text-gray-400">{secretsEncryptionTranslations("stepSecretsEncryption.laterHint")}</p>
        </div>
      )}
    </div>
  );
}
