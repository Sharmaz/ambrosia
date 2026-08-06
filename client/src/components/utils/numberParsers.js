export const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * HeroUI's NumberInput calls `onChange` from two places with two different argument
 * types: a DOM event while typing, and a number from the steppers, the wheel, the
 * arrow keys and the commit on blur/Enter. Normalizes both into a number.
 */
export const toNumberInputValue = (changeArgument, fallback = 0) => {
  const rawValue = typeof changeArgument === "object" && changeArgument?.target
    ? changeArgument.target.value.replace(/[^0-9.-]/g, "")
    : changeArgument;

  if (rawValue === "" || rawValue === null || rawValue === undefined) return fallback;

  return toFiniteNumber(rawValue, fallback);
};
