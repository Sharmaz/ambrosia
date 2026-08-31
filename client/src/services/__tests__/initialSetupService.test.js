jest.mock("@/lib/http", () => ({
  httpClient: jest.fn(),
}));

import { httpClient } from "@/lib/http";

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
    });

    afterEach(() => {
      global.XMLHttpRequest = originalXMLHttpRequest;
    });

    function resolveUpload(status) {
      const [uploadRequest] = FakeXMLHttpRequest.instances;
      uploadRequest.status = status;
      uploadRequest.onload();
    }

    it("posts a multipart body with credentials to /api/initial-setup/restore", async () => {
      const backupFile = new File(["zip-content"], "backup.zip", { type: "application/zip" });

      const restoreFromBackupPromise = restoreFromBackup("backup-password", backupFile);
      resolveUpload(200);
      await restoreFromBackupPromise;

      const [uploadRequest] = FakeXMLHttpRequest.instances;
      expect(uploadRequest.method).toBe("POST");
      expect(uploadRequest.url).toBe("/api/initial-setup/restore");
      expect(uploadRequest.withCredentials).toBe(true);
      expect(uploadRequest.sentBody.get("password")).toBe("backup-password");
      expect(uploadRequest.sentBody.get("backup")).toBe(backupFile);
    });

    it("reports upload percent from lengthComputable progress events", async () => {
      const onProgress = jest.fn();

      const restoreFromBackupPromise = restoreFromBackup(
        "backup-password",
        new File(["zip"], "backup.zip"),
        onProgress,
      );
      const [uploadRequest] = FakeXMLHttpRequest.instances;
      uploadRequest.upload.onprogress({ lengthComputable: true, loaded: 25, total: 100 });
      uploadRequest.upload.onprogress({ lengthComputable: false, loaded: 999, total: 100 });
      resolveUpload(200);
      await restoreFromBackupPromise;

      expect(onProgress).toHaveBeenCalledTimes(1);
      expect(onProgress).toHaveBeenCalledWith(25);
    });

    it("resolves with ok:true for a successful response", async () => {
      const restoreFromBackupPromise = restoreFromBackup("backup-password", new File(["zip"], "backup.zip"));
      resolveUpload(200);

      await expect(restoreFromBackupPromise).resolves.toEqual({ ok: true });
    });

    it("resolves with ok:false for a failed response", async () => {
      const restoreFromBackupPromise = restoreFromBackup("wrong-password", new File(["zip"], "backup.zip"));
      resolveUpload(400);

      await expect(restoreFromBackupPromise).resolves.toEqual({ ok: false });
    });
  });
});
