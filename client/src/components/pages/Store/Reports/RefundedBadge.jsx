"use client";
import { useTranslations } from "next-intl";

export function RefundedBadge() {
  const reportsTranslations = useTranslations("reports");

  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
      {reportsTranslations("sales.refundedBadge")}
    </span>
  );
}
