jest.mock("@/lib/http", () => ({
  httpClient: jest.fn(),
}));

import { httpClient } from "@/lib/http";

import { getInitialSetupStatus, submitInitialSetup, restoreFromBackup } from "../initialSetupService";

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
    it("calls POST /initial-setup/restore with a multipart body and skipRefresh", async () => {
      const restoreFromBackupResponse = { ok: true };
      httpClient.mockResolvedValue(restoreFromBackupResponse);
      const backupFile = new File(["zip-content"], "backup.zip", { type: "application/zip" });

      const restoreFromBackupResult = await restoreFromBackup("backup-password", backupFile);

      expect(httpClient).toHaveBeenCalledWith("/initial-setup/restore", expect.objectContaining({
        method: "POST",
        skipRefresh: true,
      }));
      const [, requestOptions] = httpClient.mock.calls[0];
      expect(requestOptions.body).toBeInstanceOf(FormData);
      expect(requestOptions.body.get("password")).toBe("backup-password");
      expect(requestOptions.body.get("backup")).toBe(backupFile);
      expect(restoreFromBackupResult).toBe(restoreFromBackupResponse);
    });
  });
});
