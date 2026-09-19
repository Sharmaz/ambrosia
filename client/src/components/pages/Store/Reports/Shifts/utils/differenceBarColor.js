export function differenceBarColor(difference) {
  if (difference < 0) return "#dc2626";
  if (difference > 0) return "#f97316";
  return "#16a34a";
}
