/**
 * Análises derivadas: categorias, orçamento, calendário de alívio, cenários
 * de projeção, metas e resumo do mês. Funções puras sobre os dados.
 */

import { sumCents, type Cents } from "./money";
import { addMonths, monthDiff, type YearMonth } from "./month";
import {
  commitmentsFrom,
  countedPurchases,
  invoicesByMonth,
  projectMonths,
  type MonthSummary,
} from "./projection";
import type { AppData, Goal, PlannedPurchase } from "./types";

export interface CategoryShare {
  category: string;
  cents: Cents;
  /** 0–1 */
  share: number;
}

/** Sua parte da fatura do mês, por categoria (estornos descontam). */
export function categoryBreakdown(data: AppData, month: YearMonth): CategoryShare[] {
  const invoice = invoicesByMonth(data).get(month);
  if (!invoice) return [];
  const map = new Map<string, Cents>();
  for (const p of countedPurchases(invoice, data.settings)) {
    map.set(p.category, (map.get(p.category) ?? 0) + p.amountCents);
  }
  const rows = [...map.entries()].filter(([, cents]) => cents > 0);
  const total = sumCents(rows.map(([, cents]) => cents));
  return rows
    .map(([category, cents]) => ({ category, cents, share: total ? cents / total : 0 }))
    .sort((a, b) => b.cents - a.cents);
}

/** Junta as categorias menores em "Outros" para o gráfico. */
export function topCategories(rows: CategoryShare[], max = 5): CategoryShare[] {
  if (rows.length <= max + 1) return rows;
  const named = rows.filter((r) => r.category !== "Outros");
  const head = named.slice(0, max);
  const rest = [...named.slice(max), ...rows.filter((r) => r.category === "Outros")];
  const cents = sumCents(rest.map((r) => r.cents));
  const total = sumCents(rows.map((r) => r.cents));
  return [...head, { category: "Outros", cents, share: total ? cents / total : 0 }];
}

export type BudgetState = "over" | "near" | "ok";

export interface BudgetStatus {
  category: string;
  limitCents: Cents;
  spentCents: Cents;
  /** 0–∞ */
  ratio: number;
  state: BudgetState;
}

export function budgetStatus(data: AppData, month: YearMonth): BudgetStatus[] {
  const spent = new Map(categoryBreakdown(data, month).map((r) => [r.category, r.cents]));
  return Object.entries(data.settings.categoryBudgets)
    .map(([category, limitCents]) => {
      const spentCents = spent.get(category) ?? 0;
      const ratio = limitCents ? spentCents / limitCents : 0;
      const state: BudgetState = ratio > 1 ? "over" : ratio >= 0.9 ? "near" : "ok";
      return { category, limitCents, spentCents, ratio, state };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

export interface ReliefMonth {
  month: YearMonth;
  /** Parcelas cuja última cobrança é neste mês. */
  ending: Array<{ id: string; description: string; amountCents: Cents; current: number; total: number }>;
  /** Quanto essas parcelas liberam a partir do mês seguinte. */
  freedCents: Cents;
  /** Total liberado acumulado em relação ao mês inicial, válido a partir do mês seguinte. */
  cumulativeCents: Cents;
}

/** Calendário de alívio: em que mês cada parcela termina e quanto sobra a mais depois. */
export function reliefCalendar(data: AppData, start: YearMonth, count = 12): ReliefMonth[] {
  const commitments = commitmentsFrom(data, start);
  let cumulative = 0;
  return Array.from({ length: count }, (_, i) => {
    const month = addMonths(start, i);
    const ending = commitments
      .filter((c) => c.lastMonth === month)
      .map((c) => ({
        id: c.id,
        description: c.description,
        amountCents: c.amountCents,
        current: c.total,
        total: c.total,
      }));
    const freedCents = sumCents(ending.map((e) => e.amountCents));
    cumulative += freedCents;
    return { month, ending, freedCents, cumulativeCents: cumulative };
  });
}

export type Scenario = "conservative" | "realistic" | "optimistic";

export const SCENARIO_LABELS: Record<Scenario, string> = {
  conservative: "Conservador",
  realistic: "Realista",
  optimistic: "Otimista",
};

/**
 * Sobra prevista em cada cenário:
 *  - Realista: o cálculo normal.
 *  - Conservador: 10% a mais de despesas (imprevistos).
 *  - Otimista: 6% a menos no gasto do dia a dia do cartão.
 */
export function scenarioBalance(summary: MonthSummary, scenario: Scenario): Cents {
  if (scenario === "conservative") return summary.balanceCents - Math.round(summary.expensesCents * 0.1);
  if (scenario === "optimistic") return summary.balanceCents + Math.round(summary.card.variableEstimateCents * 0.06);
  return summary.balanceCents;
}

export function scenarioSeries(data: AppData, start: YearMonth, count: number) {
  return projectMonths(data, start, count).map((summary) => ({
    summary,
    conservative: scenarioBalance(summary, "conservative"),
    realistic: scenarioBalance(summary, "realistic"),
    optimistic: scenarioBalance(summary, "optimistic"),
  }));
}

/** Data (mês) em que a meta é atingida no ritmo atual, ou null se não há ritmo. */
export function goalEta(goal: Goal, from: YearMonth): YearMonth | null {
  const missing = goal.targetCents - goal.savedCents;
  if (missing <= 0) return from;
  if (goal.monthlyCents <= 0) return null;
  return addMonths(from, Math.ceil(missing / goal.monthlyCents));
}

/** Reserva sugerida: 6 meses de custo (contas fixas + sua parte média do cartão). */
export function suggestedEmergencyFund(data: AppData, month: YearMonth): Cents {
  const summary = projectMonths(data, month, 1)[0];
  return (summary.billsCents + summary.card.totalCents) * 6;
}

export interface PurchaseSimulation {
  before: MonthSummary[];
  after: MonthSummary[];
  worst: MonthSummary;
  /** Mês de início (entre os próximos 6) com a maior "menor sobra". */
  bestStart: { month: YearMonth; worstBalanceCents: Cents } | null;
}

/** Impacto de uma compra parcelada nos próximos meses e o melhor mês para começar. */
export function simulatePurchase(data: AppData, plan: PlannedPurchase, horizon = 6): PurchaseSimulation {
  const months = Math.max(plan.installments, horizon);
  const before = projectMonths(data, plan.firstMonth, months);
  const after = projectMonths(data, plan.firstMonth, months, [plan]);
  const worst = after.reduce((min, m) => (m.balanceCents < min.balanceCents ? m : min), after[0]);

  let bestStart: PurchaseSimulation["bestStart"] = null;
  for (let offset = 0; offset < 6; offset++) {
    const firstMonth = addMonths(plan.firstMonth, offset);
    const candidate = projectMonths(data, firstMonth, plan.installments, [{ ...plan, firstMonth }]);
    const worstBalance = Math.min(...candidate.map((m) => m.balanceCents));
    if (!bestStart || worstBalance > bestStart.worstBalanceCents) bestStart = { month: firstMonth, worstBalanceCents: worstBalance };
  }
  return { before, after, worst, bestStart };
}

const RIDES = /UBER|99 ?RIDE|99APP|99 POP|CABIFY|DL\*99/i;
const DELIVERY = /IFD\*|IFOOD|99FOOD|RAPPI|AIQFOME|ZE DELIVERY/i;

export interface MonthlyRecap {
  month: YearMonth;
  balanceCents: Cents;
  top?: CategoryShare;
  rides: { count: number; cents: Cents };
  delivery: { count: number; cents: Cents };
  endingCount: number;
  freedCents: Cents;
  nextMonthBalanceCents: Cents;
}

export function monthlyRecap(data: AppData, month: YearMonth): MonthlyRecap {
  const [summary, next] = projectMonths(data, month, 2);
  const categories = categoryBreakdown(data, month);
  const invoice = invoicesByMonth(data).get(month);
  const counted = invoice ? countedPurchases(invoice, data.settings) : [];
  const rides = counted.filter((p) => RIDES.test(p.description) && !DELIVERY.test(p.description));
  const delivery = counted.filter((p) => DELIVERY.test(p.description));
  const ending = commitmentsFrom(data, month).filter((c) => c.lastMonth === month && monthDiff(month, c.lastMonth) === 0);
  return {
    month,
    balanceCents: summary.balanceCents,
    top: categories[0],
    rides: { count: rides.length, cents: sumCents(rides.map((p) => p.amountCents)) },
    delivery: { count: delivery.length, cents: sumCents(delivery.map((p) => p.amountCents)) },
    endingCount: ending.length,
    freedCents: sumCents(ending.map((c) => c.amountCents)),
    nextMonthBalanceCents: next.balanceCents,
  };
}
