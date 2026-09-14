"use client";

import { useState } from "react";

import { addToast, Button, Input, Modal, ModalBody, ModalContent, ModalHeader } from "@heroui/react";
import { useTranslations } from "next-intl";

import { SECRETS_UNLOCKED_EVENT, unlockSecrets } from "@/services/secretsService";

export function SecretsUnlockModal({ isOpen, onClose }) {
  const secretsEncryptionCardTranslations = useTranslations();
  const [unlockPassword, setUnlockPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleClose = () => {
    setUnlockPassword("");
    onClose?.();
  };

  const handleUnlock = async () => {
    setSubmitting(true);
    try {
      await unlockSecrets(unlockPassword);
      addToast({
        color: "success",
        description: secretsEncryptionCardTranslations("secretsEncryptionCard.unlockSuccess"),
      });
      window.dispatchEvent(new Event(SECRETS_UNLOCKED_EVENT));
      handleClose();
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
    <Modal isOpen={isOpen} onClose={handleClose}>
      <ModalContent>
        <ModalHeader>{secretsEncryptionCardTranslations("secretsEncryptionCard.title")}</ModalHeader>
        <ModalBody className="pt-0 pb-6 flex flex-col gap-4">
          <p className="text-sm text-gray-500">
            {secretsEncryptionCardTranslations("secretsEncryptionCard.lockedDescription")}
          </p>
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
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
