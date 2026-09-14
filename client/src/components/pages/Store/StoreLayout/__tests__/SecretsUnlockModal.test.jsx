import { addToast } from "@heroui/react";
import { render, screen, fireEvent, act } from "@testing-library/react";

import * as secretsService from "@/services/secretsService";

import { SecretsUnlockModal } from "../SecretsUnlockModal";

jest.mock("@heroui/react", () => {
  const actual = jest.requireActual("@heroui/react");
  return {
    ...actual,
    addToast: jest.fn(),
  };
});

jest.mock("framer-motion", () => {
  const React = require("react");
  const Mock = React.forwardRef(({ children, ...props }, ref) => (
    <div ref={ref} {...props}>{children}</div>
  ));
  Mock.displayName = "MotionDiv";
  return {
    __esModule: true,
    AnimatePresence: ({ children }) => children,
    LazyMotion: ({ children }) => children,
    domAnimation: {},
    motion: new Proxy({}, { get: () => Mock }),
    m: new Proxy({}, { get: () => Mock }),
  };
});

jest.mock("@/services/secretsService", () => ({
  ...jest.requireActual("@/services/secretsService"),
  unlockSecrets: jest.fn(),
}));

const renderModal = (props = {}) => render(
  <SecretsUnlockModal isOpen onClose={jest.fn()} {...props} />,
);

const originalError = console.error;

beforeEach(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === "string" &&
      (args[0].includes("onAnimationComplete") ||
        args[0].includes("Unknown event handler property"))
    ) return;
    originalError.call(console, ...args);
  };
});

afterEach(() => {
  console.error = originalError;
  jest.clearAllMocks();
});

describe("SecretsUnlockModal", () => {
  it("disables the unlock button while the password is empty", () => {
    renderModal();

    expect(screen.getByText("secretsEncryptionCard.unlockButton")).toBeDisabled();
  });

  it("unlocks with the entered password and dispatches SECRETS_UNLOCKED_EVENT", async () => {
    secretsService.unlockSecrets.mockResolvedValue({ message: "Secrets unlocked" });
    const dispatchEventSpy = jest.spyOn(window, "dispatchEvent");
    const onClose = jest.fn();
    renderModal({ onClose });

    fireEvent.change(screen.getByLabelText("secretsEncryptionCard.unlockPasswordLabel"), {
      target: { value: "correct-unlock-password" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("secretsEncryptionCard.unlockButton"));
    });

    expect(secretsService.unlockSecrets).toHaveBeenCalledWith("correct-unlock-password");
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ color: "success", description: "secretsEncryptionCard.unlockSuccess" }),
    );
    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: secretsService.SECRETS_UNLOCKED_EVENT }),
    );
    expect(onClose).toHaveBeenCalled();
    dispatchEventSpy.mockRestore();
  });

  it("shows an error toast and does not close when unlocking fails", async () => {
    secretsService.unlockSecrets.mockRejectedValue(new Error("Invalid credentials"));
    const onClose = jest.fn();
    renderModal({ onClose });

    fireEvent.change(screen.getByLabelText("secretsEncryptionCard.unlockPasswordLabel"), {
      target: { value: "wrong-password" },
    });
    await act(async () => {
      fireEvent.click(screen.getByText("secretsEncryptionCard.unlockButton"));
    });

    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ color: "danger", description: "Invalid credentials" }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
