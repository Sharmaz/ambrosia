import { httpClient } from "@/lib/http";

export async function getInitialSetupStatus() {
  return await httpClient("/initial-setup", {
    method: "GET",
    skipRefresh: true,
  });
}

export async function submitInitialSetup(payload) {
  return await httpClient("/initial-setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    skipRefresh: true,
  });
}

export async function restoreFromBackup(password, backupFile) {
  const restoreFormData = new FormData();
  restoreFormData.append("password", password);
  restoreFormData.append("backup", backupFile);

  return await httpClient("/initial-setup/restore", {
    method: "POST",
    body: restoreFormData,
    skipRefresh: true,
  });
}
