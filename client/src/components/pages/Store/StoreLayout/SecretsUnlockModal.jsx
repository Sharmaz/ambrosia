"use client";

import { useState } from "react";

import { addToast, Button, Input, Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { useTranslations } from "next-intl";

import { RequirePermission } from "@/hooks/usePermission";
import { SECRETS_UNLOCKED_EVENT, unlockSecrets } from "@/services/secretsService";
import WalletGuard from "@components/auth/WalletGuard";

export function SecretsUnlockModal({ onClose }) {
  const secretsEncryptionCardTranslations = useTranslations();
  const [unlockPassword, setUnlockPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleUnlock = async () => {
    setSubmitting(true);
    try {
      await unlockSecrets(unlockPassword);
      addToast({
        color: "success",
        description: secretsEncryptionCardTranslations("secretsEncryptionCard.unlockSuccess"),
      });
      window.dispatchEvent(new Event(SECRETS_UNLOCKED_EVENT));
      onClose?.();
    } catch (unlockSecretsError) {
      addToast({
        color: "danger",
        description: unlockSecretsError.message || secretsEncryptionCardTranslations("secretsEncryptionCard.unlockError"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <WalletGuard
      onCancel={onClose}
      title={secretsEncryptionCardTranslations("secretsEncryptionCard.modalTitle")}
      passwordLabel={secretsEncryptionCardTranslations("secretsEncryptionCard.passwordLabel")}
      confirmText={secretsEncryptionCardTranslations("secretsEncryptionCard.confirmButton")}
      cancelText={secretsEncryptionCardTranslations("secretsEncryptionCard.cancelButton")}
    >
      <Modal isOpen onClose={onClose}>
        <ModalContent>
          <ModalHeader>{secretsEncryptionCardTranslations("secretsEncryptionCard.title")}</ModalHeader>
          <ModalBody className="pt-0 pb-6 flex flex-col gap-4">
            <p className="text-sm text-gray-500">
              {secretsEncryptionCardTranslations("secretsEncryptionCard.lockedDescription")}
            </p>
            <RequirePermission allOf={["settings_update"]}>
              <Input
                label={secretsEncryptionCardTranslations("secretsEncryptionCard.unlockPasswordLabel")}
                type="password"
                value={unlockPassword}
                onValueChange={setUnlockPassword}
              />
              <Button
                color="primary"
                className="bg-green-800"
                isDisabled={!unlockPassword || submitting}
                isLoading={submitting}
                onPress={handleUnlock}
              >
                {secretsEncryptionCardTranslations("secretsEncryptionCard.unlockButton")}
              </Button>
            </RequirePermission>
          </ModalBody>
        </ModalContent>
      </Modal>
    </WalletGuard>
  );
}
