import { render, screen, fireEvent } from "@testing-library/react";

import { CashRefundFields } from "../CashRefundFields";

jest.mock("@heroui/react", () => ({
  NumberInput: ({ label, value, onValueChange }) => (
    <label>
      {label}
      <input
        type="number"
        aria-label={label}
        value={value}
        onChange={(e) => onValueChange(e.target.value === "" ? null : parseFloat(e.target.value))}
      />
    </label>
  ),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

const formatAmount = (cents) => `$${(cents / 100).toFixed(2)}`;

describe("CashRefundFields", () => {
  it("shows the amount to refund", () => {
    render(
      <CashRefundFields
        orderTotalCents={1000}
        cashGiven={0}
        onCashGivenChange={jest.fn()}
        cashDifferenceCents={-1000}
        isCashAmountExact={false}
        formatAmount={formatAmount}
      />,
    );
    expect(screen.getByText("$10.00")).toBeInTheDocument();
  });

  it("shows the cash given input", () => {
    render(
      <CashRefundFields
        orderTotalCents={1000}
        cashGiven={5}
        onCashGivenChange={jest.fn()}
        cashDifferenceCents={-500}
        isCashAmountExact={false}
        formatAmount={formatAmount}
      />,
    );
    expect(screen.getByLabelText("details.cashGivenLabel")).toHaveValue(5);
  });

  it("calls onCashGivenChange when the input changes", () => {
    const onCashGivenChange = jest.fn();
    render(
      <CashRefundFields
        orderTotalCents={1000}
        cashGiven={0}
        onCashGivenChange={onCashGivenChange}
        cashDifferenceCents={-1000}
        isCashAmountExact={false}
        formatAmount={formatAmount}
      />,
    );
    fireEvent.change(screen.getByLabelText("details.cashGivenLabel"), { target: { value: "10" } });
    expect(onCashGivenChange).toHaveBeenCalledWith(10);
  });

  it("shows the difference in red when the amount does not match", () => {
    render(
      <CashRefundFields
        orderTotalCents={1000}
        cashGiven={8}
        onCashGivenChange={jest.fn()}
        cashDifferenceCents={-200}
        isCashAmountExact={false}
        formatAmount={formatAmount}
      />,
    );
    const difference = screen.getByText("$-2.00");
    expect(difference).toHaveClass("text-red-600");
  });

  it("shows the difference in green when the amount matches exactly", () => {
    render(
      <CashRefundFields
        orderTotalCents={1000}
        cashGiven={10}
        onCashGivenChange={jest.fn()}
        cashDifferenceCents={0}
        isCashAmountExact
        formatAmount={formatAmount}
      />,
    );
    const difference = screen.getByText("$0.00");
    expect(difference).toHaveClass("text-green-700");
  });
});
