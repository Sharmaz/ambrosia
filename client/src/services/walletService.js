import { httpClient } from "@/lib/http/httpClient";
import { parseJsonResponse } from "@/lib/http/parseJsonResponse";

function createWalletServiceError(message, details = {}) {
  const error = new Error(message);
  error.status = details.status;
  error.code = details.code ?? "unknown";
  error.source = details.source ?? "ambrosia";
  return error;
}

function isValidPaymentResponse(body) {
  return (
    body &&
    typeof body.recipientAmountSat === "number" &&
    typeof body.routingFeeSat === "number" &&
    typeof body.paymentHash === "string" &&
    body.paymentHash.trim() !== ""
  );
}

export const loginWallet = async (password) => {
  const response = await httpClient("/wallet/auth", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ password }),
  });
  return await parseJsonResponse(response, null);
};

export const logoutWallet = async () => {
  const response = await httpClient("/wallet/logout", { method: "POST" });
  return await parseJsonResponse(response, null);
};

export async function getInfo() {
  const response = await httpClient("/wallet/getinfo");
  return await parseJsonResponse(response, null);
}

export async function createInvoiceForCart(invoiceAmount, invoiceDesc) {
  const response = await httpClient("/wallet/invoice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: invoiceDesc,
      amountSat: parseInt(invoiceAmount),
    }),
  });
  return await parseJsonResponse(response, null);
}

export async function createInvoice(invoiceAmount, invoiceDesc) {
  const response = await httpClient("/wallet/createinvoice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      description: invoiceDesc,
      amountSat: parseInt(invoiceAmount),
    }),
  });
  return await parseJsonResponse(response, null);
}

export async function payInvoiceFromService(invoice) {
  const response = await httpClient("/wallet/payinvoice", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ invoice: invoice.trim() }),
  });
  const body = await parseJsonResponse(response, null);

  if (!response.ok) {
    throw createWalletServiceError(
      body?.message ?? "Could not process the payment",
      {
        status: response.status,
        code: body?.code,
        source: body?.source,
      },
    );
  }

  if (!isValidPaymentResponse(body)) {
    throw createWalletServiceError(
      "Invalid payment response",
      {
        status: response.status,
        code: "invalid_payment_response",
        source: "ambrosia",
      },
    );
  }

  return body;
}

export async function getIncomingTransactions() {
  const response = await httpClient("/wallet/payments/incoming");
  const transactions = await parseJsonResponse(response, []);
  return transactions ? transactions : [];
}

export async function getOutgoingTransactions() {
  const response = await httpClient("/wallet/payments/outgoing");
  const transactions = await parseJsonResponse(response, []);
  return transactions ? transactions : [];
}

export async function getSeed() {
  const response = await httpClient("/wallet/seed");
  return await parseJsonResponse(response, null);
}

export async function closeChannel(channelId, address, feerateSatByte) {
  const response = await httpClient("/wallet/closechannel", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channelId, address, feerateSatByte }),
  });
  if (!response.ok) {
    const body = await parseJsonResponse(response, {});
    throw new Error(body?.message ?? "Failed to close channel");
  }
  return await parseJsonResponse(response, null);
}
