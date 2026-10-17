import {
  CircleCheck,
  EyeOff,
  FilePlus2,
  FileUp,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-react";
import { useMemo, useRef, useState, type DragEvent } from "react";
import {
  deleteInvoice,
  deletePurchase,
  importInvoice,
  savePurchase,
  setHolderCounted,
  setPurchaseIgnored,
  undo,
} from "../../app/actions";
import { useMonth } from "../../app/month";
import { useAppState } from "../../app/store";
import { buildInvoice } from "../../domain/invoice/buildInvoice";
import { parseStatement } from "../../domain/invoice/statementParser";
import { documentToLines } from "../../domain/invoice/textLayout";
import { formatBRL, sumCents } from "../../domain/money";
import { formatDate, formatDateShort, formatMonthLong, formatMonthName } from "../../domain/month";
import {
  invoiceReadTotalCents,
  invoiceShareCents,
  invoicesByMonth,
  isHolderCounted,
  isPurchaseCounted,
  sortedPurchases,
} from "../../domain/projection";
import { newId, type Invoice, type Purchase } from "../../domain/types";
import { PdfReadError, readPdfText } from "../../data/pdf/readPdf";
import { Button, IconButton } from "../../ui/Button";
import { Alert, Badge, BigMoney, Card, EmptyState, Money, SectionTitle } from "../../ui/display";
import { CategoryIcon } from "../../ui/category";
import { Segmented, Select, Switch, TextInput } from "../../ui/form";
import { useConfirm } from "../../ui/Sheet";
import { useToast } from "../../ui/Toast";
import { cn } from "../../ui/cn";
import { PurchaseSheet } from "./PurchaseSheet";

type Filter = "counted" | "ignored" | "all";

function useInvoiceImport() {
  const data = useAppState((s) => s.data);
  const { month, setMonth } = useMonth();
  const confirm = useConfirm();
  const toast = useToast();
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const importFile = async (file: File) => {
    setError(null);
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Esse arquivo não é um PDF. Baixe a fatura em PDF no app ou site do cartão e envie aqui.");
      return;
    }
    try {
      setProgress("Abrindo o PDF…");
      const pages = await readPdfText(file, (n, total) => setProgress(`Lendo página ${n} de ${total}…`));
      setProgress("Separando os lançamentos…");
      const parsed = parseStatement(documentToLines(pages), month);
      if (parsed.entries.length === 0) {
        setError(
          "Não encontrei lançamentos neste PDF. Confira se é a fatura do cartão (e não um comprovante). " +
            "Se for de outro banco, o leitor ainda pode não reconhecer o layout — dá para lançar os gastos à mão.",
        );
        return;
      }
      const target = parsed.month ?? month;
      const previous = invoicesByMonth(data).get(target);
      if (previous) {
        setProgress(null);
        const ok = await confirm({
          title: `Substituir a fatura de ${formatMonthName(target)}?`,
          message:
            "Os lançamentos serão lidos de novo deste PDF. Suas marcações (“não é meu” e categorias) e os lançamentos adicionados à mão serão mantidos.",
          confirmLabel: "Substituir",
        });
        if (!ok) return;
      }
      const invoice = buildInvoice(parsed, { fallbackMonth: month, fileName: file.name, previous });
      const undoPatch = importInvoice(invoice);
      if (target !== month) setMonth(target);
      const count = Object.keys(invoice.purchases).length;
      const matches = invoiceReadTotalCents(invoice) === invoice.statementTotalCents;
      toast({
        tone: "success",
        message: `Fatura de ${formatMonthName(target)}: ${count} lançamentos lidos${matches ? ", soma confere com o total" : ""}.`,
        action: { label: "Desfazer", onClick: () => undo(undoPatch) },
      });
    } catch (e) {
      console.error(e);
      setError(e instanceof PdfReadError ? e.message : "Algo deu errado ao ler o PDF. Tente de novo ou lance os gastos à mão.");
    } finally {
      setProgress(null);
    }
  };

  return { importFile, progress, error, clearError: () => setError(null) };
}

function UploadZone({
  onFile,
  onManual,
  progress,
}: {
  onFile: (file: File) => void;
  onManual: () => void;
  progress: string | null;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { month } = useMonth();

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) onFile(file);
  };

  return (
    <Card>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-12 text-center transition",
          dragging ? "border-accent bg-accent-soft" : "border-line",
        )}
      >
        <div className="flex size-14 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <FileUp className="size-7" aria-hidden />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-fg">Importar a fatura de {formatMonthName(month)}</h2>
          <p className="mt-1 max-w-md text-[15px] text-muted">
            Envie o PDF da fatura. O app lê todas as páginas, separa por cartão e identifica o mês pelo vencimento.
            Nada sai do seu aparelho durante a leitura.
          </p>
        </div>
        {progress ? (
          <p role="status" className="flex items-center gap-2 text-[15px] font-medium text-accent">
            <RefreshCw className="size-4 animate-spin" aria-hidden /> {progress}
          </p>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button icon={FileUp} size="lg" onClick={() => input.current?.click()}>
              Escolher PDF
            </Button>
            <Button variant="ghost" size="lg" icon={FilePlus2} onClick={onManual}>
              Lançar à mão
            </Button>
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
        />
      </div>
    </Card>
  );
}

function HolderCards({ invoice }: { invoice: Invoice }) {
  const settings = useAppState((s) => s.data.settings);
  const holders = useMemo(() => {
    const map = new Map<string, { last4: string[]; total: number }>();
    for (const card of Object.values(invoice.cards)) {
      const entry = map.get(card.holder) ?? { last4: [], total: 0 };
      entry.last4.push(card.last4);
      map.set(card.holder, entry);
    }
    for (const p of Object.values(invoice.purchases)) {
      if (!p.holder) continue;
      const entry = map.get(p.holder) ?? { last4: [], total: 0 };
      entry.total += p.amountCents;
      map.set(p.holder, entry);
    }
    return [...map.entries()];
  }, [invoice]);

  if (holders.length === 0) return null;
  return (
    <Card>
      <SectionTitle
        title="Cartões nesta fatura"
        description="Desligue os cartões cujos gastos não são seus. Eles continuam visíveis, mas não entram nas contas."
      />
      <ul className="divide-y divide-line">
        {holders.map(([holder, info]) => {
          const counted = isHolderCounted(settings, holder);
          const isTitular = invoice.accountHolder === holder;
          return (
            <li key={holder} className="py-3 first:pt-0 last:pb-0">
              <Switch
                checked={counted}
                onChange={(v) => setHolderCounted(holder, v)}
                label={holder}
                description={
                  <>
                    {isTitular ? "Titular · " : "Adicional · "}
                    final {info.last4.join(", ")} · {formatBRL(info.total)}
                    {!counted && " · não conta no orçamento"}
                  </>
                }
              />
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function InvoiceHeader({
  invoice,
  onReimport,
  onAdd,
  onDelete,
}: {
  invoice: Invoice;
  onReimport: () => void;
  onAdd: () => void;
  onDelete: () => void;
}) {
  const settings = useAppState((s) => s.data.settings);
  const share = invoiceShareCents(invoice, settings);
  const readTotal = invoiceReadTotalCents(invoice);
  const fromPdf = !!invoice.fileName;
  const diff = invoice.statementTotalCents - readTotal;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] text-muted">Fatura de {formatMonthName(invoice.month).toLowerCase()}</p>
          <h2 className="text-xl font-bold">Cartão {invoice.issuer}</h2>
        </div>
        <div className="flex gap-1.5">
          <IconButton label="Adicionar lançamento" icon={Plus} onClick={onAdd} className="border border-line bg-surface text-fg" />
          <IconButton label="Reimportar PDF" icon={RefreshCw} onClick={onReimport} className="border border-line bg-surface text-fg" />
          <IconButton label="Excluir fatura" icon={Trash2} tone="danger" onClick={onDelete} className="border border-line bg-surface text-fg" />
        </div>
      </div>
      <section className="card-ember relative space-y-3.5 overflow-hidden rounded-[1.75rem] p-5" aria-label="Resumo da fatura">
        <span aria-hidden className="absolute -right-10 -bottom-16 size-52 rounded-full border-[28px] border-white/10" />
        <div className="flex items-center justify-between">
          <span aria-hidden className="h-7 w-10 rounded-md bg-gradient-to-br from-[#f6d58e] to-[#b98a3c]" />
          <span className="text-[13px] text-white/90">{invoice.dueDate ? `vence ${formatDate(invoice.dueDate)}` : formatMonthLong(invoice.month)}</span>
        </div>
        <div>
          <p className="text-[13px] text-white/90">Sua parte</p>
          <BigMoney cents={share} size="lg" className="text-white" centsClassName="text-white/70" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-white/90">
          <span>{fromPdf ? `Total impresso ${formatBRL(invoice.statementTotalCents)}` : "Lançada à mão"}</span>
          {fromPdf && diff === 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-black/35 px-3 py-1 font-semibold text-white">
              <CircleCheck className="size-4" aria-hidden /> Conferido
            </span>
          )}
        </div>
      </section>
      {fromPdf && diff !== 0 && (
        <Alert tone="warning" icon={ShieldAlert} title={`Diferença de ${formatBRL(Math.abs(diff))} em relação ao total impresso`}>
          {diff > 0
            ? "Pode haver lançamentos que o leitor não reconheceu, ou algum foi excluído. Confira a fatura e adicione o que faltar."
            : "Há lançamentos a mais do que o total impresso (talvez algum tenha sido adicionado à mão)."}
        </Alert>
      )}
    </div>
  );
}

function PurchaseRow({
  purchase,
  counted,
  holderCounted,
  onEdit,
  onToggleIgnored,
}: {
  purchase: Purchase;
  counted: boolean;
  holderCounted: boolean;
  onEdit: () => void;
  onToggleIgnored: () => void;
}) {
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-[1.1rem] py-2.5 pr-1 pl-3",
        counted ? "bg-surface" : "border border-dashed border-line bg-transparent",
      )}
    >
      <CategoryIcon category={purchase.category} muted={!counted} />
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 rounded-lg py-0.5 text-left" aria-label={`Editar ${purchase.description}`}>
        <p className={cn("line-clamp-2 text-[15px] font-semibold break-words", counted ? "text-fg" : "text-muted line-through")}>
          {purchase.description}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
          <span className="tabular">{formatDateShort(purchase.date)}</span>
          <span aria-hidden>·</span>
          <span>{purchase.category}</span>
          {purchase.installmentTotal && (
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-12 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <span
                  className="block h-full rounded-full bg-violet"
                  style={{ width: `${(purchase.installmentCurrent! / purchase.installmentTotal) * 100}%` }}
                />
              </span>
              <span className="tabular">
                {purchase.installmentCurrent} de {purchase.installmentTotal}
              </span>
            </span>
          )}
          {purchase.kind === "refund" && <Badge tone="positive">estorno</Badge>}
          {purchase.manual && <Badge>manual</Badge>}
          {purchase.ignored && <Badge tone="warning">não é meu</Badge>}
        </div>
      </button>
      <Money
        cents={purchase.amountCents}
        className={cn("font-display text-[15px] font-semibold", !counted && "text-muted")}
        tone={purchase.amountCents < 0 ? "positive" : undefined}
      />
      <div className="flex shrink-0">
        {holderCounted && (
          <IconButton
            label={purchase.ignored ? `Voltar a contar ${purchase.description}` : `Marcar ${purchase.description} como não é meu`}
            icon={EyeOff}
            aria-pressed={!!purchase.ignored}
            className={cn(purchase.ignored && "bg-warning-soft text-warning")}
            onClick={onToggleIgnored}
          />
        )}
        <span className="hidden sm:block">
          <IconButton label={`Editar ${purchase.description}`} icon={Pencil} onClick={onEdit} />
        </span>
      </div>
    </li>
  );
}

function PurchaseList({ invoice, onEdit }: { invoice: Invoice; onEdit: (p: Purchase) => void }) {
  const settings = useAppState((s) => s.data.settings);
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [holderFilter, setHolderFilter] = useState("");

  const holders = [...new Set(Object.values(invoice.purchases).map((p) => p.holder ?? ""))].sort(
    (a, b) => Number(isHolderCounted(settings, b || undefined)) - Number(isHolderCounted(settings, a || undefined)),
  );

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = sortedPurchases(invoice).filter((p) => {
      const counted = isPurchaseCounted(p, settings);
      if (filter === "counted" && !counted) return false;
      if (filter === "ignored" && counted) return false;
      if (holderFilter && (p.holder ?? "") !== holderFilter) return false;
      if (q && !`${p.description} ${p.category}`.toLowerCase().includes(q)) return false;
      return true;
    });
    const map = new Map<string, Purchase[]>();
    for (const p of list) map.set(p.holder ?? "", [...(map.get(p.holder ?? "") ?? []), p]);
    // Cartões que contam no orçamento aparecem primeiro.
    return [...map.entries()].sort(
      ([a], [b]) => Number(isHolderCounted(settings, b || undefined)) - Number(isHolderCounted(settings, a || undefined)),
    );
  }, [invoice, settings, query, filter, holderFilter]);

  const toggleIgnored = (p: Purchase) => {
    const undoPatch = setPurchaseIgnored(invoice.id, p.id, !p.ignored);
    toast({
      message: p.ignored ? `“${p.description}” voltou a contar` : `“${p.description}” não conta mais no orçamento`,
      action: { label: "Desfazer", onClick: () => undo(undoPatch) },
    });
  };

  return (
    <section aria-labelledby="purchases-title">
      <SectionTitle
        id="purchases-title"
        title="Lançamentos"
        description="Toque para editar. O olho riscado marca o que não é seu."
      />
      {holders.length > 1 && (
        <div role="radiogroup" aria-label="Filtrar por pessoa" className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
          {["", ...holders].map((h) => {
            const selected = holderFilter === h;
            const counted = h === "" || isHolderCounted(settings, h || undefined);
            const total = sumCents(
              Object.values(invoice.purchases)
                .filter((p) => (h === "" || (p.holder ?? "") === h) && isPurchaseCounted(p, settings))
                .map((p) => p.amountCents),
            );
            const first = h ? h.split(" ")[0][0] + h.split(" ")[0].slice(1).toLowerCase() : "Todos";
            return (
              <button
                key={h || "all"}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setHolderFilter(h)}
                className={cn(
                  "h-10 shrink-0 rounded-full px-4 text-[13px] font-bold whitespace-nowrap",
                  selected ? "bg-lime text-ink" : counted ? "border border-line bg-surface text-fg" : "border border-dashed border-line text-muted",
                )}
              >
                {counted ? `${first} · ${formatBRL(total).replace(/,\d\d$/, "")}` : <span className="line-through">{first} · fora</span>}
              </button>
            );
          })}
        </div>
      )}
      <label className="relative mb-3 block">
        <span className="sr-only">Buscar lançamento</span>
        <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted" aria-hidden />
        <TextInput
          type="search"
          placeholder="Buscar lançamento"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="rounded-full pl-12"
        />
      </label>
      <Segmented
        label="Filtrar lançamentos"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "Todos" },
          { value: "counted", label: "Contam" },
          { value: "ignored", label: "Não contam" },
        ]}
      />
      {groups.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-muted">Nenhum lançamento encontrado com esses filtros.</p>
      ) : (
        <div className="mt-4 space-y-5">
          {groups.map(([holder, list]) => {
            const holderCounted = isHolderCounted(settings, holder || undefined);
            const counted = sumCents(list.filter((p) => isPurchaseCounted(p, settings)).map((p) => p.amountCents));
            const rows = (
              <ul className="space-y-2">
                {list.map((p) => (
                  <PurchaseRow
                    key={p.id}
                    purchase={p}
                    counted={isPurchaseCounted(p, settings)}
                    holderCounted={holderCounted}
                    onEdit={() => onEdit(p)}
                    onToggleIgnored={() => toggleIgnored(p)}
                  />
                ))}
              </ul>
            );
            if (!holderCounted) {
              // Cartão desligado (ex.: titular): recolhido para não poluir a lista.
              return (
                <details key={holder} className="group">
                  <summary className="mb-1 flex items-center justify-between gap-2 rounded-xl px-1 py-2 marker:content-none hover:bg-surface-2">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                      <UserRound className="size-4 text-muted" aria-hidden />
                      {holder || "Sem portador"}
                      <Badge>não conta</Badge>
                    </span>
                    <span className="text-sm text-muted">
                      {list.length} lançamentos <span className="group-open:hidden">· mostrar</span>
                    </span>
                  </summary>
                  {rows}
                </details>
              );
            }
            return (
              <section key={holder} aria-label={holder || "Sem portador"}>
                <div className="mb-1 flex items-center justify-between gap-2 px-1">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-fg">
                    <UserRound className="size-4 text-muted" aria-hidden />
                    {holder || "Sem portador"}
                  </h3>
                  <span className="text-sm text-muted">
                    conta <Money cents={counted} className="font-medium text-fg" />
                  </span>
                </div>
                {rows}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default function InvoicePage() {
  const data = useAppState((s) => s.data);
  const { month } = useMonth();
  const confirm = useConfirm();
  const toast = useToast();
  const { importFile, progress, error, clearError } = useInvoiceImport();
  const reimportInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ purchase: Purchase | null } | null>(null);

  const invoice = invoicesByMonth(data).get(month);

  const createManual = () => {
    const manual: Invoice = {
      id: newId("inv"),
      month,
      issuer: "Cartão",
      importedAt: new Date().toISOString(),
      statementTotalCents: 0,
      cards: {},
      purchases: {},
    };
    importInvoice(manual);
    setEditing({ purchase: null });
  };

  const removeInvoice = async (target: Invoice) => {
    const ok = await confirm({
      title: `Excluir a fatura de ${formatMonthName(target.month)}?`,
      message: "Todos os lançamentos e marcações desta fatura serão removidos. Você poderá desfazer logo em seguida.",
      confirmLabel: "Excluir fatura",
      tone: "danger",
    });
    if (!ok) return;
    const undoPatch = deleteInvoice(target.id);
    toast({ message: "Fatura excluída", action: { label: "Desfazer", onClick: () => undo(undoPatch) } });
  };

  return (
    <div className="space-y-5">
      {error && (
        <Alert
          tone="negative"
          icon={ShieldAlert}
          title="Não foi possível importar"
          action={
            <Button size="sm" variant="secondary" onClick={clearError}>
              Entendi
            </Button>
          }
        >
          {error}
        </Alert>
      )}

      {!invoice ? (
        <UploadZone onFile={importFile} onManual={createManual} progress={progress} />
      ) : (
        <>
          <InvoiceHeader
            invoice={invoice}
            onAdd={() => setEditing({ purchase: null })}
            onReimport={() => reimportInput.current?.click()}
            onDelete={() => removeInvoice(invoice)}
          />
          {progress && (
            <p role="status" className="flex items-center gap-2 px-1 text-[15px] font-medium text-accent">
              <RefreshCw className="size-4 animate-spin" aria-hidden /> {progress}
            </p>
          )}
          <input
            ref={reimportInput}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void importFile(file);
            }}
          />
          <HolderCards invoice={invoice} />
          {Object.keys(invoice.purchases).length === 0 ? (
            <EmptyState
              icon={FilePlus2}
              title="Nenhum lançamento"
              description="Adicione os gastos desta fatura à mão ou reimporte o PDF."
              action={
                <Button icon={Plus} onClick={() => setEditing({ purchase: null })}>
                  Adicionar lançamento
                </Button>
              }
            />
          ) : (
            <PurchaseList invoice={invoice} onEdit={(purchase) => setEditing({ purchase })} />
          )}
          <PurchaseSheet
            open={editing !== null}
            invoice={invoice}
            purchase={editing?.purchase ?? null}
            onClose={() => setEditing(null)}
            onSave={(purchase) => {
              savePurchase(invoice.id, purchase);
              setEditing(null);
              toast({ tone: "success", message: "Lançamento salvo" });
            }}
            onDelete={(purchase) => {
              const undoPatch = deletePurchase(invoice.id, purchase.id);
              setEditing(null);
              toast({ message: "Lançamento excluído", action: { label: "Desfazer", onClick: () => undo(undoPatch) } });
            }}
          />
        </>
      )}
    </div>
  );
}
