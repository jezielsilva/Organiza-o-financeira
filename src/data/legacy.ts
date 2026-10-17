/**
 * Conversão dos formatos antigos do app (valores em reais com ponto flutuante,
 * listas com "tombstones", backup v2) para o formato atual.
 */

import { guessCategory } from "../domain/categories";
import { toCents } from "../domain/money";
import { currentMonth, isYearMonth } from "../domain/month";
import { emptyData, type AppData, type Invoice, type Purchase } from "../domain/types";

type Raw = Record<string, unknown>;

const isObj = (v: unknown): v is Raw => typeof v === "object" && v !== null && !Array.isArray(v);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

function alive(list: unknown): Raw[] {
  const items = Array.isArray(list) ? list : isObj(list) ? Object.values(list) : [];
  return items.filter((item): item is Raw => isObj(item) && !item.deleted && typeof item.id === "string");
}

export interface LegacyLists {
  incomes?: unknown;
  fixedBills?: unknown;
  invoices?: unknown;
  plannedInstallments?: unknown;
}

export function convertLegacy(lists: LegacyLists): AppData {
  const data = emptyData();
  const fallbackMonth = currentMonth();

  for (const r of alive(lists.incomes)) {
    data.incomes[r.id as string] = {
      id: r.id as string,
      label: String(r.label ?? "Renda"),
      amountCents: toCents(num(r.value)),
      recurrence: r.recurrence === "single" ? "single" : "monthly",
      startMonth: isYearMonth(r.month) ? r.month : fallbackMonth,
    };
  }

  for (const r of alive(lists.fixedBills)) {
    data.bills[r.id as string] = {
      id: r.id as string,
      name: String(r.name ?? "Conta"),
      amountCents: toCents(num(r.value)),
      dueDay: Math.min(31, Math.max(1, Math.round(num(r.dueDay)) || 1)),
      category: String(r.category ?? "Outros"),
      active: r.active !== false,
    };
  }

  for (const r of alive(lists.invoices)) {
    if (!isYearMonth(r.referenceMonth)) continue;
    const purchases: Record<string, Purchase> = {};
    alive(r.purchases).forEach((p, index) => {
      const isInstallment = !!p.isInstallment && num(p.installmentTotal) > 1;
      const description = String(p.description ?? "Lançamento");
      const amount = isInstallment ? num(p.installmentValue) : num(p.totalValue);
      purchases[p.id as string] = {
        id: p.id as string,
        seq: index,
        date: typeof p.purchaseDate === "string" ? p.purchaseDate : undefined,
        description,
        category: p.category && p.category !== "Geral" ? String(p.category) : guessCategory(description),
        kind: /\bIOF\b|ANUIDADE|TARIFA/i.test(description) ? "fee" : "purchase",
        amountCents: toCents(amount),
        installmentCurrent: isInstallment ? Math.round(num(p.installmentCurrent)) || 1 : undefined,
        installmentTotal: isInstallment ? Math.round(num(p.installmentTotal)) : undefined,
        holder: typeof p.portador === "string" ? p.portador : undefined,
      };
    });
    const invoice: Invoice = {
      id: r.id as string,
      month: r.referenceMonth,
      issuer: "Carrefour",
      fileName: typeof r.fileName === "string" ? r.fileName : undefined,
      importedAt: typeof r.uploadedAt === "string" ? r.uploadedAt : new Date(0).toISOString(),
      statementTotalCents: toCents(num(r.totalValue)),
      cards: {},
      purchases,
    };
    data.invoices[invoice.id] = invoice;
  }

  for (const r of alive(lists.plannedInstallments)) {
    const installments = Math.round(num(r.installmentTotal));
    if (!isYearMonth(r.firstChargeMonth) || installments < 1) continue;
    data.plans[r.id as string] = {
      id: r.id as string,
      description: String(r.description ?? "Compra planejada"),
      totalCents: toCents(num(r.totalValue)),
      installments,
      firstMonth: r.firstChargeMonth,
      status: r.status === "confirmed_in_invoice" ? "confirmed" : r.status === "archived" ? "archived" : "active",
      createdAt: new Date(0).toISOString(),
    };
  }

  return data;
}

function readJson(storage: Storage, key: string): unknown {
  try {
    const value = storage.getItem(key);
    return value ? JSON.parse(value) : undefined;
  } catch {
    return undefined;
  }
}

/** Lê os dados das versões anteriores do app guardados no navegador. */
export function readLegacyLocalStorage(storage: Storage): { data: AppData; onboarded: boolean } | null {
  const fixas = readJson(storage, "fin_v2:transacoes_fixas") as { rendas?: unknown; contasFixas?: unknown } | undefined;
  const config = readJson(storage, "fin_v2:configuracoes_usuario") as { onboardingCompleto?: boolean } | undefined;
  const lists: LegacyLists = {
    incomes: fixas?.rendas ?? readJson(storage, "fin_incomes"),
    fixedBills: fixas?.contasFixas ?? readJson(storage, "fin_fixed_bills"),
    invoices: readJson(storage, "fin_invoices"),
    plannedInstallments: readJson(storage, "fin_planned"),
  };
  const hasAnything = Object.values(lists).some((v) => v !== undefined) || config !== undefined;
  if (!hasAnything) return null;
  return { data: convertLegacy(lists), onboarded: config?.onboardingCompleto === true };
}

/** Sala de sincronização no formato antigo: `{ meta, domains: { fixedBills: { data: [...] } } }`. */
export function convertLegacyRoom(room: unknown): AppData | null {
  if (!isObj(room) || !isObj(room.domains)) return null;
  const d = room.domains as Record<string, { data?: unknown } | undefined>;
  return convertLegacy({
    incomes: d.incomes?.data,
    fixedBills: d.fixedBills?.data,
    invoices: d.invoices?.data,
    plannedInstallments: d.plannedInstallments?.data,
  });
}

/** Backup v2 do app antigo (`configuracoes_usuario` / `transacoes_fixas`) ou arrays soltos. */
export function convertLegacyBackup(json: Raw): AppData | null {
  const fixas = isObj(json.transacoes_fixas) ? json.transacoes_fixas : undefined;
  if (!fixas && !json.fixedBills && !json.incomes && !json.invoices) return null;
  return convertLegacy({
    incomes: fixas?.rendas ?? json.incomes,
    fixedBills: fixas?.contasFixas ?? json.fixedBills,
    invoices: json.invoices,
    plannedInstallments: json.plannedInstallments,
  });
}
