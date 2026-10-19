"use client";

import { resolveTemplateVariables } from "./resolveTemplateVariables";

export function ElementPaymentMethodRow({ templateText, businessConfig, printFormats, sampleTicket, className }) {
  const paymentMethodLabel = resolveTemplateVariables(templateText || "", businessConfig, printFormats).trim() || sampleTicket.labels.paymentMethod;
  return (
    <div className={`flex justify-between gap-3 ${className}`}>
      <span>{paymentMethodLabel}</span>
      <span className="whitespace-nowrap">{sampleTicket.paymentMethod}</span>
    </div>
  );
}
