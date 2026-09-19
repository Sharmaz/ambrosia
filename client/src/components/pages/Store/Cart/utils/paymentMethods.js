export const PAYMENT_METHODS = {
  BTC: "btc",
  CASH: "cash",
  CARD: "card",
  TRANSFER: "transfer",
};

const METHOD_MATCHERS = [
  { method: PAYMENT_METHODS.BTC, nameKeywords: ["btc"] },
  { method: PAYMENT_METHODS.TRANSFER, nameKeywords: ["transfer", "transferencia", "wire", /\bach\b/] },
  { method: PAYMENT_METHODS.CASH, nameKeywords: ["cash", "efectivo"] },
  { method: PAYMENT_METHODS.CARD, nameKeywords: ["credit", "debit", "card"] },
];

function nameMatchesKeyword(normalizedName, keyword) {
  return keyword instanceof RegExp ? keyword.test(normalizedName) : normalizedName.includes(keyword);
}

export function classifyPaymentMethod(methodName = "") {
  const normalizedName = methodName.toLowerCase();
  const match = METHOD_MATCHERS.find(
    ({ nameKeywords }) => nameKeywords.some((keyword) => nameMatchesKeyword(normalizedName, keyword)),
  );
  return match ? match.method : null;
}
