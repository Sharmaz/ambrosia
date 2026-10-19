"use client";

import { resolveTemplateVariables } from "./resolveTemplateVariables";

export function ElementTotalRow({ localId, templateText, businessConfig, printFormats, sampleTicket, className }) {
  const totalLabel = resolveTemplateVariables(templateText || "", businessConfig, printFormats).trim() || sampleTicket.labels.total;
  return [
    <div key={`${localId}-total-sep`} className="border-t border-gray-400 my-2" />,
    <div
      key={`${localId}-total`}
      className={`flex justify-between gap-3 ${className}`}
    >
      <span className="font-semibold">{totalLabel}</span>
      <span className="whitespace-nowrap font-semibold">{sampleTicket.total}</span>
    </div>,
  ];
}
