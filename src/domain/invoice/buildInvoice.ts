import { guessCategory } from "../categories";
import { newId, type Invoice, type InvoiceCard, type Purchase } from "../types";
import type { YearMonth } from "../month";
import type { ParsedStatement } from "./statementParser";

function matchKey(p: Pick<Purchase, "date" | "description" | "amountCents" | "cardLast4">): string {
  return `${p.date ?? ""}|${p.description.toUpperCase()}|${p.amountCents}|${p.cardLast4 ?? ""}`;
}

/**
 * Monta a fatura a partir do que foi lido do PDF. Se já existia uma fatura do
 * mesmo mês, as decisões do usuário (categoria e "não é meu") são mantidas nos
 * lançamentos equivalentes, e lançamentos manuais são preservados.
 */
export function buildInvoice(
  parsed: ParsedStatement,
  options: { fallbackMonth: YearMonth; fileName?: string; previous?: Invoice; now?: Date },
): Invoice {
  const { previous } = options;
  const previousByKey = new Map<string, Purchase[]>();
  for (const p of Object.values(previous?.purchases ?? {})) {
    if (p.manual) continue;
    const key = matchKey(p);
    previousByKey.set(key, [...(previousByKey.get(key) ?? []), p]);
  }

  const purchases: Record<string, Purchase> = {};
  parsed.entries.forEach((entry, index) => {
    const base: Purchase = {
      id: newId("p"),
      seq: index,
      date: entry.date,
      description: entry.description,
      category: guessCategory(entry.description),
      kind: entry.kind,
      amountCents: entry.amountCents,
      installmentCurrent: entry.installmentCurrent,
      installmentTotal: entry.installmentTotal,
      holder: entry.holder,
      cardLast4: entry.cardLast4,
    };
    const old = previousByKey.get(matchKey(base))?.shift();
    const purchase = old ? { ...base, id: old.id, category: old.category, ignored: old.ignored } : base;
    purchases[purchase.id] = purchase;
  });

  let seq = parsed.entries.length;
  for (const p of Object.values(previous?.purchases ?? {})) {
    if (p.manual) purchases[p.id] = { ...p, seq: seq++ };
  }

  const cards: Record<string, InvoiceCard> = {};
  for (const card of parsed.cards) cards[card.last4] = card;

  return {
    id: previous?.id ?? newId("inv"),
    month: parsed.month ?? options.fallbackMonth,
    dueDate: parsed.dueDate,
    issuer: parsed.issuer,
    fileName: options.fileName,
    importedAt: (options.now ?? new Date()).toISOString(),
    statementTotalCents: parsed.statementTotalCents ?? parsed.debitsCents,
    accountHolder: parsed.accountHolder,
    cards,
    purchases,
    futureInstallmentsCents: parsed.futureInstallmentsCents,
  };
}
