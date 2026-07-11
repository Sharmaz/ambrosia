"use client";
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Checkbox,
} from "@heroui/react";

import { PermissionSelector } from "./PermissionSelector";

export function EditRoleModal({
  isOpen,
  onClose,
  onSubmit,
  form,
  setForm,
  permissionOptions = [],
  togglePermission,
  updating = false,
  roleName = "",
  roleTranslations,
  businessType = null,
}) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="3xl"
      placement="center"
      backdrop="blur"
      shouldBlockScroll={false}
      classNames={{
        wrapper: "items-start h-auto",
        base: "my-auto overflow-hidden",
      }}
    >
      <ModalContent>
        <ModalHeader>
          {roleTranslations("roles.edit.title")} {roleName ? `(${roleName})` : ""}
        </ModalHeader>
        <ModalBody className="max-h-[70vh] overflow-y-auto space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Input
              label={roleTranslations("roles.edit.roleName")}
              placeholder={roleTranslations("roles.edit.roleNamePlaceholder")}
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              isRequired
            />
            <Input
              label={roleTranslations("roles.edit.password")}
              placeholder={roleTranslations("roles.edit.passwordPlaceholder")}
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            />
            <Checkbox
              isSelected={form.isAdmin}
              onValueChange={(isSelected) => setForm((prev) => ({ ...prev, isAdmin: isSelected }))}
            >
              {roleTranslations("roles.edit.isAdmin")}
            </Checkbox>
          </div>

          <div className="mt-4 space-y-4">
            <p className="text-sm text-default-600">
              {roleTranslations("roles.permissions.legend")}
            </p>
            <PermissionSelector
              catalog={permissionOptions}
              selected={form.permissions}
              togglePermission={togglePermission}
              roleTranslations={roleTranslations}
              businessType={businessType}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="bordered"
            className="px-6 py-2 border border-border text-foreground hover:bg-muted transition-colors"
            onPress={onClose}
            isDisabled={updating}
          >
            {roleTranslations("roles.actions.cancel")}
          </Button>
          <Button
            color="primary"
            className="bg-green-800"
            onPress={onSubmit}
            isDisabled={!form.name.trim() || updating}
            isLoading={updating}
          >
            {roleTranslations("roles.actions.save")}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}
