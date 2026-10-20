"use client";

import { resolveTemplateVariables } from "./resolveTemplateVariables";
import { sampleTicket } from "./sampleData";

export function ElementPaymentMethodRow({ templateText, businessConfig, printFormats, className }) {
  const paymentMethodLabel = resolveTemplateVariables(templateText || "", businessConfig, printFormats).trim() || "PAYMENT METHOD";
  return (
    <div className={`flex justify-between gap-3 ${className}`}>
      <span>{paymentMethodLabel}</span>
      <span className="whitespace-nowrap">{sampleTicket.paymentMethod}</span>
    </div>
  );
}
