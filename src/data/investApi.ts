/** Cliente da função /api/invest (Netlify). Toda a regra de recomendação fica no servidor. */

import type { Holding } from "../domain/types";

export interface InvestPick {
  ticker: string;
  quantity: number;
  priceCents: number;
  costCents: number;
  reason: string;
}

export interface InvestSimulation {
  goalCents: number;
  picks: InvestPick[];
  costCents: number;
  monthlyIncomeCents: number;
  reached: boolean;
  monthsAtBudget: number | null;
}

export interface InvestIdea {
  ticker: string;
  kind: string;
  note: string;
  risk: string;
  priceCents: number;
  dividendYield: number | null;
  monthsPaid: number | null;
}

export type MarketSignal = "comprar" | "vender" | "observar" | "manter";

export interface MarketRow {
  ticker: string;
  name: string;
  note: string;
  priceCents: number;
  dividendYield: number | null;
  change1d: number | null;
  change30d: number | null;
  low52Cents: number | null;
  high52Cents: number | null;
  rangePosition: number | null;
  drawdown: number | null;
  owned: number;
  avgPriceCents: number | null;
  gainCents: number | null;
  gainPct: number | null;
  targetCents: number | null;
  signal: MarketSignal;
  message: string;
}

export interface InvestReport {
  generatedAt: string;
  portfolio: Array<{
    ticker: string;
    quantity: number;
    priceCents: number | null;
    valueCents: number | null;
    monthlyIncomeCents: number | null;
    dividendYield: number | null;
  }>;
  totals: { valueCents: number; monthlyIncomeCents: number };
  picks: InvestPick[];
  leftoverCents: number;
  ranking: Array<{
    ticker: string;
    name: string;
    bucket: string;
    note: string;
    priceCents: number;
    dividendYield: number | null;
    monthsPaid: number | null;
  }>;
  simulation: InvestSimulation | null;
  ideas: InvestIdea[];
  market: MarketRow[];
}

export async function fetchInvestReport(
  holdings: Holding[],
  budgetCents: number,
  goalCents: number,
  watchlist: Record<string, number>,
  signal?: AbortSignal,
): Promise<InvestReport> {
  const response = await fetch("/api/invest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ holdings: holdings.map(({ ticker, quantity, avgPriceCents }) => ({ ticker, quantity, avgPriceCents })), budgetCents, goalCents, watchlist }),
    signal,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || !json) throw new Error(json?.error ?? "Não foi possível buscar as cotações agora.");
  return json as InvestReport;
}
