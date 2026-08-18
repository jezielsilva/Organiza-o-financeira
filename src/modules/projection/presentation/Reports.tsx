/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo: projection
 * Camada: presentation (Relatórios & Evolução Visual UI)
 */

import React, { useMemo, useState } from "react";
import { FixedBill, IncomeSource, CardInvoice, PlannedInstallment } from "../../../types";
import { formatCurrency, formatMonth, addMonths, getMonthsRange, getMonthDiff } from "../../../core/shared/formatters";
import { calculateReport, getProjectedInvoicePurchases } from "../application/reportCalculator";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Line, ComposedChart } from "recharts";
import { Calendar, Download, Upload, Landmark, ChevronDown, ChevronUp, CreditCard, Layers, Clock, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { importarBackupDoApp } from "../../../core/infrastructure/backupService";

interface ReportsProps {
  selectedMonth: string;
  setSelectedMonth: (month: string) => void;
  incomes: IncomeSource[];
  fixedBills: FixedBill[];
  invoices: CardInvoice[];
  plannedInstallments: PlannedInstallment[];
  onImportBackup: (importedData: any) => void;
  onExportBackup: () => void;
}

export default function Reports({
  selectedMonth,
  setSelectedMonth,
  incomes,
  fixedBills,
  invoices,
  plannedInstallments,
  onImportBackup,
  onExportBackup,
}: ReportsProps) {
  const monthsRange = useMemo(() => {
    const startMonth = addMonths(selectedMonth, -1);
    return getMonthsRange(startMonth, 6);
  }, [selectedMonth]);

  const chartData = useMemo(() => {
    return monthsRange.map((m) => {
      const summary = calculateReport(m, incomes, fixedBills, invoices, plannedInstallments);
      const totalExpenses = summary.fixedBills + summary.cardInvoice + summary.simulatedInstallments;
      
      return {
        name: formatMonth(m).split(" de ")[0],
        monthKey: m,
        "Receita (+)": summary.income,
        "Despesas (-)": totalExpenses,
        "Saldo Líquido": summary.balance,
      };
    });
  }, [monthsRange, incomes, fixedBills, invoices, plannedInstallments]);

  const [activeProjTab, setActiveProjTab] = useState<"monthly" | "byItem">("monthly");
  const [expandedMonths, setExpandedMonths] = useState<Record<string, boolean>>({});

  const toggleMonthExpand = (monthKey: string) => {
    setExpandedMonths((prev) => ({
      ...prev,
      [monthKey]: !prev[monthKey],
    }));
  };

  const projectionMonths = useMemo(() => {
    return getMonthsRange(selectedMonth, 12);
  }, [selectedMonth]);

  const projectionData = useMemo(() => {
    return projectionMonths.map((m) => {
      const { purchases: invoicePurchases } = getProjectedInvoicePurchases(m, invoices);
      const installmentPurchases = invoicePurchases.filter((p) => p.isInstallment);

      const activeSimulations = plannedInstallments
        .filter((plan) => {
          if (plan.status !== "simulated") return false;
          const diff = getMonthDiff(plan.firstChargeMonth, m);
          return diff >= 0 && diff < plan.installmentTotal;
        })
        .map((plan) => {
          const diff = getMonthDiff(plan.firstChargeMonth, m);
          return {
            ...plan,
            currentInstallment: diff + 1,
          };
        });

      const totalInvoiceInstallments = installmentPurchases.reduce((acc, curr) => acc + (curr.installmentValue || 0), 0);
      const totalSimulations = activeSimulations.reduce((acc, curr) => acc + curr.installmentValue, 0);

      return {
        month: m,
        invoicePurchases: installmentPurchases.map((p) => ({
          id: p.id,
          description: p.description,
          current: p.installmentCurrent || 1,
          total: p.installmentTotal || 1,
          value: p.installmentValue || 0,
        })),
        simulations: activeSimulations.map((s) => ({
          id: s.id,
          description: s.description,
          current: s.currentInstallment,
          total: s.installmentTotal,
          value: s.installmentValue,
        })),
        totalInvoiceInstallments,
        totalSimulations,
        grandTotal: totalInvoiceInstallments + totalSimulations,
      };
    });
  }, [projectionMonths, invoices, plannedInstallments]);

  const itemsProjection = useMemo(() => {
    const { purchases: currentInvoicePurchases } = getProjectedInvoicePurchases(selectedMonth, invoices);
    const activeInvoiceInstallments = currentInvoicePurchases.filter((p) => p.isInstallment);

    const invoiceItems = activeInvoiceInstallments.map((purchase) => {
      const current = purchase.installmentCurrent || 1;
      const total = purchase.installmentTotal || 1;
      const val = purchase.installmentValue || 0;
      const totalVal = purchase.totalValue || (val * total);

      const schedule: { month: string; installmentNumber: number; value: number }[] = [];
      for (let i = current; i <= total; i++) {
        const offset = i - current;
        const m = addMonths(selectedMonth, offset);
        schedule.push({
          month: m,
          installmentNumber: i,
          value: val,
        });
      }

      return {
        id: purchase.id,
        description: purchase.description,
        type: "invoice" as const,
        currentInstallment: current,
        totalInstallments: total,
        installmentValue: val,
        totalValue: totalVal,
        schedule,
      };
    });

    const simulatedItems = plannedInstallments
      .filter((plan) => plan.status === "simulated")
      .map((plan) => {
        const total = plan.installmentTotal;
        const val = plan.installmentValue;
        const totalVal = plan.totalValue;

        const schedule: { month: string; installmentNumber: number; value: number }[] = [];
        for (let i = 1; i <= total; i++) {
          const m = addMonths(plan.firstChargeMonth, i - 1);
          if (m >= selectedMonth) {
            schedule.push({
              month: m,
              installmentNumber: i,
              value: val,
            });
          }
        }

        const currentDiff = getMonthDiff(plan.firstChargeMonth, selectedMonth);
        const currentInst = currentDiff >= 0 && currentDiff < total ? currentDiff + 1 : null;

        return {
          id: plan.id,
          description: plan.description,
          type: "simulation" as const,
          currentInstallment: currentInst,
          totalInstallments: total,
          installmentValue: val,
          totalValue: totalVal,
          schedule,
        };
      });

    return [...invoiceItems, ...simulatedItems];
  }, [selectedMonth, invoices, plannedInstallments]);

  const handleExportBackup = () => {
    onExportBackup();
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      importarBackupDoApp(e.target.files[0])
        .then((importedSchema) => {
          onImportBackup(importedSchema);
          alert("Backup importado e validado com sucesso! O app foi atualizado.");
        })
        .catch((err) => {
          if (err.message === "SCHEMA_INVALIDO") {
            alert("Erro: O arquivo de backup não corresponde ao formato esperado (schema v2 inválido).");
          } else if (err.message === "JSON_CORROMPIDO") {
            alert("Erro: O arquivo está corrompido ou não é um JSON válido.");
          } else {
            alert("Erro ao ler o arquivo de backup.");
          }
        });
    }
  };

  return (
    <div className="space-y-8" id="reports-container">
      <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="font-black text-zinc-900 text-base flex items-center gap-2 uppercase tracking-wider">
            <Landmark className="w-5 h-5 text-zinc-850 shrink-0" />
            Relatórios & Exportação
          </h3>
          <p className="text-xs text-zinc-500 mt-1">
            Exporte seus lançamentos e faturas para backup local ou importe dados para sincronizar.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportBackup}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
          >
            <Download className="w-4 h-4 text-zinc-600" /> Exportar Backup
          </button>

          <label className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-sm">
            <Upload className="w-4 h-4 text-emerald-400" /> Importar Backup
            <input
              type="file"
              accept=".json"
              onChange={handleImportBackup}
              className="hidden"
            />
          </label>
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm" id="recharts-block">
        <h3 className="font-black text-zinc-900 text-base mb-1 uppercase tracking-wider">Evolução e Fluxo de Caixa</h3>
        <p className="text-xs text-zinc-500 mb-6">Visualização comparativa de receitas, despesas previstas e saldo líquido ao longo de 6 meses.</p>

        <div className="h-80 w-full text-xs">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
              <XAxis dataKey="name" stroke="#a1a1aa" tickLine={false} />
              <YAxis stroke="#a1a1aa" tickLine={false} />
              <Tooltip
                formatter={(value: any) => [formatCurrency(Number(value)), ""]}
                contentStyle={{ backgroundColor: "#18181b", borderRadius: "16px", color: "#fff", border: "1px solid #27272a" }}
              />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Bar dataKey="Receita (+)" fill="#10b981" radius={[4, 4, 0, 0]} barSize={28} />
              <Bar dataKey="Despesas (-)" fill="#a1a1aa" radius={[4, 4, 0, 0]} barSize={28} />
              <Line type="monotone" dataKey="Saldo Líquido" stroke="#4f46e5" strokeWidth={3} dot={{ r: 4, strokeWidth: 2 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-base font-black text-zinc-900 uppercase tracking-wider">Detalhamento Financeiro do Período</h3>
        <p className="text-xs text-zinc-500">Selecione qualquer mês para carregá-lo no painel de controle principal do aplicativo.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {monthsRange.map((m) => {
            const summary = calculateReport(m, incomes, fixedBills, invoices, plannedInstallments);
            const isSelected = m === selectedMonth;
            const isPositive = summary.balance >= 0;

            return (
              <motion.div
                key={m}
                onClick={() => setSelectedMonth(m)}
                whileHover={{ y: -3 }}
                className={`cursor-pointer p-5 rounded-3xl border transition-all duration-300 ${
                  isSelected
                    ? "bg-zinc-900 text-white border-zinc-900 shadow-xl shadow-zinc-200/50"
                    : "bg-white text-zinc-800 border-zinc-200 hover:border-zinc-350 hover:shadow-2xs"
                }`}
              >
                <div className="flex justify-between items-center mb-3">
                  <span className={`text-sm font-black uppercase tracking-wider ${isSelected ? "text-white" : "text-zinc-900"}`}>
                    {formatMonth(m)}
                  </span>
                  {isSelected && (
                    <span className="text-[9px] bg-white/10 text-white border border-white/20 font-black px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                      Ativo
                    </span>
                  )}
                </div>

                <div className={`space-y-2 text-xs border-t pt-3 ${isSelected ? "border-zinc-800/80" : "border-zinc-150"}`}>
                  <div className="flex justify-between">
                    <span className={isSelected ? "text-zinc-400 font-medium" : "text-zinc-500 font-medium"}>Receitas:</span>
                    <span className="font-bold font-mono">{formatCurrency(summary.income)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isSelected ? "text-zinc-400 font-medium" : "text-zinc-500 font-medium"}>Contas Fixas:</span>
                    <span className="font-bold font-mono">-{formatCurrency(summary.fixedBills)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isSelected ? "text-zinc-400 font-medium" : "text-zinc-500 font-medium"}>Fatura Cartão:</span>
                    <span className="font-bold font-mono">-{formatCurrency(summary.cardInvoice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className={isSelected ? "text-zinc-400 font-medium" : "text-zinc-500 font-medium"}>Simulações:</span>
                    <span className="font-bold font-mono">-{formatCurrency(summary.simulatedInstallments)}</span>
                  </div>
                </div>

                <div className={`mt-4 pt-3 border-t flex justify-between items-center ${isSelected ? "border-zinc-800/80" : "border-zinc-150"}`}>
                  <span className={`text-xs font-bold uppercase tracking-wider text-[10px] ${isSelected ? "text-zinc-400" : "text-zinc-400"}`}>
                    Saldo Previsto:
                  </span>
                  <span className={`text-base font-black font-mono ${
                    isSelected 
                      ? "text-white" 
                      : isPositive ? "text-emerald-600" : "text-rose-600"
                  }`}>
                    {formatCurrency(summary.balance)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm space-y-6" id="installments-projection-section">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-150 pb-4">
          <div>
            <h3 className="font-black text-zinc-900 text-base flex items-center gap-2 uppercase tracking-wider">
              <Clock className="w-5 h-5 text-zinc-800 shrink-0" />
              Projeção de Parcelas Futuras
            </h3>
            <p className="text-xs text-zinc-500 mt-1">
              Previsão detalhada de gastos com obrigações parceladas reais e simuladas para os próximos 12 meses.
            </p>
          </div>

          <div className="flex bg-zinc-100 p-1 rounded-2xl border border-zinc-200 self-start sm:self-center">
            <button
              onClick={() => setActiveProjTab("monthly")}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeProjTab === "monthly"
                  ? "bg-zinc-900 text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <Calendar className="w-4 h-4" />
              Mensal
            </button>
            <button
              onClick={() => setActiveProjTab("byItem")}
              className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all cursor-pointer ${
                activeProjTab === "byItem"
                  ? "bg-zinc-900 text-white shadow-xs"
                  : "text-zinc-500 hover:text-zinc-900"
              }`}
            >
              <Layers className="w-4 h-4" />
              Por Item ({itemsProjection.length})
            </button>
          </div>
        </div>

        {activeProjTab === "monthly" && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500 leading-relaxed bg-zinc-50 p-4 border border-zinc-200 rounded-2xl">
              Esta lista exibe as parcelas compromissadas para cada um dos próximos 12 meses, separando os valores oriundos das <strong>faturas reais</strong> dos valores de <strong>simulações planejadas</strong>. Clique no mês para abrir o detalhamento de cada compra.
            </p>

            <div className="space-y-3">
              {projectionData.map((data) => {
                const isExpanded = !!expandedMonths[data.month];
                const hasObligations = data.grandTotal > 0;

                return (
                  <div
                    key={data.month}
                    className={`border rounded-2xl transition-all duration-300 ${
                      isExpanded
                        ? "border-zinc-300 bg-zinc-50/25 shadow-xs"
                        : "border-zinc-200 hover:border-zinc-350 hover:bg-zinc-50/10"
                    }`}
                  >
                    <div
                      onClick={() => toggleMonthExpand(data.month)}
                      className="p-4 sm:p-5 flex justify-between items-center cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2.5 rounded-xl ${hasObligations ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-400"}`}>
                          <Calendar className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-zinc-800 text-sm">{formatMonth(data.month)}</h4>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                            <span>Fatura: {formatCurrency(data.totalInvoiceInstallments)}</span>
                            <span>•</span>
                            <span>Simulações: {formatCurrency(data.totalSimulations)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-black block">Total Parcelado</span>
                          <span className={`text-base font-black font-mono ${hasObligations ? "text-zinc-900" : "text-zinc-400"}`}>
                            {formatCurrency(data.grandTotal)}
                          </span>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-zinc-500" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-zinc-500" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="px-5 pb-5 pt-1 border-t border-zinc-150/80 space-y-4">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div className="space-y-3">
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-zinc-400 flex items-center gap-1.5 border-b border-zinc-150 pb-2">
                              <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
                              Fatura de Cartão Reais/Projetadas ({data.invoicePurchases.length})
                            </h5>
                            {data.invoicePurchases.length === 0 ? (
                              <p className="text-xs text-zinc-400 italic py-2 font-semibold">Nenhum lançamento parcelado de fatura para este mês.</p>
                            ) : (
                              <div className="space-y-2">
                                {data.invoicePurchases.map((purchase) => (
                                  <div key={purchase.id} className="flex justify-between items-center p-3 bg-white border border-zinc-200 rounded-xl text-xs">
                                    <div>
                                      <span className="font-bold text-zinc-800 block">{purchase.description}</span>
                                      <span className="text-[9px] bg-zinc-100 border border-zinc-200 text-zinc-500 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider mt-1 inline-block">
                                        Parcela {purchase.current} de {purchase.total}
                                      </span>
                                    </div>
                                    <span className="font-black text-zinc-900 font-mono">
                                      {formatCurrency(purchase.value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="space-y-3">
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-1.5 border-b border-indigo-100 pb-2">
                              <Sparkles className="w-3.5 h-3.5 text-indigo-500 animate-pulse" />
                              Simulações Planejadas ({data.simulations.length})
                            </h5>
                            {data.simulations.length === 0 ? (
                              <p className="text-xs text-zinc-400 italic py-2 font-semibold">Nenhuma simulação de compra cai neste mês.</p>
                            ) : (
                              <div className="space-y-2">
                                {data.simulations.map((sim) => (
                                  <div key={sim.id} className="flex justify-between items-center p-3 bg-white border border-indigo-100 rounded-xl text-xs">
                                    <div>
                                      <span className="font-bold text-zinc-800 block">{sim.description}</span>
                                      <span className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider mt-1 inline-block">
                                        Parcela {sim.current} de {sim.total}
                                      </span>
                                    </div>
                                    <span className="font-black text-indigo-600 font-mono">
                                      {formatCurrency(sim.value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeProjTab === "byItem" && (
          <div className="space-y-4">
            <p className="text-xs text-zinc-500 leading-relaxed bg-zinc-50 p-4 border border-zinc-200 rounded-2xl">
              Esta aba lista cada obrigação parcelada individualmente (seja compra real lançada no cartão ou simulação planejada). Ao lado de cada item, veja a linha do tempo completa do cronograma restante e em quais meses as parcelas serão cobradas.
            </p>

            {itemsProjection.length === 0 ? (
              <div className="py-12 border border-dashed border-zinc-200 rounded-2xl text-center text-zinc-400">
                <CreditCard className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
                <p className="font-bold">Nenhuma compra parcelada ativa ou planejada encontrada.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {itemsProjection.map((item) => {
                  const isSimulation = item.type === "simulation";

                  return (
                    <div
                      key={item.id}
                      className={`p-5 rounded-2xl border flex flex-col justify-between space-y-4 transition-all duration-200 bg-white ${
                        isSimulation
                          ? "border-indigo-150 hover:border-indigo-300"
                          : "border-zinc-200 hover:border-zinc-350"
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex justify-between items-start gap-2 flex-wrap">
                          <span
                            className={`text-[9px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                              isSimulation
                                ? "bg-indigo-50 border-indigo-100 text-indigo-700"
                                : "bg-zinc-50 border-zinc-200 text-zinc-600"
                            }`}
                          >
                            {isSimulation ? "Simulação Planejada" : "Compra Real no Cartão"}
                          </span>
                          
                          <span className="text-[10px] font-bold text-zinc-450 uppercase tracking-widest">
                            Valor total: <span className="text-zinc-800 font-black font-mono">{formatCurrency(item.totalValue)}</span>
                          </span>
                        </div>

                        <h4 className="text-sm font-black text-zinc-900 tracking-tight leading-snug">
                          {item.description}
                        </h4>

                        <div className="flex justify-between items-center text-xs pt-1">
                          <span className="text-zinc-500 font-semibold">Valor da Parcela:</span>
                          <span className={`font-black text-sm ${isSimulation ? "text-indigo-600" : "text-zinc-950"}`}>
                            {item.totalInstallments}x de {formatCurrency(item.installmentValue)}
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-zinc-100 space-y-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 block mb-1">
                          Próximas Cobranças:
                        </span>
                        <div className="max-h-36 overflow-y-auto pr-1 space-y-1.5 custom-scrollbar">
                          {item.schedule.map((sch) => (
                            <div
                              key={sch.month}
                              className={`flex justify-between items-center px-2.5 py-1.5 rounded-xl text-[10px] border ${
                                sch.month === selectedMonth
                                  ? "bg-zinc-900 text-white border-zinc-900"
                                  : isSimulation
                                  ? "bg-indigo-50/30 border-indigo-50/50 text-zinc-700 hover:bg-indigo-50/50"
                                  : "bg-zinc-50 border-zinc-100 text-zinc-700 hover:bg-zinc-100/50"
                              }`}
                            >
                              <span className="font-bold flex items-center gap-1">
                                <Calendar className="w-3 h-3 shrink-0" />
                                {formatMonth(sch.month)}
                              </span>
                              <div className="flex items-center gap-3">
                                <span className="opacity-80 font-semibold uppercase tracking-wider text-[9px]">
                                  Parcela {sch.installmentNumber} / {item.totalInstallments}
                                </span>
                                <span className="font-black font-mono">
                                  {formatCurrency(sch.value)}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
