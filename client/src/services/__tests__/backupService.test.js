jest.mock("@/lib/http/httpClient", () => ({
  httpClient: jest.fn(),
  dispatchAuthEvent: jest.fn(),
}));

jest.mock("@/lib/http/parseJsonResponse", () => ({
  parseJsonResponse: jest.fn(),
}));

jest.mock("@/utils/downloadBlob", () => ({
  downloadBlob: jest.fn(),
}));

import { dispatchAuthEvent, httpClient } from "@/lib/http/httpClient";
import { parseJsonResponse } from "@/lib/http/parseJsonResponse";
import { downloadBlob } from "@/utils/downloadBlob";

import { exportBackup, importBackup } from "../backupService";

function makeResponse({
  ok, status, contentDisposition, totalBytes, blob, body,
}) {
  return {
    ok,
    status,
    headers: {
      get: (headerName) => {
        if (headerName === "content-disposition") return contentDisposition ?? null;
        if (headerName === "x-backup-total-bytes") return totalBytes ?? null;
        return null;
      },
    },
    body,
    blob: jest.fn().mockResolvedValue(blob),
  };
}

function makeStreamingBody(chunks) {
  let chunkIndex = 0;
  return {
    getReader: () => ({
      read: jest.fn().mockImplementation(() => {
        if (chunkIndex >= chunks.length) {
          return Promise.resolve({ done: true, value: undefined });
        }
        const chunk = chunks[chunkIndex];
        chunkIndex += 1;
        return Promise.resolve({ done: false, value: chunk });
      }),
    }),
  };
}

class FakeXMLHttpRequest {
  constructor() {
    this.upload = {};
    this.withCredentials = false;
    FakeXMLHttpRequest.instances.push(this);
  }

  open(method, url) {
    this.method = method;
    this.url = url;
  }

  send(body) {
    this.sentBody = body;
  }
}
FakeXMLHttpRequest.instances = [];

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

    describe("progress reporting", () => {
      it("reports cumulative percent against X-Backup-Total-Bytes as chunks arrive", async () => {
        const firstChunk = new Uint8Array(30);
        const secondChunk = new Uint8Array(70);
        httpClient.mockResolvedValue(makeResponse({
          ok: true,
          status: 200,
          totalBytes: "100",
          body: makeStreamingBody([firstChunk, secondChunk]),
        }));
        const onProgress = jest.fn();

        await exportBackup("wallet-password", onProgress);

        expect(onProgress).toHaveBeenNthCalledWith(1, 30);
        expect(onProgress).toHaveBeenNthCalledWith(2, 100);
      });

      it("downloads the accumulated chunks as a single blob", async () => {
        const firstChunk = new Uint8Array([1, 2, 3]);
        httpClient.mockResolvedValue(makeResponse({
          ok: true,
          status: 200,
          totalBytes: "3",
          body: makeStreamingBody([firstChunk]),
        }));

        await exportBackup("wallet-password", jest.fn());

        expect(downloadBlob).toHaveBeenCalledTimes(1);
        const [downloadedBlob] = downloadBlob.mock.calls[0];
        expect(downloadedBlob).toBeInstanceOf(Blob);
        expect(downloadedBlob.size).toBe(3);
      });

      it("falls back to buffering the whole blob when the total-bytes header is missing", async () => {
        const backupBlob = new Blob(["encrypted-zip-bytes"]);
        httpClient.mockResolvedValue(makeResponse({
          ok: true,
          status: 200,
          totalBytes: null,
          body: makeStreamingBody([new Uint8Array(10)]),
          blob: backupBlob,
        }));
        const onProgress = jest.fn();

        await exportBackup("wallet-password", onProgress);

        expect(onProgress).not.toHaveBeenCalled();
        expect(downloadBlob).toHaveBeenCalledWith(backupBlob, "ambrosia-backup.zip");
      });
    });
  });

  describe("importBackup", () => {
    let originalXMLHttpRequest;

    beforeEach(() => {
      FakeXMLHttpRequest.instances = [];
      originalXMLHttpRequest = global.XMLHttpRequest;
      global.XMLHttpRequest = FakeXMLHttpRequest;
    });

    afterEach(() => {
      global.XMLHttpRequest = originalXMLHttpRequest;
    });

    function resolveUpload({ status, body }) {
      const [uploadRequest] = FakeXMLHttpRequest.instances;
      parseJsonResponse.mockResolvedValue(body);
      uploadRequest.status = status;
      uploadRequest.onload();
    }

    it("posts a multipart body with credentials to /api/backup/import", async () => {
      const backupFile = new File(["zip-content"], "backup.zip", { type: "application/zip" });

      const importPromise = importBackup("role-password", "backup-password", backupFile);
      resolveUpload({ status: 200, body: { message: "Backup imported", businessName: "Awesome Store" } });
      await importPromise;

      const [uploadRequest] = FakeXMLHttpRequest.instances;
      expect(uploadRequest.method).toBe("POST");
      expect(uploadRequest.url).toBe("/api/backup/import");
      expect(uploadRequest.withCredentials).toBe(true);
      expect(uploadRequest.sentBody.get("rolePassword")).toBe("role-password");
      expect(uploadRequest.sentBody.get("backupPassword")).toBe("backup-password");
      expect(uploadRequest.sentBody.get("backup")).toBe(backupFile);
    });

    it("reports upload percent from lengthComputable progress events", async () => {
      const onProgress = jest.fn();

      const importPromise = importBackup("role-password", "backup-password", new File(["zip"], "backup.zip"), onProgress);
      const [uploadRequest] = FakeXMLHttpRequest.instances;
      uploadRequest.upload.onprogress({ lengthComputable: true, loaded: 25, total: 100 });
      uploadRequest.upload.onprogress({ lengthComputable: false, loaded: 999, total: 100 });
      resolveUpload({ status: 200, body: { message: "Backup imported" } });
      await importPromise;

      expect(onProgress).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith(25);
    });

    it("returns the parsed response body on success", async () => {
      const importPromise = importBackup("role-password", "backup-password", new File(["zip"], "backup.zip"));
      resolveUpload({ status: 200, body: { message: "Backup imported", businessName: "Awesome Store" } });

      await expect(importPromise).resolves.toEqual({ message: "Backup imported", businessName: "Awesome Store" });
    });

    it("throws with the server message when the response is not ok", async () => {
      const importPromise = importBackup("role-password", "wrong-backup-password", new File(["zip"], "backup.zip"));
      resolveUpload({ status: 400, body: { message: "Incorrect password or corrupted backup file" } });

      await expect(importPromise).rejects.toMatchObject({
        message: "Incorrect password or corrupted backup file",
        status: 400,
      });
    });

    it("dispatches wallet:unauthorized on a 401 response", async () => {
      const importPromise = importBackup("wrong-role-password", "backup-password", new File(["zip"], "backup.zip"));
      resolveUpload({ status: 401, body: { message: "Unauthorized" } });
      await importPromise.catch(() => {});

      expect(dispatchAuthEvent).toHaveBeenCalledWith("wallet:unauthorized");
    });
  });
});
