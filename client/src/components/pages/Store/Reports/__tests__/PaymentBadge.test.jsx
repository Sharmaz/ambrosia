import { render, screen } from "@testing-library/react";

import { PaymentBadge } from "../Sales/PaymentBadge";

describe("PaymentBadge", () => {
  it("renders the payment method label", () => {
    render(<PaymentBadge method="efectivo" />);
    expect(screen.getByText("efectivo")).toBeInTheDocument();
  });

  it("applies green styles for efectivo", () => {
    const { container } = render(<PaymentBadge method="efectivo" />);
    expect(container.firstChild).toHaveClass("bg-green-100", "text-green-800");
  });

  it("applies yellow styles for btc", () => {
    const { container } = render(<PaymentBadge method="btc" />);
    expect(container.firstChild).toHaveClass("bg-yellow-100", "text-yellow-800");
  });

  it("applies yellow styles for bitcoin (alias)", () => {
    const { container } = render(<PaymentBadge method="bitcoin" />);
    expect(container.firstChild).toHaveClass("bg-yellow-100", "text-yellow-800");
  });

  it("applies blue styles for tarjeta de débito", () => {
    const { container } = render(<PaymentBadge method="tarjeta de débito" />);
    expect(container.firstChild).toHaveClass("bg-blue-100", "text-blue-800");
  });

  it("applies purple styles for tarjeta de crédito", () => {
    const { container } = render(<PaymentBadge method="tarjeta de crédito" />);
    expect(container.firstChild).toHaveClass("bg-purple-100", "text-purple-800");
  });

  it("applies gray styles for an unknown method", () => {
    const { container } = render(<PaymentBadge method="transferencia" />);
    expect(container.firstChild).toHaveClass("bg-gray-100", "text-gray-800");
  });

  it("shows Desconocido when method is undefined", () => {
    render(<PaymentBadge />);
    expect(screen.getByText("Desconocido")).toBeInTheDocument();
  });

  it("is case-insensitive for method matching", () => {
    const { container } = render(<PaymentBadge method="BTC" />);
    expect(container.firstChild).toHaveClass("bg-yellow-100", "text-yellow-800");
  });
});
