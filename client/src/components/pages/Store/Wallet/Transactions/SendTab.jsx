"use client";

import { useState } from "react";

import { addToast, Button, Input } from "@heroui/react";
import { useTranslations } from "next-intl";

import { getPaymentErrorDescription } from "@/components/pages/Store/Wallet/utils/paymentErrors";
import { decodeInvoice, payInvoiceFromService } from "@/services/walletService";

import { PaymentConfirmModal } from "./PaymentConfirmModal";

export function SendTab({ fetchInfo, fetchTransactions }) {
  const t = useTranslations("wallet");
  const [payInvoice, setPayInvoice] = useState("");
  const [paymentResult, setPaymentResult] = useState(null);
  const [invoiceValidationError, setInvoiceValidationError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [decodedInvoice, setDecodedInvoice] = useState(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const getBolt11ValidationError = (invoiceValue) => {
    if (!invoiceValue || !invoiceValue.trim()) {
      return t("payments.send.noInvoiceToPay");
    }

    const trimmedInvoice = invoiceValue.trim().toLowerCase();
    const validPrefixes = ["lnbc", "lntb", "lnbcrt"];
    const hasValidPrefix = validPrefixes.some((prefix) => trimmedInvoice.startsWith(prefix));

    if (!hasValidPrefix) {
      return t("payments.send.invalidInvoiceFormat");
    }

    if (trimmedInvoice.length < 20) {
      return t("payments.send.invalidInvoiceFormat");
    }

    return "";
  };

  const handlePayInvoice = async () => {
    const validationError = getBolt11ValidationError(payInvoice);

    if (validationError) {
      setInvoiceValidationError(validationError);
      return;
    }

    try {
      setIsLoading(true);
      const decoded = await decodeInvoice(payInvoice);
      setDecodedInvoice(decoded);
      setPaymentResult(null);
      setIsConfirmOpen(true);
    } catch {
      addToast({
        title: t("payments.send.paymentError"),
        description: t("payments.send.confirmModal.decodingError"),
        variant: "solid",
        color: "danger",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPayment = async (customAmountSat) => {
    try {
      setIsLoading(true);
      const paymentResponse = await payInvoiceFromService(payInvoice, customAmountSat);
      setPaymentResult(paymentResponse);
      setPayInvoice("");
      setInvoiceValidationError("");
      fetchInfo?.();
      fetchTransactions?.();
      addToast({
        title: t("payments.send.paySuccessTitle"),
        description: t("payments.send.paySuccessDescription"),
        variant: "solid",
        color: "success",
      });
    } catch (err) {
      if (err?.code) {
        console.warn(err);
      } else {
        console.error(err);
      }
      addToast({
        title: t("payments.send.paymentError"),
        description: getPaymentErrorDescription(t, err),
        variant: "solid",
        color: "danger",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsConfirmOpen(false);
    setDecodedInvoice(null);
    setPaymentResult(null);
  };

  return (
    <div className="p-6 space-y-4">
      <Input
        label={t("payments.send.payInvoiceLabel")}
        placeholder="lnbc1..."
        value={payInvoice}
        onChange={(e) => {
          setPayInvoice(e.target.value);
          setInvoiceValidationError("");
        }}
        isDisabled={isLoading}
        isInvalid={Boolean(invoiceValidationError)}
        errorMessage={invoiceValidationError}
      />
      <Button
        onPress={handlePayInvoice}
        color="primary"
        size="lg"
        isLoading={isLoading}
        className="w-full"
      >
        {isLoading ? t("payments.send.payLightningLoading") : t("payments.send.payLightningButton")}
      </Button>

      <PaymentConfirmModal
        decodedInvoice={decodedInvoice}
        isOpen={isConfirmOpen}
        onClose={handleCloseModal}
        onConfirm={handleConfirmPayment}
        paymentResult={paymentResult}
        isLoading={isLoading}
      />
    </div>
  );
}
