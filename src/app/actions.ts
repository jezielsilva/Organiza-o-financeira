/**
 * Casos de uso: cada função monta um patch e o envia ao store.
 * Retornam o patch inverso para o "Desfazer".
 */

import { normalizeHolder } from "../domain/invoice/statementParser";
import {
  newId,
  type FixedBill,
  type Goal,
  type Holding,
  type Income,
  type Invoice,
  type PlannedPurchase,
  type PlanStatus,
  type Purchase,
} from "../domain/types";
import { safeKey, type Patch } from "../data/patch";
import { store } from "./store";

const commit = (patch: Patch) => store.commit(patch);
const data = () => store.getState().data;

export const saveIncome = (income: Income) => commit({ [`incomes/${income.id}`]: income });
export const deleteIncome = (id: string) => commit({ [`incomes/${id}`]: null });

export const saveBill = (bill: FixedBill) => commit({ [`bills/${bill.id}`]: bill });
export const deleteBill = (id: string) => commit({ [`bills/${id}`]: null });
export const setBillActive = (id: string, active: boolean) => commit({ [`bills/${id}/active`]: active });

export const savePlan = (plan: PlannedPurchase) => commit({ [`plans/${plan.id}`]: plan });
export const deletePlan = (id: string) => commit({ [`plans/${id}`]: null });
export const setPlanStatus = (id: string, status: PlanStatus) => commit({ [`plans/${id}/status`]: status });

export function holderKey(holder: string): string {
  return safeKey(normalizeHolder(holder));
}

/**
 * Salva uma fatura importada. Substitui outra fatura do mesmo mês e cria a
 * regra padrão de portadores: o titular da conta não conta no orçamento
 * (ex.: cartão principal de outra pessoa), os adicionais contam.
 */
export function importInvoice(invoice: Invoice): Patch {
  const patch: Patch = {};
  for (const existing of Object.values(data().invoices)) {
    if (existing.month === invoice.month && existing.id !== invoice.id) patch[`invoices/${existing.id}`] = null;
  }
  patch[`invoices/${invoice.id}`] = invoice;
  const rules = data().settings.holderRules;
  const titular = invoice.accountHolder ? holderKey(invoice.accountHolder) : undefined;
  for (const card of Object.values(invoice.cards)) {
    const key = holderKey(card.holder);
    if (key && !(key in rules) && !(`settings/holderRules/${key}` in patch)) {
      patch[`settings/holderRules/${key}`] = key !== titular;
    }
  }
  return commit(patch);
}

export const deleteInvoice = (id: string) => commit({ [`invoices/${id}`]: null });

export const savePurchase = (invoiceId: string, purchase: Purchase) =>
  commit({ [`invoices/${invoiceId}/purchases/${purchase.id}`]: purchase });

export const deletePurchase = (invoiceId: string, purchaseId: string) =>
  commit({ [`invoices/${invoiceId}/purchases/${purchaseId}`]: null });

export const setPurchaseIgnored = (invoiceId: string, purchaseId: string, ignored: boolean) =>
  commit({ [`invoices/${invoiceId}/purchases/${purchaseId}/ignored`]: ignored ? true : null });

export const setHolderCounted = (holder: string, counted: boolean) =>
  commit({ [`settings/holderRules/${holderKey(holder)}`]: counted });

export const saveGoal = (goal: Goal) => commit({ [`goals/${goal.id}`]: goal });
export const deleteGoal = (id: string) => commit({ [`goals/${id}`]: null });
export const addToGoal = (goal: Goal, cents: number) =>
  commit({ [`goals/${goal.id}/savedCents`]: Math.max(0, goal.savedCents + cents) });

export const saveHolding = (holding: Holding) => commit({ [`holdings/${holding.id}`]: holding });
export const deleteHolding = (id: string) => commit({ [`holdings/${id}`]: null });

/** Registra compras de cotas: soma à posição existente do ticker ou cria uma nova. */
export function buyHoldings(buys: Array<{ ticker: string; quantity: number; priceCents?: number }>): Patch {
  const patch: Patch = {};
  const current = Object.values(data().holdings);
  for (const { ticker, quantity, priceCents } of buys) {
    const existing = current.find((h) => h.ticker === ticker);
    if (existing) {
      patch[`holdings/${existing.id}/quantity`] = existing.quantity + quantity;
      // Preço médio ponderado: só quando já se conhece o médio anterior.
      if (priceCents && existing.avgPriceCents) {
        patch[`holdings/${existing.id}/avgPriceCents`] = Math.round(
          (existing.avgPriceCents * existing.quantity + priceCents * quantity) / (existing.quantity + quantity),
        );
      }
    } else {
      const holding: Holding = { id: newId("h"), ticker, quantity, ...(priceCents ? { avgPriceCents: priceCents } : {}) };
      patch[`holdings/${holding.id}`] = holding;
    }
  }
  return commit(patch);
}

export const setCategoryBudget = (category: string, cents: number | null) =>
  commit({ [`settings/categoryBudgets/${safeKey(category)}`]: cents && cents > 0 ? cents : null });

export const setInvestGoal = (cents: number | null) =>
  commit({ "settings/investGoalCents": cents && cents > 0 ? cents : null });

export const setWatch = (ticker: string, targetCents: number | null) =>
  commit({ [`settings/watchlist/${ticker}`]: targetCents && targetCents > 0 ? targetCents : null });

export const undo = (patch: Patch) => commit(patch);
