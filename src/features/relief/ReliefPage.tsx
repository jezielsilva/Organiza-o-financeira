import { Sprout } from "lucide-react";
import { useMemo } from "react";
import { useMonth } from "../../app/month";
import { useAppState } from "../../app/store";
import { reliefCalendar } from "../../domain/insights";
import { formatBRL } from "../../domain/money";
import { addMonths, formatMonthName, formatMonthShort, monthDiff } from "../../domain/month";
import { EmptyState } from "../../ui/display";
import { cn } from "../../ui/cn";

const reais = (cents: number) => formatBRL(cents).replace(/,\d\d$/, "");

export default function ReliefPage() {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const calendar = useMemo(() => reliefCalendar(data, month, 12), [data, month]);
  const withRelief = calendar.filter((r) => r.freedCents > 0);

  if (withRelief.length === 0) {
    return (
      <EmptyState
        icon={Sprout}
        title="Nenhuma parcela em aberto"
        description="Quando a fatura tiver compras parceladas, aqui aparece em que mês cada uma termina e quanto o orçamento ganha."
      />
    );
  }

  // Barras: quanto já foi liberado ao entrar em cada mês (acumulado das parcelas que terminaram antes).
  const bars = Array.from({ length: 6 }, (_, i) => ({
    month: addMonths(month, i),
    cents: i === 0 ? 0 : calendar[i - 1].cumulativeCents,
  }));
  const max = Math.max(...bars.map((b) => b.cents), 1);
  const lastBar = bars[bars.length - 1];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[0.8125rem] text-muted">Parcelas</p>
        <h2 className="text-xl font-bold">Calendário de alívio</h2>
      </div>

      <section className="space-y-4 rounded-[1.75rem] bg-lime p-5 text-ink" aria-label="Quanto o orçamento ganha">
        <p className="text-sm font-semibold">Até {formatMonthName(lastBar.month).toLowerCase()}, seu orçamento ganha</p>
        <p className="font-display leading-none font-bold">
          <span className="text-[2.6rem]">+{reais(lastBar.cents)}</span>
          <span className="text-xl">/mês</span>
        </p>
        <ol className="grid h-32 grid-cols-6 items-end gap-2">
          {bars.map((b) => (
            <li key={b.month} className="flex h-full flex-col items-center justify-end gap-1.5">
              {b.cents > 0 && <span className="text-[0.6875rem] font-bold tabular">{reais(b.cents).replace(/R\$\s/, "")}</span>}
              <span
                className={cn("w-full rounded-lg", b.cents > 0 ? "bg-ink" : "bg-ink/15")}
                style={{ height: `${Math.max(6, (b.cents / max) * 80)}px` }}
                aria-hidden
              />
              <span className="text-xs font-bold">{formatMonthShort(b.month).slice(0, 3)}</span>
            </li>
          ))}
        </ol>
      </section>

      <ol className="ml-2 space-y-5 border-l-2 border-line pl-5">
        {withRelief.map((r, index) => {
          const away = monthDiff(month, r.month);
          return (
            <li key={r.month} className="relative space-y-2">
              <span
                aria-hidden
                className={cn(
                  "absolute top-1 -left-[1.95rem] size-3.5 rounded-full border-[3px] border-bg",
                  index === 0 ? "bg-lime" : index === 1 ? "bg-muted" : "bg-line",
                )}
              />
              <div className="flex items-baseline justify-between gap-3 text-[0.9375rem]">
                <h3 className="font-bold">
                  {formatMonthName(r.month)}
                  <span className="font-normal text-muted">
                    {" "}
                    · {away === 0 ? "última parcela este mês" : `daqui a ${away} ${away === 1 ? "mês" : "meses"}`}
                  </span>
                </h3>
                <span className={cn("shrink-0 font-bold", index === 0 ? "text-accent" : "text-fg")}>libera {formatBRL(r.freedCents)}</span>
              </div>
              <ul className="divide-y divide-line rounded-[1.25rem] bg-surface">
                {r.ending.map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[0.875rem]">
                    <span className="min-w-0 truncate">{e.description}</span>
                    <span className="shrink-0 text-muted tabular">
                      {e.current}/{e.total} · {formatBRL(e.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
