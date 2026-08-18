/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo: fixed-bills
 * Camada: presentation (Componentes React UI)
 */

import React, { useState } from "react";
import { FixedBill, IncomeSource } from "../../../types";
import { formatCurrency, formatMonth } from "../../../core/shared/formatters";
import { Plus, Edit2, Trash2, Check, Wallet, CheckSquare, Square } from "lucide-react";

interface FixedBillsProps {
  selectedMonth: string;
  incomes: IncomeSource[];
  fixedBills: FixedBill[];
  setIncomes: React.Dispatch<React.SetStateAction<IncomeSource[]>>;
  setFixedBills: React.Dispatch<React.SetStateAction<FixedBill[]>>;
}

export default function FixedBills({
  selectedMonth,
  incomes,
  fixedBills,
  setIncomes,
  setFixedBills,
}: FixedBillsProps) {
  const [billName, setBillName] = useState("");
  const [billValue, setBillValue] = useState("");
  const [billDueDay, setBillDueDay] = useState("5");
  const [billCategory, setBillCategory] = useState("Moradia");
  const [editingBillId, setEditingBillId] = useState<string | null>(null);

  const [incomeLabel, setIncomeLabel] = useState("");
  const [incomeValue, setIncomeValue] = useState("");
  const [incomeRecurrence, setIncomeRecurrence] = useState<"monthly" | "single">("monthly");
  const [editingIncomeId, setEditingIncomeId] = useState<string | null>(null);

  const categories = ["Moradia", "Alimentação", "Transporte", "Saúde", "Educação", "Serviços", "Assinaturas", "Outros"];

  const handleSaveBill = (e: React.FormEvent) => {
    e.preventDefault();
    if (!billName || !billValue) return;

    const val = parseFloat(billValue);
    if (isNaN(val) || val <= 0) return;

    const due = parseInt(billDueDay);
    if (isNaN(due) || due < 1 || due > 31) return;

    if (editingBillId) {
      setFixedBills((prev) =>
        prev.map((b) =>
          b.id === editingBillId
            ? { ...b, name: billName, value: val, dueDay: due, category: billCategory }
            : b
        )
      );
      setEditingBillId(null);
    } else {
      const newBill: FixedBill = {
        id: `bill-${Date.now()}`,
        name: billName,
        value: val,
        dueDay: due,
        category: billCategory,
        active: true,
      };
      setFixedBills((prev) => [...prev, newBill]);
    }

    setBillName("");
    setBillValue("");
    setBillDueDay("5");
    setBillCategory("Moradia");
  };

  const handleEditBill = (bill: FixedBill) => {
    setEditingBillId(bill.id);
    setBillName(bill.name);
    setBillValue(bill.value.toString());
    setBillDueDay(bill.dueDay.toString());
    setBillCategory(bill.category || "Moradia");
  };

  const handleDeleteBill = (id: string) => {
    setFixedBills((prev) => prev.filter((b) => b.id !== id));
    if (editingBillId === id) {
      setEditingBillId(null);
      setBillName("");
      setBillValue("");
    }
  };

  const handleToggleBillActive = (id: string) => {
    setFixedBills((prev) =>
      prev.map((b) => (b.id === id ? { ...b, active: !b.active } : b))
    );
  };

  const handleSaveIncome = (e: React.FormEvent) => {
    e.preventDefault();
    if (!incomeLabel || !incomeValue) return;

    const val = parseFloat(incomeValue);
    if (isNaN(val) || val <= 0) return;

    if (editingIncomeId) {
      setIncomes((prev) =>
        prev.map((inc) =>
          inc.id === editingIncomeId ? { ...inc, label: incomeLabel, value: val, recurrence: incomeRecurrence } : inc
        )
      );
      setEditingIncomeId(null);
    } else {
      const newIncome: IncomeSource = {
        id: `inc-${Date.now()}`,
        label: incomeLabel,
        value: val,
        month: selectedMonth,
        recurrence: incomeRecurrence,
      };
      setIncomes((prev) => [...prev, newIncome]);
    }

    setIncomeLabel("");
    setIncomeValue("");
    setIncomeRecurrence("monthly");
  };

  const handleEditIncome = (inc: IncomeSource) => {
    setEditingIncomeId(inc.id);
    setIncomeLabel(inc.label);
    setIncomeValue(inc.value.toString());
    setIncomeRecurrence(inc.recurrence || "monthly");
  };

  const handleDeleteIncome = (id: string) => {
    setIncomes((prev) => prev.filter((inc) => inc.id !== id));
    if (editingIncomeId === id) {
      setEditingIncomeId(null);
      setIncomeLabel("");
      setIncomeValue("");
      setIncomeRecurrence("monthly");
    }
  };

  const currentMonthIncomes = incomes.filter((inc) => {
    const isRecurrent = !inc.recurrence || inc.recurrence === "monthly";
    if (isRecurrent) {
      return inc.month <= selectedMonth;
    } else {
      return inc.month === selectedMonth;
    }
  });

  const totalIncome = currentMonthIncomes.reduce((acc, curr) => acc + curr.value, 0);
  const totalFixedBills = fixedBills.filter((b) => b.active).reduce((acc, curr) => acc + curr.value, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8" id="fixed-bills-container">
      <div className="lg:col-span-5 space-y-6">
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Wallet className="w-5 h-5 text-zinc-800 shrink-0" />
            <h3 className="text-base font-black text-zinc-900 uppercase tracking-wider">Renda de {formatMonth(selectedMonth)}</h3>
          </div>

          <form onSubmit={handleSaveIncome} className="space-y-4 mb-6 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
            <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest">
              {editingIncomeId ? "Editar Fonte de Renda" : "Adicionar Nova Renda"}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Descrição</label>
                <input
                  type="text"
                  placeholder="Ex: Salário, Freela, Pix"
                  value={incomeLabel}
                  onChange={(e) => setIncomeLabel(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:border-zinc-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={incomeValue}
                  onChange={(e) => setIncomeValue(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:border-zinc-900"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-zinc-500 mb-1">Tipo de Renda</label>
              <select
                value={incomeRecurrence}
                onChange={(e) => setIncomeRecurrence(e.target.value as "monthly" | "single")}
                className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-800 focus:outline-hidden focus:border-zinc-900"
              >
                <option value="monthly">Recorrência Mensal (Repete nos meses futuros)</option>
                <option value="single">Renda Avulsa (Válida apenas para este mês)</option>
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              {editingIncomeId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingIncomeId(null);
                    setIncomeLabel("");
                    setIncomeValue("");
                    setIncomeRecurrence("monthly");
                  }}
                  className="px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
                >
                  Cancelar
                </button>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
              >
                {editingIncomeId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 text-emerald-400" />}
                {editingIncomeId ? "Salvar" : "Adicionar"}
              </button>
            </div>
          </form>

          <div className="space-y-3">
            <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-zinc-400 pb-2 border-b border-zinc-150">
              <span>Fontes de Renda</span>
              <span>Total: <span className="text-emerald-600 font-black font-mono">{formatCurrency(totalIncome)}</span></span>
            </div>

            {currentMonthIncomes.length === 0 ? (
              <p className="text-xs text-zinc-450 py-6 text-center font-bold">Nenhuma renda cadastrada para este mês.</p>
            ) : (
              <div className="space-y-2">
                {currentMonthIncomes.map((inc) => {
                  const isRecurrent = !inc.recurrence || inc.recurrence === "monthly";
                  return (
                    <div key={inc.id} className="flex justify-between items-center p-3 bg-white border border-zinc-200 hover:border-zinc-350 hover:shadow-2xs rounded-xl transition-all duration-200 group">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h5 className="text-xs font-bold text-zinc-800">{inc.label}</h5>
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                            isRecurrent 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                              : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                          }`}>
                            {isRecurrent ? "Recorrente" : "Avulsa"}
                          </span>
                        </div>
                        <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-semibold">
                          {isRecurrent ? "Receita Mensal Fixa" : `Renda Única em ${formatMonth(inc.month)}`}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-xs font-black text-emerald-600 font-mono">{formatCurrency(inc.value)}</span>
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => handleEditIncome(inc)}
                            className="p-1.5 text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 rounded-lg transition-all"
                            title="Editar"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteIncome(inc.id)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="lg:col-span-7 space-y-6">
        <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 pb-1">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-zinc-800 shrink-0" />
              <h3 className="text-base font-black text-zinc-900 uppercase tracking-wider">Contas Fixas Recorrentes</h3>
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">
              Total: <span className="text-indigo-650 font-black font-mono">{formatCurrency(totalFixedBills)}</span>
            </span>
          </div>

          <form id="add-bill-form" onSubmit={handleSaveBill} className="space-y-4 mb-6 p-4 bg-zinc-50 border border-zinc-200 rounded-2xl">
            <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest">
              {editingBillId ? "Editar Despesa Recorrente" : "Adicionar Nova Conta Fixa"}
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-bold text-zinc-500 mb-1">Nome da Conta</label>
                <input
                  type="text"
                  placeholder="Ex: Aluguel, Internet, Netflix"
                  value={billName}
                  onChange={(e) => setBillName(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:border-zinc-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0,00"
                  value={billValue}
                  onChange={(e) => setBillValue(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 placeholder-zinc-400 focus:outline-hidden focus:border-zinc-900"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-zinc-500 mb-1">Dia Venc.</label>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={billDueDay}
                  onChange={(e) => setBillDueDay(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-800 focus:outline-hidden focus:border-zinc-900"
                  required
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-zinc-450 uppercase tracking-wider text-[10px]">Categoria:</span>
                <div className="flex flex-wrap gap-1 items-center">
                  {categories.slice(0, 4).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setBillCategory(cat)}
                      className={`px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all ${
                        billCategory === cat
                          ? "bg-zinc-900 text-white shadow-2xs"
                          : "bg-white border border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <select
                    value={categories.includes(billCategory) ? billCategory : "Outros"}
                    onChange={(e) => setBillCategory(e.target.value)}
                    className="px-2 py-1 bg-white border border-zinc-200 text-[10px] font-bold uppercase tracking-wider text-zinc-600 rounded-xl focus:outline-hidden"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                {editingBillId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingBillId(null);
                      setBillName("");
                      setBillValue("");
                      setBillDueDay("5");
                      setBillCategory("Moradia");
                    }}
                    className="px-3 py-1.5 bg-zinc-200 hover:bg-zinc-300 text-zinc-800 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
                  >
                    Cancelar
                  </button>
                )}
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-4 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-black uppercase tracking-wider rounded-lg transition-all"
                >
                  {editingBillId ? <Check className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5 text-emerald-400" />}
                  {editingBillId ? "Salvar" : "Adicionar"}
                </button>
              </div>
            </div>
          </form>

          <div className="space-y-3">
            <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 pb-2 border-b border-zinc-150">
              Suas Contas Fixas Recorrentes
            </div>

            {fixedBills.length === 0 ? (
              <p className="text-xs text-zinc-400 py-10 text-center font-bold">Nenhuma conta fixa cadastrada. Adicione acima para iniciar.</p>
            ) : (
              <div className="space-y-2">
                {fixedBills.map((bill) => (
                  <div
                    key={bill.id}
                    className={`flex items-center justify-between p-3.5 rounded-2xl border transition-all duration-200 group ${
                      bill.active
                        ? "bg-white border-zinc-200 hover:border-zinc-350 hover:shadow-2xs"
                        : "bg-zinc-50/50 border-zinc-150 opacity-60 hover:opacity-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => handleToggleBillActive(bill.id)}
                        className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                          bill.active
                            ? "bg-indigo-50/50 border-indigo-150 text-indigo-600 hover:bg-indigo-100/50"
                            : "bg-zinc-100 border-zinc-200 text-zinc-400 hover:bg-zinc-200"
                        }`}
                        title={bill.active ? "Desativar (não entra no relatório)" : "Ativar (entra no relatório)"}
                      >
                        {bill.active ? (
                          <CheckSquare className="w-4 h-4 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 shrink-0" />
                        )}
                      </button>

                      <div>
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <h5 className={`text-xs font-bold ${bill.active ? "text-zinc-800" : "text-zinc-400 line-through"}`}>
                            {bill.name}
                          </h5>
                          {bill.category && (
                            <span className="text-[9px] font-black uppercase tracking-wider bg-zinc-100 text-zinc-500 border border-zinc-200 px-1.5 py-0.5 rounded-full">
                              {bill.category}
                            </span>
                          )}
                        </div>
                        <span className="text-[9px] text-zinc-450 font-bold block mt-1">
                          Vence dia {bill.dueDay} • Recorrente
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className={`text-xs font-black font-mono ${bill.active ? "text-zinc-900" : "text-zinc-400 line-through"}`}>
                        {formatCurrency(bill.value)}
                      </span>
                      <div className="flex gap-0.5">
                        <button
                          onClick={() => handleEditBill(bill)}
                          className="p-1.5 text-zinc-400 hover:text-zinc-950 hover:bg-zinc-100 rounded-lg transition-all"
                          title="Editar"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteBill(bill.id)}
                          className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
