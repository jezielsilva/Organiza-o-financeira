import { Banknote, Plus, ReceiptText, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { deleteBill, deleteIncome, saveBill, saveIncome, setBillActive, undo } from "../../app/actions";
import { useMonth } from "../../app/month";
import { useAppState } from "../../app/store";
import { BILL_CATEGORIES } from "../../domain/categories";
import { formatMonthLong, formatMonthShort } from "../../domain/month";
import { billsForMonth, incomeForMonth } from "../../domain/projection";
import { newId, type FixedBill, type Income } from "../../domain/types";
import { Button } from "../../ui/Button";
import { Badge, Card, EmptyState, Money, SectionTitle } from "../../ui/display";
import { Field, MoneyInput, Segmented, Select, Switch, TextInput } from "../../ui/form";
import { Sheet } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";
import { cn } from "../../ui/cn";

function IncomeSheet({ income, open, onClose }: { income: Income | null; open: boolean; onClose: () => void }) {
  const { month } = useMonth();
  const toast = useToast();
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [recurrence, setRecurrence] = useState<Income["recurrence"]>("monthly");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setLabel(income?.label ?? "");
    setAmount(income?.amountCents ?? null);
    setRecurrence(income?.recurrence ?? "monthly");
    setErrors({});
  }, [open, income]);

  const submit = () => {
    const next: Record<string, string> = {};
    if (!label.trim()) next.label = "Dê um nome para a renda.";
    if (!amount) next.amount = "Informe um valor maior que zero.";
    setErrors(next);
    if (Object.keys(next).length) return;
    saveIncome({
      id: income?.id ?? newId("inc"),
      label: label.trim(),
      amountCents: amount!,
      recurrence,
      startMonth: income?.startMonth ?? month,
    });
    toast({ tone: "success", message: income ? "Renda atualizada" : "Renda adicionada" });
    onClose();
  };

  const remove = () => {
    if (!income) return;
    const undoPatch = deleteIncome(income.id);
    toast({ message: `“${income.label}” excluída`, action: { label: "Desfazer", onClick: () => undo(undoPatch) } });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={income ? "Editar renda" : "Nova renda"}
      onSubmit={submit}
      footer={
        <>
          {income && (
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
        <Field label="Nome" error={errors.label}>
          <TextInput value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Salário, Freela" autoFocus={!income} />
        </Field>
        <Field label="Valor" error={errors.amount}>
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <div>
          <p className="mb-1.5 text-sm font-medium text-fg">Frequência</p>
          <Segmented
            label="Frequência"
            value={recurrence}
            onChange={setRecurrence}
            options={[
              { value: "monthly", label: "Todo mês" },
              { value: "single", label: "Só este mês" },
            ]}
          />
          <p className="mt-1.5 text-sm text-muted">
            {recurrence === "monthly"
              ? `Entra todo mês a partir de ${formatMonthLong(income?.startMonth ?? month)}.`
              : `Entra só em ${formatMonthLong(income?.startMonth ?? month)}.`}
          </p>
        </div>
      </div>
    </Sheet>
  );
}

function BillSheet({ bill, open, onClose }: { bill: FixedBill | null; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [amount, setAmount] = useState<number | null>(null);
  const [dueDay, setDueDay] = useState("10");
  const [category, setCategory] = useState("Moradia");
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setName(bill?.name ?? "");
    setAmount(bill?.amountCents ?? null);
    setDueDay(String(bill?.dueDay ?? 10));
    setCategory(bill?.category ?? "Moradia");
    setErrors({});
  }, [open, bill]);

  const submit = () => {
    const next: Record<string, string> = {};
    const day = Number(dueDay);
    if (!name.trim()) next.name = "Dê um nome para a conta.";
    if (!amount) next.amount = "Informe um valor maior que zero.";
    if (!Number.isInteger(day) || day < 1 || day > 31) next.dueDay = "Use um dia entre 1 e 31.";
    setErrors(next);
    if (Object.keys(next).length) return;
    saveBill({
      id: bill?.id ?? newId("bill"),
      name: name.trim(),
      amountCents: amount!,
      dueDay: day,
      category,
      active: bill?.active ?? true,
    });
    toast({ tone: "success", message: bill ? "Conta atualizada" : "Conta adicionada" });
    onClose();
  };

  const remove = () => {
    if (!bill) return;
    const undoPatch = deleteBill(bill.id);
    toast({ message: `“${bill.name}” excluída`, action: { label: "Desfazer", onClick: () => undo(undoPatch) } });
    onClose();
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={bill ? "Editar conta fixa" : "Nova conta fixa"}
      onSubmit={submit}
      footer={
        <>
          {bill && (
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
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Aluguel, Internet" autoFocus={!bill} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Valor mensal" error={errors.amount}>
            <MoneyInput value={amount} onChange={setAmount} />
          </Field>
          <Field label="Dia do vencimento" error={errors.dueDay}>
            <TextInput inputMode="numeric" value={dueDay} onChange={(e) => setDueDay(e.target.value.replace(/\D/g, "").slice(0, 2))} />
          </Field>
        </div>
        <Field label="Categoria">
          <Select value={category} onChange={(e) => setCategory(e.target.value)}>
            {BILL_CATEGORIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
      </div>
    </Sheet>
  );
}

export default function BillsPage() {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const [incomeSheet, setIncomeSheet] = useState<{ income: Income | null } | null>(null);
  const [billSheet, setBillSheet] = useState<{ bill: FixedBill | null } | null>(null);

  const incomes = Object.values(data.incomes)
    .filter((i) => (i.recurrence === "single" ? i.startMonth === month : i.startMonth <= month))
    .sort((a, b) => b.amountCents - a.amountCents);
  const futureIncomes = Object.values(data.incomes).filter((i) => i.startMonth > month);
  const bills = Object.values(data.bills).sort((a, b) => Number(b.active) - Number(a.active) || a.dueDay - b.dueDay);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <SectionTitle
          title="Renda"
          description={
            <>
              Em {formatMonthLong(month)}: <Money cents={incomeForMonth(data, month)} className="font-semibold text-positive" />
            </>
          }
          action={
            <Button size="sm" icon={Plus} onClick={() => setIncomeSheet({ income: null })}>
              Renda
            </Button>
          }
        />
        {incomes.length === 0 ? (
          <EmptyState icon={Banknote} title="Nenhuma renda neste mês" description="Cadastre salário e outras entradas para o app calcular quanto sobra." />
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {incomes.map((income) => (
              <li key={income.id}>
                <button
                  type="button"
                  onClick={() => setIncomeSheet({ income })}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.9375rem] text-fg">{income.label}</p>
                    <p className="text-sm text-muted">
                      {income.recurrence === "monthly" ? `Todo mês desde ${formatMonthShort(income.startMonth)}` : "Só neste mês"}
                    </p>
                  </div>
                  <Money cents={income.amountCents} className="text-[0.9375rem] font-semibold" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {futureIncomes.length > 0 && (
          <p className="mt-3 text-sm text-muted">
            {futureIncomes.length} renda{futureIncomes.length > 1 ? "s" : ""} começa{futureIncomes.length > 1 ? "m" : ""} em meses futuros.
          </p>
        )}
      </Card>

      <Card>
        <SectionTitle
          title="Contas fixas"
          description={
            <>
              Total ativo por mês: <Money cents={billsForMonth(data)} className="font-semibold text-fg" />
            </>
          }
          action={
            <Button size="sm" icon={Plus} onClick={() => setBillSheet({ bill: null })}>
              Conta
            </Button>
          }
        />
        {bills.length === 0 ? (
          <EmptyState icon={ReceiptText} title="Nenhuma conta fixa" description="Aluguel, luz, internet, escola… tudo que se repete todo mês." />
        ) : (
          <ul className="divide-y divide-line rounded-2xl border border-line">
            {bills.map((bill) => (
              <li key={bill.id} className={cn("flex items-center gap-2 pr-3", !bill.active && "opacity-60")}>
                <button
                  type="button"
                  onClick={() => setBillSheet({ bill })}
                  className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 text-left"
                >
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-[0.9375rem] text-fg", !bill.active && "line-through")}>{bill.name}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
                      Vence dia {bill.dueDay} <Badge>{bill.category}</Badge>
                      {!bill.active && <Badge tone="warning">pausada</Badge>}
                    </p>
                  </div>
                  <Money cents={bill.amountCents} className="text-[0.9375rem] font-semibold" />
                </button>
                <Switch
                  checked={bill.active}
                  onChange={(v) => setBillActive(bill.id, v)}
                  label={`Conta ${bill.name} ativa`}
                  className="[&>div:first-child]:sr-only"
                />
              </li>
            ))}
          </ul>
        )}
        {bills.some((b) => !b.active) && (
          <p className="mt-3 text-sm text-muted">
            Contas pausadas ({bills.filter((b) => !b.active).length}) não entram no cálculo.
          </p>
        )}
      </Card>

      <IncomeSheet open={incomeSheet !== null} income={incomeSheet?.income ?? null} onClose={() => setIncomeSheet(null)} />
      <BillSheet open={billSheet !== null} bill={billSheet?.bill ?? null} onClose={() => setBillSheet(null)} />
    </div>
  );
}
