"use client";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";

import { useTranslations } from "next-intl";

import { useAuth } from "@/hooks/auth/useAuth";
import { getTurnOpen, openTurn, closeTurn } from "@/services/shiftsService";
import {
  getTickets,
  getPayments,
  getPaymentMethods,
  getPaymentByTicketId,
} from "@/services/ticketsService";

export const TurnContext = createContext();

export function TurnProvider({ children }) {
  const shiftTranslations = useTranslations("shifts");
  const { user } = useAuth();

  const [openTurnId, setOpenTurnId] = useState(null);
  const [openShiftData, setOpenShiftData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [totalBalance, setTotalBalance] = useState(0);
  const [totalTickets, setTotalTickets] = useState(0);
  const [byPaymentMethod, setByPaymentMethod] = useState([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  const loadOpenTurn = useCallback(async () => {
    try {
      setError(null);
      const shift = await getTurnOpen();
      setOpenTurnId(shift?.id ?? null);
      setOpenShiftData(shift);
      return shift?.id ?? null;
    } catch (err) {
      setError(err?.message || "Error al obtener turno");
      setOpenTurnId(null);
      setOpenShiftData(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOpenTurn();
  }, [loadOpenTurn, user?.id]);

  const fetchTicketBreakdown = useCallback(async (shiftTickets) => {
    setBreakdownLoading(true);
    try {
      const [payments, methods] = await Promise.all([
        getPayments(),
        getPaymentMethods(),
      ]);

      const methodTotals = {};
      for (const ticket of shiftTickets) {
        const ticketPayments = await getPaymentByTicketId(ticket.id);
        if (!ticketPayments?.length) continue;

        const payment = payments.find((payment) => payment.id === ticketPayments[0].paymentId);
        if (!payment) continue;

        const method = methods.find((method) => method.id === payment.methodId);
        const methodName = method?.name ?? shiftTranslations("other");

        methodTotals[methodName] = (methodTotals[methodName] ?? 0) + ticket.totalAmount;
      }

      setByPaymentMethod(
        Object.entries(methodTotals).map(([name, total]) => ({ name, total })),
      );
    } finally {
      setBreakdownLoading(false);
    }
  }, [shiftTranslations]);

  const fetchShiftTickets = useCallback(async () => {
    if (!openShiftData?.shiftDate || !openShiftData?.startTime) return;

    setTicketsLoading(true);
    try {
      const shiftStartMs = new Date(
        `${openShiftData.shiftDate}T${openShiftData.startTime}`,
      ).getTime();

      const tickets = await getTickets();
      const shiftTickets = tickets.filter(
        (ticket) => new Date(`${ticket.ticketDate.replace(" ", "T")}Z`).getTime() >= shiftStartMs,
      );

      setTotalBalance(shiftTickets.reduce((runningTotal, ticket) => runningTotal + ticket.totalAmount, 0));
      setTotalTickets(shiftTickets.length);

      fetchTicketBreakdown(shiftTickets).catch(() => {});
    } catch {
    } finally {
      setTicketsLoading(false);
    }
  }, [openShiftData?.shiftDate, openShiftData?.startTime, fetchTicketBreakdown]);

  useEffect(() => {
    fetchShiftTickets();
  }, [fetchShiftTickets]);

  const resetTicketMetrics = useCallback(() => {
    setTotalBalance(0);
    setTotalTickets(0);
    setByPaymentMethod([]);
    setTicketsLoading(false);
    setBreakdownLoading(false);
  }, []);

  const updateTurn = useCallback((newTurnId) => {
    setOpenTurnId(newTurnId);
  }, []);

  const refreshTurn = useCallback(async () => {
    setLoading(true);
    return await loadOpenTurn();
  }, [loadOpenTurn]);

  const openShift = useCallback(async (initialAmount = 0) => {
    const result = await openTurn(user?.id || user?.userId, initialAmount);
    const id = result?.id ?? null;
    setOpenTurnId(id);
    if (id) {
      const shift = await getTurnOpen();
      setOpenShiftData(shift);
    }
    return id;
  }, [user]);

  const closeShift = useCallback(async (finalAmount = null, difference = null) => {
    if (!openTurnId) return false;
    await closeTurn(openTurnId, finalAmount, difference);
    setOpenTurnId(null);
    setOpenShiftData(null);
    resetTicketMetrics();
    return true;
  }, [openTurnId, resetTicketMetrics]);

  const value = useMemo(
    () => ({
      openTurn: openTurnId,
      openShiftData,
      loading,
      error,
      setOpenTurn: setOpenTurnId,
      updateTurn,
      refreshTurn,
      checkOpenShift: loadOpenTurn,
      openShift,
      closeShift,
      totalBalance,
      totalTickets,
      byPaymentMethod,
      ticketsLoading,
      breakdownLoading,
      refreshShiftTickets: fetchShiftTickets,
    }),
    [
      openTurnId, openShiftData, loading, error,
      updateTurn, refreshTurn, loadOpenTurn, openShift, closeShift,
      totalBalance, totalTickets, byPaymentMethod, ticketsLoading, breakdownLoading,
      fetchShiftTickets,
    ],
  );

  return (
    <TurnContext.Provider value={value}>
      {children}
    </TurnContext.Provider>
  );
}
