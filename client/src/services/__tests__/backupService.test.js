jest.mock("@/lib/http/httpClient", () => ({
  httpClient: jest.fn(),
}));

jest.mock("@/lib/http/parseJsonResponse", () => ({
  parseJsonResponse: jest.fn(),
}));

jest.mock("@/utils/downloadBlob", () => ({
  downloadBlob: jest.fn(),
}));

import { httpClient } from "@/lib/http/httpClient";
import { parseJsonResponse } from "@/lib/http/parseJsonResponse";
import { downloadBlob } from "@/utils/downloadBlob";

import { exportBackup } from "../backupService";

function makeResponse({ ok, status, contentDisposition, blob }) {
  return {
    ok,
    status,
    headers: {
      get: (headerName) => (headerName === "content-disposition" ? contentDisposition : null),
    },
    blob: jest.fn().mockResolvedValue(blob),
  };
}

describe("backupService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("exportBackup", () => {
    it("calls /backup/export with the password and skipForbiddenRedirect", async () => {
      const backupBlob = new Blob(["encrypted-zip-bytes"]);
      httpClient.mockResolvedValue(makeResponse({
        ok: true,
        status: 200,
        contentDisposition: 'attachment; filename="ambrosia-backup-my-store-2026-08-24.zip"',
        blob: backupBlob,
      }));

      await exportBackup("wallet-password");

      expect(httpClient).toHaveBeenCalledWith("/backup/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: "wallet-password" }),
        skipForbiddenRedirect: true,
      });
    });

    it("downloads the blob using the filename from Content-Disposition", async () => {
      const backupBlob = new Blob(["encrypted-zip-bytes"]);
      httpClient.mockResolvedValue(makeResponse({
        ok: true,
        status: 200,
        contentDisposition: 'attachment; filename="ambrosia-backup-my-store-2026-08-24.zip"',
        blob: backupBlob,
      }));

      await exportBackup("wallet-password");

      expect(downloadBlob).toHaveBeenCalledWith(backupBlob, "ambrosia-backup-my-store-2026-08-24.zip");
    });

    it("falls back to a default filename when Content-Disposition is missing", async () => {
      const backupBlob = new Blob(["encrypted-zip-bytes"]);
      httpClient.mockResolvedValue(makeResponse({
        ok: true,
        status: 200,
        contentDisposition: null,
        blob: backupBlob,
      }));

      await exportBackup("wallet-password");

      expect(downloadBlob).toHaveBeenCalledWith(backupBlob, "ambrosia-backup.zip");
    });

    it("throws with the server message when the response is not ok", async () => {
      httpClient.mockResolvedValue(makeResponse({ ok: false, status: 401 }));
      parseJsonResponse.mockResolvedValue({ message: "Invalid password" });

      await expect(exportBackup("wrong-password")).rejects.toMatchObject({
        message: "Invalid password",
        status: 401,
      });
      expect(downloadBlob).not.toHaveBeenCalled();
    });

    it("throws a fallback message when the error response has no body", async () => {
      httpClient.mockResolvedValue(makeResponse({ ok: false, status: 401 }));
      parseJsonResponse.mockResolvedValue(null);

      await expect(exportBackup("wrong-password")).rejects.toMatchObject({
        message: "Could not export the backup",
        status: 401,
      });
    });
  });
});
