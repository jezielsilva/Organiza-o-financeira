/**
 * Validação defensiva de dados que chegam de fora (Firebase, backup, storage).
 * Itens inválidos são descartados em vez de quebrar a tela.
 */

import { isYearMonth } from "../domain/month";
import {
  emptyData,
  type AppData,
  type FixedBill,
  type Goal,
  type Holding,
  type Income,
  type Invoice,
  type InvoiceCard,
  type PlannedPurchase,
  type Purchase,
} from "../domain/types";

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
const int = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? Math.round(v) : undefined;
const optStr = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** Firebase devolve arrays quando as chaves são numéricas; aceitamos os dois formatos. */
function entries(v: unknown): Raw[] {
  if (Array.isArray(v)) return v.filter(isObj);
  if (isObj(v)) return Object.values(v).filter(isObj);
  return [];
}

function toMap<T extends { id: string }>(items: Array<T | null>): Record<string, T> {
  const map: Record<string, T> = {};
  for (const item of items) if (item) map[item.id] = item;
  return map;
}

export function normalizeIncome(r: Raw): Income | null {
  const amountCents = int(r.amountCents);
  if (!r.id || amountCents === undefined || !isYearMonth(r.startMonth)) return null;
  return {
    id: str(r.id),
    label: str(r.label, "Renda"),
    amountCents,
    recurrence: r.recurrence === "single" ? "single" : "monthly",
    startMonth: r.startMonth,
  };
}

export function normalizeBill(r: Raw): FixedBill | null {
  const amountCents = int(r.amountCents);
  if (!r.id || amountCents === undefined) return null;
  const dueDay = Math.min(31, Math.max(1, int(r.dueDay) ?? 1));
  return {
    id: str(r.id),
    name: str(r.name, "Conta"),
    amountCents,
    dueDay,
    category: str(r.category, "Outros"),
    active: r.active !== false,
  };
}

export function normalizePurchase(r: Raw, index: number): Purchase | null {
  const amountCents = int(r.amountCents);
  if (!r.id || amountCents === undefined) return null;
  const current = int(r.installmentCurrent);
  const total = int(r.installmentTotal);
  return {
    id: str(r.id),
    seq: int(r.seq) ?? index,
    date: optStr(r.date),
    description: str(r.description, "Lançamento"),
    category: str(r.category, "Outros"),
    kind: r.kind === "fee" || r.kind === "refund" ? r.kind : "purchase",
    amountCents,
    installmentCurrent: current && total ? current : undefined,
    installmentTotal: current && total ? total : undefined,
    holder: optStr(r.holder),
    cardLast4: optStr(r.cardLast4),
    ignored: r.ignored === true ? true : undefined,
    manual: r.manual === true ? true : undefined,
  };
}

export function normalizeInvoice(r: Raw): Invoice | null {
  if (!r.id || !isYearMonth(r.month)) return null;
  const purchases = toMap(entries(r.purchases).map((p, i) => normalizePurchase(p, i)));
  const cards: Record<string, InvoiceCard> = {};
  for (const c of entries(r.cards)) {
    const last4 = str(c.last4);
    if (last4) cards[last4] = { holder: str(c.holder), last4 };
  }
  return {
    id: str(r.id),
    month: r.month,
    dueDate: optStr(r.dueDate),
    issuer: str(r.issuer, "Cartão"),
    fileName: optStr(r.fileName),
    importedAt: str(r.importedAt, new Date(0).toISOString()),
    statementTotalCents: int(r.statementTotalCents) ?? 0,
    accountHolder: optStr(r.accountHolder),
    cards,
    purchases,
    futureInstallmentsCents: int(r.futureInstallmentsCents),
  };
}

export function normalizePlan(r: Raw): PlannedPurchase | null {
  const totalCents = int(r.totalCents);
  const installments = int(r.installments);
  if (!r.id || !totalCents || !installments || installments < 1 || !isYearMonth(r.firstMonth)) return null;
  return {
    id: str(r.id),
    description: str(r.description, "Compra planejada"),
    totalCents,
    installments,
    firstMonth: r.firstMonth,
    status: r.status === "confirmed" || r.status === "archived" ? r.status : "active",
    createdAt: str(r.createdAt, new Date(0).toISOString()),
  };
}

export function normalizeGoal(r: Raw): Goal | null {
  const targetCents = int(r.targetCents);
  if (!r.id || !targetCents || targetCents <= 0) return null;
  return {
    id: str(r.id),
    name: str(r.name, "Meta"),
    kind: r.kind === "emergency" ? "emergency" : "goal",
    targetCents,
    savedCents: Math.max(0, int(r.savedCents) ?? 0),
    monthlyCents: Math.max(0, int(r.monthlyCents) ?? 0),
    createdAt: str(r.createdAt, new Date(0).toISOString()),
  };
}

export function normalizeHolding(r: Raw): Holding | null {
  const quantity = int(r.quantity);
  const ticker = str(r.ticker).trim().toUpperCase();
  if (!r.id || !/^[A-Z0-9]{4,7}$/.test(ticker) || !quantity || quantity <= 0) return null;
  const avg = int(r.avgPriceCents);
  return { id: str(r.id), ticker, quantity, ...(avg && avg > 0 ? { avgPriceCents: avg } : {}) };
}

export function normalizeData(raw: unknown): AppData {
  const data = emptyData();
  if (!isObj(raw)) return data;
  data.incomes = toMap(entries(raw.incomes).map(normalizeIncome));
  data.bills = toMap(entries(raw.bills).map(normalizeBill));
  data.invoices = toMap(entries(raw.invoices).map(normalizeInvoice));
  data.plans = toMap(entries(raw.plans).map(normalizePlan));
  data.goals = toMap(entries(raw.goals).map(normalizeGoal));
  data.holdings = toMap(entries(raw.holdings).map(normalizeHolding));
  const settings = isObj(raw.settings) ? raw.settings : {};
  if (isObj(settings.holderRules)) {
    for (const [name, counted] of Object.entries(settings.holderRules)) {
      if (typeof counted === "boolean") data.settings.holderRules[name] = counted;
    }
  }
  if (isObj(settings.categoryBudgets)) {
    for (const [category, cents] of Object.entries(settings.categoryBudgets)) {
      const value = int(cents);
      if (value && value > 0) data.settings.categoryBudgets[category] = value;
    }
  }
  const goal = int(settings.investGoalCents);
  if (goal && goal > 0) data.settings.investGoalCents = goal;
  if (isObj(settings.watchlist)) {
    const watchlist: Record<string, number> = {};
    for (const [ticker, cents] of Object.entries(settings.watchlist)) {
      const value = int(cents);
      if (/^[A-Z0-9]{4,7}$/.test(ticker) && value && value > 0) watchlist[ticker] = value;
    }
    if (Object.keys(watchlist).length) data.settings.watchlist = watchlist;
  }
  return data;
}

export function isEmptyData(data: AppData): boolean {
  return (
    Object.keys(data.incomes).length === 0 &&
    Object.keys(data.bills).length === 0 &&
    Object.keys(data.invoices).length === 0 &&
    Object.keys(data.plans).length === 0 &&
    Object.keys(data.goals).length === 0 &&
    Object.keys(data.holdings).length === 0
  );
}
