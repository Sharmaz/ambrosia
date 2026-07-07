"use client";
import { useMemo } from "react";

export function useOrdersData(sales) {
  return useMemo(() => {
    const byOrder = {};
    for (const {
      orderId,
      saleDate,
      userName,
      paymentMethod,
      productName,
      quantity,
      priceAtOrder,
      satoshiAmount,
      exchangeRateAtPayment,
      exchangeRateCurrency,
      fiatAmountAtPayment,
      discountAmount,
    } of sales) {
      if (!byOrder[orderId]) {
        byOrder[orderId] = {
          orderId,
          shortId: orderId.slice(-8),
          date: saleDate,
          userName,
          paymentMethod,
          items: [],
          subtotal: 0,
          total: 0,
          itemCount: 0,
          discountAmount: discountAmount ?? 0,
          satoshiAmount: satoshiAmount ?? null,
          exchangeRateAtPayment: exchangeRateAtPayment ?? null,
          exchangeRateCurrency: exchangeRateCurrency ?? null,
          fiatAmountAtPayment: fiatAmountAtPayment ?? null,
        };
      }
      byOrder[orderId].items.push({ productName, quantity, priceAtOrder });
      byOrder[orderId].subtotal += quantity * priceAtOrder;
      byOrder[orderId].itemCount += quantity;
    }
    return Object.values(byOrder)
      .map((order) => ({
        ...order,
        total: Math.max(order.subtotal - order.discountAmount, 0),
      }))
      .sort((newerOrder, olderOrder) => olderOrder.date.localeCompare(newerOrder.date));
  }, [sales]);
}
