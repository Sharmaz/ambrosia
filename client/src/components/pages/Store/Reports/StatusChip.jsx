"use client";
import { Chip } from "@heroui/react";
import { useTranslations } from "next-intl";

const STATUS_STYLES = {
  paid: "bg-green-200 text-green-800 border border-green-300",
  refunded: "bg-purple-100 text-purple-800 border border-purple-200",
};

export function StatusChip({ refunded }) {
  const reportsTranslations = useTranslations("reports");
  const status = refunded ? "refunded" : "paid";

  return (
    <Chip className={`text-xs ${STATUS_STYLES[status]}`} size="sm">
      {reportsTranslations(`status.${status}`)}
    </Chip>
  );
}
