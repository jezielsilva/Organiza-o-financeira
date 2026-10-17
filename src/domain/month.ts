/** Mês no formato "AAAA-MM". Strings nesse formato são comparáveis lexicograficamente. */
export type YearMonth = string;

const MONTHS_LONG = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const MONTHS_SHORT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function ym(year: number, month: number): YearMonth {
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function parseYm(value: YearMonth): { year: number; month: number } {
  const [year, month] = value.split("-").map(Number);
  return { year, month };
}

export function isYearMonth(value: unknown): value is YearMonth {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function currentMonth(now: Date = new Date()): YearMonth {
  return ym(now.getFullYear(), now.getMonth() + 1);
}

export function addMonths(value: YearMonth, offset: number): YearMonth {
  const { year, month } = parseYm(value);
  const index = year * 12 + (month - 1) + offset;
  return ym(Math.floor(index / 12), (index % 12) + 1);
}

/** Quantidade de meses de `from` até `to` (positivo se `to` é depois). */
export function monthDiff(from: YearMonth, to: YearMonth): number {
  const a = parseYm(from);
  const b = parseYm(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
}

export function monthRange(start: YearMonth, count: number): YearMonth[] {
  return Array.from({ length: count }, (_, i) => addMonths(start, i));
}

/** "Outubro de 2026" */
export function formatMonthLong(value: YearMonth): string {
  const { year, month } = parseYm(value);
  return `${MONTHS_LONG[month - 1]} de ${year}`;
}

/** "Outubro" */
export function formatMonthName(value: YearMonth): string {
  return MONTHS_LONG[parseYm(value).month - 1];
}

/** "out/26" */
export function formatMonthShort(value: YearMonth): string {
  const { year, month } = parseYm(value);
  return `${MONTHS_SHORT[month - 1]}/${String(year).slice(2)}`;
}

/** "2026-10-14" → "14/10/2026" */
export function formatDate(isoDate: string | undefined): string {
  if (!isoDate) return "—";
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

/** "2026-10-14" → "14 out" */
export function formatDateShort(isoDate: string | undefined): string {
  if (!isoDate) return "—";
  const [, m, d] = isoDate.split("-").map(Number);
  return `${d} ${MONTHS_SHORT[m - 1]}`;
}
