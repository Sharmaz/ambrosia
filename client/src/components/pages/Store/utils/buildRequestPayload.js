import { toArray } from "@/components/utils/array";

import { normalizeSku } from "./normalizeSku";

const toFiniteNumber = (value) => {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
};

export const buildRequestPayload = (product, imageUrl, { includeId = false } = {}) => {
  const priceCents = Math.round(toFiniteNumber(product.productPrice) * 100);
  const isBundle = product.isBundle ?? false;
  const hasVariants = isBundle ? false : (product.hasVariants ?? false);

  return {
    ...(includeId ? { id: product.productId } : {}),
    SKU: normalizeSku(product.productSKU),
    name: product.productName,
    description: product.productDescription || null,
    imageUrl,
    costCents: priceCents,
    categoryIds: toArray(product.productCategories),
    quantity: isBundle ? 0 : toFiniteNumber(product.productStock),
    minStockThreshold: toFiniteNumber(product.productMinStock),
    maxStockThreshold: toFiniteNumber(product.productMaxStock),
    hasVariants,
    priceCents,
    isBundle,
    bundleComponents: isBundle
      ? (product.bundleComponents ?? []).map((bundleProduct) => ({
          componentId: bundleProduct.productId,
          quantity: bundleProduct.quantity,
        }))
      : [],
  };
};
