"use client";

import { Button, Modal, ModalBody, ModalContent, ModalFooter, ModalHeader } from "@heroui/react";
import { useTranslations } from "next-intl";

export function RestartRequiredModal({ isOpen, onAcknowledge }) {
  const restartModalTranslations = useTranslations("restartRequiredModal");

  return (
    <Modal
      isOpen={isOpen}
      isDismissable={false}
      hideCloseButton
      backdrop="blur"
      classNames={{
        backdrop: "backdrop-blur-xs bg-white/10",
      }}
    >
      <ModalContent>
        <ModalHeader>{restartModalTranslations("title")}</ModalHeader>
        <ModalBody>
          <p>{restartModalTranslations("description")}</p>
        </ModalBody>
        <ModalFooter>
          <Button color="primary" className="bg-green-800" onPress={onAcknowledge}>
            {restartModalTranslations("acknowledgeButton")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
