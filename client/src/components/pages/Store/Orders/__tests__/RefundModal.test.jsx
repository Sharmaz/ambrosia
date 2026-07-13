import { addToast } from "@heroui/react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

import { httpClient, parseJsonResponse } from "@/lib/http";

import { RefundModal } from "../RefundModal";

jest.mock("@/lib/http", () => ({
  httpClient: jest.fn(),
  parseJsonResponse: jest.fn(),
}));

jest.mock("@heroui/react", () => ({
  addToast: jest.fn(),
  Modal: ({ isOpen, children }) => (isOpen ? <div>{children}</div> : null),
  ModalContent: ({ children }) => <div>{children}</div>,
  ModalHeader: ({ children }) => <div>{children}</div>,
  ModalBody: ({ children }) => <div>{children}</div>,
  ModalFooter: ({ children }) => <div>{children}</div>,
  Button: ({ onPress, isDisabled, isLoading, children }) => (
    <button type="button" onClick={onPress} disabled={isDisabled || isLoading}>
      {children}
    </button>
  ),
  Textarea: ({ label, value, onValueChange, errorMessage }) => (
    <label>
      {label}
      <textarea aria-label={label} value={value} onChange={(e) => onValueChange(e.target.value)} />
      {errorMessage && <span>{errorMessage}</span>}
    </label>
  ),
}));

jest.mock("next-intl", () => ({
  useTranslations: () => (key) => key,
}));

describe("RefundModal", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("refunds a non-BTC order without an invoice field", async () => {
    httpClient.mockResolvedValue({ ok: true });
    const onRefunded = jest.fn();
    const order = { id: "order-1", total: 10 };

    render(<RefundModal order={order} isOpen onClose={jest.fn()} onRefunded={onRefunded} />);

    expect(screen.queryByLabelText("details.refundInvoiceLabel")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("details.refundConfirm"));

    await waitFor(() => expect(httpClient).toHaveBeenCalledWith("/store/orders/order-1/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice: "" }),
    }));

    await waitFor(() => expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ color: "success", description: "details.refundSuccess" }),
    ));
    expect(onRefunded).toHaveBeenCalled();
  });

  it("disables confirm until an invoice is entered for a BTC order, then refunds", async () => {
    httpClient.mockResolvedValue({ ok: true });
    const onRefunded = jest.fn();
    const order = { id: "order-btc", satoshiAmount: 5000 };

    render(<RefundModal order={order} isOpen onClose={jest.fn()} onRefunded={onRefunded} />);

    expect(screen.getByText(/5000\s+details\.sats/)).toBeInTheDocument();
    expect(screen.getByText("details.refundConfirm")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("details.refundInvoiceLabel"), {
      target: { value: "lnbc1000n1pj9h8uqpp5test" },
    });

    expect(screen.getByText("details.refundConfirm")).not.toBeDisabled();

    fireEvent.click(screen.getByText("details.refundConfirm"));

    await waitFor(() => expect(httpClient).toHaveBeenCalledWith("/store/orders/order-btc/refund", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invoice: "lnbc1000n1pj9h8uqpp5test" }),
    }));
    expect(onRefunded).toHaveBeenCalled();
  });

  it("shows a format error and does not call httpClient when the invoice has an invalid prefix", async () => {
    const onRefunded = jest.fn();
    const order = { id: "order-btc", satoshiAmount: 5000 };

    render(<RefundModal order={order} isOpen onClose={jest.fn()} onRefunded={onRefunded} />);

    fireEvent.change(screen.getByLabelText("details.refundInvoiceLabel"), {
      target: { value: "not-an-invoice-at-all" },
    });

    fireEvent.click(screen.getByText("details.refundConfirm"));

    expect(await screen.findByText("details.refundInvoiceInvalid")).toBeInTheDocument();
    expect(httpClient).not.toHaveBeenCalled();
    expect(onRefunded).not.toHaveBeenCalled();
  });

  it("shows a format error and does not call httpClient when the invoice is shorter than 20 characters", async () => {
    const onRefunded = jest.fn();
    const order = { id: "order-btc", satoshiAmount: 5000 };

    render(<RefundModal order={order} isOpen onClose={jest.fn()} onRefunded={onRefunded} />);

    fireEvent.change(screen.getByLabelText("details.refundInvoiceLabel"), {
      target: { value: "lnbc123" },
    });

    fireEvent.click(screen.getByText("details.refundConfirm"));

    expect(await screen.findByText("details.refundInvoiceInvalid")).toBeInTheDocument();
    expect(httpClient).not.toHaveBeenCalled();
    expect(onRefunded).not.toHaveBeenCalled();
  });

  it("clears the invoice format error when the user edits the field again", async () => {
    const order = { id: "order-btc", satoshiAmount: 5000 };

    render(<RefundModal order={order} isOpen onClose={jest.fn()} onRefunded={jest.fn()} />);

    fireEvent.change(screen.getByLabelText("details.refundInvoiceLabel"), {
      target: { value: "not-an-invoice-at-all" },
    });
    fireEvent.click(screen.getByText("details.refundConfirm"));
    expect(await screen.findByText("details.refundInvoiceInvalid")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("details.refundInvoiceLabel"), {
      target: { value: "lnbc1000n1pj9h8uqpp5test" },
    });

    expect(screen.queryByText("details.refundInvoiceInvalid")).not.toBeInTheDocument();
  });

  it("shows an error toast and does not call onRefunded when the request throws", async () => {
    httpClient.mockRejectedValue(new Error("Network request failed"));
    const onRefunded = jest.fn();
    const order = { id: "order-1", total: 10 };

    render(<RefundModal order={order} isOpen onClose={jest.fn()} onRefunded={onRefunded} />);

    fireEvent.click(screen.getByText("details.refundConfirm"));

    await waitFor(() => expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ color: "danger", description: "Network request failed" }),
    ));
    expect(onRefunded).not.toHaveBeenCalled();
  });

  it("shows the server's error message and does not call onRefunded when the response is not ok", async () => {
    httpClient.mockResolvedValue({ ok: false, status: 409 });
    parseJsonResponse.mockResolvedValueOnce({ message: "Order has already been refunded" });
    const onRefunded = jest.fn();
    const order = { id: "order-1", total: 10 };

    render(<RefundModal order={order} isOpen onClose={jest.fn()} onRefunded={onRefunded} />);

    fireEvent.click(screen.getByText("details.refundConfirm"));

    await waitFor(() => expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ color: "danger", description: "Order has already been refunded" }),
    ));
    expect(onRefunded).not.toHaveBeenCalled();
  });

  it("falls back to the translated error message when a failed response has no body", async () => {
    httpClient.mockResolvedValue({ ok: false, status: 500 });
    parseJsonResponse.mockResolvedValueOnce(null);
    const onRefunded = jest.fn();
    const order = { id: "order-1", total: 10 };

    render(<RefundModal order={order} isOpen onClose={jest.fn()} onRefunded={onRefunded} />);

    fireEvent.click(screen.getByText("details.refundConfirm"));

    await waitFor(() => expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ color: "danger", description: "details.refundError" }),
    ));
    expect(onRefunded).not.toHaveBeenCalled();
  });

  it("resets the invoice and calls onClose when cancelled", () => {
    const onClose = jest.fn();
    const order = { id: "order-btc", satoshiAmount: 5000 };

    render(<RefundModal order={order} isOpen onClose={onClose} onRefunded={jest.fn()} />);

    fireEvent.change(screen.getByLabelText("details.refundInvoiceLabel"), {
      target: { value: "lnbc1..." },
    });

    fireEvent.click(screen.getByText("details.close"));

    expect(onClose).toHaveBeenCalled();
  });
});
