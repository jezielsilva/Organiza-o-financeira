import { Archive, CalendarClock, Check, CircleCheck, Lightbulb, RotateCcw, Trash2, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { deletePlan, savePlan, setPlanStatus, undo } from "../../app/actions";
import { useMonth } from "../../app/month";
import { useAppState } from "../../app/store";
import { simulatePurchase } from "../../domain/insights";
import { formatBRL } from "../../domain/money";
import { addMonths, formatMonthName, formatMonthShort, isYearMonth } from "../../domain/month";
import { planInstallmentCents, planInstallmentNumber } from "../../domain/projection";
import { newId, type AppData, type PlannedPurchase } from "../../domain/types";
import { Button, IconButton } from "../../ui/Button";
import { Badge, Card, EmptyState, Money, ProgressBar, SectionTitle } from "../../ui/display";
import { Field, Segmented, TextInput } from "../../ui/form";
import { useToast } from "../../ui/Toast";
import { cn } from "../../ui/cn";

const INSTALLMENTS = [1, 3, 6, 10, 12];

function withoutPlan(data: AppData, id: string): AppData {
  if (!(id in data.plans)) return data;
  const { [id]: _, ...plans } = data.plans;
  return { ...data, plans };
}

/** Comparação "sobra hoje" × "com a compra" mês a mês. */
function ImpactBars({ before, after }: { before: number[]; after: number[]; }) {
  const max = Math.max(...before, ...after, 1);
  return (
    <div className="grid grid-cols-6 items-end gap-2" aria-hidden>
      {before.slice(0, 6).map((b, i) => (
        <div key={i} className="flex h-24 items-end justify-center gap-0.5">
          <span className="w-2.5 rounded bg-line" style={{ height: `${Math.max(4, (Math.max(0, b) / max) * 88)}px` }} />
          <span
            className={cn("w-2.5 rounded", after[i] < 0 ? "bg-negative" : "bg-violet")}
            style={{ height: `${Math.max(4, (Math.max(0, after[i]) / max) * 88)}px` }}
          />
        </div>
      ))}
    </div>
  );
}

function Simulator({ editing, onDone }: { editing: PlannedPurchase | null; onDone: () => void }) {
  const allData = useAppState((s) => s.data);
  const { month } = useMonth();
  const toast = useToast();
  const [description, setDescription] = useState(editing?.description ?? "");
  const [digits, setDigits] = useState(editing ? String(editing.totalCents) : "");
  const [installments, setInstallments] = useState(String(editing?.installments ?? 6));
  const [custom, setCustom] = useState("");
  const [firstMonth, setFirstMonth] = useState(editing?.firstMonth ?? addMonths(month, 1));
  const [error, setError] = useState<string | null>(null);

  const totalCents = Number(digits || 0);
  const count = Number(installments === "custom" ? custom : installments) || 0;
  const data = useMemo(() => withoutPlan(allData, editing?.id ?? ""), [allData, editing?.id]);

  const draft: PlannedPurchase | null =
    totalCents > 0 && count >= 1 && isYearMonth(firstMonth)
      ? {
          id: editing?.id ?? "draft",
          description: description.trim() || "Compra",
          totalCents,
          installments: count,
          firstMonth,
          status: "active",
          createdAt: editing?.createdAt ?? new Date().toISOString(),
        }
      : null;

  const sim = useMemo(() => (draft ? simulatePurchase(data, draft) : null), [data, draft?.totalCents, draft?.installments, draft?.firstMonth]);

  const submit = () => {
    if (!description.trim()) return setError("Diga o que você quer comprar.");
    if (!draft) return setError("Informe o valor total.");
    savePlan({ ...draft, id: editing?.id ?? newId("plan"), description: description.trim() });
    toast({ tone: "success", message: editing ? "Compra planejada atualizada" : "Adicionada ao planejamento" });
    setDescription("");
    setDigits("");
    setError(null);
    onDone();
  };

  const display = formatBRL(totalCents);
  const comma = display.lastIndexOf(",");

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <label htmlFor="plan-desc" className="text-[13px] text-muted">
          O que você quer comprar?
        </label>
        <input
          id="plan-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ex.: Geladeira"
          className="w-60 border-b border-line bg-transparent py-1.5 text-center text-[17px] font-semibold text-fg placeholder:text-muted/60 focus:border-accent focus:outline-none"
        />
        <label htmlFor="plan-value" className="sr-only">
          Valor total
        </label>
        <div className="relative mt-2">
          <input
            id="plan-value"
            inputMode="numeric"
            autoComplete="off"
            value={digits}
            onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").replace(/^0+/, "").slice(0, 10))}
            className="absolute inset-0 w-full cursor-text opacity-0"
            aria-describedby="plan-value-display"
          />
          <p id="plan-value-display" aria-hidden className="font-display pointer-events-none leading-none font-semibold tracking-tight">
            <span className={cn("text-[3.25rem]", !totalCents && "text-muted/50")}>{display.slice(0, comma)}</span>
            <span className="text-3xl text-muted/60">{display.slice(comma)}</span>
          </p>
        </div>
        <span className="text-xs text-muted">toque no valor e digite só números</span>
      </div>

      <div role="radiogroup" aria-label="Parcelas" className="grid grid-cols-6 gap-1.5">
        {[...INSTALLMENTS.map(String), "custom"].map((value) => {
          const selected = installments === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setInstallments(value)}
              className={cn(
                "font-display h-11 rounded-2xl text-[15px] font-semibold",
                selected ? "bg-fg text-bg" : "border border-line bg-surface text-fg",
              )}
            >
              {value === "custom" ? "Outro" : `${value}x`}
            </button>
          );
        })}
      </div>
      {installments === "custom" && (
        <Field label="Número de parcelas">
          <TextInput inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, "").slice(0, 2))} />
        </Field>
      )}

      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-[15px] text-fg/80">
        {draft ? (
          <span>
            {count === 1 ? "À vista" : `${count}x de `}
            {count > 1 && <strong className="text-fg">{formatBRL(planInstallmentCents(draft, 1))}</strong>} · começando em
          </span>
        ) : (
          <span>Começando em</span>
        )}
        <label className="sr-only" htmlFor="plan-month">
          Primeira cobrança
        </label>
        <input
          id="plan-month"
          type="month"
          value={firstMonth}
          onChange={(e) => setFirstMonth(e.target.value)}
          className="h-10 rounded-full border border-line bg-surface px-3 text-[15px] font-semibold text-fg"
        />
      </div>

      {sim && draft && (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full",
                sim.worst.balanceCents >= 0 ? "bg-lime text-ink" : "bg-negative text-white",
              )}
            >
              {sim.worst.balanceCents >= 0 ? <Check className="size-5" aria-hidden /> : <TriangleAlert className="size-5" aria-hidden />}
            </span>
            <div>
              <p className="text-[15px] font-bold">{sim.worst.balanceCents >= 0 ? "Cabe no orçamento" : "Aperta o orçamento"}</p>
              <p className="text-[13px] text-muted">
                Mês mais apertado: {formatMonthShort(sim.worst.month)} ·{" "}
                {sim.worst.balanceCents >= 0 ? `sobram ${formatBRL(sim.worst.balanceCents)}` : `faltam ${formatBRL(-sim.worst.balanceCents)}`}
              </p>
            </div>
          </div>
          <ImpactBars before={sim.before.map((m) => m.balanceCents)} after={sim.after.map((m) => m.balanceCents)} />
          <div className="grid grid-cols-6 text-center text-xs text-muted" aria-hidden>
            {sim.after.slice(0, 6).map((m) => (
              <span key={m.month}>{formatMonthShort(m.month).slice(0, 3)}</span>
            ))}
          </div>
          <div className="flex gap-4 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-line" />Sobra hoje</span>
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-sm bg-violet" />Com a compra</span>
          </div>
          <table className="sr-only">
            <caption>Sobra mensal antes e depois da compra</caption>
            <tbody>
              {sim.after.map((m, i) => (
                <tr key={m.month}>
                  <th scope="row">{formatMonthName(m.month)}</th>
                  <td>hoje {formatBRL(sim.before[i].balanceCents)}</td>
                  <td>com a compra {formatBRL(m.balanceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {sim?.bestStart && draft && sim.bestStart.month !== draft.firstMonth && sim.bestStart.worstBalanceCents > sim.worst.balanceCents + 5000 && (
        <button
          type="button"
          onClick={() => setFirstMonth(sim.bestStart!.month)}
          className="flex w-full items-start gap-3 rounded-[1.25rem] border border-line bg-surface p-4 text-left text-[14px] leading-relaxed text-fg/90"
        >
          <Lightbulb className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
          <span>
            <strong className="text-fg">Dica:</strong> começando em {formatMonthName(sim.bestStart.month).toLowerCase()}, o mês mais apertado
            fica com {formatBRL(sim.bestStart.worstBalanceCents)}. <span className="font-semibold text-accent underline">Usar esse mês</span>
          </span>
        </button>
      )}

      {error && <p className="text-center text-sm font-semibold text-negative">{error}</p>}

      <div className="flex gap-2">
        {editing && (
          <Button variant="secondary" size="lg" onClick={onDone}>
            Cancelar
          </Button>
        )}
        <Button type="submit" size="lg" block>
          {editing ? "Salvar alterações" : "Adicionar ao planejamento"}
        </Button>
      </div>
    </form>
  );
}

export default function PlansPage() {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const toast = useToast();
  const [editing, setEditing] = useState<PlannedPurchase | null>(null);
  const [view, setView] = useState<"active" | "history">("active");

  const plans = Object.values(data.plans).sort((a, b) => a.firstMonth.localeCompare(b.firstMonth));
  const active = plans.filter((p) => p.status === "active");
  const history = plans.filter((p) => p.status !== "active");
  const list = view === "active" ? active : history;

  const changeStatus = (plan: PlannedPurchase, status: PlannedPurchase["status"], message: string) => {
    const undoPatch = setPlanStatus(plan.id, status);
    toast({ message, action: { label: "Desfazer", onClick: () => undo(undoPatch) } });
  };

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 [&>*]:min-w-0">
      <section aria-labelledby="sim-title">
        <p className="text-[13px] text-muted">Simulador</p>
        <h2 id="sim-title" className="mb-5 text-xl font-bold">
          {editing ? `Editando “${editing.description}”` : "Posso comprar?"}
        </h2>
        <Simulator key={editing?.id ?? "new"} editing={editing} onDone={() => setEditing(null)} />
      </section>

      <section aria-labelledby="plans-title">
        <SectionTitle
          id="plans-title"
          title="Compras planejadas"
          description="Entram na previsão dos próximos meses até aparecerem na fatura."
        />
        <Segmented
          label="Exibir"
          value={view}
          onChange={setView}
          options={[
            { value: "active", label: `Ativas (${active.length})` },
            { value: "history", label: `Histórico (${history.length})` },
          ]}
        />
        <div className="mt-4">
          {list.length === 0 ? (
            <EmptyState
              icon={CalendarClock}
              title={view === "active" ? "Nada planejado" : "Histórico vazio"}
              description={view === "active" ? "Simule uma compra e adicione ao planejamento." : "Compras confirmadas na fatura ou arquivadas aparecem aqui."}
            />
          ) : (
            <ul className="space-y-2.5">
              {list.map((plan) => {
                const n = planInstallmentNumber(plan, month);
                const lastMonth = addMonths(plan.firstMonth, plan.installments - 1);
                return (
                  <li key={plan.id} className="rounded-[1.25rem] bg-surface p-4">
                    <div className="flex items-start gap-3">
                      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => { setEditing(plan); window.scrollTo({ top: 0, behavior: "smooth" }); }} aria-label={`Editar ${plan.description}`}>
                        <p className="text-[15px] font-bold text-fg">{plan.description}</p>
                        <p className="mt-0.5 text-[13px] text-muted">
                          {plan.installments === 1 ? "À vista" : `${plan.installments}x de ${formatBRL(planInstallmentCents(plan, 1))}`} ·{" "}
                          {formatMonthShort(plan.firstMonth)}
                          {plan.installments > 1 && ` a ${formatMonthShort(lastMonth)}`}
                        </p>
                      </button>
                      <Money cents={plan.totalCents} className="font-display text-[15px] font-semibold" />
                    </div>
                    {view === "active" ? (
                      <>
                        <div className="mt-3 flex items-center gap-2">
                          <ProgressBar value={n ?? 0} max={plan.installments} label={`Parcela ${n ?? 0} de ${plan.installments}`} />
                          <span className="shrink-0 text-[13px] text-muted tabular">
                            {n ? `${n}/${plan.installments}` : plan.firstMonth > month ? "não começou" : "terminou"}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button size="sm" variant="secondary" icon={CircleCheck} onClick={() => changeStatus(plan, "confirmed", "Marcada como lançada na fatura")}>
                            Já veio na fatura
                          </Button>
                          <Button size="sm" variant="ghost" icon={Archive} onClick={() => changeStatus(plan, "archived", "Compra arquivada")}>
                            Arquivar
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <Badge tone={plan.status === "confirmed" ? "positive" : "neutral"}>
                          {plan.status === "confirmed" ? "Lançada na fatura" : "Arquivada"}
                        </Badge>
                        <div className="flex">
                          <IconButton label={`Reativar ${plan.description}`} icon={RotateCcw} onClick={() => changeStatus(plan, "active", "Compra reativada")} />
                          <IconButton
                            label={`Excluir ${plan.description}`}
                            icon={Trash2}
                            tone="danger"
                            onClick={() => {
                              const undoPatch = deletePlan(plan.id);
                              toast({ message: "Compra excluída", action: { label: "Desfazer", onClick: () => undo(undoPatch) } });
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
