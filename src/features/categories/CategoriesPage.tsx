import { ChartPie, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { setCategoryBudget } from "../../app/actions";
import { useMonth } from "../../app/month";
import { useAppState } from "../../app/store";
import { PURCHASE_CATEGORIES } from "../../domain/categories";
import { budgetStatus, categoryBreakdown, topCategories, type BudgetStatus, type CategoryShare } from "../../domain/insights";
import { formatBRL, sumCents } from "../../domain/money";
import { addMonths, formatMonthName } from "../../domain/month";
import { Button } from "../../ui/Button";
import { Card, EmptyState, SectionTitle } from "../../ui/display";
import { MoneyInput } from "../../ui/form";
import { Sheet } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";
import { CategoryIcon, categoryStyle } from "../../ui/category";
import { cn } from "../../ui/cn";

const RADIUS = 80;
const CIRC = 2 * Math.PI * RADIUS;
const GAP = 6;

function compactTotal(cents: number): string {
  const reais = cents / 100;
  if (reais >= 1000) return `${(reais / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return reais.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Rosca segmentada com espaço entre as fatias (referência Finance Widgets). */
function Donut({ rows, total }: { rows: CategoryShare[]; total: number }) {
  const usable = CIRC - GAP * rows.length;
  let offset = 0;
  const arcs = rows.map((row) => {
    const length = Math.max(2, usable * row.share);
    const arc = { row, length, offset };
    offset += length + GAP;
    return arc;
  });
  return (
    <div className="relative size-44 shrink-0">
      <svg
        viewBox="0 0 200 200"
        className="size-full"
        role="img"
        aria-label={`Gastos por categoria: ${rows.map((r) => `${r.category} ${Math.round(r.share * 100)}%`).join(", ")}`}
      >
        <g transform="rotate(-90 100 100)" fill="none" strokeWidth="18" strokeLinecap="round">
          {arcs.map(({ row, length, offset }) => (
            <circle
              key={row.category}
              cx="100"
              cy="100"
              r={RADIUS}
              stroke={categoryStyle(row.category).color}
              strokeDasharray={`${length} ${CIRC - length}`}
              strokeDashoffset={-offset}
            />
          ))}
        </g>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xs text-muted">sua parte</span>
        <span className="font-display text-3xl font-bold tracking-tight">{compactTotal(total)}</span>
      </div>
    </div>
  );
}

function BudgetRow({ status }: { status: BudgetStatus }) {
  const { category, spentCents, limitCents, ratio, state } = status;
  const color = state === "over" ? "bg-negative" : state === "near" ? "bg-warning" : "bg-fg/40";
  const label =
    state === "over"
      ? `${formatBRL(spentCents - limitCents)} acima`
      : state === "near"
        ? "Quase no limite"
        : `${formatBRL(limitCents - spentCents)} livres`;
  return (
    <li className="space-y-2.5 rounded-[1.25rem] bg-surface p-4">
      <div className="flex items-center gap-3">
        <CategoryIcon category={category} size="sm" />
        <span className="flex-1 text-[15px] font-semibold">{category}</span>
        <span className={cn("text-[13px] font-bold", state === "over" ? "text-negative" : state === "near" ? "text-warning" : "text-positive")}>
          {label}
        </span>
      </div>
      <div
        className="h-2.5 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-label={`${category}: ${Math.round(ratio * 100)}% do limite`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(ratio * 100))}
      >
        <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <div className="flex justify-between text-[13px] text-muted">
        <span>
          {formatBRL(spentCents)} de {formatBRL(limitCents)}
        </span>
        <span className="tabular">{Math.round(ratio * 100)}%</span>
      </div>
    </li>
  );
}

function BudgetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, number | null>>({});

  // Sugestão: média das 3 faturas anteriores por categoria.
  const averages = useMemo(() => {
    const sums = new Map<string, number>();
    let count = 0;
    for (let i = 0; i < 3; i++) {
      const rows = categoryBreakdown(data, addMonths(month, -i));
      if (rows.length === 0) continue;
      count++;
      for (const r of rows) sums.set(r.category, (sums.get(r.category) ?? 0) + r.cents);
    }
    return new Map([...sums].map(([k, v]) => [k, Math.round(v / Math.max(1, count) / 1000) * 1000]));
  }, [data, month]);

  useEffect(() => {
    if (open) setValues({ ...data.settings.categoryBudgets });
  }, [open, data.settings.categoryBudgets]);

  const save = () => {
    for (const category of PURCHASE_CATEGORIES) {
      const next = values[category] ?? null;
      if ((data.settings.categoryBudgets[category] ?? null) !== next) setCategoryBudget(category, next);
    }
    toast({ tone: "success", message: "Limites salvos" });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Limites por categoria"
      description="Deixe em branco para não acompanhar a categoria."
      onSubmit={save}
      footer={
        <Button type="submit" block>
          Salvar limites
        </Button>
      }
    >
      <ul className="space-y-3">
        {PURCHASE_CATEGORIES.map((category) => {
          const avg = averages.get(category);
          return (
            <li key={category} className="flex items-center gap-3">
              <CategoryIcon category={category} size="sm" />
              <label htmlFor={`budget-${category}`} className="flex-1 text-[15px] font-medium">
                {category}
                {avg ? <span className="block text-xs text-muted">média {formatBRL(avg)}</span> : null}
              </label>
              <MoneyInput
                id={`budget-${category}`}
                className="w-36 text-right"
                value={values[category] ?? null}
                onChange={(v) => setValues((s) => ({ ...s, [category]: v }))}
              />
            </li>
          );
        })}
      </ul>
    </Sheet>
  );
}

export default function CategoriesPage() {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const [editing, setEditing] = useState(false);
  const rows = useMemo(() => categoryBreakdown(data, month), [data, month]);
  const chart = topCategories(rows);
  const total = sumCents(rows.map((r) => r.cents));
  const budgets = useMemo(() => budgetStatus(data, month), [data, month]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[13px] text-muted">{formatMonthName(month)}</p>
        <h2 className="text-xl font-bold">Para onde foi o dinheiro</h2>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={ChartPie}
          title="Sem fatura neste mês"
          description="Importe a fatura do cartão para ver os gastos por categoria."
          action={
            <a href="#/fatura" className="inline-flex h-11 items-center rounded-full bg-accent px-5 font-bold text-accent-fg">
              Importar fatura
            </a>
          }
        />
      ) : (
        <Card className="flex flex-col items-center gap-5 sm:flex-row">
          <Donut rows={chart} total={total} />
          <ul className="grid w-full flex-1 gap-2.5 text-[14px]">
            {chart.map((r) => (
              <li key={r.category} className="flex items-center gap-2.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: categoryStyle(r.category).color }} aria-hidden />
                <span className="flex-1">{r.category}</span>
                <span className="tabular text-muted">{formatBRL(r.cents)}</span>
                <span className="tabular w-10 text-right font-semibold">{Math.round(r.share * 100)}%</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <section aria-labelledby="budget-title">
        <SectionTitle
          id="budget-title"
          title="Orçamento por categoria"
          description="Limite mensal para os gastos do cartão."
          action={
            <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
              {budgets.length ? "Editar limites" : "Definir limites"}
            </Button>
          }
        />
        {budgets.length === 0 ? (
          <p className="rounded-[1.25rem] border border-dashed border-line p-5 text-center text-[15px] text-muted">
            Defina um limite para Mercado, Alimentação, Lazer… e acompanhe aqui quanto já foi.
          </p>
        ) : (
          <ul className="grid gap-2.5 lg:grid-cols-2">
            {budgets.map((b) => (
              <BudgetRow key={b.category} status={b} />
            ))}
          </ul>
        )}
      </section>

      {rows.length > chart.length && (
        <details className="rounded-[1.25rem] border border-line bg-surface p-4">
          <summary className="text-[15px] font-semibold marker:content-none">Todas as categorias ({rows.length})</summary>
          <ul className="mt-3 space-y-2">
            {rows.map((r) => (
              <li key={r.category} className="flex items-center gap-3 text-[14px]">
                <CategoryIcon category={r.category} size="sm" />
                <span className="flex-1">{r.category}</span>
                <span className="tabular">{formatBRL(r.cents)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <BudgetSheet open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}
