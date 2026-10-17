import {
  ArrowRight,
  ChartLine,
  CircleCheck,
  FileUp,
  Link2,
  Plus,
  ShoppingBag,
  Sparkles,
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
  countedPurchases,
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
    <section aria-labelledby="hero-title" className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 id="hero-title" className="text-[15px] text-muted">
          {positive ? "Sobra" : "Falta"} em {formatMonthName(summary.month).toLowerCase()}
        </h2>
        {pct !== null && (
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-bold",
              positive ? "bg-lime text-ink" : "bg-negative-soft text-negative",
            )}
          >
            {positive ? `${pct}% da renda` : "acima da renda"}
          </span>
        )}
      </div>
      <BigMoney cents={summary.balanceCents} size="xl" className={positive ? "text-fg" : "text-negative"} />
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
  { label: "Fatura", icon: FileUp, route: "fatura" },
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

function CardTile({ summary }: { summary: MonthSummary }) {
  const data = useAppState((s) => s.data);
  const invoice = summary.card.invoiceId ? data.invoices[summary.card.invoiceId] : undefined;

  if (summary.card.source === "none") {
    return (
      <a href="#/fatura" className="card-ember flex flex-col gap-3 rounded-3xl p-5 col-span-2">
        <FileUp className="size-6" aria-hidden />
        <span className="text-lg font-bold">Importe a fatura do cartão</span>
        <span className="text-sm text-white/85">O app lê o PDF, separa por cartão e calcula as parcelas dos próximos meses.</span>
      </a>
    );
  }

  const last4 = invoice ? countedPurchases(invoice, data.settings).find((p) => p.cardLast4)?.cardLast4 : undefined;
  const isReal = summary.card.source === "invoice";
  return (
    <a href="#/fatura" className="card-ember relative flex flex-col gap-2.5 overflow-hidden rounded-3xl p-5 col-span-2">
      <span aria-hidden className="absolute -right-10 -bottom-16 size-48 rounded-full border-[28px] border-white/10" />
      <span className="flex justify-between text-[13px] text-white/90">
        <span>
          {isReal ? invoice?.issuer : "Cartão"}
          {isReal && invoice?.dueDate && ` · vence ${formatDate(invoice.dueDate).slice(0, 5)}`}
        </span>
        {last4 && <span className="tabular">•••• {last4}</span>}
      </span>
      <span className="text-[13px] text-white/90">{isReal ? "Sua parte da fatura" : "Previsão do cartão (fatura não importada)"}</span>
      <BigMoney cents={summary.card.totalCents} size="md" className="text-white" centsClassName="text-white/70" />
      <span className="text-[13px] text-white/90">
        {isReal && invoice
          ? `de ${formatBRL(invoice.statementTotalCents)} no total`
          : `${formatBRL(summary.card.installmentsCents)} em parcelas + ${formatBRL(summary.card.variableEstimateCents)} do dia a dia`}
      </span>
    </a>
  );
}

function ReliefTile() {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const next = useMemo(() => reliefCalendar(data, month, 12).find((r) => r.freedCents > 0), [data, month]);
  return (
    <a href="#/alivio" className="flex flex-col gap-1.5 rounded-3xl bg-lime p-4 text-ink">
      <span className="text-xs font-bold">{next ? `Alívio em ${formatMonthName(addMonths(next.month, 1)).toLowerCase()}` : "Calendário de alívio"}</span>
      <span className="font-display text-2xl font-bold">{next ? `+${formatBRL(next.freedCents).replace(/,\d\d$/, "")}` : "—"}</span>
      <span className="text-xs font-semibold">
        {next ? `${next.ending.length} parcela${next.ending.length > 1 ? "s" : ""} termina${next.ending.length > 1 ? "m" : ""} em ${formatMonthShort(next.month)}` : "Nenhuma parcela em aberto"}
      </span>
    </a>
  );
}

function ReserveTile() {
  const goals = useAppState((s) => s.data.goals);
  const reserve = Object.values(goals).find((g) => g.kind === "emergency");
  const pct = reserve ? Math.min(100, Math.round((reserve.savedCents / reserve.targetCents) * 100)) : 0;
  const circumference = 2 * Math.PI * 21;
  return (
    <a href="#/metas" className="flex items-center gap-3 rounded-3xl bg-violet p-4 text-ink">
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden className="shrink-0">
        <circle cx="26" cy="26" r="21" fill="none" stroke="rgb(11 11 13 / 0.2)" strokeWidth="7" />
        <circle
          cx="26"
          cy="26"
          r="21"
          fill="none"
          stroke={pct > 0 ? "#0b0b0d" : "none"}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
          transform="rotate(-90 26 26)"
        />
      </svg>
      <span className="flex flex-col">
        <span className="text-xs font-bold">Reserva</span>
        <span className="font-display text-xl font-bold">{reserve ? `${pct}%` : "Criar"}</span>
      </span>
    </a>
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
      <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
        <ChartLine className="size-5" aria-hidden />
      </span>
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
    <Card className="border-violet/50">
      <SectionTitle title="Essas compras planejadas já vieram na fatura?" description="Confirme para não contar o mesmo gasto duas vezes." />
      <ul className="space-y-2">
        {matches.map(({ plan, purchase }) => (
          <li key={plan.id} className="flex flex-col gap-3 rounded-2xl bg-surface-2 p-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 text-[15px]">
              <p className="font-semibold text-fg">
                <Link2 className="mr-1 inline size-4 text-violet" aria-hidden />
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
    <Card>
      <SectionTitle
        title="Próximos meses"
        description="Quanto deve sobrar em cada mês."
        action={
          <a href="#/relatorios" className="text-sm font-semibold text-accent">
            Projeção
          </a>
        }
      />
      <ul className="space-y-1">
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
                    className={cn("block h-full rounded-full", positive ? "bg-lime" : "bg-negative")}
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
    </Card>
  );
}

export default function Dashboard() {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const summary = useMemo(() => summarizeMonth(data, month), [data, month]);
  const next = useMemo(() => projectMonths(data, addMonths(month, 1), 6), [data, month]);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-5">
          <Hero summary={summary} />
          <Explanation summary={summary} />
          <QuickActions />
        </div>
        <div className="grid grid-cols-2 gap-2.5 self-start">
          <CardTile summary={summary} />
          <ReliefTile />
          <ReserveTile />
          <a href="#/resumo" className="col-span-2 flex items-center gap-3 rounded-3xl border border-line bg-surface p-4 hover:bg-surface-2">
            <span className="flex size-10 items-center justify-center rounded-2xl bg-ember/15 text-ember">
              <Sparkles className="size-5" aria-hidden />
            </span>
            <span className="flex-1">
              <span className="block text-[15px] font-bold text-fg">Resumo de {formatMonthName(month).toLowerCase()}</span>
              <span className="block text-sm text-muted">Onde mais gastou, corridas, delivery e parcelas que acabaram</span>
            </span>
            <ArrowRight className="size-5 text-muted" aria-hidden />
          </a>
        </div>
      </div>
      <Insight next={next[0]} />
      <PlanMatches />
      <NextMonths months={next} />
    </div>
  );
}
