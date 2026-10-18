import { CircleDollarSign, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { addToGoal, deleteGoal, saveGoal, undo } from "../../app/actions";
import { useAppState } from "../../app/store";
import { goalEta, suggestedEmergencyFund } from "../../domain/insights";
import { formatBRL, sumCents } from "../../domain/money";
import { addMonths, currentMonth, formatMonthShort } from "../../domain/month";
import { projectMonths } from "../../domain/projection";
import { newId, type Goal } from "../../domain/types";
import { Button } from "../../ui/Button";
import { Card } from "../../ui/display";
import { Field, MoneyInput, TextInput } from "../../ui/form";
import { Sheet } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";
import { cn } from "../../ui/cn";

function Ring({ pct, size = 132, stroke = 14, track, color }: { pct: number; size?: number; stroke?: number; track: string; color: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${(Math.min(100, pct) / 100) * c} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}

const pctOf = (g: Goal) => Math.round((g.savedCents / g.targetCents) * 100);

function GoalSheet({
  open,
  onClose,
  goal,
  kind,
  suggestedTarget,
}: {
  open: boolean;
  onClose: () => void;
  goal: Goal | null;
  kind: Goal["kind"];
  suggestedTarget?: number;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [target, setTarget] = useState<number | null>(null);
  const [saved, setSaved] = useState<number | null>(null);
  const [monthly, setMonthly] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? (kind === "emergency" ? "Reserva de emergência" : ""));
    setTarget(goal?.targetCents ?? suggestedTarget ?? null);
    setSaved(goal?.savedCents ?? null);
    setMonthly(goal?.monthlyCents ?? null);
    setErrors({});
  }, [open, goal, kind, suggestedTarget]);

  const submit = () => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Dê um nome para a meta.";
    if (!target) next.target = "Informe quanto quer juntar.";
    setErrors(next);
    if (Object.keys(next).length) return;
    saveGoal({
      id: goal?.id ?? newId("goal"),
      name: name.trim(),
      kind: goal?.kind ?? kind,
      targetCents: target!,
      savedCents: saved ?? 0,
      monthlyCents: monthly ?? 0,
      createdAt: goal?.createdAt ?? new Date().toISOString(),
    });
    toast({ tone: "success", message: goal ? "Meta atualizada" : "Meta criada" });
    onClose();
  };

  const remove = () => {
    if (!goal) return;
    const undoPatch = deleteGoal(goal.id);
    toast({ message: `“${goal.name}” excluída`, action: { label: "Desfazer", onClick: () => undo(undoPatch) } });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={goal ? "Ajustar meta" : kind === "emergency" ? "Reserva de emergência" : "Nova meta"}
      description={kind === "emergency" && !goal ? "Sugestão: 6 meses do seu custo mensal (contas fixas + cartão)." : undefined}
      onSubmit={submit}
      footer={
        <>
          {goal && (
            <Button variant="ghost" icon={Trash2} className="text-negative" onClick={remove}>
              Excluir
            </Button>
          )}
          <Button type="submit" className="ml-auto min-w-32">
            Salvar
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Nome" error={errors.name}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Viagem, Troca do celular" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Quanto juntar" error={errors.target}>
            <MoneyInput value={target} onChange={setTarget} />
          </Field>
          <Field label="Já guardado">
            <MoneyInput value={saved} onChange={setSaved} />
          </Field>
        </div>
        <Field label="Guardar por mês" hint="Usado para prever quando a meta é atingida.">
          <MoneyInput value={monthly} onChange={setMonthly} />
        </Field>
      </div>
    </Sheet>
  );
}

function DepositSheet({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const toast = useToast();
  const [amount, setAmount] = useState<number | null>(null);
  useEffect(() => {
    if (goal) setAmount(goal.monthlyCents || null);
  }, [goal]);
  const submit = (sign: 1 | -1) => {
    if (!goal || !amount) return;
    const undoPatch = addToGoal(goal, sign * amount);
    toast({
      tone: "success",
      message: sign > 0 ? `${formatBRL(amount)} guardados em “${goal.name}”` : `${formatBRL(amount)} retirados de “${goal.name}”`,
      action: { label: "Desfazer", onClick: () => undo(undoPatch) },
    });
    onClose();
  };
  return (
    <Sheet
      open={goal !== null}
      onClose={onClose}
      title={goal ? `Guardar em “${goal.name}”` : ""}
      onSubmit={() => submit(1)}
      footer={
        <>
          <Button variant="secondary" onClick={() => submit(-1)}>
            Retirar
          </Button>
          <Button type="submit" className="ml-auto min-w-32">
            Guardar
          </Button>
        </>
      }
    >
      <Field label="Valor">
        <MoneyInput value={amount} onChange={setAmount} />
      </Field>
    </Sheet>
  );
}

export default function GoalsPage() {
  const data = useAppState((s) => s.data);
  const month = currentMonth();
  const [editing, setEditing] = useState<{ goal: Goal | null; kind: Goal["kind"] } | null>(null);
  const [depositing, setDepositing] = useState<Goal | null>(null);

  const goals = Object.values(data.goals).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const reserve = goals.find((g) => g.kind === "emergency");
  const others = goals.filter((g) => g.kind !== "emergency");
  const suggested = useMemo(() => suggestedEmergencyFund(data, month), [data, month]);
  const nextMonth = useMemo(() => projectMonths(data, addMonths(month, 1), 1)[0], [data, month]);
  const monthlyTotal = sumCents(goals.filter((g) => g.savedCents < g.targetCents).map((g) => g.monthlyCents));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">Guardando dinheiro</p>
          <h2 className="text-xl font-bold">Metas e reserva</h2>
        </div>
        <Button icon={Plus} onClick={() => setEditing({ goal: null, kind: "goal" })}>
          Meta
        </Button>
      </div>

      {reserve ? (
        <section className="space-y-4 rounded-[1.75rem] border border-line bg-surface p-5 text-fg" aria-label="Reserva de emergência">
          <div className="flex items-center justify-between gap-2">
            <span className="rounded-full bg-surface-2 px-3 py-1 text-xs font-bold tracking-wide text-muted">RESERVA DE EMERGÊNCIA</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative">
              <Ring pct={pctOf(reserve)} track="var(--app-surface-2)" color="var(--app-accent)" />
              <span className="font-display absolute inset-0 flex items-center justify-center text-3xl font-bold">{pctOf(reserve)}%</span>
            </div>
            <div className="space-y-1">
              <p className="font-display text-2xl font-bold">{formatBRL(reserve.savedCents)}</p>
              <p className="text-[13px] font-semibold">de {formatBRL(reserve.targetCents)}</p>
              <p className="pt-1 text-[13px] font-semibold">
                {reserve.savedCents >= reserve.targetCents
                  ? "Reserva completa!"
                  : goalEta(reserve, month)
                    ? `Guardando ${formatBRL(reserve.monthlyCents)}/mês, completa em ${formatMonthShort(goalEta(reserve, month)!)}`
                    : "Defina quanto guardar por mês para prever a data."}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDepositing(reserve)} className="h-11 rounded-full bg-accent text-[14px] font-bold text-accent-fg">
              Guardar agora
            </button>
            <button
              type="button"
              onClick={() => setEditing({ goal: reserve, kind: "emergency" })}
              className="h-11 rounded-full border border-line text-[14px] font-bold text-fg hover:bg-surface-2"
            >
              Ajustar meta
            </button>
          </div>
        </section>
      ) : (
        <button
          type="button"
          onClick={() => setEditing({ goal: null, kind: "emergency" })}
          className="flex w-full items-center gap-4 rounded-[1.75rem] border border-dashed border-line bg-surface p-5 text-left text-fg hover:bg-surface-2"
        >
          <ShieldCheck className="size-9 shrink-0" aria-hidden />
          <span>
            <span className="block text-lg font-bold">Criar reserva de emergência</span>
            <span className="block text-[13px] font-semibold">Sugestão: {formatBRL(suggested)} (6 meses do seu custo)</span>
          </span>
        </button>
      )}

      {others.length > 0 && (
        <ul className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
          {others.map((g, i) => {
            const pct = pctOf(g);
            const eta = goalEta(g, month);
            const highlight = i === 0;
            return (
              <li key={g.id}>
                <div className={cn("flex h-full flex-col gap-2.5 rounded-3xl p-4", "border border-line bg-surface")}>
                  <button type="button" onClick={() => setEditing({ goal: g, kind: "goal" })} className="text-left text-[13px] font-bold">
                    {g.name}
                  </button>
                  <span className="font-display text-2xl font-bold">{pct}%</span>
                  <span className={cn("h-2 overflow-hidden rounded-full", "bg-surface-2")} aria-hidden>
                    <span className={cn("block h-full rounded-full", highlight ? "bg-accent" : "bg-fg/40")} style={{ width: `${Math.min(100, pct)}%` }} />
                  </span>
                  <span className={cn("text-xs font-semibold", "text-muted")}>
                    {formatBRL(g.savedCents)} de {formatBRL(g.targetCents)}
                    {eta && g.savedCents < g.targetCents && ` · ${formatMonthShort(eta)}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setDepositing(g)}
                    className={cn(
                      "mt-auto h-10 rounded-full text-[13px] font-bold",
                      "bg-surface-2 text-fg",
                    )}
                  >
                    Guardar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Card className="flex items-center gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <CircleDollarSign className="size-5" aria-hidden />
        </span>
        <p className="text-[15px] leading-relaxed text-fg/80">
          Em {formatMonthShort(nextMonth.month)} devem sobrar <strong className="text-fg">{formatBRL(nextMonth.balanceCents)}</strong>.
          {monthlyTotal > 0
            ? nextMonth.balanceCents >= monthlyTotal
              ? ` Separar ${formatBRL(monthlyTotal)} mantém todas as metas no prazo.`
              : ` As metas pedem ${formatBRL(monthlyTotal)} por mês — mais do que a sobra prevista.`
            : " Defina quanto guardar por mês em cada meta para acompanhar o prazo."}
        </p>
      </Card>

      <GoalSheet
        open={editing !== null}
        onClose={() => setEditing(null)}
        goal={editing?.goal ?? null}
        kind={editing?.kind ?? "goal"}
        suggestedTarget={editing?.kind === "emergency" ? suggested : undefined}
      />
      <DepositSheet goal={depositing} onClose={() => setDepositing(null)} />
    </div>
  );
}
