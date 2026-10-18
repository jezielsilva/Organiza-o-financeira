import type { Cents } from "./money";
import type { YearMonth } from "./month";

/**
 * Entidades do domínio. Coleções são mapas `id → item` (e não arrays) para que
 * cada item tenha um caminho estável no Firebase (`bills/<id>`) e possa ser
 * gravado/apagado isoladamente, sem sobrescrever o que a outra pessoa editou.
 */

export interface Income {
  id: string;
  label: string;
  amountCents: Cents;
  /** Mensal: vale a partir de `startMonth`. Avulsa: vale só em `startMonth`. */
  recurrence: "monthly" | "single";
  startMonth: YearMonth;
}

export interface FixedBill {
  id: string;
  name: string;
  amountCents: Cents;
  dueDay: number;
  category: string;
  active: boolean;
}

export type PurchaseKind = "purchase" | "fee" | "refund";

export interface Purchase {
  id: string;
  /** Ordem original na fatura. */
  seq: number;
  /** "AAAA-MM-DD" */
  date?: string;
  description: string;
  category: string;
  kind: PurchaseKind;
  /** Valor cobrado NESTA fatura (a parcela, se parcelado). Negativo para estornos. */
  amountCents: Cents;
  installmentCurrent?: number;
  installmentTotal?: number;
  /** Nome do portador do cartão, como impresso na fatura. */
  holder?: string;
  cardLast4?: string;
  /** Marcado pelo usuário como "não é meu": não entra no orçamento. */
  ignored?: boolean;
  /** Lançado à mão (não veio do PDF). */
  manual?: boolean;
}

export interface InvoiceCard {
  holder: string;
  last4: string;
}

export interface Invoice {
  id: string;
  /** Mês de vencimento da fatura: é nele que o dinheiro sai. */
  month: YearMonth;
  dueDate?: string;
  issuer: string;
  fileName?: string;
  importedAt: string;
  /** Total impresso na fatura (todos os portadores). */
  statementTotalCents: Cents;
  /** Titular da conta do cartão, se lido do PDF. */
  accountHolder?: string;
  cards: Record<string, InvoiceCard>;
  purchases: Record<string, Purchase>;
  /** Saldo de parcelas futuras informado pelo banco (todos os portadores). */
  futureInstallmentsCents?: Cents;
}

export type PlanStatus = "active" | "confirmed" | "archived";

export interface PlannedPurchase {
  id: string;
  description: string;
  totalCents: Cents;
  installments: number;
  firstMonth: YearMonth;
  status: PlanStatus;
  createdAt: string;
}

export interface Goal {
  id: string;
  name: string;
  /** "emergency" = reserva de emergência (no máximo uma). */
  kind: "emergency" | "goal";
  targetCents: Cents;
  savedCents: Cents;
  /** Quanto pretende guardar por mês. */
  monthlyCents: Cents;
  createdAt: string;
}

/** Posição na carteira de investimentos (FII/ação da B3). */
export interface Holding {
  id: string;
  /** Código B3 em maiúsculas, ex.: "MXRF11". */
  ticker: string;
  quantity: number;
}

/** Configurações compartilhadas entre quem usa o mesmo código. */
export interface SharedSettings {
  /** Nome normalizado do portador → conta no orçamento? */
  holderRules: Record<string, boolean>;
  /** Limite mensal por categoria de gasto do cartão. */
  categoryBudgets: Record<string, Cents>;
}

export interface AppData {
  incomes: Record<string, Income>;
  bills: Record<string, FixedBill>;
  invoices: Record<string, Invoice>;
  plans: Record<string, PlannedPurchase>;
  goals: Record<string, Goal>;
  holdings: Record<string, Holding>;
  settings: SharedSettings;
}

export const COLLECTIONS = ["incomes", "bills", "invoices", "plans", "goals", "holdings"] as const;
export type CollectionName = (typeof COLLECTIONS)[number];

export function emptyData(): AppData {
  return {
    incomes: {},
    bills: {},
    invoices: {},
    plans: {},
    goals: {},
    holdings: {},
    settings: { holderRules: {}, categoryBudgets: {} },
  };
}

export function newId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}${Date.now().toString(36)}${random}`;
}
