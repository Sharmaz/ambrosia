export const DEFAULT_TIP_PERCENTAGES = [10, 15, 20];

export function isValidTipPercentages(value) {
  if (typeof value !== "string") return false;

  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.length === 0 || entries.some((entry) => entry === "")) return false;

  const parsedPercentages = entries.map(Number);
  return parsedPercentages.every(
    (percentage) => Number.isFinite(percentage) && percentage > 0 && percentage <= 100,
  ) && new Set(parsedPercentages).size === parsedPercentages.length;
}

export function normalizeTipPercentages(value) {
  if (!isValidTipPercentages(value)) return null;
  return value.split(",").map((entry) => Number(entry.trim())).join(",");
}

export function getDiscountedSubtotal(subtotal = 0, discountAmount = 0) {
  const numericSubtotal = Number(subtotal) || 0;
  const numericDiscount = Number(discountAmount) || 0;
  return Math.max(0, numericSubtotal - numericDiscount);
}

export function resolveTipAmount(baseAmount = 0, tipValue = 0, tipType = "percentage") {
  const numericBase = Math.max(0, Number(baseAmount) || 0);
  const numericValue = Number(tipValue) || 0;

  if (numericValue <= 0) return 0;

  if (tipType === "fixed") {
    return Math.round(numericValue * 100);
  }

  return Math.round((numericBase * numericValue) / 100);
}

export function parseTipPercentages(serializedTipPercentages) {
  const normalizedPercentages = normalizeTipPercentages(serializedTipPercentages);
  return normalizedPercentages
    ? normalizedPercentages.split(",").map(Number)
    : DEFAULT_TIP_PERCENTAGES;
}
