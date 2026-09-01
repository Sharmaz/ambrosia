jest.mock("@/lib/http", () => ({
  httpClient: jest.fn(),
}));

jest.mock("../backupProgressChannel", () => ({
  openBackupProgressChannel: jest.fn(),
  closeBackupProgressChannel: jest.fn(),
}));

import { httpClient } from "@/lib/http";
import { waitForInstance } from "@test-utils/waitForInstance";

import { closeBackupProgressChannel, openBackupProgressChannel } from "../backupProgressChannel";
import { getInitialSetupStatus, submitInitialSetup, restoreFromBackup } from "../initialSetupService";

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

describe("initialSetupService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("getInitialSetupStatus", () => {
    it("calls GET /initial-setup with skipRefresh", async () => {
      const initialSetupStatusResponse = { initialized: true };
      httpClient.mockResolvedValue(initialSetupStatusResponse);

      const initialSetupStatus = await getInitialSetupStatus();

      expect(httpClient).toHaveBeenCalledWith("/initial-setup", {
        method: "GET",
        skipRefresh: true,
      });
      expect(initialSetupStatus).toBe(initialSetupStatusResponse);
    });
  });

  describe("submitInitialSetup", () => {
    it("calls POST /initial-setup with the JSON-encoded payload and skipRefresh", async () => {
      const submitInitialSetupResponse = { ok: true };
      httpClient.mockResolvedValue(submitInitialSetupResponse);
      const setupPayload = { businessType: "store", userName: "Ivan" };

      const submitInitialSetupResult = await submitInitialSetup(setupPayload);

      expect(httpClient).toHaveBeenCalledWith("/initial-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setupPayload),
        skipRefresh: true,
      });
      expect(submitInitialSetupResult).toBe(submitInitialSetupResponse);
    });
  });

  describe("restoreFromBackup", () => {
    let originalXMLHttpRequest;

    beforeEach(() => {
      FakeXMLHttpRequest.instances = [];
      originalXMLHttpRequest = global.XMLHttpRequest;
      global.XMLHttpRequest = FakeXMLHttpRequest;
      openBackupProgressChannel.mockResolvedValue(null);
    });

    afterEach(() => {
      global.XMLHttpRequest = originalXMLHttpRequest;
    });

    async function resolveUpload(status) {
      const uploadRequest = await waitForInstance(FakeXMLHttpRequest);
      uploadRequest.status = status;
      uploadRequest.onload();
    }

    it("posts a multipart body with credentials to /api/initial-setup/restore", async () => {
      const backupFile = new File(["zip-content"], "backup.zip", { type: "application/zip" });

      const restoreFromBackupPromise = restoreFromBackup("backup-password", backupFile);
      await resolveUpload(200);
      await restoreFromBackupPromise;

      const [uploadRequest] = FakeXMLHttpRequest.instances;
      expect(uploadRequest.method).toBe("POST");
      expect(uploadRequest.url).toBe("/api/initial-setup/restore");
      expect(uploadRequest.withCredentials).toBe(true);
      expect(uploadRequest.sentBody.get("password")).toBe("backup-password");
      expect(uploadRequest.sentBody.get("backup")).toBe(backupFile);
    });

    it("resolves with ok:true for a successful response", async () => {
      const restoreFromBackupPromise = restoreFromBackup("backup-password", new File(["zip"], "backup.zip"));
      await resolveUpload(200);

      await expect(restoreFromBackupPromise).resolves.toEqual({ ok: true });
    });

    it("resolves with ok:false for a failed response", async () => {
      const restoreFromBackupPromise = restoreFromBackup("wrong-password", new File(["zip"], "backup.zip"));
      await resolveUpload(400);

      await expect(restoreFromBackupPromise).resolves.toEqual({ ok: false });
    });

    describe("progress reporting", () => {
      it("opens a progress channel with the caller's onProgress", async () => {
        const onProgress = jest.fn();

        const restoreFromBackupPromise = restoreFromBackup(
          "backup-password",
          new File(["zip"], "backup.zip"),
          onProgress,
        );
        await resolveUpload(200);
        await restoreFromBackupPromise;

        expect(openBackupProgressChannel).toHaveBeenCalledWith(onProgress, "/initial-setup/progress-token");
      });

      it("appends operationId before the backup file when a progress channel connects", async () => {
        openBackupProgressChannel.mockResolvedValue({ operationId: "operation-1", socket: { close: jest.fn() } });

        const restoreFromBackupPromise = restoreFromBackup(
          "backup-password",
          new File(["zip"], "backup.zip"),
          jest.fn(),
        );
        await resolveUpload(200);
        await restoreFromBackupPromise;

        const [uploadRequest] = FakeXMLHttpRequest.instances;
        const sentFieldNames = [...uploadRequest.sentBody.keys()];
        expect(uploadRequest.sentBody.get("operationId")).toBe("operation-1");
        expect(sentFieldNames.indexOf("operationId")).toBeLessThan(sentFieldNames.indexOf("backup"));
      });

      it("does not append operationId when no progress channel could connect", async () => {
        const restoreFromBackupPromise = restoreFromBackup(
          "backup-password",
          new File(["zip"], "backup.zip"),
          jest.fn(),
        );
        await resolveUpload(200);
        await restoreFromBackupPromise;

        const [uploadRequest] = FakeXMLHttpRequest.instances;
        expect(uploadRequest.sentBody.has("operationId")).toBe(false);
      });

      it("closes the progress channel once the restore call settles", async () => {
        const progressChannel = { operationId: "operation-1", socket: { close: jest.fn() } };
        openBackupProgressChannel.mockResolvedValue(progressChannel);

        const restoreFromBackupPromise = restoreFromBackup(
          "backup-password",
          new File(["zip"], "backup.zip"),
          jest.fn(),
        );
        await resolveUpload(200);
        await restoreFromBackupPromise;

        expect(closeBackupProgressChannel).toHaveBeenCalledWith(progressChannel);
      });
    });
  });
});
