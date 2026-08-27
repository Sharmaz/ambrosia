import { dispatchAuthEvent, httpClient } from "@/lib/http/httpClient";
import { parseJsonResponse } from "@/lib/http/parseJsonResponse";
import { downloadBlob } from "@/utils/downloadBlob";

function createBackupServiceError(message, errorDetails = {}) {
  const error = new Error(message);
  error.status = errorDetails.status;
  error.code = errorDetails.code ?? "unknown";
  return error;
}

function extractFilename(contentDisposition, fallbackFilename) {
  const match = contentDisposition?.match(/filename="?([^"]+)"?/);
  return match?.[1] ?? fallbackFilename;
}

async function readResponseWithProgress(response, totalBytes, onProgress) {
  if (!response.body || !totalBytes || !onProgress) {
    return response.blob();
  }

  const bodyReader = response.body.getReader();
  const receivedChunks = [];
  let receivedBytes = 0;

  for (;;) {
    const { done, value } = await bodyReader.read();
    if (done) break;
    receivedChunks.push(value);
    receivedBytes += value.length;
    onProgress(Math.min(100, Math.round((receivedBytes / totalBytes) * 100)));
  }

  return new Blob(receivedChunks);
}

export async function exportBackup(password, onProgress) {
  const backupExportResponse = await httpClient("/backup/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
    skipForbiddenRedirect: true,
  });

  if (!backupExportResponse.ok) {
    const backupExportErrorBody = await parseJsonResponse(backupExportResponse, null);
    throw createBackupServiceError(
      backupExportErrorBody?.message ?? "Could not export the backup",
      { status: backupExportResponse.status },
    );
  }

  const totalExportBytes = Number(backupExportResponse.headers.get("x-backup-total-bytes")) || 0;
  const backupBlob = await readResponseWithProgress(backupExportResponse, totalExportBytes, onProgress);
  const filename = extractFilename(
    backupExportResponse.headers.get("content-disposition"),
    "ambrosia-backup.zip",
  );
  downloadBlob(backupBlob, filename);
}

function uploadBackupWithProgress(formData, onProgress) {
  return new Promise((resolve, reject) => {
    const uploadRequest = new XMLHttpRequest();
    uploadRequest.open("POST", "/api/backup/import");
    uploadRequest.withCredentials = true;

    if (onProgress) {
      uploadRequest.upload.onprogress = (progressEvent) => {
        if (!progressEvent.lengthComputable) return;
        onProgress(Math.round((progressEvent.loaded / progressEvent.total) * 100));
      };
    }

    uploadRequest.onload = () => {
      if (uploadRequest.status === 401) dispatchAuthEvent("wallet:unauthorized");
      if (uploadRequest.status === 403) dispatchAuthEvent("auth:forbidden");
      resolve(uploadRequest);
    };
    uploadRequest.onerror = () => reject(new Error("Network error while importing the backup"));

    uploadRequest.send(formData);
  });
}

export async function importBackup(password, backupFile, onProgress) {
  const importFormData = new FormData();
  importFormData.append("password", password);
  importFormData.append("backup", backupFile);

  const backupImportRequest = await uploadBackupWithProgress(importFormData, onProgress);
  const backupImportResponseLike = {
    status: backupImportRequest.status,
    text: async () => backupImportRequest.responseText,
  };
  const backupImportBody = await parseJsonResponse(backupImportResponseLike, null);

  if (backupImportRequest.status < 200 || backupImportRequest.status >= 300) {
    throw createBackupServiceError(
      backupImportBody?.message ?? "Could not import the backup",
      { status: backupImportRequest.status },
    );
  }

  return backupImportBody;
}
