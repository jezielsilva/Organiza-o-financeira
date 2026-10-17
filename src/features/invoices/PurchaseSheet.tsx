import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { PURCHASE_CATEGORIES } from "../../domain/categories";
import { newId, type Invoice, type Purchase } from "../../domain/types";
import { Button } from "../../ui/Button";
import { Field, MoneyInput, Select, Switch, TextInput } from "../../ui/form";
import { Sheet } from "../../ui/Sheet";

interface Draft {
  description: string;
  amount: number | null;
  date: string;
  category: string;
  installment: boolean;
  current: string;
  total: string;
  holder: string;
  ignored: boolean;
  refund: boolean;
}

function toDraft(purchase: Purchase | null, invoice: Invoice): Draft {
  return {
    description: purchase?.description ?? "",
    amount: purchase ? Math.abs(purchase.amountCents) : null,
    date: purchase?.date ?? `${invoice.month}-01`,
    category: purchase?.category ?? "Outros",
    installment: !!purchase?.installmentTotal,
    current: String(purchase?.installmentCurrent ?? 1),
    total: String(purchase?.installmentTotal ?? 2),
    holder: purchase?.holder ?? "",
    ignored: purchase?.ignored ?? false,
    refund: purchase?.kind === "refund",
  };
}

export function PurchaseSheet({
  open,
  invoice,
  purchase,
  onClose,
  onSave,
  onDelete,
}: {
  open: boolean;
  invoice: Invoice;
  purchase: Purchase | null;
  onClose: () => void;
  onSave: (purchase: Purchase) => void;
  onDelete: (purchase: Purchase) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(purchase, invoice));
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setDraft(toDraft(purchase, invoice));
      setErrors({});
    }
  }, [open, purchase, invoice]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const holders = [...new Set(Object.values(invoice.cards).map((c) => c.holder))];

  const submit = () => {
    const next: Record<string, string> = {};
    if (!draft.description.trim()) next.description = "Informe uma descrição.";
    if (!draft.amount) next.amount = "Informe um valor maior que zero.";
    const current = Number(draft.current);
    const total = Number(draft.total);
    if (draft.installment && (!Number.isInteger(total) || total < 2 || total > 99)) next.total = "Entre 2 e 99 parcelas.";
    if (draft.installment && (!Number.isInteger(current) || current < 1 || current > total)) {
      next.current = "A parcela atual deve estar entre 1 e o total.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    const card = Object.values(invoice.cards).find((c) => c.holder === draft.holder);
    onSave({
      id: purchase?.id ?? newId("p"),
      seq: purchase?.seq ?? Object.keys(invoice.purchases).length,
      date: draft.date || undefined,
      description: draft.description.trim(),
      category: draft.category,
      kind: draft.refund ? "refund" : purchase?.kind === "fee" ? "fee" : "purchase",
      amountCents: draft.refund ? -draft.amount! : draft.amount!,
      installmentCurrent: draft.installment ? current : undefined,
      installmentTotal: draft.installment ? total : undefined,
      holder: draft.holder || undefined,
      cardLast4: card?.last4 ?? (draft.holder === purchase?.holder ? purchase?.cardLast4 : undefined),
      ignored: draft.ignored || undefined,
      manual: purchase ? purchase.manual : true,
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={purchase ? "Editar lançamento" : "Novo lançamento"}
      onSubmit={submit}
      footer={
        <>
          {purchase && (
            <Button variant="ghost" icon={Trash2} className="text-negative" onClick={() => onDelete(purchase)}>
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
        <Field label="Descrição" error={errors.description}>
          <TextInput
            value={draft.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="Ex.: Mercado, Farmácia"
            autoFocus={!purchase}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label={draft.installment ? "Valor da parcela" : "Valor"} error={errors.amount}>
            <MoneyInput value={draft.amount} onChange={(v) => set("amount", v)} />
          </Field>
          <Field label="Data da compra">
            <TextInput type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Categoria">
            <Select value={draft.category} onChange={(e) => set("category", e.target.value)}>
              {PURCHASE_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Cartão / portador">
            <Select value={draft.holder} onChange={(e) => set("holder", e.target.value)}>
              <option value="">Não informado</option>
              {holders.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Switch checked={draft.installment} onChange={(v) => set("installment", v)} label="Compra parcelada" />
        {draft.installment && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Parcela atual" error={errors.current}>
              <TextInput inputMode="numeric" value={draft.current} onChange={(e) => set("current", e.target.value.replace(/\D/g, ""))} />
            </Field>
            <Field label="Total de parcelas" error={errors.total}>
              <TextInput inputMode="numeric" value={draft.total} onChange={(e) => set("total", e.target.value.replace(/\D/g, ""))} />
            </Field>
          </div>
        )}
        <Switch
          checked={draft.refund}
          onChange={(v) => set("refund", v)}
          label="É um estorno / crédito"
          description="O valor será descontado da fatura."
        />
        <Switch
          checked={draft.ignored}
          onChange={(v) => set("ignored", v)}
          label="Não é meu"
          description="Continua na lista, mas não entra no seu orçamento."
        />
      </div>
    </Sheet>
  );
}
