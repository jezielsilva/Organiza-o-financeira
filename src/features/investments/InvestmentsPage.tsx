import {
  ArrowDownRight,
  ArrowUpRight,
  BellRing,
  CircleAlert,
  CircleCheck,
  Eye,
  Flag,
  Lightbulb,
  Plus,
  RefreshCw,
  Sprout,
  Target,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buyHoldings, deleteHolding, saveHolding, setInvestGoal, setWatch, undo } from "../../app/actions";
import { useAppState } from "../../app/store";
import { fetchInvestReport, type InvestPick, type InvestReport, type MarketRow, type MarketSignal } from "../../data/investApi";
import { formatBRL } from "../../domain/money";
import { newId, type Holding } from "../../domain/types";
import { Button, IconButton } from "../../ui/Button";
import { cn } from "../../ui/cn";
import { Alert, Badge, BigMoney, Card, EmptyState, SectionTitle } from "../../ui/display";
import { Field, MoneyInput, TextInput } from "../../ui/form";
import { Sheet } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";

/** Carteira inicial informada pelo usuário (FIIs de papel comprados no Nubank). */
const STARTER: Array<Pick<Holding, "ticker" | "quantity">> = [
  { ticker: "CPTS11", quantity: 6 },
  { ticker: "MXRF11", quantity: 4 },
  { ticker: "VGHF11", quantity: 4 },
];

const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`);
const signedPct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

const SIGNAL: Record<MarketSignal, { label: string; tone: "positive" | "negative" | "warning" | "neutral" | "accent" }> = {
  vender: { label: "Vender", tone: "accent" },
  comprar: { label: "Comprar", tone: "positive" },
  observar: { label: "De olho", tone: "warning" },
  manter: { label: "Manter", tone: "neutral" },
};

/** Variação colorida com seta (verde sobe, vermelho cai). */
function Change({ value, label }: { value: number | null; label: string }) {
  if (value === null) return null;
  const up = value >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={cn("tabular inline-flex items-center gap-0.5", up ? "text-positive" : "text-negative")}>
      <Icon className="size-3.5" aria-hidden />
      {signedPct(value)}
      <span className="text-muted">{label}</span>
    </span>
  );
}

/** Onde o preço está entre a mínima e a máxima de 52 semanas. */
function RangeBar({ row }: { row: MarketRow }) {
  if (row.rangePosition === null || row.low52Cents === null || row.high52Cents === null) return null;
  const at = Math.min(100, Math.max(0, row.rangePosition * 100));
  const target =
    row.targetCents !== null && row.high52Cents > row.low52Cents
      ? Math.min(100, Math.max(0, ((row.targetCents - row.low52Cents) / (row.high52Cents - row.low52Cents)) * 100))
      : null;
  return (
    <div className="mt-2" aria-label={`Faixa de 52 semanas: ${formatBRL(row.low52Cents)} a ${formatBRL(row.high52Cents)}`}>
      <div className="relative h-1.5 rounded-full bg-surface-2">
        <div className="absolute inset-y-0 left-0 rounded-full bg-line" style={{ width: `${at}%` }} />
        {target !== null && <span className="absolute -top-1 h-3.5 w-0.5 bg-warning" style={{ left: `${target}%` }} />}
        <span className="absolute -top-1 size-3.5 -translate-x-1/2 rounded-full border-2 border-surface bg-fg" style={{ left: `${at}%` }} />
      </div>
      <p className="tabular mt-1 flex justify-between text-[0.75rem] text-muted">
        <span>mín. 52s {formatBRL(row.low52Cents)}</span>
        <span>máx. {formatBRL(row.high52Cents)}</span>
      </p>
    </div>
  );
}

function MarketItem({ row, onBuy, onWatch }: { row: MarketRow; onBuy: (row: MarketRow) => void; onWatch: (row: MarketRow) => void }) {
  const signal = SIGNAL[row.signal];
  return (
    <li className="py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-semibold text-fg">
            {row.ticker}
            <Badge tone={signal.tone}>{signal.label}</Badge>
            {row.owned > 0 && <span className="text-[0.8125rem] font-normal text-muted">{row.owned} na carteira</span>}
          </p>
          {row.note && <p className="truncate text-[0.8125rem] text-muted">{row.note}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="tabular text-[0.9375rem] font-semibold text-fg">{formatBRL(row.priceCents)}</p>
          <p className="flex justify-end gap-2 text-[0.75rem]">
            <Change value={row.change1d} label="dia" />
            <Change value={row.change30d} label="30d" />
          </p>
        </div>
      </div>
      <RangeBar row={row} />
      <p className="mt-1.5 text-[0.8125rem] text-fg/85">{row.message}</p>
      <p className="tabular text-[0.75rem] text-muted">
        DY {pct(row.dividendYield)}
        {row.drawdown !== null && row.drawdown > 0.01 && ` · ${pct(row.drawdown)} abaixo da máxima`}
        {row.avgPriceCents !== null && ` · médio ${formatBRL(row.avgPriceCents)}`}
        {row.gainCents !== null && (
          <span className={row.gainCents >= 0 ? "text-positive" : "text-negative"}>
            {" "}· {row.gainCents >= 0 ? "+" : "−"}
            {formatBRL(Math.abs(row.gainCents))}
          </span>
        )}
        {row.targetCents !== null && ` · alvo ${formatBRL(row.targetCents)}`}
      </p>
      <div className="mt-2 flex gap-2">
        <Button size="sm" variant="secondary" icon={CircleCheck} onClick={() => onBuy(row)}>
          Comprei
        </Button>
        <Button size="sm" variant="ghost" icon={Target} onClick={() => onWatch(row)}>
          {row.targetCents !== null ? "Alvo" : "Definir alvo"}
        </Button>
      </div>
    </li>
  );
}

function WatchSheet({ open, onClose, row }: { open: boolean; onClose: () => void; row: Pick<MarketRow, "ticker" | "targetCents"> | null }) {
  const [ticker, setTicker] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setTicker(row?.ticker ?? "");
    setTarget(row?.targetCents ?? null);
    setError(undefined);
  }, [open, row]);

  const submit = () => {
    const code = ticker.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,7}$/.test(code)) return setError("Use o código da B3, ex.: JHSF3");
    setWatch(code, target);
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={row?.ticker ? `Preço-alvo de ${row.ticker}` : "Observar ação"}
      onSubmit={submit}
      footer={
        <div className="flex gap-2">
          {row?.targetCents != null && (
            <Button variant="secondary" onClick={() => { setWatch(row.ticker, null); onClose(); }}>
              Parar de observar
            </Button>
          )}
          <Button type="submit" block>Salvar</Button>
        </div>
      }
    >
      <div className="space-y-4">
        {!row?.ticker && (
          <Field label="Código" error={error}>
            <TextInput value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="JHSF3" autoCapitalize="characters" />
          </Field>
        )}
        <Field label="Comprar quando chegar em">
          <MoneyInput value={target} onChange={setTarget} />
        </Field>
        <p className="text-[0.8125rem] text-muted">Você recebe o aviso no relatório de 8h, 14h e 20h e o sinal aparece aqui.</p>
      </div>
    </Sheet>
  );
}

function PickList({ picks }: { picks: InvestPick[] }) {
  const toast = useToast();
  const buy = (items: InvestPick[]) => {
    const inverse = buyHoldings(items.map(({ ticker, quantity, priceCents }) => ({ ticker, quantity, priceCents })));
    const label = items.length === 1 ? `${items[0].quantity}× ${items[0].ticker}` : `${items.length} ativos`;
    toast({ message: `${label} adicionado à carteira`, action: { label: "Desfazer", onClick: () => undo(inverse) } });
  };
  return (
    <>
    <ul className="divide-y divide-line">
      {picks.map((p) => (
        <li key={p.ticker} className="py-3">
          <p className="flex items-baseline justify-between gap-3 text-[0.9375rem] font-semibold text-fg">
            <span>
              {p.quantity}× {p.ticker}
            </span>
            <span className="tabular">{formatBRL(p.costCents)}</span>
          </p>
          <p className="tabular text-[0.8125rem] text-fg/80">{formatBRL(p.priceCents)} por cota</p>
          <p className="text-[0.8125rem] text-muted">{p.reason}</p>
          <Button size="sm" variant="secondary" icon={CircleCheck} className="mt-2" onClick={() => buy([p])}>
            Comprei
          </Button>
        </li>
      ))}
    </ul>
    {picks.length > 1 && (
      <Button size="sm" icon={CircleCheck} block className="mt-1" onClick={() => buy(picks)}>
        Comprei tudo
      </Button>
    )}
    </>
  );
}

type HoldingDraft = Partial<Holding> & { ticker: string };

function HoldingSheet({ open, onClose, holding }: { open: boolean; onClose: () => void; holding: HoldingDraft | null }) {
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [avg, setAvg] = useState<number | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setTicker(holding?.ticker ?? "");
    setQuantity(holding?.quantity ? String(holding.quantity) : "");
    setAvg(holding?.avgPriceCents ?? null);
    setError(undefined);
  }, [open, holding]);

  const submit = () => {
    const code = ticker.trim().toUpperCase();
    const qty = Number(quantity);
    if (!/^[A-Z0-9]{4,7}$/.test(code)) return setError("Use o código da B3, ex.: MXRF11");
    if (!Number.isInteger(qty) || qty <= 0) return setError("Informe a quantidade de cotas");
    if (!holding?.id) {
      // Compra nova de um ativo que já existe: soma e recalcula o preço médio.
      buyHoldings([{ ticker: code, quantity: qty, priceCents: avg ?? undefined }]);
    } else {
      saveHolding({ id: holding.id, ticker: code, quantity: qty, ...(avg ? { avgPriceCents: avg } : {}) });
    }
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={holding?.id ? `Editar ${holding.ticker}` : holding?.ticker ? `Comprei ${holding.ticker}` : "Adicionar ativo"}
      onSubmit={submit}
      footer={<Button type="submit" block>Salvar</Button>}
    >
      <div className="space-y-4">
        <Field label="Código" error={error}>
          <TextInput value={ticker} onChange={(e) => setTicker(e.target.value)} placeholder="MXRF11" autoCapitalize="characters" />
        </Field>
        <Field label="Cotas">
          <TextInput value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="0" />
        </Field>
        <Field label={holding?.id ? "Preço médio por cota" : "Preço pago por cota"}>
          <MoneyInput value={avg} onChange={setAvg} />
        </Field>
        <p className="text-[0.8125rem] text-muted">Com o preço médio, o app calcula o lucro e avisa quando vale vender e reinvestir.</p>
      </div>
    </Sheet>
  );
}

export default function InvestmentsPage() {
  const holdingsMap = useAppState((s) => s.data.holdings);
  const holdings = useMemo(() => Object.values(holdingsMap).sort((a, b) => a.ticker.localeCompare(b.ticker)), [holdingsMap]);
  const toast = useToast();
  const savedGoal = useAppState((s) => s.data.settings.investGoalCents ?? null);
  const watchlist = useAppState((s) => s.data.settings.watchlist);
  const [budget, setBudget] = useState<number | null>(null);
  const [goal, setGoal] = useState<number | null>(savedGoal);
  const [report, setReport] = useState<InvestReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<{ holding: HoldingDraft | null } | null>(null);
  const [watching, setWatching] = useState<{ row: Pick<MarketRow, "ticker" | "targetCents"> | null } | null>(null);
  const abort = useRef<AbortController>(null);

  const load = useCallback(
    async (budgetCents: number, goalCents: number) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      setError(undefined);
      try {
        setReport(await fetchInvestReport(holdings, budgetCents, goalCents, watchlist ?? {}, controller.signal));
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [holdings, watchlist],
  );

  // A meta salva pode chegar do Firebase depois da tela abrir.
  useEffect(() => {
    if (savedGoal !== null) setGoal((current) => current ?? savedGoal);
  }, [savedGoal]);

  // Pesquisa a cada vez que a tela é aberta (e quando a carteira muda).
  useEffect(() => {
    void load(budget ?? 0, goal ?? 0);
    return () => abort.current?.abort();
  }, [load]);

  const byTicker = new Map(report?.portfolio.map((p) => [p.ticker, p]));
  const market = report?.market ?? [];
  const marketBy = new Map(market.map((m) => [m.ticker, m]));
  const signals = market.filter((m) => m.signal === "vender" || m.signal === "comprar" || (m.signal === "observar" && (m.owned || m.targetCents !== null)));
  const radar = market.filter((m) => !m.owned && !signals.includes(m));
  const owned = market.filter((m) => m.owned);
  const dayCents = owned.reduce((s, m) => s + (m.change1d !== null ? Math.round((m.priceCents * m.change1d * m.owned) / (1 + m.change1d)) : 0), 0);
  const gainCents = owned.some((m) => m.gainCents !== null) ? owned.reduce((s, m) => s + (m.gainCents ?? 0), 0) : null;
  const buyRow = (m: MarketRow) => setEditing({ holding: { ticker: m.ticker, avgPriceCents: m.priceCents } });
  const watchRow = (m: MarketRow) => setWatching({ row: { ticker: m.ticker, targetCents: m.targetCents } });

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <section className="space-y-3 pt-4 pb-2" aria-label="Carteira">
        <p className="text-[0.9375rem] text-muted">Renda passiva estimada por mês</p>
        <BigMoney cents={report?.totals.monthlyIncomeCents ?? 0} size="hero" />
        <p className="tabular text-sm text-muted">
          Carteira {report ? formatBRL(report.totals.valueCents) : "—"} · {holdings.length} ativo{holdings.length === 1 ? "" : "s"}
        </p>
        {report && owned.length > 0 && (
          <p className="tabular flex flex-wrap gap-x-4 text-sm">
            <span className={dayCents >= 0 ? "text-positive" : "text-negative"}>
              Hoje {dayCents >= 0 ? "+" : "−"}{formatBRL(Math.abs(dayCents))}
            </span>
            {gainCents !== null && (
              <span className={gainCents >= 0 ? "text-positive" : "text-negative"}>
                Resultado {gainCents >= 0 ? "+" : "−"}{formatBRL(Math.abs(gainCents))}
              </span>
            )}
          </p>
        )}
      </section>

      {signals.length > 0 && (
        <Card>
          <SectionTitle
            title="Sinais de hoje"
            description="Vender com lucro e reinvestir nos FIIs, ou comprar o que caiu e paga proventos."
          />
          <ul className="divide-y divide-line">
            {signals.map((m) => (
              <MarketItem key={m.ticker} row={m} onBuy={buyRow} onWatch={watchRow} />
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <SectionTitle
          title="Quanto vai investir este mês?"
          description="Distribui o valor em cotas inteiras de até R$ 20, priorizando FIIs que pagam todo mês."
        />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(budget ?? 0, goal ?? 0);
          }}
        >
          <MoneyInput value={budget} onChange={setBudget} aria-label="Valor do aporte" />
          <Button type="submit" icon={TrendingUp} disabled={loading} className="h-12 shrink-0">
            Recomendar
          </Button>
        </form>

        {report && report.picks.length > 0 && (
          <div className="mt-4">
            <PickList picks={report.picks} />
            <p className="tabular flex justify-between border-t border-line pt-3 text-sm text-muted">
              <span>Sobra do aporte</span>
              <span>{formatBRL(report.leftoverCents)}</span>
            </p>
          </div>
        )}
        {report && (budget ?? 0) > 0 && report.picks.length === 0 && !loading && (
          <p className="mt-4 text-sm text-muted">O valor não cobre uma cota dos fundos recomendados. Junte para o próximo mês.</p>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Meta de renda passiva"
          description="Quanto quer receber por mês. O simulador diz o que comprar, e quantas cotas, dentro do seu perfil."
        />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setInvestGoal(goal);
            void load(budget ?? 0, goal ?? 0);
          }}
        >
          <MoneyInput value={goal} onChange={setGoal} aria-label="Meta de renda mensal" />
          <Button type="submit" icon={Flag} disabled={loading || !goal} className="h-12 shrink-0">
            Simular
          </Button>
        </form>

        {report?.simulation && (
          <div className="mt-4 space-y-3">
            {report.simulation.picks.length === 0 ? (
              <p className="text-sm text-positive">Sua carteira já rende {formatBRL(report.totals.monthlyIncomeCents)}/mês: meta atingida.</p>
            ) : (
              <>
                <div className="rounded-2xl bg-surface-2 p-4">
                  <p className="text-[0.8125rem] text-muted">Investimento necessário</p>
                  <BigMoney cents={report.simulation.costCents} size="md" />
                  <p className="tabular mt-2 text-[0.8125rem] text-muted">
                    Renda estimada depois: {formatBRL(report.simulation.monthlyIncomeCents)}/mês
                    {report.simulation.monthsAtBudget !== null &&
                      ` · ~${report.simulation.monthsAtBudget} ${report.simulation.monthsAtBudget === 1 ? "mês" : "meses"} aportando ${formatBRL(budget ?? 0)}`}
                  </p>
                  {!report.simulation.reached && (
                    <p className="mt-2 text-[0.8125rem] text-warning">Sem dados de dividendos suficientes para chegar exatamente à meta.</p>
                  )}
                </div>
                <PickList picks={report.simulation.picks} />
                {report.simulation.monthsAtBudget === null && (
                  <p className="text-[0.8125rem] text-muted">Preencha o aporte mensal acima para ver em quanto tempo chega lá.</p>
                )}
              </>
            )}
          </div>
        )}
      </Card>

      {error && (
        <Alert tone="negative" icon={CircleAlert} title="Não deu para pesquisar agora" action={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => void load(budget ?? 0, goal ?? 0)}>Tentar de novo</Button>}>
          {error}
        </Alert>
      )}

      <Card>
        <SectionTitle
          title="Minha carteira"
          action={<Button size="sm" variant="secondary" icon={Plus} onClick={() => setEditing({ holding: null })}>Ativo</Button>}
        />
        {holdings.length === 0 ? (
          <EmptyState
            icon={Sprout}
            title="Nenhum ativo cadastrado"
            description="Comece com a carteira que você já tem no Nubank."
            action={
              <Button
                size="sm"
                onClick={() => {
                  for (const h of STARTER) saveHolding({ id: newId("h"), ...h });
                }}
              >
                Adicionar CPTS11, MXRF11 e VGHF11
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-line">
            {holdings.map((h) => {
              const p = byTicker.get(h.ticker);
              return (
                <li key={h.id} className="flex items-center gap-3 py-3">
                  <button type="button" onClick={() => setEditing({ holding: h })} className="min-w-0 flex-1 text-left">
                    <span className="block text-[0.9375rem] font-semibold text-fg">
                      {h.ticker} <span className="font-normal text-muted">· {h.quantity} cotas</span>
                    </span>
                    <span className="tabular block text-[0.8125rem] text-muted">
                      {p?.priceCents != null ? `${formatBRL(p.priceCents)}/cota · DY ${pct(p.dividendYield)}` : "Sem cotação"}
                      {h.avgPriceCents ? ` · médio ${formatBRL(h.avgPriceCents)}` : " · toque para informar o preço médio"}
                    </span>
                    {marketBy.get(h.ticker) && (
                      <span className="flex gap-2 text-[0.75rem]">
                        <Change value={marketBy.get(h.ticker)!.change1d} label="dia" />
                        <Change value={marketBy.get(h.ticker)!.change30d} label="30d" />
                      </span>
                    )}
                  </button>
                  <span className="tabular text-right text-[0.9375rem] font-semibold text-fg">
                    {p?.valueCents != null ? formatBRL(p.valueCents) : "—"}
                    {p?.monthlyIncomeCents != null && (
                      <span className="block text-[0.75rem] font-normal text-positive">+{formatBRL(p.monthlyIncomeCents)}/mês</span>
                    )}
                  </span>
                  <IconButton
                    label={`Remover ${h.ticker}`}
                    icon={Trash2}
                    size="sm"
                    onClick={() => {
                      const inverse = deleteHolding(h.id);
                      toast({ message: `${h.ticker} removido`, action: { label: "Desfazer", onClick: () => undo(inverse) } });
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Radar de ações pagadoras"
          description="Ações caras que pagam proventos. Quando caem perto da mínima, viram compra para vender na alta e reinvestir."
          action={<Button size="sm" variant="secondary" icon={Eye} onClick={() => setWatching({ row: null })}>Observar</Button>}
        />
        {radar.length === 0 ? (
          <p className="text-sm text-muted">{loading ? "Pesquisando…" : "Nada no radar agora."}</p>
        ) : (
          <ul className="divide-y divide-line">
            {radar.map((m) => (
              <MarketItem key={m.ticker} row={m} onBuy={buyRow} onWatch={watchRow} />
            ))}
          </ul>
        )}
      </Card>

      <Alert tone="accent" icon={BellRing} title="Relatório às 8h, 14h e 20h">
        Os sinais acima chegam por notificação no celular (app ntfy). A configuração fica no Netlify.
      </Alert>

      {report && report.ranking.length > 0 && (
        <details className="group rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <summary className="text-[0.9375rem] font-bold text-fg marker:content-none">Melhores pagadores mensais hoje</summary>
          <ul className="mt-4 divide-y divide-line">
            {report.ranking.map((r) => (
              <li key={r.ticker} className="py-3">
                <p className="tabular flex justify-between gap-3 text-[0.9375rem] font-semibold text-fg">
                  <span>
                    {r.ticker} <span className="font-normal text-muted">· {r.bucket}</span>
                  </span>
                  <span>DY {pct(r.dividendYield)}</span>
                </p>
                <p className="text-[0.8125rem] text-muted">
                  {formatBRL(r.priceCents)}/cota{r.monthsPaid !== null ? ` · pagou em ${r.monthsPaid} dos últimos 12 meses` : ""} · {r.note}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {report && report.ideas.length > 0 && (
        <details className="group rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <summary className="flex items-center gap-2 text-[0.9375rem] font-bold text-fg marker:content-none">
            <Lightbulb className="size-4 text-muted" aria-hidden />
            Ideias fora do seu padrão
          </summary>
          <p className="mt-2 text-[0.8125rem] text-muted">
            Pagam todo mês e pagam bem, mas têm cota mais cara ou risco maior que a sua carteira. Não entram nas recomendações acima.
          </p>
          <ul className="mt-3 divide-y divide-line">
            {report.ideas.map((i) => (
              <li key={i.ticker} className="py-3">
                <p className="tabular flex justify-between gap-3 text-[0.9375rem] font-semibold text-fg">
                  <span>
                    {i.ticker} <span className="font-normal text-muted">· {i.kind}</span>
                  </span>
                  <span>DY {pct(i.dividendYield)}</span>
                </p>
                <p className="text-[0.8125rem] text-muted">
                  {formatBRL(i.priceCents)}/cota · {i.note}
                </p>
                <p className="text-[0.8125rem] text-warning">Risco: {i.risk}</p>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="text-xs leading-relaxed text-muted">
        {loading ? "Pesquisando cotações…" : report ? `Dados da B3 via brapi.dev, atualizados em ${new Date(report.generatedAt).toLocaleString("pt-BR")}.` : ""}{" "}
        Análise automática com base no seu perfil (renda passiva, moderado). Não é recomendação de um profissional
        certificado; rendimento passado não garante rendimento futuro.
      </p>

      <HoldingSheet open={!!editing} onClose={() => setEditing(null)} holding={editing?.holding ?? null} />
      <WatchSheet open={!!watching} onClose={() => setWatching(null)} row={watching?.row ?? null} />
    </div>
  );
}
