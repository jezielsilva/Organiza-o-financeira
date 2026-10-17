/**
 * Dinheiro é sempre representado em centavos inteiros (`Cents`) para evitar
 * erros de arredondamento de ponto flutuante (0.1 + 0.2 !== 0.3).
 */
export type Cents = number;

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

export function formatBRL(cents: Cents): string {
  return brl.format(cents / 100);
}

/** Formata com sinal explícito: "+ R$ 10,00" / "− R$ 10,00". */
export function formatSignedBRL(cents: Cents): string {
  if (cents === 0) return formatBRL(0);
  return `${cents > 0 ? "+" : "−"} ${formatBRL(Math.abs(cents))}`;
}

export function toCents(value: number): Cents {
  return Math.round(value * 100);
}

/**
 * Converte texto digitado ou lido de PDF em centavos.
 * Aceita "1.234,56", "1234,56", "12,5", "R$ 10", "10.50" e "-12,00".
 * Retorna `null` quando não há número reconhecível.
 */
export function parseBRL(input: string): Cents | null {
  let s = input.replace(/R\$/gi, "").replace(/\s/g, "");
  if (!s) return null;
  const negative = s.startsWith("-") || s.endsWith("-");
  s = s.replace(/-/g, "");
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0) {
    // Vírgula é o separador decimal brasileiro; pontos são milhares.
    normalized = s.slice(0, lastComma).replace(/[.,]/g, "") + "." + s.slice(lastComma + 1);
  } else if (lastDot >= 0 && s.length - lastDot - 1 <= 2 && s.indexOf(".") === lastDot) {
    // "10.5" ou "10.50": um único ponto seguido de 1–2 dígitos é decimal.
    normalized = s;
  } else {
    normalized = s.replace(/\./g, "");
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return negative ? -cents : cents;
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

/** Divide um total em N parcelas; a última absorve a diferença de centavos. */
export function splitInstallments(total: Cents, count: number): Cents[] {
  const base = Math.floor(total / count);
  const parts = Array.from({ length: count }, () => base);
  parts[count - 1] += total - base * count;
  return parts;
}
