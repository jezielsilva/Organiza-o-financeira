import { CircleAlert, Plus, RefreshCw, Sprout, Trash2, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { deleteHolding, saveHolding, undo } from "../../app/actions";
import { useAppState } from "../../app/store";
import { fetchInvestReport, type InvestReport } from "../../data/investApi";
import { formatBRL } from "../../domain/money";
import { newId, type Holding } from "../../domain/types";
import { Button, IconButton } from "../../ui/Button";
import { Alert, BigMoney, Card, EmptyState, SectionTitle } from "../../ui/display";
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

function HoldingSheet({ open, onClose, holding }: { open: boolean; onClose: () => void; holding: Holding | null }) {
  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setTicker(holding?.ticker ?? "");
    setQuantity(holding ? String(holding.quantity) : "");
    setError(undefined);
  }, [open, holding]);

  const submit = () => {
    const code = ticker.trim().toUpperCase();
    const qty = Number(quantity);
    if (!/^[A-Z0-9]{4,7}$/.test(code)) return setError("Use o código da B3, ex.: MXRF11");
    if (!Number.isInteger(qty) || qty <= 0) return setError("Informe a quantidade de cotas");
    saveHolding({ id: holding?.id ?? newId("h"), ticker: code, quantity: qty });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={holding ? `Editar ${holding.ticker}` : "Adicionar ativo"}
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
      </div>
    </Sheet>
  );
}

export default function InvestmentsPage() {
  const holdingsMap = useAppState((s) => s.data.holdings);
  const holdings = useMemo(() => Object.values(holdingsMap).sort((a, b) => a.ticker.localeCompare(b.ticker)), [holdingsMap]);
  const toast = useToast();
  const [budget, setBudget] = useState<number | null>(null);
  const [report, setReport] = useState<InvestReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<{ holding: Holding | null } | null>(null);
  const abort = useRef<AbortController>(null);

  const load = useCallback(
    async (budgetCents: number) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setLoading(true);
      setError(undefined);
      try {
        setReport(await fetchInvestReport(holdings, budgetCents, controller.signal));
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [holdings],
  );

  // Pesquisa a cada vez que a tela é aberta (e quando a carteira muda).
  useEffect(() => {
    void load(budget ?? 0);
    return () => abort.current?.abort();
  }, [load]);

  const byTicker = new Map(report?.portfolio.map((p) => [p.ticker, p]));

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <section className="space-y-3 pt-4 pb-2" aria-label="Carteira">
        <p className="text-[15px] text-muted">Renda passiva estimada por mês</p>
        <BigMoney cents={report?.totals.monthlyIncomeCents ?? 0} size="hero" />
        <p className="tabular text-sm text-muted">
          Carteira {report ? formatBRL(report.totals.valueCents) : "—"} · {holdings.length} ativo{holdings.length === 1 ? "" : "s"}
        </p>
      </section>

      <Card>
        <SectionTitle
          title="Quanto vai investir este mês?"
          description="Distribui o valor em cotas inteiras, priorizando FIIs que pagam todo mês."
        />
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void load(budget ?? 0);
          }}
        >
          <MoneyInput value={budget} onChange={setBudget} aria-label="Valor do aporte" />
          <Button type="submit" icon={TrendingUp} disabled={loading} className="h-12 shrink-0">
            Recomendar
          </Button>
        </form>

        {report && report.picks.length > 0 && (
          <ul className="mt-4 divide-y divide-line">
            {report.picks.map((p) => (
              <li key={p.ticker} className="py-3">
                <p className="flex items-baseline justify-between gap-3 text-[15px] font-semibold text-fg">
                  <span>
                    {p.quantity}× {p.ticker}
                  </span>
                  <span className="tabular">{formatBRL(p.costCents)}</span>
                </p>
                <p className="text-[13px] text-muted">{p.reason}</p>
              </li>
            ))}
            <li className="tabular flex justify-between pt-3 text-sm text-muted">
              <span>Sobra do aporte</span>
              <span>{formatBRL(report.leftoverCents)}</span>
            </li>
          </ul>
        )}
        {report && (budget ?? 0) > 0 && report.picks.length === 0 && !loading && (
          <p className="mt-4 text-sm text-muted">O valor não cobre uma cota dos fundos recomendados. Junte para o próximo mês.</p>
        )}
      </Card>

      {error && (
        <Alert tone="negative" icon={CircleAlert} title="Não deu para pesquisar agora" action={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => void load(budget ?? 0)}>Tentar de novo</Button>}>
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
                    <span className="block text-[15px] font-semibold text-fg">
                      {h.ticker} <span className="font-normal text-muted">· {h.quantity} cotas</span>
                    </span>
                    <span className="tabular block text-[13px] text-muted">
                      {p?.priceCents != null ? `${formatBRL(p.priceCents)}/cota · DY ${pct(p.dividendYield)}` : "Sem cotação"}
                    </span>
                  </button>
                  <span className="tabular text-right text-[15px] font-semibold text-fg">
                    {p?.valueCents != null ? formatBRL(p.valueCents) : "—"}
                    {p?.monthlyIncomeCents != null && (
                      <span className="block text-[12px] font-normal text-positive">+{formatBRL(p.monthlyIncomeCents)}/mês</span>
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

      {report && report.ranking.length > 0 && (
        <details className="group rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <summary className="text-[15px] font-bold text-fg marker:content-none">Melhores pagadores mensais hoje</summary>
          <ul className="mt-4 divide-y divide-line">
            {report.ranking.map((r) => (
              <li key={r.ticker} className="py-3">
                <p className="tabular flex justify-between gap-3 text-[15px] font-semibold text-fg">
                  <span>
                    {r.ticker} <span className="font-normal text-muted">· {r.bucket}</span>
                  </span>
                  <span>DY {pct(r.dividendYield)}</span>
                </p>
                <p className="text-[13px] text-muted">
                  {formatBRL(r.priceCents)}/cota{r.monthsPaid !== null ? ` · pagou em ${r.monthsPaid} dos últimos 12 meses` : ""} · {r.note}
                </p>
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
    </div>
  );
}
