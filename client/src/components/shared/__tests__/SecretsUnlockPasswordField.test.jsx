import { render, screen, fireEvent } from "@testing-library/react";

import { SecretsUnlockPasswordField } from "../SecretsUnlockPasswordField";

jest.mock("@heroui/react", () => ({
  Input: ({ label, value, onValueChange, description }) => (
    <div>
      <label htmlFor={label}>{label}</label>
      <input id={label} value={value} onChange={(event) => onValueChange(event.target.value)} />
      {description && <span>{description}</span>}
    </div>
  ),
}));

jest.mock("lucide-react", () => ({
  AlertTriangle: () => <svg data-testid="icon-alert" />,
}));

function renderField(props = {}) {
  return render(
    <SecretsUnlockPasswordField unlockPassword="" onUnlockPasswordChange={jest.fn()} {...props} />,
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
  });
});
