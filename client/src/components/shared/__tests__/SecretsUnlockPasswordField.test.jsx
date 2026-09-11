import { render, screen, fireEvent } from "@testing-library/react";

import { SecretsUnlockPasswordField } from "../SecretsUnlockPasswordField";

jest.mock("@heroui/react", () => ({
  Input: ({ label, type, value, onValueChange, description, endContent, isInvalid, errorMessage }) => (
    <div>
      <label htmlFor={label}>{label}</label>
      <input id={label} type={type} value={value} onChange={(event) => onValueChange(event.target.value)} />
      {description && <span>{description}</span>}
      {isInvalid && errorMessage && <span>{errorMessage}</span>}
      {endContent}
    </div>
  ),
}));

jest.mock("lucide-react", () => ({
  AlertTriangle: () => <svg data-testid="icon-alert" />,
  Eye: () => <svg data-testid="icon-eye" />,
  EyeOff: () => <svg data-testid="icon-eye-off" />,
}));

function renderField(props = {}) {
  return render(
    <SecretsUnlockPasswordField
      unlockPassword=""
      onUnlockPasswordChange={jest.fn()}
      unlockPasswordConfirmation=""
      onUnlockPasswordConfirmationChange={jest.fn()}
      {...props}
    />,
  );
}

describe("SecretsUnlockPasswordField", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders the password label and current value", () => {
      renderField({ unlockPassword: "correct-unlock-password" });

      expect(screen.getByLabelText("passwordLabel").value).toBe("correct-unlock-password");
    });

    it("renders the password description", () => {
      renderField();

      expect(screen.getByText("passwordDescription")).toBeInTheDocument();
    });

    it("renders the write-it-down warning", () => {
      renderField();

      expect(screen.getByText("passwordWarning")).toBeInTheDocument();
    });

    it("renders the confirm password label and current value", () => {
      renderField({ unlockPasswordConfirmation: "correct-unlock-password" });

      expect(screen.getByLabelText("confirmPasswordLabel").value).toBe("correct-unlock-password");
    });
  });

  describe("Interaction", () => {
    it("calls onUnlockPasswordChange with the entered value", () => {
      const onUnlockPasswordChange = jest.fn();
      renderField({ onUnlockPasswordChange });

      fireEvent.change(screen.getByLabelText("passwordLabel"), {
        target: { value: "new-unlock-password" },
      });

      expect(onUnlockPasswordChange).toHaveBeenCalledWith("new-unlock-password");
    });

    it("calls onUnlockPasswordConfirmationChange with the entered value", () => {
      const onUnlockPasswordConfirmationChange = jest.fn();
      renderField({ onUnlockPasswordConfirmationChange });

      fireEvent.change(screen.getByLabelText("confirmPasswordLabel"), {
        target: { value: "new-unlock-password" },
      });

      expect(onUnlockPasswordConfirmationChange).toHaveBeenCalledWith("new-unlock-password");
    });

    it("toggles the password field between hidden and visible", () => {
      renderField();

      expect(screen.getByLabelText("passwordLabel")).toHaveAttribute("type", "password");

      const [togglePasswordButton] = screen.getAllByRole("button");
      fireEvent.click(togglePasswordButton);

      expect(screen.getByLabelText("passwordLabel")).toHaveAttribute("type", "text");
    });

    it("toggles the confirm password field between hidden and visible", () => {
      renderField();

      expect(screen.getByLabelText("confirmPasswordLabel")).toHaveAttribute("type", "password");

      const [, toggleConfirmPasswordButton] = screen.getAllByRole("button");
      fireEvent.click(toggleConfirmPasswordButton);

      expect(screen.getByLabelText("confirmPasswordLabel")).toHaveAttribute("type", "text");
    });
  });

  describe("Password match validation", () => {
    it("does not show an error while the confirm field is still empty", () => {
      renderField({ unlockPassword: "correct-unlock-password", unlockPasswordConfirmation: "" });

      expect(screen.queryByText("passwordsDoNotMatch")).not.toBeInTheDocument();
    });

    it("does not show an error when the passwords match", () => {
      renderField({ unlockPassword: "correct-unlock-password", unlockPasswordConfirmation: "correct-unlock-password" });

      expect(screen.queryByText("passwordsDoNotMatch")).not.toBeInTheDocument();
    });

    it("shows an error when the passwords don't match", () => {
      renderField({ unlockPassword: "correct-unlock-password", unlockPasswordConfirmation: "different-password" });

      expect(screen.getByText("passwordsDoNotMatch")).toBeInTheDocument();
    });
  });
});
