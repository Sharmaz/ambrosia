import { httpClient } from "@/lib/http/httpClient";
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

export async function exportBackup(password) {
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

  const backupBlob = await backupExportResponse.blob();
  const filename = extractFilename(
    backupExportResponse.headers.get("content-disposition"),
    "ambrosia-backup.zip",
  );
  downloadBlob(backupBlob, filename);
}

export async function importBackup(password, backupFile) {
  const importFormData = new FormData();
  importFormData.append("password", password);
  importFormData.append("backup", backupFile);

  const backupImportResponse = await httpClient("/backup/import", {
    method: "POST",
    body: importFormData,
    skipForbiddenRedirect: true,
  });

  const backupImportBody = await parseJsonResponse(backupImportResponse, null);
  if (!backupImportResponse.ok) {
    throw createBackupServiceError(
      backupImportBody?.message ?? "Could not import the backup",
      { status: backupImportResponse.status },
    );
  }

  return backupImportBody;
}
