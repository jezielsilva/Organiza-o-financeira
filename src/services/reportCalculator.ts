/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo de serviço focado exclusivamente em cálculos e agregações para relatórios financeiros (SRP).
 */

import { FixedBill, IncomeSource, CardInvoice, PlannedInstallment, MonthlyReportSummary, CardPurchase } from "../types";
import { getMonthDiff } from "../utils/formatters";

// Calcula as parcelas ativas de uma fatura para um determinado mês de destino (projeção)
export function getProjectedInvoicePurchases(
  targetMonth: string,
  invoices: CardInvoice[]
): { purchases: CardPurchase[]; sourceInvoiceMonth: string | null } {
  const realInvoice = invoices.find((inv) => inv.referenceMonth === targetMonth);
  if (realInvoice) {
    return { purchases: realInvoice.purchases, sourceInvoiceMonth: targetMonth };
  }

  const sortedPastInvoices = invoices
    .filter((inv) => inv.referenceMonth < targetMonth)
    .sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth));

  if (sortedPastInvoices.length === 0) {
    return { purchases: [], sourceInvoiceMonth: null };
  }

  const latestInvoice = sortedPastInvoices[0];
  const diffMonths = getMonthDiff(latestInvoice.referenceMonth, targetMonth);

  const projectedPurchases: CardPurchase[] = latestInvoice.purchases
    .filter((purchase) => {
      if (!purchase.isInstallment) return false;
      const current = purchase.installmentCurrent || 1;
      const total = purchase.installmentTotal || 1;
      const finalInstallmentAtTarget = current + diffMonths;
      return finalInstallmentAtTarget <= total;
    })
    .map((purchase) => {
      const current = purchase.installmentCurrent || 1;
      const total = purchase.installmentTotal || 1;
      const projectedCurrent = current + diffMonths;
      const remaining = total - projectedCurrent;

      return {
        ...purchase,
        id: `${purchase.id}-proj-${targetMonth}`,
        installmentCurrent: projectedCurrent,
        installmentsRemaining: remaining,
      };
    });

  return {
    purchases: projectedPurchases,
    sourceInvoiceMonth: latestInvoice.referenceMonth,
  };
}

// Calcula o resumo financeiro completo para um determinado mês
export function calculateReport(
  month: string,
  incomes: IncomeSource[],
  fixedBills: FixedBill[],
  invoices: CardInvoice[],
  plannedInstallments: PlannedInstallment[]
): MonthlyReportSummary {
  const totalIncome = incomes
    .filter((inc) => {
      const isRecurrent = !inc.recurrence || inc.recurrence === "monthly";
      if (isRecurrent) {
        return inc.month <= month;
      } else {
        return inc.month === month;
      }
    })
    .reduce((acc, curr) => acc + curr.value, 0);

  const activeBills = fixedBills.filter((bill) => bill.active);
  const totalFixedBills = activeBills.reduce((acc, curr) => acc + curr.value, 0);

  const { purchases: invoicePurchases } = getProjectedInvoicePurchases(month, invoices);
  const realInvoice = invoices.find((inv) => inv.referenceMonth === month);
  
  const totalCardInvoice = realInvoice 
    ? realInvoice.totalValue 
    : invoicePurchases.reduce((acc, curr) => acc + (curr.installmentValue || 0), 0);

  const activeSimulatedInstallments = plannedInstallments.filter((plan) => {
    if (plan.status !== "simulated") return false;
    const diff = getMonthDiff(plan.firstChargeMonth, month);
    return diff >= 0 && diff < plan.installmentTotal;
  });

  const totalSimulated = activeSimulatedInstallments.reduce((acc, curr) => acc + curr.installmentValue, 0);

  const balance = totalIncome - (totalFixedBills + totalCardInvoice + totalSimulated);

  return {
    month,
    income: totalIncome,
    fixedBills: totalFixedBills,
    cardInvoice: totalCardInvoice,
    simulatedInstallments: totalSimulated,
    balance,
  };
}
