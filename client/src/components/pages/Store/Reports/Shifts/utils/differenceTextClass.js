export function differenceTextClass(difference) {
  if (difference == null) return "text-gray-400";
  if (difference < 0) return "text-red-600";
  if (difference > 0) return "text-orange-500";
  return "text-green-600";
}
