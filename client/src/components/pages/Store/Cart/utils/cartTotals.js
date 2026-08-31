import { getDiscountedSubtotal, resolveTipAmount } from "./tipCalculations";

export function calculateCartTotals(
  items = [],
  discountValue = 0,
  discountType = "percentage",
  tipValue = 0,
  tipType = "percentage",
) {
  const subtotal = (items || []).reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const discountAmount = Math.round(
    discountType === "fixed"
      ? (Number(discountValue) || 0) * 100
      : (subtotal * (Number(discountValue) || 0)) / 100,
  );
  const discountedSubtotal = getDiscountedSubtotal(subtotal, discountAmount);
  const tipAmount = resolveTipAmount(discountedSubtotal, tipValue, tipType);
  const total = discountedSubtotal + tipAmount;

  return { subtotal, discountAmount, tipAmount, total };
}
