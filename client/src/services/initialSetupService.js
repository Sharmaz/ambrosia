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

function uploadRestoreWithProgress(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const uploadRequest = new XMLHttpRequest();
    uploadRequest.open("POST", "/api/initial-setup/restore");
    uploadRequest.withCredentials = true;

    if (onProgress) {
      uploadRequest.upload.onprogress = (progressEvent) => {
        if (!progressEvent.lengthComputable) return;
        onProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
      };
    }

    uploadRequest.onload = () => resolve(uploadRequest);
    uploadRequest.onerror = () => reject(new Error("Network error while restoring the backup"));

    uploadRequest.send(formData);
  });
}

export async function restoreFromBackup(password, backupFile, onProgress) {
  const restoreFormData = new FormData();
  restoreFormData.append("password", password);
  restoreFormData.append("backup", backupFile);

  const restoreRequest = await uploadRestoreWithProgress(restoreFormData, onProgress);
  return { ok: restoreRequest.status >= 200 && restoreRequest.status < 300 };
}
