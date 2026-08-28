import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";

import { restartBackendAfterImport } from "@/utils/restartBackendAfterImport";
import { restoreFromBackup } from "@services/initialSetupService";
import { selectBackupFile } from "@test-utils/selectBackupFile";

import { RestoreFromBackupStep } from "../RestoreFromBackup";

jest.mock("@services/initialSetupService", () => ({
  restoreFromBackup: jest.fn(),
}));

jest.mock("@/utils/restartBackendAfterImport", () => ({
  restartBackendAfterImport: jest.fn(),
}));

const mockAddToast = jest.fn();
jest.mock("@heroui/react", () => {
  const actual = jest.requireActual("@heroui/react");
  return {
    ...actual,
    addToast: (...args) => mockAddToast(...args),
  };
});

function renderStep(onBack = jest.fn()) {
  return render(<RestoreFromBackupStep onBack={onBack} />);
}

describe("RestoreFromBackupStep", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    restartBackendAfterImport.mockResolvedValue(false);
  });

  it("renders the password and file fields", async () => {
    await act(async () => {
      renderStep();
    });

    expect(screen.getByLabelText("hide-show-backup-password")).toBeInTheDocument();
    expect(screen.getByText("fileLabel")).toBeInTheDocument();
  });

  it("calls onBack when the back button is pressed", async () => {
    const onBack = jest.fn();
    await act(async () => {
      renderStep(onBack);
    });

    fireEvent.click(screen.getByText("restore.backToSetup"));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("shows a missing-fields error when submitting without a password or file", async () => {
    await act(async () => {
      renderStep();
    });

    fireEvent.click(screen.getByText("restore.submitButton"));

    expect(await screen.findByText("restore.missingFields")).toBeInTheDocument();
    expect(restoreFromBackup).not.toHaveBeenCalled();
  });

  it("shows a generic error when the server rejects the backup", async () => {
    restoreFromBackup.mockResolvedValue({ ok: false });

    await act(async () => {
      renderStep();
    });

    fireEvent.change(screen.getByLabelText("hide-show-backup-password"), { target: { value: "secret" } });
    selectBackupFile();

    await act(async () => {
      fireEvent.click(screen.getByText("restore.submitButton"));
    });

    expect(await screen.findByText("restore.genericError")).toBeInTheDocument();
  });

  it("shows a generic error when the request throws", async () => {
    restoreFromBackup.mockRejectedValue(new Error("network error"));

    await act(async () => {
      renderStep();
    });

    fireEvent.change(screen.getByLabelText("hide-show-backup-password"), { target: { value: "secret" } });
    selectBackupFile();

    await act(async () => {
      fireEvent.click(screen.getByText("restore.submitButton"));
    });

    expect(await screen.findByText("restore.genericError")).toBeInTheDocument();
  });

  it("shows the manual restart message outside Electron on success", async () => {
    restoreFromBackup.mockResolvedValue({ ok: true });

    await act(async () => {
      renderStep();
    });

    fireEvent.change(screen.getByLabelText("hide-show-backup-password"), { target: { value: "secret" } });
    selectBackupFile();

    await act(async () => {
      fireEvent.click(screen.getByText("restore.submitButton"));
    });

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "restore.restartRequiredManual" }),
      );
    });
  });

  it("shows the Electron restart message on success when the backend restarts automatically", async () => {
    restartBackendAfterImport.mockResolvedValue(true);
    restoreFromBackup.mockResolvedValue({ ok: true });

    await act(async () => {
      renderStep();
    });

    fireEvent.change(screen.getByLabelText("hide-show-backup-password"), { target: { value: "secret" } });
    selectBackupFile();

    await act(async () => {
      fireEvent.click(screen.getByText("restore.submitButton"));
    });

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: "restore.restartRequiredElectron" }),
      );
    });
  });
});
