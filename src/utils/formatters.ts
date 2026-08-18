/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo utilitário focado exclusivamente em formatações de moeda e manipulação de datas.
 */

// Formata valores em Reais (BRL)
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// Retorna o mês corrente do sistema do usuário no formato "AAAA-MM" (ex: "2026-08")
export function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

// Formata strings "AAAA-MM" para exibição (ex: "2026-07" -> "Julho / 2026")
export function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
}

// Retorna a diferença em meses entre duas datas "AAAA-MM" (fim - início)
export function getMonthDiff(startStr: string, endStr: string): number {
  const [startYear, startMonth] = startStr.split("-").map(Number);
  const [endYear, endMonth] = endStr.split("-").map(Number);
  return (endYear - startYear) * 12 + (endMonth - startMonth);
}

// Adiciona N meses a uma data "AAAA-MM"
export function addMonths(yearMonth: string, offset: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Gera uma lista consecutiva de meses "AAAA-MM" a partir de uma data inicial
export function getMonthsRange(startYearMonth: string, count: number): string[] {
  const list: string[] = [];
  for (let i = 0; i < count; i++) {
    list.push(addMonths(startYearMonth, i));
  }
  return list;
}
