"use client";
import { useCallback, useEffect, useState } from "react";

import { Modal, ModalBody, ModalContent, ModalHeader, Spinner } from "@heroui/react";
import { useTranslations } from "next-intl";

import { getShiftBreakdown } from "@/services/shiftsService";

import { differenceTextClass } from "./utils/differenceTextClass";

export function ShiftDetailModal({ shift, formatCurrency, onClose }) {
  const reportsTranslations = useTranslations("reports");
  const shiftTranslations = useTranslations("shifts");
  const [breakdown, setBreakdown] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const fetchBreakdown = useCallback(async () => {
    if (!shift?.id) return;

    setLoading(true);
    setError(false);
    try {
      const fetchedBreakdown = await getShiftBreakdown(shift.id);
      setBreakdown(fetchedBreakdown);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [shift?.id]);

  useEffect(() => {
    fetchBreakdown();
  }, [fetchBreakdown]);

  const shiftPeriod = shift
    ? `${shift.shiftDate} ${shift.startTime}${shift.endTime ? ` – ${shift.endTime}` : ""}`
    : "—";

  return (
    <Modal
      isOpen={Boolean(shift)}
      onClose={onClose}
      size="md"
      scrollBehavior="inside"
      backdrop="blur"
      classNames={{
        backdrop: "backdrop-blur-xs bg-white/10",
        base: "my-auto",
      }}
    >
      <ModalContent>
        <ModalHeader className="flex flex-col gap-0.5 pb-2">
          <span>{reportsTranslations("shiftsReport.detailTitle")}</span>
          {shift && <span className="text-sm font-normal text-gray-400">{shift.userName}</span>}
        </ModalHeader>
        <ModalBody className="pb-6">
          {shift && (
            <div className="space-y-4">
              {loading && (
                <div className="flex justify-center py-8">
                  <Spinner size="sm" />
                </div>
              )}

              {!loading && error && (
                <p className="text-sm text-red-600 text-center py-4">{shiftTranslations("loadError")}</p>
              )}

              {!loading && !error && breakdown && (
                <>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-400">{shiftTranslations("shiftPeriod")}</p>
                      <p className="font-medium">{shiftPeriod}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-400">{shiftTranslations("initialAmountLabel")}</p>
                      <p className="font-medium">{formatCurrency(breakdown.initialAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400">{shiftTranslations("totalTickets")}</p>
                      <p className="font-medium">{breakdown.totalTickets}</p>
                    </div>
                    {breakdown.totalTips > 0 && (
                      <div className="text-right">
                        <p className="text-xs text-gray-400">{shiftTranslations("totalTips")}</p>
                        <p className="font-medium">{formatCurrency(breakdown.totalTips)}</p>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-gray-100 pt-3 space-y-2">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">{shiftTranslations("totalSales")}</span>
                      <span className="font-medium">{formatCurrency(breakdown.totalSales)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">{shiftTranslations("cashSales")}</span>
                      <span className="font-medium">{formatCurrency(breakdown.cashSales)}</span>
                    </div>
                    {breakdown.cashRefunds > 0 && (
                      <div className="flex justify-between items-center text-sm text-red-600">
                        <span>{shiftTranslations("cashRefunds")}</span>
                        <span>-{formatCurrency(breakdown.cashRefunds)}</span>
                      </div>
                    )}
                  </div>

                  {breakdown.byPaymentMethod.length > 0 && (
                    <div className="border-t border-gray-100 pt-3 space-y-2">
                      <p className="text-xs text-gray-400">{shiftTranslations("byPaymentMethod")}</p>
                      {breakdown.byPaymentMethod.map(({ name, total }) => (
                        <div key={name} className="flex justify-between items-center text-sm">
                          <span>{name}</span>
                          <span className="font-medium">{formatCurrency(total)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-gray-200 pt-3 flex justify-between items-center">
                    <span className="font-semibold text-sm">{shiftTranslations("expectedTotal")}</span>
                    <span className="font-bold text-green-700">{formatCurrency(breakdown.expectedTotal)}</span>
                  </div>

                  {breakdown.finalAmount != null && (
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-500">{shiftTranslations("finalAmount")}</span>
                      <span className="font-medium">{formatCurrency(breakdown.finalAmount)}</span>
                    </div>
                  )}

                  {breakdown.difference != null && (
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-sm">{shiftTranslations("difference")}</span>
                      <span className={`font-bold ${differenceTextClass(breakdown.difference)}`}>
                        {breakdown.difference >= 0 ? "+" : ""}
                        {formatCurrency(breakdown.difference)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}
