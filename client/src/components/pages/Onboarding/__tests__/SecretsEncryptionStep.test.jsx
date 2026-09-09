import { render, screen, fireEvent } from "@testing-library/react";

import { SecretsEncryptionStep } from "../SecretsEncryptionStep";

jest.mock("@heroui/react", () => ({
  Checkbox: ({ children, isSelected, onValueChange }) => (
    <label>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={(event) => onValueChange(event.target.checked)}
      />
      {children}
    </label>
  ),
}));

let mockSecretsUnlockPasswordFieldProps = null;

jest.mock("@components/shared/SecretsUnlockPasswordField", () => ({
  SecretsUnlockPasswordField: (props) => {
    mockSecretsUnlockPasswordFieldProps = props;
    const { unlockPassword, onUnlockPasswordChange } = props;
    return (
      <div data-testid="secrets-unlock-password-field">
        <span data-testid="unlock-password-value">{unlockPassword}</span>
        <button type="button" onClick={() => onUnlockPasswordChange("new-unlock-password")}>set-unlock-password</button>
      </div>
    );
  },
}));

function renderStep(secretsEncryptionData = {}, onChange = jest.fn()) {
  const defaultSecretsEncryptionData = { activateSecretsEncryption: false, secretsUnlockPassword: "" };
  return {
    onChange,
    ...render(
      <SecretsEncryptionStep
        secretsEncryptionData={{ ...defaultSecretsEncryptionData, ...secretsEncryptionData }}
        onChange={onChange}
      />,
    ),
  };
}

describe("SecretsEncryptionStep", () => {
  afterEach(() => {
    jest.clearAllMocks();
    mockSecretsUnlockPasswordFieldProps = null;
  });

  it("renders unchecked and without the password field by default", () => {
    renderStep();

    expect(screen.getByRole("checkbox")).not.toBeChecked();
    expect(screen.queryByTestId("secrets-unlock-password-field")).not.toBeInTheDocument();
  });

  it("shows the shared password field with the current value when already checked", () => {
    renderStep({ activateSecretsEncryption: true, secretsUnlockPassword: "correct-unlock-password" });

    expect(screen.getByTestId("unlock-password-value").textContent).toBe("correct-unlock-password");
  });

  it("shows the later-hint text when already checked", () => {
    renderStep({ activateSecretsEncryption: true, secretsUnlockPassword: "" });

    expect(screen.getByText("stepSecretsEncryption.laterHint")).toBeInTheDocument();
  });

  it("checking the checkbox with no prior password calls onChange with an empty password", () => {
    const { onChange } = renderStep({ activateSecretsEncryption: false, secretsUnlockPassword: "" });

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onChange).toHaveBeenCalledWith({ activateSecretsEncryption: true, secretsUnlockPassword: "" });
  });

  it("unchecking the checkbox clears the password", () => {
    const { onChange } = renderStep({ activateSecretsEncryption: true, secretsUnlockPassword: "correct-unlock-password" });

    fireEvent.click(screen.getByRole("checkbox"));

    expect(onChange).toHaveBeenCalledWith({ activateSecretsEncryption: false, secretsUnlockPassword: "" });
  });

  it("forwards the shared field's onUnlockPasswordChange as only the password change", () => {
    const { onChange } = renderStep({ activateSecretsEncryption: true, secretsUnlockPassword: "" });

    fireEvent.click(screen.getByText("set-unlock-password"));

    expect(onChange).toHaveBeenCalledWith({ secretsUnlockPassword: "new-unlock-password" });
  });

  it("passes the current password down to the shared field via unlockPassword", () => {
    renderStep({ activateSecretsEncryption: true, secretsUnlockPassword: "correct-unlock-password" });

    expect(mockSecretsUnlockPasswordFieldProps.unlockPassword).toBe("correct-unlock-password");
  });
});
