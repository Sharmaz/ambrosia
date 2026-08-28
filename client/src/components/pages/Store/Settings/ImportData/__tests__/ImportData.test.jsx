import { render, screen, fireEvent, act } from "@testing-library/react";

import * as backupService from "@/services/backupService";
import { restartBackendAfterImport } from "@/utils/restartBackendAfterImport";
import { MockHeroUIProgress } from "@test-utils/mockHeroUIProgress";

import { ImportData } from "../ImportData";

jest.mock("@heroui/react", () => ({
  addToast: jest.fn(),
  Button: ({ onPress, children, ...props }) => (
    <button type="button" onClick={onPress} {...props}>{children}</button>
  ),
  Card: ({ children }) => <div>{children}</div>,
  CardHeader: ({ children }) => <div>{children}</div>,
  CardBody: ({ children }) => <div>{children}</div>,
  CardFooter: ({ children }) => <div>{children}</div>,
  Spinner: () => <div data-testid="spinner" />,
  Progress: MockHeroUIProgress,
  Modal: ({ isOpen, children }) => (isOpen ? <div>{children}</div> : null),
  ModalContent: ({ children }) => <div>{children}</div>,
  ModalHeader: ({ children }) => <div>{children}</div>,
  ModalBody: ({ children }) => <div>{children}</div>,
  ModalFooter: ({ children }) => <div>{children}</div>,
}));

jest.mock("@components/shared/BackupPasswordAndFileFields", () => ({
  BackupPasswordAndFileFields: ({ onBackupPasswordChange, onFileChange }) => (
    <div>
      <button type="button" data-testid="fill-backup-password" onClick={() => onBackupPasswordChange("backup-password")}>fill-backup-password</button>
      <button
        type="button"
        data-testid="select-backup-file"
        onClick={() => onFileChange(new File(["zip-content"], "backup.zip", { type: "application/zip" }))}
      >
        select-backup-file
      </button>
    </div>
  ),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

jest.mock("@components/auth/WalletGuard", () => function MockWalletGuard({ children, onAuthorized, onCancel }) {
  return (
    <div data-testid="wallet-guard">
      <button type="button" data-testid="guard-confirm" onClick={() => onAuthorized("wallet-password")}>confirm</button>
      <button type="button" data-testid="guard-cancel" onClick={onCancel}>cancel</button>
      {children}
    </div>
  );
},
);

jest.mock("@/utils/restartBackendAfterImport", () => ({
  restartBackendAfterImport: jest.fn(),
}));

async function unlockSelectFileAndImport() {
  fireEvent.click(screen.getByText("cardImportData.importButton"));
  fireEvent.click(screen.getByTestId("guard-confirm"));
  fireEvent.click(screen.getByTestId("select-backup-file"));
  fireEvent.click(screen.getByTestId("fill-backup-password"));
  fireEvent.click(screen.getByText("cardImportData.continueButton"));

  await act(async () => {
    fireEvent.click(screen.getByText("cardImportData.confirmModal.confirmButton"));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  restartBackendAfterImport.mockResolvedValue(false);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ImportData", () => {
  describe("Initial (locked) state", () => {
    it("renders the locked card by default", () => {
      render(<ImportData />);
      expect(screen.getByText("cardImportData.importButton")).toBeInTheDocument();
    });

    it("does not render the WalletGuard before reveal", () => {
      render(<ImportData />);
      expect(screen.queryByTestId("wallet-guard")).not.toBeInTheDocument();
    });
  });

  describe("Transition to unlocked state", () => {
    it("renders WalletGuard after the import button is clicked", () => {
      render(<ImportData />);
      fireEvent.click(screen.getByText("cardImportData.importButton"));
      expect(screen.getByTestId("wallet-guard")).toBeInTheDocument();
    });
  });

  describe("Successful import", () => {
    it("calls importBackup with the wallet password, backup password, and the selected file", async () => {
      jest.spyOn(backupService, "importBackup").mockResolvedValue({ businessName: "Awesome Store" });
      render(<ImportData />);

      await unlockSelectFileAndImport();

      expect(backupService.importBackup).toHaveBeenCalledWith(
        "wallet-password",
        "backup-password",
        expect.any(File),
        expect.any(Function),
      );
    });

    it("threads progress reported by importBackup into the rendered card", async () => {
      let reportProgress;
      jest.spyOn(backupService, "importBackup").mockImplementation((rolePassword, backupPassword, backupFile, onProgress) => {
        reportProgress = onProgress;
        return new Promise(() => {});
      });
      render(<ImportData />);

      await unlockSelectFileAndImport();
      act(() => {
        reportProgress(63);
      });

      expect(screen.getByTestId("progress")).toHaveAttribute("data-value", "63");
    });

    it("shows a success toast", async () => {
      const { addToast } = require("@heroui/react");
      jest.spyOn(backupService, "importBackup").mockResolvedValue({ businessName: "Awesome Store" });
      render(<ImportData />);

      await unlockSelectFileAndImport();

      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ color: "success", description: "cardImportData.success" }),
      );
    });

    it("shows the manual restart message when not running in Electron", async () => {
      const { addToast } = require("@heroui/react");
      jest.spyOn(backupService, "importBackup").mockResolvedValue({ businessName: "Awesome Store" });
      restartBackendAfterImport.mockResolvedValue(false);
      render(<ImportData />);

      await unlockSelectFileAndImport();

      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ color: "warning", description: "cardImportData.restartRequiredManual" }),
      );
    });

    it("shows the Electron restart message when the backend restarts automatically", async () => {
      const { addToast } = require("@heroui/react");
      jest.spyOn(backupService, "importBackup").mockResolvedValue({ businessName: "Awesome Store" });
      restartBackendAfterImport.mockResolvedValue(true);
      render(<ImportData />);

      await unlockSelectFileAndImport();

      expect(addToast).toHaveBeenCalledWith(
        expect.objectContaining({ color: "primary", description: "cardImportData.restartRequiredElectron" }),
      );
    });
  });

  describe("Failed import", () => {
    it("shows an error inside the card when importBackup throws", async () => {
      jest.spyOn(backupService, "importBackup").mockRejectedValue(new Error("Invalid backup file"));
      render(<ImportData />);

      await unlockSelectFileAndImport();

      expect(await screen.findByText("cardImportData.errorDescription")).toBeInTheDocument();
    });

    it("does not trigger the restart flow when importBackup throws", async () => {
      jest.spyOn(backupService, "importBackup").mockRejectedValue(new Error("Invalid backup file"));
      render(<ImportData />);

      await unlockSelectFileAndImport();

      expect(restartBackendAfterImport).not.toHaveBeenCalled();
    });
  });

  describe("Cancel", () => {
    it("returns to locked state when WalletGuard cancel is pressed", () => {
      render(<ImportData />);
      fireEvent.click(screen.getByText("cardImportData.importButton"));
      fireEvent.click(screen.getByTestId("guard-cancel"));
      expect(screen.getByText("cardImportData.importButton")).toBeInTheDocument();
    });
  });
});
