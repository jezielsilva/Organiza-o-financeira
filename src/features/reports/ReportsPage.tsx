import { ChevronDown, Sprout } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMonth } from "../../app/month";
import { useAppState } from "../../app/store";
import { scenarioSeries, SCENARIO_LABELS, type Scenario } from "../../domain/insights";
import { formatBRL, sumCents } from "../../domain/money";
import { addMonths, formatMonthLong, formatMonthName, formatMonthShort } from "../../domain/month";
import { commitmentsFrom } from "../../domain/projection";
import { Card, Money, SectionTitle } from "../../ui/display";
import { Segmented } from "../../ui/form";
import { cn } from "../../ui/cn";

function compact(cents: number): string {
  const value = cents / 100;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return value.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

function Projection() {
  const data = useAppState((s) => s.data);
  const { month, setMonth } = useMonth();
  const [period, setPeriod] = useState<"6" | "12">("12");
  const [scenario, setScenario] = useState<Scenario>("realistic");
  const series = useMemo(() => scenarioSeries(data, month, Number(period)), [data, month, period]);
  const saved = sumCents(series.map((s) => Math.max(0, s[scenario])));
  const chart = series.map((s) => ({
    name: formatMonthShort(s.summary.month).slice(0, 3),
    sobra: s[scenario],
    faixa: [s.conservative, s.optimistic],
  }));
  const highlights = series.slice(1, 3);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">Próximos {period} meses</p>
          <h2 className="text-xl font-bold">Projeção</h2>
        </div>
        <div className="w-32">
          <Segmented
            label="Período"
            value={period}
            onChange={setPeriod}
            options={[
              { value: "6", label: "6M" },
              { value: "12", label: "12M" },
            ]}
          />
        </div>
      </div>

      <div role="radiogroup" aria-label="Cenário" className="grid grid-cols-3 gap-1.5">
        {(Object.keys(SCENARIO_LABELS) as Scenario[]).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={scenario === s}
            onClick={() => setScenario(s)}
            className={cn(
              "h-11 rounded-2xl text-[14px] font-semibold",
              scenario === s ? "bg-lime font-bold text-ink" : "border border-line bg-surface text-fg",
            )}
          >
            {SCENARIO_LABELS[s]}
          </button>
        ))}
      </div>

      <Card className="space-y-3">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-[13px] text-muted">Se guardar toda a sobra</p>
            <p className="font-display leading-tight font-bold">
              <span className="text-4xl">{compact(saved).replace(" mil", "")}</span>
              <span className="text-xl text-muted">{saved >= 100000 ? " mil" : " reais"}</span>
            </p>
          </div>
          <span className="text-xs text-muted">até {formatMonthShort(series[series.length - 1].summary.month)}</span>
        </div>
        <div className="h-56 w-full" aria-hidden>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="var(--app-line)" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "var(--app-muted)", fontSize: 12 }} />
              <YAxis tickLine={false} axisLine={false} width={44} tick={{ fill: "var(--app-muted)", fontSize: 11 }} tickFormatter={compact} />
              <Tooltip
                cursor={{ stroke: "var(--app-line)" }}
                formatter={(value, name) =>
                  Array.isArray(value)
                    ? [`${formatBRL(Number(value[0]))} a ${formatBRL(Number(value[1]))}`, "Faixa"]
                    : [formatBRL(Number(value)), String(name)]
                }
                contentStyle={{ background: "var(--app-surface-2)", border: "1px solid var(--app-line)", borderRadius: 14, color: "var(--app-fg)" }}
              />
              <Area dataKey="faixa" name="Faixa" fill="var(--app-chart-1)" fillOpacity={0.14} stroke="none" type="monotone" />
              <Line dataKey="sobra" name="Sobra" stroke="var(--app-chart-1)" strokeWidth={3} dot={{ r: 3, fill: "var(--app-bg)" }} type="monotone" />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-[3px] w-3.5 rounded bg-chart-1" />Sobra prevista</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-chart-1/25" />Faixa entre cenários</span>
        </div>
      </Card>

      <ul className="grid grid-cols-2 gap-2.5">
        {highlights.map((s, i) => {
          const prev = series[i];
          const diff = s[scenario] - prev[scenario];
          return (
            <li key={s.summary.month}>
              <button type="button" onClick={() => setMonth(s.summary.month)} className="w-full rounded-[1.25rem] bg-surface p-4 text-left">
                <span className="block text-xs text-muted">{formatMonthName(s.summary.month)}</span>
                <Money cents={s[scenario]} className="font-display block text-[1.4rem] font-bold" />
                <span className={cn("text-xs font-semibold", diff >= 0 ? "text-positive" : "text-negative")}>
                  {diff >= 0 ? "+" : "−"}
                  {formatBRL(Math.abs(diff))} vs {formatMonthShort(prev.summary.month)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="rounded-[1.25rem] border border-dashed border-line p-4 text-[13px] leading-relaxed text-muted">
        Realista usa as parcelas reais e a média do dia a dia das 3 últimas faturas. Conservador soma 10% de imprevistos às
        despesas; otimista considera o gasto do dia a dia 6% menor.
      </p>

      <Card>
        <SectionTitle title="Mês a mês" description={`Cenário ${SCENARIO_LABELS[scenario].toLowerCase()}.`} />
        <div className="-mx-5 overflow-x-auto sm:mx-0">
          <table className="w-full min-w-[30rem] text-sm">
            <caption className="sr-only">Resumo mensal: renda, despesas e sobra</caption>
            <thead>
              <tr className="border-b border-line text-left text-muted">
                <th scope="col" className="px-5 py-2 font-medium sm:px-2">Mês</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Renda</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Fixas</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Cartão</th>
                <th scope="col" className="px-2 py-2 text-right font-medium">Planejado</th>
                <th scope="col" className="px-5 py-2 text-right font-medium sm:px-2">Sobra</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {series.map(({ summary: m, ...values }) => (
                <tr key={m.month} className={cn(m.month === month && "bg-accent-soft/40")}>
                  <th scope="row" className="px-5 py-2 text-left font-normal capitalize sm:px-2">{formatMonthShort(m.month)}</th>
                  <td className="px-2 py-2 text-right"><Money cents={m.incomeCents} /></td>
                  <td className="px-2 py-2 text-right"><Money cents={m.billsCents} /></td>
                  <td className="px-2 py-2 text-right">
                    <Money cents={m.card.totalCents} />
                    {m.card.source === "projected" && <span className="ml-1 text-xs text-muted">est.</span>}
                  </td>
                  <td className="px-2 py-2 text-right"><Money cents={m.plannedCents} /></td>
                  <td className="px-5 py-2 text-right font-semibold sm:px-2"><Money cents={values[scenario]} tone="auto" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function InstallmentSchedule() {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const months = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => {
        const m = addMonths(month, i);
        const items = commitmentsFrom(data, m).filter((c) => c.current > 0);
        return { month: m, items, total: sumCents(items.map((c) => c.amountCents)) };
      }),
    [data, month],
  );

  return (
    <Card>
      <SectionTitle
        title="Parcelas mês a mês"
        description="Tudo que já está parcelado (cartão e compras planejadas)."
        action={
          <a href="#/alivio" className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
            <Sprout className="size-4" aria-hidden /> Alívio
          </a>
        }
      />
      <ul className="space-y-2">
        {months.map(({ month: m, items, total }) => (
          <li key={m}>
            <details className="group rounded-[1.1rem] bg-surface-2">
              <summary className="flex items-center gap-3 px-4 py-3 marker:content-none">
                <span className="flex-1 text-[15px] font-semibold text-fg">{formatMonthLong(m)}</span>
                <span className="text-sm text-muted">{items.length}</span>
                <Money cents={total} className="w-24 text-right text-[15px] font-semibold" />
                <ChevronDown className="size-4 text-muted transition group-open:rotate-180" aria-hidden />
              </summary>
              {items.length > 0 && (
                <ul className="divide-y divide-line border-t border-line">
                  {items.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                      <span className="min-w-0 flex-1 truncate text-fg">{c.description}</span>
                      <span className="tabular text-muted">
                        {c.current}/{c.total}
                      </span>
                      <Money cents={c.amountCents} className="w-24 text-right" />
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function ReportsPage() {
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.3fr_1fr] [&>*]:min-w-0">
      <Projection />
      <InstallmentSchedule />
    </div>
  );
}
