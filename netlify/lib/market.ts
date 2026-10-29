/**
 * Cotações (brapi.dev + Investidor10) e leitura de tendência, compartilhadas
 * entre /api/invest e o relatório agendado. Regras de compra/venda ficam aqui.
 */

export interface Quote {
  ticker: string;
  name: string;
  priceCents: number;
  /** Proventos pagos por cota nos últimos 12 meses, em centavos. */
  dividends12mCents: number | null;
  monthsPaid: number | null;
  dividendYield: number | null;
  /** Variação do dia e dos últimos ~30 dias (fração: -0.05 = -5%). */
  change1d: number | null;
  change30d: number | null;
  low52Cents: number | null;
  high52Cents: number | null;
}

interface BrapiQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  fiftyTwoWeekLow?: number;
  fiftyTwoWeekHigh?: number;
  historicalDataPrice?: Array<{ date?: number; close?: number | null }>;
  dividendsData?: { cashDividends?: Array<{ paymentDate?: string; rate?: number }> };
}

/** Units de ações também terminam em 11: não são FIIs. */
const STOCK_UNITS = new Set(["TAEE11", "KLBN11", "SAPR11", "ALUP11", "SANB11", "BPAC11"]);
export const isFii = (ticker: string) => /11$/.test(ticker) && !STOCK_UNITS.has(ticker);

/** Segundo motor: lê o "DY (12M)" da página pública do ativo no Investidor10. */
async function investidor10Yield(ticker: string): Promise<number | null> {
  const kind = isFii(ticker) ? "fiis" : "acoes";
  const response = await fetch(`https://investidor10.com.br/${kind}/${ticker.toLowerCase()}/`, {
    headers: { "User-Agent": "Mozilla/5.0 (controle-financeiro)" },
  });
  if (!response.ok) return null;
  const match = (await response.text()).match(/DY \(12M\)\s*:\s*([\d.,]+)%/);
  return match ? Number(match[1].replace(/\./g, "").replace(",", ".")) / 100 : null;
}

export const quoteErrors = { last: null as string | null };

const cache = new Map<string, { at: number; quote: Quote | null }>();
const CACHE_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function fetchQuote(ticker: string, token: string): Promise<Quote | null> {
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.quote;

  const base = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${encodeURIComponent(token)}`;
  // O plano grátis pode recusar módulos extras: cai para só a cotação.
  let response = await fetch(`${base}&range=3mo&interval=1d&dividends=true`);
  if (!response.ok) response = await fetch(`${base}&range=1mo&interval=1d`);
  if (!response.ok) response = await fetch(base);
  const json = (await response.json().catch(() => ({}))) as { results?: BrapiQuote[]; message?: string };
  if (!response.ok) {
    quoteErrors.last = `brapi (${response.status}): ${json.message ?? "erro desconhecido"}`;
    return null;
  }
  const q = json.results?.[0];
  if (!q?.regularMarketPrice) return null;

  // Só proventos já pagos: a brapi também lista os anunciados para datas futuras.
  const now = Date.now();
  const paid = q.dividendsData?.cashDividends?.filter((d) => {
    const at = d.paymentDate ? Date.parse(d.paymentDate) : NaN;
    return at >= now - 365 * DAY_MS && at <= now && d.rate;
  });
  const priceCents = Math.round(q.regularMarketPrice * 100);
  let dividends12mCents = paid?.length ? Math.round(paid.reduce((sum, d) => sum + (d.rate ?? 0), 0) * 100) : null;
  const monthsPaid = paid?.length ? new Set(paid.map((d) => d.paymentDate!.slice(0, 7))).size : null;
  if (dividends12mCents === null) {
    const dy = await investidor10Yield(ticker).catch(() => null);
    if (dy !== null) dividends12mCents = Math.round(dy * priceCents);
  }

  const history = (q.historicalDataPrice ?? [])
    .filter((h): h is { date: number; close: number } => !!h.date && !!h.close)
    .sort((a, b) => a.date - b.date);
  const monthAgo = history.find((h) => h.date * 1000 >= now - 30 * DAY_MS);
  const closes = history.map((h) => h.close);
  const low = q.fiftyTwoWeekLow ?? (closes.length ? Math.min(...closes) : null);
  const high = q.fiftyTwoWeekHigh ?? (closes.length ? Math.max(...closes) : null);

  const quote: Quote = {
    ticker,
    name: q.longName ?? q.shortName ?? ticker,
    priceCents,
    dividends12mCents,
    monthsPaid,
    dividendYield: dividends12mCents !== null ? dividends12mCents / priceCents : null,
    change1d: q.regularMarketChangePercent != null ? q.regularMarketChangePercent / 100 : null,
    change30d: monthAgo ? q.regularMarketPrice / monthAgo.close - 1 : null,
    low52Cents: low ? Math.round(low * 100) : null,
    high52Cents: high ? Math.round(high * 100) : null,
  };
  cache.set(ticker, { at: Date.now(), quote });
  return quote;
}

/**
 * Ações boas pagadoras, normalmente caras ou cíclicas: entram no radar para
 * comprar na queda e vender na alta, reinvestindo o lucro nos FIIs da carteira.
 */
export const OPPORTUNITIES: Record<string, string> = {
  JHSF3: "Shoppings e imóveis de alto padrão, paga proventos",
  TAEE11: "Transmissão de energia, dividendos altos e estáveis",
  BBAS3: "Banco com dividend yield alto",
  ITSA4: "Holding do Itaú, paga proventos com frequência",
  BBSE3: "Seguros, paga quase todo o lucro",
  CMIG4: "Energia, dividendos altos",
  PETR4: "Petróleo, dividendos altos e cíclicos",
  VALE3: "Mineração, dividendos cíclicos",
  CXSE3: "Seguros da Caixa, boa pagadora",
  ISAE4: "Transmissão de energia, contratos longos",
};

export type Signal = "comprar" | "vender" | "observar" | "manter";

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
  /** 0 = na mínima de 52 semanas, 1 = na máxima. */
  rangePosition: number | null;
  /** Queda desde a máxima de 52 semanas (fração positiva). */
  drawdown: number | null;
  owned: number;
  avgPriceCents: number | null;
  /** Lucro/prejuízo da posição se vender agora. */
  gainCents: number | null;
  gainPct: number | null;
  targetCents: number | null;
  signal: Signal;
  message: string;
}

const brl = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const pc = (v: number) => `${(v * 100).toFixed(1).replace(".", ",")}%`;

/** Lucro mínimo para sugerir venda, e quanto ele precisa superar os proventos de 12 meses. */
const SELL_GAIN_PCT = 0.15;
const BUY_DRAWDOWN = 0.15;
const BUY_RANGE = 0.3;
const FALLING_HARD = -0.1;
const MIN_DY = 0.04;

export function analyze(
  q: Quote,
  ctx: { note?: string; owned?: number; avgPriceCents?: number | null; targetCents?: number | null },
): MarketRow {
  const owned = ctx.owned ?? 0;
  const avg = ctx.avgPriceCents ?? null;
  const target = ctx.targetCents ?? null;
  const { low52Cents: low, high52Cents: high, priceCents: price } = q;
  const rangePosition = low !== null && high !== null && high > low ? (price - low) / (high - low) : null;
  const drawdown = high ? Math.max(0, 1 - price / high) : null;
  const gainCents = owned && avg ? (price - avg) * owned : null;
  const gainPct = avg ? price / avg - 1 : null;
  const income12m = (q.dividends12mCents ?? 0) * owned;
  const paysWell = (q.dividendYield ?? 0) >= MIN_DY;
  const fallingHard = (q.change30d ?? 0) <= FALLING_HARD;

  let signal: Signal = "manter";
  let message = owned ? "Segue rendendo proventos: mantenha." : "Sem sinal claro agora.";

  if (gainCents !== null && gainPct !== null && gainPct >= SELL_GAIN_PCT && gainCents > income12m) {
    signal = "vender";
    const months = q.dividends12mCents ? Math.round(gainCents / (income12m / 12)) : null;
    message =
      `Lucro de ${brl(gainCents)} (+${pc(gainPct)}) se vender agora` +
      (months ? `, o mesmo que ${months} meses de proventos dessa posição` : "") +
      ". Venda e reinvista nos FIIs que pagam todo mês.";
  } else if (target !== null && price <= target) {
    signal = "comprar";
    message = `Chegou no seu preço-alvo de ${brl(target)}.` + (fallingHard ? " Ainda caindo: compre aos poucos." : "");
  } else if (drawdown !== null && rangePosition !== null && drawdown >= BUY_DRAWDOWN && rangePosition <= BUY_RANGE && paysWell) {
    if (fallingHard) {
      signal = "observar";
      message = `Caiu ${pc(drawdown)} da máxima e segue em queda forte (${pc(q.change30d!)} em 30 dias). Espere estabilizar ou defina um preço-alvo.`;
    } else {
      signal = "comprar";
      message = `Caiu ${pc(drawdown)} da máxima de 52 semanas, perto da mínima, e paga DY de ${pc(q.dividendYield!)}. Bom ponto para comprar e vender na alta.`;
    }
  } else if (owned && avg && price < avg && paysWell && !fallingHard) {
    signal = "comprar";
    message = `Abaixo do seu preço médio (${brl(avg)}): comprar mais baixa o médio e aumenta os proventos.`;
  } else if (fallingHard) {
    signal = "observar";
    message = `Em queda: ${pc(q.change30d!)} nos últimos 30 dias.`;
  } else if (drawdown !== null && drawdown < 0.03 && !owned) {
    message = "Perto da máxima de 52 semanas: caro agora.";
  }

  return {
    ticker: q.ticker,
    name: q.name,
    note: ctx.note ?? "",
    priceCents: price,
    dividendYield: q.dividendYield,
    change1d: q.change1d,
    change30d: q.change30d,
    low52Cents: low,
    high52Cents: high,
    rangePosition,
    drawdown,
    owned,
    avgPriceCents: avg,
    gainCents,
    gainPct,
    targetCents: target,
    signal,
    message,
  };
}

const SIGNAL_ORDER: Record<Signal, number> = { vender: 0, comprar: 1, observar: 2, manter: 3 };
export const bySignal = (a: MarketRow, b: MarketRow) =>
  SIGNAL_ORDER[a.signal] - SIGNAL_ORDER[b.signal] || (b.drawdown ?? 0) - (a.drawdown ?? 0);

export interface Position {
  quantity: number;
  avgPriceCents: number | null;
}

/** Análise da carteira + radar de oportunidades + lista de observação. */
export async function buildMarket(
  positions: Map<string, Position>,
  watchlist: Record<string, number>,
  token: string,
  quotes?: Map<string, Quote>,
): Promise<MarketRow[]> {
  const tickers = [...new Set([...positions.keys(), ...Object.keys(OPPORTUNITIES), ...Object.keys(watchlist)])];
  const rows = await Promise.all(
    tickers.map(async (ticker) => {
      const q = quotes?.get(ticker) ?? (await fetchQuote(ticker, token).catch(() => null));
      if (!q) return null;
      const p = positions.get(ticker);
      return analyze(q, {
        note: OPPORTUNITIES[ticker],
        owned: p?.quantity,
        avgPriceCents: p?.avgPriceCents,
        targetCents: watchlist[ticker] ?? null,
      });
    }),
  );
  return rows.filter((r): r is MarketRow => r !== null).sort(bySignal);
}
