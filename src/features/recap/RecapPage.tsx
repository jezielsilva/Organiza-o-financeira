import { ChevronLeft, ChevronRight, Share2, TrendingUp, X } from "lucide-react";
import { useMemo, useState } from "react";
import { navigate } from "../../app/router";
import { useAppState } from "../../app/store";
import { monthlyRecap } from "../../domain/insights";
import { formatBRL } from "../../domain/money";
import { addMonths, currentMonth, formatMonthName, formatMonthShort } from "../../domain/month";
import { invoicesByMonth } from "../../domain/projection";
import { Button, IconButton } from "../../ui/Button";

const reais = (cents: number) => formatBRL(cents).replace(/,\d\d$/, "");

export default function RecapPage() {
  const data = useAppState((s) => s.data);
  // Por padrão, o último mês com fatura importada (o mais completo).
  const initial = useMemo(() => {
    const months = [...invoicesByMonth(data).keys()].filter((m) => m <= currentMonth()).sort();
    return months[months.length - 1] ?? currentMonth();
  }, [data]);
  const [month, setMonth] = useState(initial);
  const recap = useMemo(() => monthlyRecap(data, month), [data, month]);
  const name = formatMonthName(month).toLowerCase();
  const positive = recap.balanceCents >= 0;

  const share = async () => {
    const text = `Meu ${name}: ${positive ? "sobraram" : "faltaram"} ${formatBRL(Math.abs(recap.balanceCents))} depois de tudo pago.`;
    if (navigator.share) await navigator.share({ title: "Resumo do mês", text }).catch(() => {});
    else await navigator.clipboard?.writeText(text);
  };

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center gap-2">
        <IconButton label="Fechar resumo" icon={X} onClick={() => navigate("inicio")} className="border border-line bg-surface" />
        <div className="flex flex-1 items-center justify-center gap-1">
          <IconButton label="Mês anterior" icon={ChevronLeft} onClick={() => setMonth(addMonths(month, -1))} />
          <span className="min-w-20 text-center text-[15px] font-semibold capitalize">{formatMonthShort(month)}</span>
          <IconButton label="Próximo mês" icon={ChevronRight} onClick={() => setMonth(addMonths(month, 1))} />
        </div>
        <IconButton label="Compartilhar resumo" icon={Share2} onClick={share} className="border border-line bg-surface" />
      </div>

      <div className="space-y-1 pt-2">
        <p className="text-[15px] text-muted">Seu {name} em resumo</p>
        <h2 className="font-display text-[2.1rem] leading-[1.1] font-bold tracking-tight">
          {positive ? "Sobraram " : "Faltaram "}
          <span className={positive ? "text-lime" : "text-negative"}>{reais(Math.abs(recap.balanceCents))}</span>
          {positive ? " depois de tudo pago." : " para fechar o mês."}
        </h2>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {recap.top ? (
          <div className="col-span-2 space-y-1.5 rounded-3xl bg-[#f2f1ec] p-5 text-ink">
            <p className="text-[13px] font-bold">Onde mais gastou</p>
            <p className="font-display text-[1.75rem] leading-tight font-bold">{recap.top.category}</p>
            <p className="text-sm font-semibold">
              {formatBRL(recap.top.cents)} · {Math.round(recap.top.share * 100)}% da sua parte do cartão
            </p>
          </div>
        ) : (
          <div className="col-span-2 rounded-3xl border border-dashed border-line p-5 text-[15px] text-muted">
            Importe a fatura de {name} para ver onde o dinheiro foi.
          </div>
        )}
        <div className="space-y-1.5 rounded-3xl border border-line bg-surface p-4">
          <p className="text-[13px] text-muted">Corridas de app</p>
          <p className="font-display text-2xl font-bold">{recap.rides.count}</p>
          <p className="text-[13px] text-fg/80">{formatBRL(recap.rides.cents)} no total</p>
        </div>
        <div className="space-y-1.5 rounded-3xl border border-line bg-surface p-4">
          <p className="text-[13px] text-muted">Delivery</p>
          <p className="font-display text-2xl font-bold">
            {recap.delivery.count} {recap.delivery.count === 1 ? "pedido" : "pedidos"}
          </p>
          <p className="text-[13px] text-fg/80">{formatBRL(recap.delivery.cents)} no total</p>
        </div>
        <div className="col-span-2 flex items-center justify-between gap-3 rounded-3xl bg-lime p-5 text-ink">
          <div className="space-y-1">
            <p className="text-[13px] font-bold">{recap.endingCount > 0 ? "Boa notícia" : "Próximo mês"}</p>
            <p className="text-base leading-snug font-bold">
              {recap.endingCount > 0
                ? `${recap.endingCount} parcela${recap.endingCount > 1 ? "s" : ""} acabaram. ${formatMonthName(addMonths(month, 1))} começa com ${reais(recap.freedCents)} a mais.`
                : `${formatMonthName(addMonths(month, 1))} deve ${recap.nextMonthBalanceCents >= 0 ? "sobrar" : "faltar"} ${reais(Math.abs(recap.nextMonthBalanceCents))}.`}
            </p>
          </div>
          <TrendingUp className="size-10 shrink-0" aria-hidden />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <Button variant="secondary" block icon={Share2} onClick={share}>
          Compartilhar
        </Button>
        <Button block onClick={() => navigate("inicio")}>
          Voltar ao início
        </Button>
      </div>
    </div>
  );
}
