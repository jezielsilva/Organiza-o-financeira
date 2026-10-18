import {
  ArrowRight,
  ChartLine,
  ChartPie,
  CircleCheck,
  Link2,
  Plus,
  ShoppingBag,
  Target,
} from "lucide-react";
import { useMemo, type ElementType } from "react";
import { setPlanStatus, undo as undoPatch } from "../../app/actions";
import { useMonth } from "../../app/month";
import { navigate, type Route } from "../../app/router";
import { useAppState } from "../../app/store";
import { goalEta, reliefCalendar } from "../../domain/insights";
import { formatBRL, type Cents } from "../../domain/money";
import { addMonths, formatDate, formatMonthName, formatMonthShort } from "../../domain/month";
import {
  findPlanMatches,
  invoicesByMonth,
  planInstallmentCents,
  projectMonths,
  summarizeMonth,
  type MonthSummary,
} from "../../domain/projection";
import { Button } from "../../ui/Button";
import { BigMoney, Card, Money, SectionTitle } from "../../ui/display";
import { useToast } from "../../ui/Toast";
import { cn } from "../../ui/cn";

function BudgetBar({ summary }: { summary: MonthSummary }) {
  const { incomeCents, billsCents, card, plannedCents, balanceCents } = summary;
  const scale = Math.max(incomeCents, summary.expensesCents, 1);
  const segments = [
    { label: "Fixas", cents: billsCents, color: "bg-chart-4" },
    { label: card.source === "invoice" ? "Cartão" : "Cartão (est.)", cents: card.totalCents, color: "bg-chart-2" },
    { label: "Planejado", cents: plannedCents, color: "bg-chart-3" },
    { label: "Sobra", cents: Math.max(0, balanceCents), color: "bg-chart-1" },
  ].filter((s) => s.cents > 0);

  return (
    <div>
      <div className="flex h-3 w-full gap-1" aria-hidden>
        {segments.map((s) => (
          <div key={s.label} className={cn("h-full rounded-full", s.color)} style={{ width: `${(s.cents / scale) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-fg/80">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", s.color)} aria-hidden />
            {s.label} <Money cents={s.cents} className="font-semibold text-fg" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Explanation({ summary }: { summary: MonthSummary }) {
  const { card } = summary;
  const rows: Array<[string, Cents, string?]> = [
    ["Renda do mês", summary.incomeCents],
    ["Contas fixas ativas", -summary.billsCents],
  ];
  if (card.source === "invoice") rows.push(["Sua parte da fatura do cartão", -card.totalCents]);
  else if (card.source === "projected") {
    rows.push(["Parcelas que ainda caem no cartão", -card.installmentsCents]);
    rows.push(["Dia a dia no cartão (estimativa)", -card.variableEstimateCents, "Média dos gastos à vista das últimas faturas."]);
  }
  if (summary.plannedCents) rows.push(["Compras planejadas", -summary.plannedCents]);

  return (
    <details className="group rounded-2xl border border-line bg-surface px-4 py-3">
      <summary className="flex items-center justify-between text-sm font-semibold text-fg marker:content-none">
        Como chegamos neste valor
        <ArrowRight className="size-4 text-muted transition group-open:rotate-90" aria-hidden />
      </summary>
      <dl className="mt-3 space-y-2 text-sm">
        {rows.map(([label, cents, hint]) => (
          <div key={label} className="flex items-start justify-between gap-3">
            <dt className="text-muted">
              {label}
              {hint && <span className="block text-xs">{hint}</span>}
            </dt>
            <dd>
              <Money cents={cents} signed />
            </dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 border-t border-line pt-2 font-semibold">
          <dt>Sobra</dt>
          <dd>
            <Money cents={summary.balanceCents} signed tone="auto" />
          </dd>
        </div>
      </dl>
    </details>
  );
}

function Hero({ summary }: { summary: MonthSummary }) {
  const positive = summary.balanceCents >= 0;
  const pct = summary.incomeCents > 0 ? Math.round((summary.balanceCents / summary.incomeCents) * 100) : null;
  return (
    <section aria-labelledby="hero-title" className="space-y-5 pt-4 pb-2">
      <div className="flex items-center justify-between gap-3">
        <h2 id="hero-title" className="text-[15px] text-muted">
          {positive ? "Sobra" : "Falta"} em {formatMonthName(summary.month).toLowerCase()}
        </h2>
        {pct !== null && (
          <span
            className={cn("tabular text-xs font-semibold", positive ? "text-muted" : "text-negative")}
          >
            {positive ? `${pct}% da renda` : "acima da renda"}
          </span>
        )}
      </div>
      <BigMoney cents={summary.balanceCents} size="hero" className={positive ? "text-fg" : "text-negative"} />
      {summary.incomeCents === 0 ? (
        <Button variant="secondary" icon={Plus} onClick={() => navigate("contas")}>
          Cadastrar renda
        </Button>
      ) : (
        <BudgetBar summary={summary} />
      )}
    </section>
  );
}

const ACTIONS: Array<{ label: string; icon: ElementType; route: Route }> = [
  { label: "Categorias", icon: ChartPie, route: "categorias" },
  { label: "Contas", icon: Plus, route: "contas" },
  { label: "Comprar?", icon: ShoppingBag, route: "planejar" },
  { label: "Metas", icon: Target, route: "metas" },
];

function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {ACTIONS.map((a) => (
        <a
          key={a.route}
          href={`#/${a.route}`}
          className="flex h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-[1.1rem] border border-line bg-surface text-xs font-semibold text-fg hover:bg-surface-2"
        >
          <a.icon className="size-5" aria-hidden />
          {a.label}
        </a>
      ))}
    </div>
  );
}

function Row({ href, label, value, hint }: { href: string; label: string; value: string; hint: string }) {
  return (
    <li>
      <a href={href} className="flex items-center gap-3 px-4 py-3.5 hover:bg-surface-2">
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-fg">{label}</span>
          <span className="block truncate text-[13px] text-muted">{hint}</span>
        </span>
        <span className="tabular text-[15px] font-semibold text-fg">{value}</span>
        <ArrowRight className="size-4 text-muted" aria-hidden />
      </a>
    </li>
  );
}

function Overview({ summary }: { summary: MonthSummary }) {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const relief = useMemo(() => reliefCalendar(data, month, 12).find((r) => r.freedCents > 0), [data, month]);
  const reserve = Object.values(data.goals).find((g) => g.kind === "emergency");
  const invoice = summary.card.invoiceId ? data.invoices[summary.card.invoiceId] : undefined;
  const isReal = summary.card.source === "invoice";
  const reservePct = reserve ? Math.min(100, Math.round((reserve.savedCents / reserve.targetCents) * 100)) : 0;

  return (
    <ul className="divide-y divide-line overflow-hidden rounded-3xl border border-line bg-surface">
      {summary.card.source === "none" ? (
        <Row href="#/fatura" label="Importar fatura" value="PDF" hint="Separa por cartão e calcula as parcelas futuras" />
      ) : (
        <Row
          href="#/fatura"
          label={isReal ? `Cartão${invoice?.issuer ? ` · ${invoice.issuer}` : ""}` : "Cartão (previsão)"}
          value={formatBRL(summary.card.totalCents)}
          hint={
            isReal && invoice
              ? `${invoice.dueDate ? `vence ${formatDate(invoice.dueDate).slice(0, 5)} · ` : ""}de ${formatBRL(invoice.statementTotalCents)} no total`
              : `${formatBRL(summary.card.installmentsCents)} em parcelas + dia a dia`
          }
        />
      )}
      <Row
        href="#/alivio"
        label="Próximo alívio"
        value={relief ? `+${formatBRL(relief.freedCents).replace(/,\d\d$/, "")}` : "—"}
        hint={relief ? `A partir de ${formatMonthName(addMonths(relief.month, 1)).toLowerCase()}` : "Nenhuma parcela em aberto"}
      />
      <Row
        href="#/metas"
        label="Reserva de emergência"
        value={reserve ? `${reservePct}%` : "Criar"}
        hint={reserve ? `${formatBRL(reserve.savedCents)} de ${formatBRL(reserve.targetCents)}` : "Sugestão: 6 meses do seu custo"}
      />
      <Row href="#/resumo" label={`Resumo de ${formatMonthName(month).toLowerCase()}`} value="" hint="Onde mais gastou e parcelas que acabaram" />
    </ul>
  );
}

function Insight({ next }: { next: MonthSummary }) {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const relief = useMemo(() => reliefCalendar(data, addMonths(month, 1), 6).find((r) => r.freedCents > 0), [data, month]);
  const reserve = Object.values(data.goals).find((g) => g.kind === "emergency");
  const eta = reserve ? goalEta(reserve, month) : null;
  return (
    <Card className="flex gap-3 p-4 sm:p-5">
      <ChartLine className="mt-1 size-5 shrink-0 text-muted" aria-hidden />
      <p className="text-[15px] leading-relaxed text-fg/80">
        <strong className="text-fg">
          {formatMonthName(next.month)} {next.balanceCents >= 0 ? "sobra" : "falta"} {formatBRL(Math.abs(next.balanceCents))}.
        </strong>{" "}
        {relief
          ? `Em ${formatMonthShort(relief.month)} terminam ${relief.ending.length} parcela${relief.ending.length > 1 ? "s" : ""} e o orçamento ganha ${formatBRL(relief.freedCents)} por mês.`
          : "Nenhuma parcela termina nos próximos meses."}
        {eta && reserve && reserve.savedCents < reserve.targetCents && ` A reserva completa em ${formatMonthShort(eta)}.`}
      </p>
    </Card>
  );
}

function PlanMatches() {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const toast = useToast();
  const invoice = invoicesByMonth(data).get(month);
  if (!invoice) return null;
  const matches = findPlanMatches(invoice, Object.values(data.plans));
  if (matches.length === 0) return null;
  return (
    <Card>
      <SectionTitle title="Essas compras planejadas já vieram na fatura?" description="Confirme para não contar o mesmo gasto duas vezes." />
      <ul className="space-y-2">
        {matches.map(({ plan, purchase }) => (
          <li key={plan.id} className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 text-[15px]">
              <p className="font-semibold text-fg">
                <Link2 className="mr-1 inline size-4 text-muted" aria-hidden />
                {plan.description} · {formatBRL(planInstallmentCents(plan, 1))}/mês
              </p>
              <p className="text-sm text-muted">
                Na fatura: {purchase.description} · {formatBRL(purchase.amountCents)}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                icon={CircleCheck}
                onClick={() => {
                  const undo = setPlanStatus(plan.id, "confirmed");
                  toast({ message: "Compra marcada como lançada na fatura", action: { label: "Desfazer", onClick: () => undoPatch(undo) } });
                }}
              >
                Sim, é ela
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPlanStatus(plan.id, "archived")}>
                Arquivar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function NextMonths({ months }: { months: MonthSummary[] }) {
  const { setMonth } = useMonth();
  const maxAbs = Math.max(...months.map((m) => Math.abs(m.balanceCents)), 1);
  return (
    <details className="group rounded-3xl border border-line bg-surface p-5 sm:p-6">
      <summary className="flex items-center justify-between text-[15px] font-bold text-fg marker:content-none">
        Próximos meses
        <ArrowRight className="size-4 text-muted transition group-open:rotate-90" aria-hidden />
      </summary>
      <ul className="mt-4 space-y-1">
        {months.map((m) => {
          const positive = m.balanceCents >= 0;
          return (
            <li key={m.month}>
              <button
                type="button"
                onClick={() => setMonth(m.month)}
                className="grid w-full grid-cols-[3.5rem_1fr_auto] items-center gap-3 rounded-2xl px-2 py-2.5 text-left hover:bg-surface-2"
                aria-label={`${formatMonthName(m.month)}: ${positive ? "sobra" : "falta"} ${formatBRL(Math.abs(m.balanceCents))}. Abrir mês.`}
              >
                <span className="text-[15px] font-semibold capitalize text-fg">{formatMonthShort(m.month)}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                  <span
                    className={cn("block h-full rounded-full", positive ? "bg-fg/40" : "bg-negative")}
                    style={{ width: `${(Math.abs(m.balanceCents) / maxAbs) * 100}%` }}
                  />
                </span>
                <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                  <Money cents={m.balanceCents} signed tone="auto" />
                  {m.card.source === "projected" && <span className="text-xs font-normal text-muted">est.</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <a href="#/relatorios" className="mt-3 inline-block text-sm font-semibold text-accent">
        Ver projeção completa
      </a>
    </details>
  );
}

export default function Dashboard() {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const summary = useMemo(() => summarizeMonth(data, month), [data, month]);
  const next = useMemo(() => projectMonths(data, addMonths(month, 1), 6), [data, month]);

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Hero summary={summary} />
      <Explanation summary={summary} />
      <QuickActions />
      <Overview summary={summary} />
      <Insight next={next[0]} />
      <PlanMatches />
      <NextMonths months={next} />
    </div>
  );
}
