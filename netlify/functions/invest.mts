/**
 * POST /api/invest — recomendação de aportes em FIIs que pagam todo mês.
 *
 * Regras de negócio ficam aqui (servidor), não no app:
 *  1. Busca cotação e dividendos dos últimos 12 meses na brapi.dev; se a brapi
 *     não trouxer proventos, usa o DY (12M) publicado no Investidor10.
 *  2. Classifica cada fundo por como reage aos juros (CDI, IPCA, tijolo).
 *  3. Pontua por dividend yield e regularidade dos pagamentos mensais.
 *  4. Distribui o aporte cota a cota, mirando a alocação-alvo do perfil
 *     "renda passiva / moderado": juros pós-fixados > inflação > tijolo.
 *
 * Variável de ambiente obrigatória no Netlify: BRAPI_TOKEN.
 */

type Bucket = "cdi" | "ipca" | "tijolo";

/** Universo curado: FIIs líquidos, pagadores mensais, com cota acessível. */
const UNIVERSE: Record<string, { bucket: Bucket; note: string }> = {
  MXRF11: { bucket: "cdi", note: "Papel híbrido, cota baixa e muito líquido" },
  VGHF11: { bucket: "cdi", note: "Multiestratégia de crédito, cota baixa" },
  VGIR11: { bucket: "cdi", note: "CRIs atrelados ao CDI: rende mais com juros altos" },
  KNCR11: { bucket: "cdi", note: "CRIs de alta qualidade atrelados ao CDI" },
  RZAK11: { bucket: "cdi", note: "Crédito imobiliário pós-fixado" },
  GARE11: { bucket: "tijolo", note: "Galpões e varejo com cota baixa, paga todo mês" },
  CPTS11: { bucket: "ipca", note: "CRIs em IPCA: protege da inflação" },
  KNIP11: { bucket: "ipca", note: "CRIs em IPCA de baixo risco" },
  RECR11: { bucket: "ipca", note: "Crédito imobiliário majoritariamente em IPCA" },
  IRDM11: { bucket: "ipca", note: "Crédito diversificado em IPCA e CDI" },
  HGLG11: { bucket: "tijolo", note: "Galpões logísticos: diversifica fora do crédito" },
  BTLG11: { bucket: "tijolo", note: "Logística com contratos longos" },
  XPML11: { bucket: "tijolo", note: "Shoppings: aluguel corrigido pela inflação" },
  TRXF11: { bucket: "tijolo", note: "Imóveis de varejo com contratos atípicos" },
};

/**
 * Ideias fora do perfil: pagam todo mês e pagam bem, mas com risco maior
 * (agro, infraestrutura, crédito high yield). Nunca entram na alocação.
 */
const IDEAS: Record<string, { kind: string; note: string; risk: string }> = {
  KNCA11: { kind: "Fiagro", note: "Crédito do agronegócio, paga todo mês", risk: "Depende da safra e do crédito rural" },
  VGIA11: { kind: "Fiagro", note: "CRAs com cota baixa e yield alto", risk: "Concentração em poucos devedores do agro" },
  SNAG11: { kind: "Fiagro", note: "Crédito agro diversificado", risk: "Inadimplência no agro afeta os rendimentos" },
  CPTI11: { kind: "FI-Infra", note: "Debêntures de infraestrutura, isento de IR", risk: "Cota oscila com a curva de juros longos" },
  KDIF11: { kind: "FI-Infra", note: "Infraestrutura incentivada, paga todo mês", risk: "Cota alta e sensível aos juros longos" },
  HGCR11: { kind: "FII high grade", note: "CRIs com garantias fortes", risk: "Rendimento cai quando o CDI cai" },
  RBRY11: { kind: "FII high yield", note: "CRIs high yield com retorno acima da média", risk: "Risco de crédito maior que os de papel tradicionais" },
};

/**
 * Perfil conservador de aportes pequenos: só cotas de até R$ 20 entram nas
 * recomendações e no simulador. As mais caras viram "ideias".
 */
const MAX_PROFILE_PRICE_CENTS = 2000;
const inProfile = (a: Asset) => a.bucket !== null && a.priceCents <= MAX_PROFILE_PRICE_CENTS;

const TARGET: Record<Bucket, number> = { cdi: 0.45, ipca: 0.35, tijolo: 0.2 };
const BUCKET_LABEL: Record<Bucket, string> = { cdi: "Juros (CDI)", ipca: "Inflação (IPCA)", tijolo: "Tijolo" };

interface Asset {
  ticker: string;
  name: string;
  bucket: Bucket | null;
  note: string;
  priceCents: number;
  /** Proventos pagos por cota nos últimos 12 meses, em centavos. */
  dividends12mCents: number | null;
  monthsPaid: number | null;
  dividendYield: number | null;
  score: number;
}

interface BrapiQuote {
  symbol: string;
  shortName?: string;
  longName?: string;
  regularMarketPrice?: number;
  dividendsData?: { cashDividends?: Array<{ paymentDate?: string; rate?: number }> };
}

/** Segundo motor: lê o "DY (12M)" da página pública do ativo no Investidor10. */
async function investidor10Yield(ticker: string): Promise<number | null> {
  const kind = /11$/.test(ticker) ? "fiis" : "acoes";
  const response = await fetch(`https://investidor10.com.br/${kind}/${ticker.toLowerCase()}/`, {
    headers: { "User-Agent": "Mozilla/5.0 (controle-financeiro)" },
  });
  if (!response.ok) return null;
  const match = (await response.text()).match(/DY \(12M\)\s*:\s*([\d.,]+)%/);
  return match ? Number(match[1].replace(/\./g, "").replace(",", ".")) / 100 : null;
}

let lastError: string | null = null;

const cache = new Map<string, { at: number; asset: Asset | null }>();
const CACHE_MS = 30 * 60 * 1000;

async function fetchAsset(ticker: string, token: string): Promise<Asset | null> {
  const hit = cache.get(ticker);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.asset;

  const base = `https://brapi.dev/api/quote/${encodeURIComponent(ticker)}?token=${encodeURIComponent(token)}`;
  // O plano grátis pode recusar o módulo de dividendos: cai para só a cotação
  // e o DY vem do Investidor10.
  let response = await fetch(`${base}&dividends=true`);
  if (!response.ok) response = await fetch(base);
  const json = (await response.json().catch(() => ({}))) as { results?: BrapiQuote[]; message?: string };
  if (!response.ok) {
    lastError = `brapi (${response.status}): ${json.message ?? "erro desconhecido"}`;
    return null;
  }
  const quote = json.results?.[0];
  if (!quote?.regularMarketPrice) return null;

  // Só proventos já pagos: a brapi também lista os anunciados para datas futuras.
  const now = Date.now();
  const since = now - 365 * 24 * 60 * 60 * 1000;
  const paid = quote.dividendsData?.cashDividends?.filter((d) => {
    const at = d.paymentDate ? Date.parse(d.paymentDate) : NaN;
    return at >= since && at <= now && d.rate;
  });
  const priceCents = Math.round(quote.regularMarketPrice * 100);
  let dividends12mCents = paid?.length ? Math.round(paid.reduce((sum, d) => sum + (d.rate ?? 0), 0) * 100) : null;
  const monthsPaid = paid?.length ? new Set(paid.map((d) => d.paymentDate!.slice(0, 7))).size : null;
  if (dividends12mCents === null) {
    const dy = await investidor10Yield(ticker).catch(() => null);
    if (dy !== null) dividends12mCents = Math.round(dy * priceCents);
  }
  const dividendYield = dividends12mCents !== null ? dividends12mCents / priceCents : null;
  const info = UNIVERSE[ticker];

  // Yield conta até 16% a.a. (acima disso costuma ser risco, não oportunidade);
  // regularidade mensal pesa porque o objetivo é renda caindo todo mês.
  const yieldScore = dividendYield !== null ? Math.min(dividendYield, 0.16) / 0.16 : 0.5;
  const regularity = monthsPaid !== null ? Math.min(monthsPaid, 12) / 12 : 0.5;
  const asset: Asset = {
    ticker,
    name: quote.longName ?? quote.shortName ?? ticker,
    bucket: info?.bucket ?? null,
    note: info?.note ?? "",
    priceCents,
    dividends12mCents,
    monthsPaid,
    dividendYield,
    score: yieldScore * 0.6 + regularity * 0.4,
  };
  cache.set(ticker, { at: Date.now(), asset });
  return asset;
}

interface Pick {
  ticker: string;
  quantity: number;
  priceCents: number;
  costCents: number;
  reason: string;
}

/**
 * Compra cota a cota mirando a alocação-alvo. Com `goal`, o orçamento é livre
 * e para quando a renda mensal estimada da carteira atinge a meta.
 */
function allocate(
  assets: Asset[],
  positions: Map<string, number>,
  budgetCents: number,
  goal?: { incomeCents: number; targetCents: number },
): Pick[] {
  const eligible = assets.filter((a) => inProfile(a) && a.score >= 0.55 && (!goal || a.dividends12mCents));
  let income = goal?.incomeCents ?? 0;
  let guard = 200_000;
  const value: Record<Bucket, number> = { cdi: 0, ipca: 0, tijolo: 0 };
  for (const a of assets) if (a.bucket) value[a.bucket] += (positions.get(a.ticker) ?? 0) * a.priceCents;

  const picks = new Map<string, Pick>();
  let remaining = budgetCents;
  for (;;) {
    if (goal && income >= goal.targetCents) break;
    if (--guard < 0) break;
    const total = value.cdi + value.ipca + value.tijolo;
    // Bucket mais abaixo do alvo primeiro; dentro dele, melhor pontuação que caiba no orçamento.
    const order = (Object.keys(TARGET) as Bucket[]).sort(
      (x, y) => (value[x] / (total || 1) - TARGET[x]) - (value[y] / (total || 1) - TARGET[y]),
    );
    let chosen: Asset | undefined;
    for (const bucket of order) {
      chosen = eligible
        .filter((a) => a.bucket === bucket && a.priceCents <= remaining)
        .sort((x, y) => y.score - x.score)[0];
      if (chosen) break;
    }
    if (!chosen) break;
    remaining -= chosen.priceCents;
    income += (chosen.dividends12mCents ?? 0) / 12;
    value[chosen.bucket!] += chosen.priceCents;
    const current = picks.get(chosen.ticker);
    if (current) {
      current.quantity += 1;
      current.costCents += chosen.priceCents;
    } else {
      const dy = chosen.dividendYield !== null ? ` · DY ${(chosen.dividendYield * 100).toFixed(1)}% a.a.` : "";
      picks.set(chosen.ticker, {
        ticker: chosen.ticker,
        quantity: 1,
        priceCents: chosen.priceCents,
        costCents: chosen.priceCents,
        reason: `${BUCKET_LABEL[chosen.bucket!]}: ${chosen.note}${dy}`,
      });
    }
  }
  return [...picks.values()];
}

export default async (request: Request): Promise<Response> => {
  if (request.method !== "POST") return Response.json({ error: "Use POST" }, { status: 405 });
  const token = process.env.BRAPI_TOKEN;
  if (!token) return Response.json({ error: "BRAPI_TOKEN não configurado no Netlify." }, { status: 500 });

  let body: { holdings?: Array<{ ticker?: unknown; quantity?: unknown }>; budgetCents?: unknown; goalCents?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "JSON inválido" }, { status: 400 });
  }
  const positions = new Map<string, number>();
  for (const h of body.holdings ?? []) {
    const ticker = String(h.ticker ?? "").toUpperCase();
    const quantity = Number(h.quantity);
    if (/^[A-Z0-9]{4,7}$/.test(ticker) && Number.isInteger(quantity) && quantity > 0) {
      positions.set(ticker, (positions.get(ticker) ?? 0) + quantity);
    }
  }
  const budgetCents = Math.max(0, Math.min(10_000_000, Math.round(Number(body.budgetCents) || 0)));
  const goalCents = Math.max(0, Math.min(2_000_000, Math.round(Number(body.goalCents) || 0)));

  lastError = null;
  const tickers = [...new Set([...positions.keys(), ...Object.keys(UNIVERSE), ...Object.keys(IDEAS)])];
  const assets = (await Promise.all(tickers.map((t) => fetchAsset(t, token).catch(() => null)))).filter(
    (a): a is Asset => a !== null,
  );
  if (assets.length === 0) {
    return Response.json({ error: lastError ?? "Nenhuma cotação disponível agora." }, { status: 502 });
  }
  const byTicker = new Map(assets.map((a) => [a.ticker, a]));

  const portfolio = [...positions].map(([ticker, quantity]) => {
    const a = byTicker.get(ticker);
    return {
      ticker,
      quantity,
      priceCents: a?.priceCents ?? null,
      valueCents: a ? a.priceCents * quantity : null,
      monthlyIncomeCents: a?.dividends12mCents != null ? Math.round((a.dividends12mCents * quantity) / 12) : null,
      dividendYield: a?.dividendYield ?? null,
    };
  });

  const picks = allocate(assets, positions, budgetCents);
  const incomeCents = portfolio.reduce((s, p) => s + (p.monthlyIncomeCents ?? 0), 0);

  function simulate() {
    if (!goalCents) return null;
    const goalPicks = allocate(assets, positions, Number.MAX_SAFE_INTEGER, { incomeCents, targetCents: goalCents });
    const costCents = goalPicks.reduce((s, p) => s + p.costCents, 0);
    const addedIncome = goalPicks.reduce((s, p) => {
      const a = byTicker.get(p.ticker);
      return s + ((a?.dividends12mCents ?? 0) * p.quantity) / 12;
    }, 0);
    return {
      goalCents,
      picks: goalPicks,
      costCents,
      monthlyIncomeCents: Math.round(incomeCents + addedIncome),
      reached: incomeCents + addedIncome >= goalCents,
      // Sem reinvestir os rendimentos: estimativa conservadora.
      monthsAtBudget: budgetCents > 0 ? Math.ceil(costCents / budgetCents) : null,
    };
  }

  // Ideias: fora do perfil por tipo (IDEAS) ou por preço (cota acima do teto).
  const pricey = assets
    .filter((a) => a.bucket && !inProfile(a))
    .map((a) => [a.ticker, { kind: `${BUCKET_LABEL[a.bucket!]} · cota alta`, note: a.note, risk: "Cota acima do seu padrão: cada aporte compra menos cotas" }] as const);
  const ideas = [...Object.entries(IDEAS), ...pricey]
    .map(([ticker, info]) => ({ ticker, ...info, asset: byTicker.get(ticker) }))
    .filter((i) => i.asset && i.asset.dividendYield !== null)
    .sort((x, y) => (y.asset!.dividendYield ?? 0) - (x.asset!.dividendYield ?? 0))
    .map(({ asset, ...info }) => ({
      ...info,
      priceCents: asset!.priceCents,
      dividendYield: asset!.dividendYield,
      monthsPaid: asset!.monthsPaid,
    }));
  const ranking = assets
    .filter(inProfile)
    .sort((x, y) => y.score - x.score)
    .slice(0, 8)
    .map((a) => ({
      ticker: a.ticker,
      name: a.name,
      bucket: BUCKET_LABEL[a.bucket!],
      note: a.note,
      priceCents: a.priceCents,
      dividendYield: a.dividendYield,
      monthsPaid: a.monthsPaid,
    }));

  return Response.json({
    generatedAt: new Date().toISOString(),
    portfolio,
    totals: {
      valueCents: portfolio.reduce((s, p) => s + (p.valueCents ?? 0), 0),
      monthlyIncomeCents: incomeCents,
    },
    picks,
    leftoverCents: budgetCents - picks.reduce((s, p) => s + p.costCents, 0),
    ranking,
    simulation: simulate(),
    ideas,
  });
};

export const config = { path: "/api/invest" };
