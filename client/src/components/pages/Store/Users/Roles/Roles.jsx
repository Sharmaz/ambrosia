"use client";

import { useMemo, useRef, useState } from "react";

import { addToast, Button, Card, CardBody } from "@heroui/react";
import { useTranslations } from "next-intl";

import { usePermissions } from "@/components/pages/Store/hooks/usePermissions";
import { PageHeader } from "@/components/shared/PageHeader";
import { RequirePermission } from "@/hooks/usePermission";
import { buildPermissionSet } from "@/lib/features";
import { useConfigurations } from "@/providers/configurations/configurationsProvider";

import { CreateRoleModal } from "./CreateRoleModal";
import { DeleteRoleModal } from "./DeleteRoleModal";
import { EditRoleModal } from "./EditRoleModal";
import { RolesList } from "./RolesList";
import { permissionCatalog } from "./utils/permissionCatalog";

export function Roles({ roles, createRole, deleteRole, loading: loadingRoles, updateRoleWithPermissions, getRolePermissions }) {
  const { permissions, loading: loadingPerms } = usePermissions();
  const roleTranslations = useTranslations();
  const { businessType } = useConfigurations();
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRole, setEditingRole] = useState(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [roleToDelete, setRoleToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const creatingRef = useRef(false);
  const updatingRef = useRef(false);
  const deletingRef = useRef(false);
  const [form, setForm] = useState({
    name: "",
    password: "",
    isAdmin: false,
    permissions: [],
  });

  const permSet = useMemo(() => buildPermissionSet(permissions), [permissions]);
  const filteredCatalog = useMemo(() => permissionCatalog.filter((permission) => {
    if (!permSet.has(permission.key)) return false;
    if (!businessType) return true;
    return permission.business === "both" || permission.business === businessType;
  }), [permSet, businessType]);

  const togglePermission = (name) => {
    setForm((prev) => {
      const exists = prev.permissions.includes(name);
      return {
        ...prev,
        permissions: exists
          ? prev.permissions.filter((p) => p !== name)
          : [...prev.permissions, name],
      };
    });
  };

  const handleCreateRole = async () => {
    if (!form.name.trim()) return;
    if (creatingRef.current) return;
    creatingRef.current = true;
    try {
      setCreating(true);
      await createRole({
        name: form.name.trim(),
        password: form.password.trim() || undefined,
        isAdmin: form.isAdmin,
        permissions: form.permissions,
      });
      setForm({ name: "", password: "", isAdmin: false, permissions: [] });
      setShowModal(false);
      addToast({ title: roleTranslations("roles.actions.createSuccess"), color: "success" });
    } catch {
      addToast({
        title: roleTranslations("roles.actions.createErrorTitle"),
        description: roleTranslations("roles.actions.createErrorDescription"),
        color: "danger",
      });
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  };

  const openEditModal = async (role) => {
    try {
      setEditingRole(role);
      setUpdating(false);
      const rolePerms = await getRolePermissions(role.id);
      setForm({
        name: role.role,
        password: "",
        isAdmin: role.isAdmin,
        permissions: rolePerms.map((p) => p.name),
      });
      setShowEditModal(true);
    } catch {
    }
  };

  const handleUpdateRole = async () => {
    if (!editingRole) return;
    if (updatingRef.current) return;
    updatingRef.current = true;
    try {
      setUpdating(true);
      await updateRoleWithPermissions(editingRole.id, {
        name: form.name.trim(),
        password: form.password.trim() || undefined,
        isAdmin: form.isAdmin,
        permissions: form.permissions,
      });
      setShowEditModal(false);
      setEditingRole(null);
      setForm({ name: "", password: "", isAdmin: false, permissions: [] });
      addToast({ title: roleTranslations("roles.actions.saveSuccess"), color: "success" });
    } catch (error) {
      addToast({
        title: error?.status === 409 ? roleTranslations("roles.actions.lastAdminErrorTitle") : roleTranslations("roles.actions.saveErrorTitle"),
        description: error?.status === 409 ? roleTranslations("roles.actions.lastAdminErrorDescription") : roleTranslations("roles.actions.saveErrorDescription"),
        color: error?.status === 409 ? "warning" : "danger",
      });
    } finally {
      updatingRef.current = false;
      setUpdating(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!roleToDelete) return;
    if (deletingRef.current) return;
    deletingRef.current = true;
    try {
      setDeleting(true);
      await deleteRole(roleToDelete.id);
      setRoleToDelete(null);
      addToast({ title: roleTranslations("roles.actions.deleteSuccess"), color: "success" });
    } catch (error) {
      addToast({
        title: error?.status === 409 ? roleTranslations("roles.actions.lastAdminErrorTitle") : roleTranslations("roles.actions.saveErrorTitle"),
        description: error?.status === 409 ? roleTranslations("roles.actions.lastAdminErrorDescription") : roleTranslations("roles.actions.deleteError"),
        color: error?.status === 409 ? "warning" : "danger",
      });
    } finally {
      deletingRef.current = false;
      setDeleting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={roleTranslations("roles.header.title")}
        subtitle={roleTranslations("roles.header.subtitle")}
        actions={(
          <RequirePermission allOf={["roles_create"]}>
            <Button
              color="primary"
              className="bg-green-800"
              onPress={() => setShowModal(true)}
              isDisabled={loadingPerms}
            >
              {roleTranslations("roles.actions.new")}
            </Button>
          </RequirePermission>
        )}
      />

      <Card className="bg-white rounded-lg shadow-lg overflow-x-auto">
        <CardBody className="p-4 lg:p-8">
          <RolesList
            roles={roles}
            loading={loadingRoles}
            onEdit={openEditModal}
            onDelete={setRoleToDelete}
          />
        </CardBody>
      </Card>

      <CreateRoleModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleCreateRole}
        creating={creating}
        form={form}
        setForm={setForm}
        permissionOptions={filteredCatalog}
        togglePermission={togglePermission}
        roleTranslations={roleTranslations}
        businessType={businessType}
      />

      <DeleteRoleModal
        role={roleToDelete}
        onClose={() => setRoleToDelete(null)}
        onConfirm={handleDeleteRole}
        deleting={deleting}
      />

      {editingRole && (
        <EditRoleModal
          isOpen={showEditModal}
          onClose={() => {
            setShowEditModal(false);
            setEditingRole(null);
          }}
          onSubmit={handleUpdateRole}
          form={form}
          setForm={setForm}
          permissionOptions={filteredCatalog}
          togglePermission={togglePermission}
          updating={updating}
          roleName={editingRole?.role}
          roleTranslations={roleTranslations}
          businessType={businessType}
        />
      )}
    </div>
  );
}
