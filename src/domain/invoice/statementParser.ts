/**
 * Interpreta as linhas de texto de uma fatura de cartão (layout Carrefour /
 * Banco CSF, que é o padrão de vários emissores brasileiros).
 *
 * Estrutura esperada a partir de "LANÇAMENTOS NO BRASIL":
 *
 *   SILVIA SILVA            530034******6403   ← cabeçalho de portador
 *   06/07 LOJAS RENNER ...-3/3        83,94     ← lançamento (parcela 3 de 3)
 *   14/09 Pagamento de Fatura via PIX 3.681,09- ← crédito
 *   JEZIEL SANTOS           530034******2890   ← próximo portador
 *
 * Os blocos de portador continuam entre colunas e páginas.
 */

import { parseBRL, type Cents } from "../money";
import { addMonths, monthDiff, ym, type YearMonth } from "../month";
import type { PurchaseKind } from "../types";

export interface ParsedEntry {
  /** "DD/MM" como impresso */
  rawDate: string;
  date: string; // AAAA-MM-DD (ano inferido)
  description: string;
  amountCents: Cents;
  kind: PurchaseKind;
  installmentCurrent?: number;
  installmentTotal?: number;
  holder?: string;
  cardLast4?: string;
}

export interface ParsedStatement {
  issuer: string;
  accountHolder?: string;
  dueDate?: string;
  /** Mês de vencimento (AAAA-MM). */
  month?: YearMonth;
  statementTotalCents?: Cents;
  /** "Lançamentos atuais/débitos" impresso no resumo. */
  declaredDebitsCents?: Cents;
  futureInstallmentsCents?: Cents;
  nextInvoiceInstallmentsCents?: Cents;
  cards: Array<{ holder: string; last4: string }>;
  entries: ParsedEntry[];
  /** Pagamentos da fatura anterior (não são gastos). */
  paymentsCents: Cents;
  /** Soma de todos os débitos lidos (todos os portadores) — usado para conferência. */
  debitsCents: Cents;
}

const MONEY = String.raw`\d{1,3}(?:\.\d{3})*,\d{2}`;
const ENTRY = new RegExp(String.raw`^(\d{2})\/(\d{2})\s+(.+?)\s+(-|${MONEY}-?)$`);
const HOLDER = /^([A-ZÀ-Ý][A-ZÀ-Ý.' ]+?)\s+\d{4,6}\*{3,}(\d{4})$/;
const INSTALLMENT = /\s*-\s*(\d{1,2})\s*\/\s*(\d{1,2})$/;
const SECTION_START = /LAN[ÇC]AMENTOS (NO BRASIL|NACIONAIS|NO EXTERIOR|INTERNACIONAIS)/i;
const FULL_DATE = /(\d{2})\/(\d{2})\/(\d{4})/;
const FEE = /\bIOF\b|ANUIDADE|TARIFA|ENCARGO|JUROS|MULTA/i;
const PAYMENT = /PAGAMENTO|PAGTO|PGTO/i;

function findMoney(lines: string[], pattern: RegExp): Cents | undefined {
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) {
      const cents = parseBRL(match[1]);
      if (cents !== null) return cents;
    }
  }
  return undefined;
}

function isoFromFull(match: RegExpMatchArray): string {
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function findDueDate(lines: string[]): string | undefined {
  for (let i = 0; i < lines.length; i++) {
    if (!/VENCIMENTO/i.test(lines[i])) continue;
    for (let j = i; j <= Math.min(i + 2, lines.length - 1); j++) {
      const match = lines[j].match(FULL_DATE);
      if (match) return isoFromFull(match);
    }
  }
  return undefined;
}

function detectIssuer(text: string): string {
  const upper = text.toUpperCase();
  if (upper.includes("CARREFOUR")) return "Carrefour";
  if (upper.includes("NUBANK") || upper.includes("NU PAGAMENTOS")) return "Nubank";
  if (upper.includes("ITAÚ") || upper.includes("ITAU")) return "Itaú";
  if (upper.includes("BRADESCO")) return "Bradesco";
  if (upper.includes("SANTANDER")) return "Santander";
  if (upper.includes("BANCO INTER")) return "Inter";
  return "Cartão";
}

/**
 * Infere o ano de um lançamento "DD/MM".
 * Compras parceladas aparecem meses (ou mais de um ano) depois da compra, então
 * a referência é o mês provável da compra: (mês da fatura − parcela atual).
 */
export function inferEntryDate(
  day: number,
  month: number,
  invoiceMonth: YearMonth,
  installmentCurrent?: number,
): string {
  const invoiceYear = Number(invoiceMonth.slice(0, 4));
  const target = addMonths(invoiceMonth, -(installmentCurrent ?? 1));
  let best = ym(invoiceYear, month);
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const year of [invoiceYear, invoiceYear - 1, invoiceYear - 2]) {
    const candidate = ym(year, month);
    if (candidate > invoiceMonth) continue;
    const distance = Math.abs(monthDiff(candidate, target));
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return `${best}-${String(day).padStart(2, "0")}`;
}

export function parseStatement(lines: string[], fallbackMonth: YearMonth): ParsedStatement {
  const text = lines.join("\n");
  const dueDate = findDueDate(lines);
  const month = dueDate ? dueDate.slice(0, 7) : undefined;
  const invoiceMonth = month ?? fallbackMonth;
  const accountHolder = text.match(/TITULAR:\s*([A-ZÀ-Ý][A-ZÀ-Ý.' ]+?)\s*$/m)?.[1]?.trim();

  const result: ParsedStatement = {
    issuer: detectIssuer(text),
    accountHolder,
    dueDate,
    month,
    statementTotalCents:
      findMoney(lines, /TOTAL DA FATURA ATUAL:?\s*R\$\s*([\d.]+,\d{2})/i) ??
      findMoney(lines, /TOTAL DA (?:SUA )?FATURA:?\s*R\$\s*([\d.]+,\d{2})/i),
    declaredDebitsCents: findMoney(lines, /Lan[çc]amentos atuais\/d[ée]bitos:?\s*R\$\s*([\d.]+,\d{2})/i),
    futureInstallmentsCents: findMoney(lines, /Total de parcelas a pagar:?\s*R\$\s*([\d.]+,\d{2})/i),
    nextInvoiceInstallmentsCents: findMoney(lines, /a vencer na pr[óo]xima fatura:?\s*R\$\s*([\d.]+,\d{2})/i),
    cards: [],
    entries: [],
    paymentsCents: 0,
    debitsCents: 0,
  };

  let inSection = false;
  let holder: string | undefined;
  let cardLast4: string | undefined;

  for (const raw of lines) {
    const line = raw.trim();
    if (!inSection) {
      if (SECTION_START.test(line)) inSection = true;
      continue;
    }

    const holderMatch = line.match(HOLDER);
    if (holderMatch) {
      holder = holderMatch[1].trim();
      cardLast4 = holderMatch[2];
      if (!result.cards.some((c) => c.last4 === cardLast4)) {
        result.cards.push({ holder, last4: cardLast4 });
      }
      continue;
    }

    const entry = line.match(ENTRY);
    if (!entry) continue;
    const [, dd, mm, rawDescription, rawValue] = entry;
    if (rawValue === "-") continue; // ex.: "Tarifa de Anuidade com desconto -" (valor zero)

    const isCredit = rawValue.endsWith("-");
    const cents = Math.abs(parseBRL(rawValue) ?? 0);
    if (cents === 0) continue;

    let description = rawDescription.trim();
    let installmentCurrent: number | undefined;
    let installmentTotal: number | undefined;
    const installment = description.match(INSTALLMENT);
    if (installment) {
      const current = Number(installment[1]);
      const total = Number(installment[2]);
      if (current >= 1 && total >= current && total > 1) {
        installmentCurrent = current;
        installmentTotal = total;
        description = description.slice(0, installment.index).trim();
      }
    }
    description = prettifyDescription(description);

    if (isCredit && PAYMENT.test(description)) {
      result.paymentsCents += cents;
      continue;
    }

    const kind: PurchaseKind = isCredit ? "refund" : FEE.test(description) ? "fee" : "purchase";
    if (!isCredit) result.debitsCents += cents;

    result.entries.push({
      rawDate: `${dd}/${mm}`,
      date: inferEntryDate(Number(dd), Number(mm), invoiceMonth, installmentCurrent),
      description,
      amountCents: isCredit ? -cents : cents,
      kind,
      installmentCurrent,
      installmentTotal,
      holder,
      cardLast4,
    });
  }

  return result;
}

const LOWER_WORDS = new Set(["de", "da", "do", "das", "dos", "e", "com"]);

function titleWord(word: string, index: number): string {
  // Palavras com maiúsculas e minúsculas misturadas (ex.: "UberRides") ficam como estão.
  if (word !== word.toUpperCase()) return word;
  const lower = word.toLowerCase();
  if (index > 0 && LOWER_WORDS.has(lower)) return lower;
  return lower.replace(/(^|[*.\-/])(\p{L})/gu, (_, sep: string, letter: string) => sep + letter.toUpperCase());
}

/**
 * "SUPERMERCADO GUANABARA, RIO DE JANEIR" → "Supermercado Guanabara".
 * Remove a cidade truncada que o banco anexa depois da vírgula e suaviza a caixa alta.
 */
export function prettifyDescription(raw: string): string {
  let text = raw.replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").trim();
  const city = text.match(/, ([\p{L} .]{2,18})$/u);
  if (city && city.index! > 2) text = text.slice(0, city.index);
  return text
    .split(" ")
    .map((word, i) => titleWord(word, i))
    .join(" ");
}

export function normalizeHolder(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
