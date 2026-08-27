import { render, screen, fireEvent, act } from "@testing-library/react";

import { MockHeroUIProgress } from "@test-utils/mockHeroUIProgress";
import { selectBackupFile } from "@test-utils/selectBackupFile";

import { ImportDataCardUnlocked } from "../ImportDataCardUnlocked";

jest.mock("@heroui/react", () => ({
  Card: ({ children }) => <div>{children}</div>,
  CardHeader: ({ children }) => <div>{children}</div>,
  CardBody: ({ children }) => <div>{children}</div>,
  Spinner: () => <div data-testid="spinner" />,
  Progress: MockHeroUIProgress,
  Button: ({ onPress, children, ...props }) => (
    <button type="button" onClick={onPress} {...props}>{children}</button>
  ),
}));

jest.mock("@components/auth/WalletGuard", () => function MockWalletGuard({ children, onAuthorized, onCancel, title, passwordLabel, confirmText, cancelText }) {
  return (
    <div>
      <span data-testid="guard-title">{title}</span>
      <span data-testid="guard-password-label">{passwordLabel}</span>
      <span data-testid="guard-confirm-text">{confirmText}</span>
      <span data-testid="guard-cancel-text">{cancelText}</span>
      <button type="button" data-testid="guard-confirm" onClick={() => onAuthorized("wallet-password")}>confirm</button>
      <button type="button" data-testid="guard-cancel" onClick={onCancel}>cancel</button>
      {children}
    </div>
  );
},
);

jest.mock("../ImportBackupConfirmModal", () => ({
  ImportBackupConfirmModal: ({ isOpen, onConfirm, onOpenChange }) => (
    isOpen ? (
      <div data-testid="confirm-modal">
        <button type="button" data-testid="modal-confirm" onClick={onConfirm}>confirm-import</button>
        <button type="button" data-testid="modal-cancel" onClick={() => onOpenChange(false)}>cancel-import</button>
      </div>
    ) : null
  ),
}));

const importDataTranslations = (key) => key;

function renderUnlocked(props = {}) {
  return render(
    <ImportDataCardUnlocked importDataTranslations={importDataTranslations} onImport={jest.fn()} onHide={jest.fn()} {...props} />,
  );
}

describe("ImportDataCardUnlocked", () => {
  describe("WalletGuard props", () => {
    it("passes the modal title, password label, confirm text, and cancel text", () => {
      renderUnlocked();
      expect(screen.getByTestId("guard-title").textContent).toBe("cardImportData.modalTitle");
      expect(screen.getByTestId("guard-password-label").textContent).toBe("cardImportData.passwordLabel");
      expect(screen.getByTestId("guard-confirm-text").textContent).toBe("cardImportData.confirmButton");
      expect(screen.getByTestId("guard-cancel-text").textContent).toBe("cardImportData.cancelButton");
    });

    it("calls onHide when WalletGuard cancels", () => {
      const onHide = jest.fn();
      renderUnlocked({ onHide });
      fireEvent.click(screen.getByTestId("guard-cancel"));
      expect(onHide).toHaveBeenCalledTimes(1);
    });
  });

  describe("File selection", () => {
    it("shows a missing-fields error when continuing without a file", () => {
      renderUnlocked();
      fireEvent.click(screen.getByTestId("guard-confirm"));

      fireEvent.click(screen.getByText("cardImportData.continueButton"));

      expect(screen.getByText("cardImportData.missingFields")).toBeInTheDocument();
      expect(screen.queryByTestId("confirm-modal")).not.toBeInTheDocument();
    });

    it("opens the confirm modal when a file is selected and continue is pressed", () => {
      renderUnlocked();
      fireEvent.click(screen.getByTestId("guard-confirm"));
      selectBackupFile();

      fireEvent.click(screen.getByText("cardImportData.continueButton"));

      expect(screen.getByTestId("confirm-modal")).toBeInTheDocument();
    });
  });

  describe("Confirming the import", () => {
    it("calls onImport with the wallet password and the selected file", async () => {
      const onImport = jest.fn().mockResolvedValue(undefined);
      renderUnlocked({ onImport });
      fireEvent.click(screen.getByTestId("guard-confirm"));
      selectBackupFile();
      fireEvent.click(screen.getByText("cardImportData.continueButton"));

      await act(async () => {
        fireEvent.click(screen.getByTestId("modal-confirm"));
      });

      expect(onImport).toHaveBeenCalledWith("wallet-password", expect.any(File), expect.any(Function));
    });

    it("shows a spinner while importing", async () => {
      let resolveImport;
      const onImport = jest.fn(() => new Promise((resolve) => { resolveImport = resolve; }));
      renderUnlocked({ onImport });
      fireEvent.click(screen.getByTestId("guard-confirm"));
      selectBackupFile();
      fireEvent.click(screen.getByText("cardImportData.continueButton"));

      fireEvent.click(screen.getByTestId("modal-confirm"));

      expect(await screen.findByTestId("spinner")).toBeInTheDocument();

      await act(async () => {
        resolveImport();
      });
    });

    it("shows a progress bar once onImport reports an upload percent", async () => {
      let reportProgress;
      const onImport = jest.fn((password, backupFile, onProgress) => {
        reportProgress = onProgress;
        return new Promise(() => {});
      });
      renderUnlocked({ onImport });
      fireEvent.click(screen.getByTestId("guard-confirm"));
      selectBackupFile();
      fireEvent.click(screen.getByText("cardImportData.continueButton"));

      fireEvent.click(screen.getByTestId("modal-confirm"));
      await act(async () => {
        reportProgress(37);
      });

      expect(screen.getByTestId("progress")).toHaveAttribute("data-value", "37");
      expect(screen.getByText("cardImportData.uploadingProgress")).toBeInTheDocument();
    });

    it("shows the processing message once the upload reaches 100 percent", async () => {
      let reportProgress;
      const onImport = jest.fn((password, backupFile, onProgress) => {
        reportProgress = onProgress;
        return new Promise(() => {});
      });
      renderUnlocked({ onImport });
      fireEvent.click(screen.getByTestId("guard-confirm"));
      selectBackupFile();
      fireEvent.click(screen.getByText("cardImportData.continueButton"));

      fireEvent.click(screen.getByTestId("modal-confirm"));
      await act(async () => {
        reportProgress(100);
      });

      expect(screen.getByText("cardImportData.processing")).toBeInTheDocument();
    });

    it("shows a generic error when onImport throws", async () => {
      const onImport = jest.fn().mockRejectedValue(new Error("Wrong password"));
      renderUnlocked({ onImport });
      fireEvent.click(screen.getByTestId("guard-confirm"));
      selectBackupFile();
      fireEvent.click(screen.getByText("cardImportData.continueButton"));

      await act(async () => {
        fireEvent.click(screen.getByTestId("modal-confirm"));
      });

      expect(await screen.findByText("cardImportData.errorDescription")).toBeInTheDocument();
    });

    it("closes the confirm modal without importing when cancelled", () => {
      const onImport = jest.fn();
      renderUnlocked({ onImport });
      fireEvent.click(screen.getByTestId("guard-confirm"));
      selectBackupFile();
      fireEvent.click(screen.getByText("cardImportData.continueButton"));

      fireEvent.click(screen.getByTestId("modal-cancel"));

      expect(screen.queryByTestId("confirm-modal")).not.toBeInTheDocument();
      expect(onImport).not.toHaveBeenCalled();
    });
  });
});
