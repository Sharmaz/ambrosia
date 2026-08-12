"use client";
import { useState, useEffect, useCallback } from "react";

import { toArray } from "@/components/utils/array";
import { usePermission } from "@/hooks/usePermission";
import { httpClient, parseJsonResponse } from "@/lib/http";
import { useFetchList } from "@/lib/http/useFetchList";

import { buildHttpError } from "../utils/buildHttpError";

export function useRoles() {
  const { fetchList } = useFetchList();
  const [roles, setRoles] = useState([]);
  const canRead = usePermission({ allOf: ["roles_read"] });
  const [loading, setLoading] = useState(canRead);
  const [error, setError] = useState(null);

  const fetchRoles = useCallback(async () => {
    if (!canRead) return;
    setLoading(true);
    setError(null);

    try {
      const rolesData = await fetchList("/roles");
      if (rolesData === null) return;
      setRoles(toArray(rolesData));
    } catch (roleLoadError) {
      console.error("Error fetching roles:", roleLoadError);
    } finally {
      setLoading(false);
    }
  }, [canRead, fetchList]);

  const updateRole = useCallback(async (roleId, role) => {
    try {
      const updateRoleRequest = await httpClient(`/roles/${roleId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(role),
      });
      if (updateRoleRequest.ok === false) {
        throw buildHttpError(updateRoleRequest, "Error updating role");
      }
      return updateRoleRequest;
    } catch (updateRoleError) {
      console.error("Error updating role:", updateRoleError);
      throw updateRoleError;
    }
  }, []);

  const assignPermissions = useCallback(async (roleId, permissions = []) => {
    if (!roleId) return;
    try {
      await httpClient(`/roles/${roleId}/permissions`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ permissions }),
      });
    } catch (assignPermissionsError) {
      console.error("Error assigning permissions:", assignPermissionsError);
      throw assignPermissionsError;
    }
  }, []);

  const createRole = useCallback(
    async ({ name, password, isAdmin = false, permissions = [] }) => {
      try {
        const roleRequestBody = { role: name, isAdmin };
        if (password) roleRequestBody.password = password;
        const createRoleRequest = await httpClient("/roles", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(roleRequestBody),
        });
        if (createRoleRequest.ok === false) {
          throw buildHttpError(createRoleRequest, "Error creating role");
        }
        const createdRoleData = await parseJsonResponse(createRoleRequest, []);
        const createdRoleId = createdRoleData?.id || createdRoleData?.roleId;
        if (permissions.length > 0) {
          await assignPermissions(createdRoleId, permissions);
        }
        await fetchRoles();
        return createdRoleId;
      } catch (createRoleError) {
        console.error("Error creating role:", createRoleError);
        throw createRoleError;
      }
    },
    [assignPermissions, fetchRoles],
  );

  const updateRoleWithPermissions = useCallback(
    async (roleId, { name, isAdmin = false, password, permissions = [] }) => {
      if (!roleId) return;
      await updateRole(roleId, {
        role: name,
        isAdmin,
        ...(password ? { password } : {}),
      });
      await assignPermissions(roleId, permissions);
      await fetchRoles();
    },
    [assignPermissions, fetchRoles, updateRole],
  );

  const deleteRole = useCallback(async (roleId) => {
    const deleteRoleResponse = await httpClient(`/roles/${roleId}`, { method: "DELETE" });
    if (deleteRoleResponse.ok === false) {
      throw buildHttpError(deleteRoleResponse, "Error deleting role");
    }
    await fetchRoles();
  }, [fetchRoles]);

  const getRolePermissions = useCallback(async (roleId) => {
    if (!roleId) return [];
    try {
      const rolePermissionsResponse = await httpClient(`/roles/${roleId}/permissions`);

      const rolePermissionsData = await parseJsonResponse(rolePermissionsResponse);

      return toArray(rolePermissionsData, []);
    } catch (rolePermissionsError) {
      console.error("Error fetching role permissions:", rolePermissionsError);
      throw rolePermissionsError;
    }
  }, []);

  useEffect(() => {
    fetchRoles();
  }, [fetchRoles]);

  return {
    roles,
    createRole,
    deleteRole,
    assignPermissions,
    updateRoleWithPermissions,
    getRolePermissions,
    loading,
    error,
    refetch: fetchRoles,
  };
}
