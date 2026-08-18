/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Núcleo Transversal (Core Shared) — Formatação de moeda BRL e manipuladores de data.
 */

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
}

export function getMonthDiff(startStr: string, endStr: string): number {
  const [startYear, startMonth] = startStr.split("-").map(Number);
  const [endYear, endMonth] = endStr.split("-").map(Number);
  return (endYear - startYear) * 12 + (endMonth - startMonth);
}

export function addMonths(yearMonth: string, offset: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function getMonthsRange(startYearMonth: string, count: number): string[] {
  const list: string[] = [];
  for (let i = 0; i < count; i++) {
    list.push(addMonths(startYearMonth, i));
  }
  return list;
}
