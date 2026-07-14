/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { FixedBill, IncomeSource, CardInvoice, PlannedInstallment } from "../types";
import { formatCurrency, formatMonth, calculateReport, addMonths } from "../utils";
import { TrendingUp, TrendingDown, Calendar, CreditCard, ArrowRight, DollarSign, ShieldAlert, CheckCircle2 } from "lucide-react";
import { motion } from "motion/react";

interface DashboardProps {
  selectedMonth: string;
  incomes: IncomeSource[];
  fixedBills: FixedBill[];
  invoices: CardInvoice[];
  plannedInstallments: PlannedInstallment[];
  setActiveTab: (tab: string) => void;
  onConfirmReconciliation: (plannedId: string, status: "confirmed_in_invoice" | "archived") => void;
}

export default function Dashboard({
  selectedMonth,
  incomes,
  fixedBills,
  invoices,
  plannedInstallments,
  setActiveTab,
  onConfirmReconciliation,
}: DashboardProps) {
  const summary = calculateReport(selectedMonth, incomes, fixedBills, invoices, plannedInstallments);

  // Calcula projeções para os próximos 3 meses
  const nextMonths = [
    addMonths(selectedMonth, 1),
    addMonths(selectedMonth, 2),
    addMonths(selectedMonth, 3),
  ];

  const projections = nextMonths.map((m) => ({
    month: m,
    data: calculateReport(m, incomes, fixedBills, invoices, plannedInstallments),
  }));

  // Encontra faturas reais e projetadas
  const activeInvoice = invoices.find((inv) => inv.referenceMonth === selectedMonth);

  // Reconciliação automática (Regra de Negócio 4.3):
  // Tentar encontrar correspondências entre simulações ("simulated") e compras reais na fatura deste mês.
  const reconciliationSuggestions = React.useMemo(() => {
    if (!activeInvoice) return [];

    return plannedInstallments
      .filter((plan) => plan.status === "simulated")
      .map((plan) => {
        // Encontra compras na fatura com nome similar ou valor parecido
        const match = activeInvoice.purchases.find((pur) => {
          const descSim = pur.description.toLowerCase().includes(plan.description.toLowerCase()) ||
            plan.description.toLowerCase().includes(pur.description.toLowerCase());
          const valueSim = Math.abs((pur.installmentValue || pur.totalValue) - plan.installmentValue) < 10 || 
            Math.abs(pur.totalValue - plan.totalValue) < 10;
          return descSim && valueSim;
        });

        if (match) {
          return {
            planned: plan,
            matchedPurchase: match,
          };
        }
        return null;
      })
      .filter((item): item is { planned: PlannedInstallment; matchedPurchase: any } => item !== null);
  }, [activeInvoice, plannedInstallments]);

  return (
    <div className="space-y-8" id="dashboard-container">
      {/* Resumo Principal do Mês Selecionado */}
      <motion.div
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      >
        {/* Card de Saldo */}
        <div
          id="balance-card"
          className={`lg:col-span-8 rounded-3xl p-6 border transition-all duration-300 flex flex-col justify-between ${
            summary.balance >= 0
              ? "bg-emerald-50/20 border-emerald-100 text-zinc-900"
              : "bg-rose-50/20 border-rose-100 text-zinc-900"
          }`}
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
                Saldo Previsto do Mês
              </span>
              <span className="text-[10px] font-black px-2.5 py-1 rounded-full bg-zinc-900 text-white shadow-xs uppercase tracking-wider">
                {formatMonth(selectedMonth)}
              </span>
            </div>
            <div className="mt-4">
              <h2 className={`text-4xl lg:text-5xl font-black tracking-tighter ${summary.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                {summary.balance >= 0 ? "+" : ""} {formatCurrency(summary.balance)}
              </h2>
            </div>
            <p className="mt-2 text-xs text-zinc-500 leading-relaxed max-w-md">
              {summary.balance >= 0
                ? "Parabéns! Suas finanças estão no verde para este mês."
                : "Atenção: Suas despesas previstas superam suas receitas cadastradas."}
            </p>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-zinc-200/60">
            <div className="bg-white border border-zinc-200/60 p-3 rounded-xl">
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Entradas (+)</span>
              <span className="text-sm font-bold text-emerald-600 block mt-0.5">
                {formatCurrency(summary.income)}
              </span>
            </div>
            <div className="bg-white border border-zinc-200/60 p-3 rounded-xl">
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Contas Fixas (-)</span>
              <span className="text-sm font-bold text-zinc-800 block mt-0.5">
                {formatCurrency(summary.fixedBills)}
              </span>
            </div>
            <div className="bg-white border border-zinc-200/60 p-3 rounded-xl">
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Fatura Cartão (-)</span>
              <span className="text-sm font-bold text-zinc-800 block mt-0.5">
                {formatCurrency(summary.cardInvoice)}
                {!activeInvoice && summary.cardInvoice > 0 && (
                  <span className="text-[9px] block font-semibold text-amber-600">
                    (Projetado)
                  </span>
                )}
              </span>
            </div>
            <div className="bg-white border border-zinc-200/60 p-3 rounded-xl">
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">Simulações (-)</span>
              <span className="text-sm font-bold text-zinc-800 block mt-0.5">
                {formatCurrency(summary.simulatedInstallments)}
              </span>
            </div>
          </div>
        </div>

        {/* Card de Informação sobre Fatura Atual */}
        <div id="invoice-status-card" className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 flex flex-col justify-between shadow-2xl text-zinc-100 lg:col-span-4 min-h-[300px]">
          <div>
            <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
              <div>
                <h3 className="font-bold text-white text-base">Fatura do Cartão</h3>
                <p className="text-zinc-500 text-[10px] mt-0.5">
                  {activeInvoice ? "Atualizado via IA" : "Projeção estimada"}
                </p>
              </div>
              <CreditCard className="w-5 h-5 text-indigo-400 shrink-0" />
            </div>

            <div className="mt-4">
              {activeInvoice ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="text-[10px] uppercase font-black tracking-wider">Leitura: Confiável</span>
                  </div>
                  <div className="text-3xl font-black text-white tracking-tight">
                    {formatCurrency(activeInvoice.totalValue)}
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {activeInvoice.purchases.length} compras extraídas com precisão pelo leitor em Python.
                  </p>
                  {activeInvoice.needsReview && (
                    <div className="flex items-center gap-1.5 mt-2 p-2 bg-amber-500/10 rounded-xl border border-amber-500/20 text-amber-400 text-xs">
                      <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                      <span>Requer revisão de dados do cartão!</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <span className="text-[9px] font-black uppercase tracking-wider text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-full border border-amber-400/20 inline-block">
                    Fatura Estimada
                  </span>
                  <div className="text-3xl font-black text-white tracking-tight">
                    {formatCurrency(summary.cardInvoice)}
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Baseada em parcelas em aberto de meses anteriores. Envie a fatura real para obter precisão máxima.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 border-t border-zinc-850 pt-4 flex items-center justify-between gap-4">
            <div>
              <p className="text-zinc-500 text-[9px] uppercase font-black tracking-wider font-mono">Total da Fatura</p>
              <p className="text-xl text-white font-black tracking-tight">
                {formatCurrency(activeInvoice ? activeInvoice.totalValue : summary.cardInvoice)}
              </p>
            </div>
            <button
              id="go-to-invoice-btn"
              onClick={() => setActiveTab("cartao")}
              className="inline-flex items-center justify-center gap-2 py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors shrink-0 shadow-lg shadow-indigo-950/20"
            >
              {activeInvoice ? "Ver Compras" : "Subir PDF"}
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Reconciliação Automática */}
      {reconciliationSuggestions.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-indigo-50/50 border border-indigo-100 rounded-3xl p-5 shadow-xs"
          id="reconciliation-alert"
        >
          <div className="flex gap-3">
            <ShieldAlert className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
            <div className="space-y-1 w-full">
              <h4 className="font-bold text-indigo-950 text-sm">
                Conciliação Automática de Parcelas
              </h4>
              <p className="text-xs text-indigo-900 leading-relaxed">
                O sistema identificou compras na fatura que coincidem com simulações manuais ativas. Confirme se deseja unificá-las para evitar duplicidade no orçamento:
              </p>

              <div className="mt-3 space-y-3">
                {reconciliationSuggestions.map(({ planned, matchedPurchase }) => (
                  <div
                    key={planned.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 bg-white border border-indigo-100 rounded-xl gap-3 text-xs text-zinc-700 shadow-2xs"
                  >
                    <div>
                      <div className="font-bold text-zinc-900">
                        Simulação: <span className="text-indigo-600">{planned.description}</span> ({formatCurrency(planned.installmentValue)}/mês)
                      </div>
                      <div className="text-zinc-500 mt-0.5">
                        Fatura Real: <span className="font-semibold text-zinc-800">{matchedPurchase.description}</span> ({formatCurrency(matchedPurchase.installmentValue || matchedPurchase.totalValue)})
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => onConfirmReconciliation(planned.id, "confirmed_in_invoice")}
                        className="px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white font-bold rounded-lg transition-colors text-[10px] uppercase tracking-wider"
                      >
                        Confirmar
                      </button>
                      <button
                        onClick={() => onConfirmReconciliation(planned.id, "archived")}
                        className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-bold rounded-lg transition-colors text-[10px] uppercase tracking-wider"
                      >
                        Arquivar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Projeção do Orçamento (Próximos 3 Meses) */}
      <div id="projections-section" className="space-y-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-zinc-400" />
          <h3 className="text-xs font-black uppercase tracking-widest text-zinc-400">Projeção 3 Meses</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {projections.map((proj, idx) => {
            const isPositive = proj.data.balance >= 0;
            const totalExpenses = proj.data.fixedBills + proj.data.cardInvoice + proj.data.simulatedInstallments;
            const percentage = proj.data.income > 0 ? Math.min(100, Math.round((totalExpenses / proj.data.income) * 100)) : 0;
            return (
              <motion.div
                key={proj.month}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: idx * 0.1 }}
                className="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-300"
              >
                <div>
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-3">
                    <span className="text-sm font-bold text-zinc-800">
                      {formatMonth(proj.month)}
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                        isPositive
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-100"
                          : "bg-rose-50 text-rose-700 border border-rose-100"
                      }`}
                    >
                      {isPositive ? "Superávit" : "Déficit"}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between items-baseline">
                      <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider">Renda:</span>
                      <span className="font-semibold text-zinc-800">
                        {formatCurrency(proj.data.income)}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="text-zinc-400 text-[10px] font-bold uppercase tracking-wider">Despesas:</span>
                      <span className="font-semibold text-zinc-800">
                        -{formatCurrency(totalExpenses)}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar showing commitment */}
                  <div className="mt-4">
                    <div className="w-full bg-zinc-100 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${isPositive ? "bg-emerald-500" : "bg-rose-500"}`}
                        style={{ width: `${percentage}%` }}
                      ></div>
                    </div>
                    <span className="text-[9px] text-zinc-400 font-semibold mt-1 block">
                      Compromete {percentage}% da renda prevista
                    </span>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-zinc-100 flex justify-between items-center">
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest font-mono">Saldo Previsto</span>
                  <span className={`text-base font-black ${isPositive ? "text-emerald-600" : "text-rose-600"}`}>
                    {formatCurrency(proj.data.balance)}
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
