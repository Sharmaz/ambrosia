import { restartBackendAfterImport } from "../restartBackendAfterImport";

let mockIsElectron = false;
jest.mock("@lib/isElectron", () => ({
  get isElectron() {
    return mockIsElectron;
  },
}));

describe("restartBackendAfterImport", () => {
  beforeEach(() => {
    mockIsElectron = false;
  });

  afterEach(() => {
    delete window.electron;
  });

  it("returns false without invoking any IPC channel outside Electron", async () => {
    const restartTriggered = await restartBackendAfterImport();

    expect(restartTriggered).toBe(false);
  });

  it("invokes services:restart with backend and returns true inside Electron", async () => {
    mockIsElectron = true;
    const mockInvoke = jest.fn().mockResolvedValue(undefined);
    window.electron = { ipc: { invoke: mockInvoke } };

    const restartTriggered = await restartBackendAfterImport();

    expect(mockInvoke).toHaveBeenCalledWith("services:restart", "backend");
    expect(restartTriggered).toBe(true);
  });
});
