/**
 * Relatório agendado da carteira: 8h, 14h e 20h (Brasília).
 *
 * Lê a carteira e a lista de observação da sala de sincronização no Firebase,
 * roda o radar de tendência (lib/market) e envia o resumo por push via ntfy.
 *
 * Variáveis de ambiente no Netlify:
 *  - BRAPI_TOKEN               cotações
 *  - FIREBASE_DATABASE_URL     ex.: https://seu-projeto-default-rtdb.firebaseio.com
 *  - SYNC_CODE                 código de sincronização usado no app (Ajustes)
 *  - FIREBASE_DB_SECRET        opcional, se as regras do banco exigirem autenticação
 *  - NTFY_TOPIC                tópico do app ntfy (instale o ntfy no celular e assine o tópico)
 */

import { buildMarket, type MarketRow, type Position } from "../lib/market";

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pc = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1).replace(".", ",")}%`;

async function readRoom<T>(path: string): Promise<T | null> {
  const base = process.env.FIREBASE_DATABASE_URL!.replace(/\/$/, "");
  const secret = process.env.FIREBASE_DB_SECRET;
  const url = `${base}/sync_rooms/${encodeURIComponent(process.env.SYNC_CODE!)}/v3/${path}.json${secret ? `?auth=${encodeURIComponent(secret)}` : ""}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Firebase (${response.status}) ao ler ${path}`);
  return (await response.json()) as T | null;
}

function greeting(): string {
  const hour = Number(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
  return hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
}

function line(r: MarketRow): string {
  const day = r.change1d !== null ? ` (${pc(r.change1d)} hoje)` : "";
  return `• ${r.ticker} ${brl(r.priceCents)}${day}: ${r.message}`;
}

export function composeReport(rows: MarketRow[]): { title: string; body: string; priority: number } {
  const sell = rows.filter((r) => r.signal === "vender");
  const buy = rows.filter((r) => r.signal === "comprar");
  const watch = rows.filter((r) => r.signal === "observar" && (r.owned || r.targetCents));
  const owned = rows.filter((r) => r.owned);
  const dayCents = owned.reduce((s, r) => s + (r.change1d !== null ? Math.round((r.priceCents * r.change1d * r.owned) / (1 + r.change1d)) : 0), 0);
  const gainCents = owned.reduce((s, r) => s + (r.gainCents ?? 0), 0);

  const parts: string[] = [];
  if (sell.length) parts.push(`VENDER (lucro bom):\n${sell.map(line).join("\n")}`);
  if (buy.length) parts.push(`COMPRAR (em queda / no alvo):\n${buy.map(line).join("\n")}`);
  if (watch.length) parts.push(`DE OLHO:\n${watch.map(line).join("\n")}`);
  if (!parts.length) parts.push("Nenhum sinal de compra ou venda agora. Carteira segue rendendo proventos.");
  if (owned.length) {
    parts.push(
      `Carteira hoje: ${dayCents >= 0 ? "+" : ""}${brl(dayCents)}` +
        (owned.some((r) => r.gainCents !== null) ? ` · resultado total ${gainCents >= 0 ? "+" : ""}${brl(gainCents)}` : ""),
    );
  }
  const counts = [sell.length && `${sell.length} p/ vender`, buy.length && `${buy.length} p/ comprar`].filter(Boolean).join(", ");
  return {
    title: `${greeting()}! Ações${counts ? `: ${counts}` : ""}`,
    body: parts.join("\n\n"),
    priority: sell.length || buy.length ? 4 : 2,
  };
}

export default async (): Promise<Response> => {
  const { BRAPI_TOKEN: token, NTFY_TOPIC: topic, FIREBASE_DATABASE_URL, SYNC_CODE } = process.env;
  if (!token || !topic || !FIREBASE_DATABASE_URL || !SYNC_CODE) {
    console.error("invest-alert: configure BRAPI_TOKEN, NTFY_TOPIC, FIREBASE_DATABASE_URL e SYNC_CODE no Netlify.");
    return new Response("missing env", { status: 500 });
  }

  const [holdings, watchlistRaw] = await Promise.all([
    readRoom<Record<string, { ticker?: string; quantity?: number; avgPriceCents?: number }>>("holdings"),
    readRoom<Record<string, number>>("settings/watchlist"),
  ]);
  const positions = new Map<string, Position>();
  for (const h of Object.values(holdings ?? {})) {
    const ticker = String(h?.ticker ?? "").toUpperCase();
    const quantity = Number(h?.quantity);
    if (!/^[A-Z0-9]{4,7}$/.test(ticker) || !(quantity > 0)) continue;
    const avg = Number(h.avgPriceCents);
    positions.set(ticker, { quantity: (positions.get(ticker)?.quantity ?? 0) + quantity, avgPriceCents: avg > 0 ? avg : null });
  }
  const watchlist: Record<string, number> = {};
  for (const [ticker, cents] of Object.entries(watchlistRaw ?? {})) if (Number(cents) > 0) watchlist[ticker] = Number(cents);

  const rows = await buildMarket(positions, watchlist, token);
  const report = composeReport(rows);

  // Publicação em JSON: aceita acentos no título sem codificar cabeçalhos.
  const response = await fetch("https://ntfy.sh/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic, title: report.title, message: report.body, priority: report.priority, tags: ["chart_with_upwards_trend"] }),
  });
  if (!response.ok) console.error(`invest-alert: ntfy respondeu ${response.status}`);
  return new Response("ok");
};

// 11h, 17h e 23h UTC = 8h, 14h e 20h em Brasília.
export const config = { schedule: "0 11,17,23 * * *" };
