/**
 * Motor de cálculo do orçamento. Funções puras: recebem os dados e devolvem
 * números, sem tocar em armazenamento ou UI.
 *
 * Fatura de um mês M:
 *  - Se existe a fatura real de M → soma dos lançamentos que contam no orçamento
 *    (portador incluído e não marcado como "não é meu").
 *  - Se não existe → parcelas que ainda caem em M (projetadas da fatura mais
 *    recente) + gasto do dia a dia estimado pela média das últimas faturas.
 *    Sem essa estimativa a projeção ficava otimista: assinaturas, mercado e
 *    transporte simplesmente sumiam dos meses futuros.
 */

import { sumCents, type Cents } from "./money";
import { addMonths, monthDiff, type YearMonth } from "./month";
import { normalizeHolder } from "./invoice/statementParser";
import type { AppData, Invoice, PlannedPurchase, Purchase, SharedSettings } from "./types";

const ESTIMATE_WINDOW = 3;

export function isHolderCounted(settings: SharedSettings, holder: string | undefined): boolean {
  if (!holder) return true;
  return settings.holderRules[normalizeHolder(holder)] ?? true;
}

export function isPurchaseCounted(purchase: Purchase, settings: SharedSettings): boolean {
  return !purchase.ignored && isHolderCounted(settings, purchase.holder);
}

export function countedPurchases(invoice: Invoice, settings: SharedSettings): Purchase[] {
  return Object.values(invoice.purchases).filter((p) => isPurchaseCounted(p, settings));
}

export function sortedPurchases(invoice: Invoice): Purchase[] {
  return Object.values(invoice.purchases).sort((a, b) => a.seq - b.seq);
}

/** Quanto desta fatura é "seu" (o que sai do seu orçamento). */
export function invoiceShareCents(invoice: Invoice, settings: SharedSettings): Cents {
  return sumCents(countedPurchases(invoice, settings).map((p) => p.amountCents));
}

/** Soma de todos os lançamentos lidos, de todos os portadores — para conferir com o total impresso. */
export function invoiceReadTotalCents(invoice: Invoice): Cents {
  return sumCents(Object.values(invoice.purchases).map((p) => p.amountCents));
}

export function isInstallment(p: Purchase): boolean {
  return !!p.installmentTotal && p.installmentTotal > 1 && !!p.installmentCurrent;
}

export function invoicesByMonth(data: AppData): Map<YearMonth, Invoice> {
  const map = new Map<YearMonth, Invoice>();
  for (const invoice of Object.values(data.invoices)) {
    const existing = map.get(invoice.month);
    if (!existing || existing.importedAt < invoice.importedAt) map.set(invoice.month, invoice);
  }
  return map;
}

function latestInvoiceBefore(data: AppData, month: YearMonth): Invoice | undefined {
  let latest: Invoice | undefined;
  for (const invoice of invoicesByMonth(data).values()) {
    if (invoice.month < month && (!latest || invoice.month > latest.month)) latest = invoice;
  }
  return latest;
}

export interface ProjectedInstallment {
  purchaseId: string;
  invoiceId: string;
  description: string;
  holder?: string;
  amountCents: Cents;
  current: number;
  total: number;
  /** Mês em que cai a última parcela. */
  lastMonth: YearMonth;
}

/** Parcelas da fatura `source` que continuam caindo em `month`. */
export function installmentsFromInvoice(
  source: Invoice,
  month: YearMonth,
  settings: SharedSettings,
): ProjectedInstallment[] {
  const offset = monthDiff(source.month, month);
  if (offset < 0) return [];
  return countedPurchases(source, settings)
    .filter(isInstallment)
    .map((p) => {
      const current = p.installmentCurrent! + offset;
      return {
        purchaseId: p.id,
        invoiceId: source.id,
        description: p.description,
        holder: p.holder,
        amountCents: p.amountCents,
        current,
        total: p.installmentTotal!,
        lastMonth: addMonths(source.month, p.installmentTotal! - p.installmentCurrent!),
      };
    })
    .filter((item) => item.current <= item.total);
}

/** Média do gasto não parcelado (dia a dia) nas últimas faturas até `month` (exclusive). */
export function variableSpendingEstimate(data: AppData, month: YearMonth): Cents {
  const recent = [...invoicesByMonth(data).values()]
    .filter((invoice) => invoice.month < month)
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, ESTIMATE_WINDOW);
  if (recent.length === 0) return 0;
  const totals = recent.map((invoice) =>
    sumCents(
      countedPurchases(invoice, data.settings)
        .filter((p) => !isInstallment(p))
        .map((p) => p.amountCents),
    ),
  );
  return Math.max(0, Math.round(sumCents(totals) / recent.length));
}

export function planInstallmentNumber(plan: PlannedPurchase, month: YearMonth): number | null {
  const offset = monthDiff(plan.firstMonth, month);
  return offset >= 0 && offset < plan.installments ? offset + 1 : null;
}

export function planInstallmentCents(plan: PlannedPurchase, installmentNumber: number): Cents {
  const base = Math.floor(plan.totalCents / plan.installments);
  return installmentNumber === plan.installments ? plan.totalCents - base * (plan.installments - 1) : base;
}

export interface CardForecast {
  source: "invoice" | "projected" | "none";
  invoiceId?: string;
  totalCents: Cents;
  installmentsCents: Cents;
  variableEstimateCents: Cents;
}

export interface MonthSummary {
  month: YearMonth;
  incomeCents: Cents;
  billsCents: Cents;
  card: CardForecast;
  plannedCents: Cents;
  expensesCents: Cents;
  balanceCents: Cents;
}

export function incomeForMonth(data: AppData, month: YearMonth): Cents {
  return sumCents(
    Object.values(data.incomes)
      .filter((i) => (i.recurrence === "single" ? i.startMonth === month : i.startMonth <= month))
      .map((i) => i.amountCents),
  );
}

export function billsForMonth(data: AppData): Cents {
  return sumCents(Object.values(data.bills).filter((b) => b.active).map((b) => b.amountCents));
}

export function plannedForMonth(data: AppData, month: YearMonth, extra: PlannedPurchase[] = []): Cents {
  return sumCents(
    [...Object.values(data.plans).filter((p) => p.status === "active"), ...extra].map((plan) => {
      const n = planInstallmentNumber(plan, month);
      return n === null ? 0 : planInstallmentCents(plan, n);
    }),
  );
}

export function cardForecast(data: AppData, month: YearMonth): CardForecast {
  const real = invoicesByMonth(data).get(month);
  if (real) {
    const share = invoiceShareCents(real, data.settings);
    const installments = sumCents(
      countedPurchases(real, data.settings).filter(isInstallment).map((p) => p.amountCents),
    );
    return {
      source: "invoice",
      invoiceId: real.id,
      totalCents: share,
      installmentsCents: installments,
      variableEstimateCents: share - installments,
    };
  }
  const latest = latestInvoiceBefore(data, month);
  if (!latest) return { source: "none", totalCents: 0, installmentsCents: 0, variableEstimateCents: 0 };
  const installments = sumCents(installmentsFromInvoice(latest, month, data.settings).map((i) => i.amountCents));
  const variable = variableSpendingEstimate(data, month);
  return {
    source: "projected",
    invoiceId: latest.id,
    totalCents: installments + variable,
    installmentsCents: installments,
    variableEstimateCents: variable,
  };
}

export function summarizeMonth(data: AppData, month: YearMonth, extraPlans: PlannedPurchase[] = []): MonthSummary {
  const incomeCents = incomeForMonth(data, month);
  const billsCents = billsForMonth(data);
  const card = cardForecast(data, month);
  const plannedCents = plannedForMonth(data, month, extraPlans);
  const expensesCents = billsCents + card.totalCents + plannedCents;
  return {
    month,
    incomeCents,
    billsCents,
    card,
    plannedCents,
    expensesCents,
    balanceCents: incomeCents - expensesCents,
  };
}

export function projectMonths(
  data: AppData,
  start: YearMonth,
  count: number,
  extraPlans: PlannedPurchase[] = [],
): MonthSummary[] {
  return Array.from({ length: count }, (_, i) => summarizeMonth(data, addMonths(start, i), extraPlans));
}

export interface EndingCommitment {
  id: string;
  type: "card" | "plan";
  description: string;
  holder?: string;
  amountCents: Cents;
  current: number;
  total: number;
  lastMonth: YearMonth;
}

/**
 * Compromissos parcelados que ainda caem em `month` ou depois, ordenados pelo
 * que termina primeiro — responde "o que está acabando e o que está longe".
 */
export function commitmentsFrom(data: AppData, month: YearMonth): EndingCommitment[] {
  const real = invoicesByMonth(data).get(month);
  const source = real ?? latestInvoiceBefore(data, month);
  const card: EndingCommitment[] = source
    ? installmentsFromInvoice(source, month, data.settings).map((i) => ({
        id: i.purchaseId,
        type: "card" as const,
        description: i.description,
        holder: i.holder,
        amountCents: i.amountCents,
        current: i.current,
        total: i.total,
        lastMonth: i.lastMonth,
      }))
    : [];
  const plans: EndingCommitment[] = Object.values(data.plans)
    .filter((p) => p.status === "active")
    .map((plan): EndingCommitment | null => {
      const lastMonth = addMonths(plan.firstMonth, plan.installments - 1);
      const n = planInstallmentNumber(plan, month);
      if (lastMonth < month) return null;
      const current = n ?? 0;
      return {
        id: plan.id,
        type: "plan",
        description: plan.description,
        amountCents: planInstallmentCents(plan, Math.max(1, current)),
        current,
        total: plan.installments,
        lastMonth,
      };
    })
    .filter((x): x is EndingCommitment => x !== null);
  return [...card, ...plans].sort(
    (a, b) => a.lastMonth.localeCompare(b.lastMonth) || b.amountCents - a.amountCents,
  );
}

/** Lançamentos da fatura parecidos com uma compra planejada (para evitar contar duas vezes). */
export function findPlanMatches(invoice: Invoice, plans: PlannedPurchase[]) {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  return plans
    .filter((plan) => plan.status === "active")
    .map((plan) => {
      const planKey = normalize(plan.description);
      const expected = planInstallmentCents(plan, 1);
      const match = Object.values(invoice.purchases).find((p) => {
        const key = normalize(p.description);
        const similarText = planKey.length >= 3 && (key.includes(planKey) || planKey.includes(key));
        const similarValue = Math.abs(p.amountCents - expected) <= 1000;
        return similarText && similarValue;
      });
      return match ? { plan, purchase: match } : null;
    })
    .filter((x): x is { plan: PlannedPurchase; purchase: Purchase } => x !== null);
}
