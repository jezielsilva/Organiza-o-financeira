/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { FixedBill, IncomeSource } from "../types";
import { getCurrentMonth } from "../utils";
import { normalizarDiaVencimento } from "../services/calculationEngine";
import { motion, AnimatePresence } from "motion/react";
import {
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Plus,
  Trash2,
  Wallet,
  Coins,
  LayoutDashboard,
  AlertCircle,
  FileText,
} from "lucide-react";

// --- Tipos internos do formulário ---
interface IncomeEntry {
  label: string;
  value: string;
}

interface BillEntry {
  name: string;
  value: string;
  dueDay: string;
  category: string;
}

interface OnboardingProps {
  onComplete: (incomes: IncomeSource[], bills: FixedBill[]) => void;
}

const TOTAL_STEPS = 3;

// Componente de campo de texto reutilizável
function Field({
  label,
  placeholder,
  value,
  type = "text",
  min,
  onChange,
  error,
}: {
  label: string;
  placeholder: string;
  value: string;
  type?: string;
  min?: string;
  onChange: (v: string) => void;
  error?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-zinc-500 mb-1">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        min={min}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2.5 bg-white border rounded-xl text-sm font-semibold text-zinc-800 placeholder-zinc-400 focus:outline-none focus:ring-2 transition-all ${
          error
            ? "border-rose-300 focus:ring-rose-200"
            : "border-zinc-200 focus:ring-zinc-900/10 focus:border-zinc-900"
        }`}
      />
      {error && (
        <p className="text-rose-500 text-xs mt-1 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" /> {error}
        </p>
      )}
    </div>
  );
}

// --- Componente Principal de Onboarding ---
export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Estado do formulário de rendas
  const [incomes, setIncomes] = useState<IncomeEntry[]>([
    { label: "", value: "" },
  ]);

  // Estado do formulário de contas fixas
  const [bills, setBills] = useState<BillEntry[]>([
    { name: "", value: "", dueDay: "5", category: "Moradia" },
  ]);

  const BILL_CATEGORIES = [
    "Moradia",
    "Alimentação",
    "Transporte",
    "Saúde",
    "Educação",
    "Serviços",
    "Assinaturas",
    "Outros",
  ];

  // ========== Funções de manipulação de Rendas ==========
  const handleIncomeChange = (index: number, field: keyof IncomeEntry, value: string) => {
    setIncomes((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setErrors({});
  };

  const addIncome = () => {
    setIncomes((prev) => [...prev, { label: "", value: "" }]);
  };

  const removeIncome = (index: number) => {
    if (incomes.length === 1) return;
    setIncomes((prev) => prev.filter((_, i) => i !== index));
  };

  // ========== Funções de manipulação de Contas Fixas ==========
  const handleBillChange = (index: number, field: keyof BillEntry, value: string) => {
    setBills((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    setErrors({});
  };

  const addBill = () => {
    setBills((prev) => [
      ...prev,
      { name: "", value: "", dueDay: "5", category: "Moradia" },
    ]);
  };

  const removeBill = (index: number) => {
    if (bills.length === 1) return;
    setBills((prev) => prev.filter((_, i) => i !== index));
  };

  // ========== Validação ==========
  const validateIncomes = (): boolean => {
    const newErrors: Record<string, string> = {};
    incomes.forEach((inc, i) => {
      if (!inc.label.trim()) {
        newErrors[`income_label_${i}`] = "Informe o nome da renda.";
      }
      const val = parseFloat(inc.value);
      if (!inc.value || isNaN(val) || val <= 0) {
        newErrors[`income_value_${i}`] = "Valor deve ser um número positivo.";
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateBills = (): boolean => {
    const newErrors: Record<string, string> = {};
    bills.forEach((bill, i) => {
      if (!bill.name.trim()) {
        newErrors[`bill_name_${i}`] = "Informe o nome da conta.";
      }
      const val = parseFloat(bill.value);
      if (!bill.value || isNaN(val) || val <= 0) {
        newErrors[`bill_value_${i}`] = "Valor deve ser um número positivo.";
      }
      const day = parseInt(bill.dueDay);
      if (isNaN(day) || day < 1 || day > 31) {
        newErrors[`bill_due_${i}`] = "Dia de vencimento deve ser entre 1 e 31.";
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ========== Navegação entre etapas ==========
  const handleNext = () => {
    if (step === 1 && !validateIncomes()) return;
    if (step === 2 && !validateBills()) return;
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const handleBack = () => {
    setErrors({});
    setStep((s) => Math.max(s - 1, 0));
  };

  // ========== Conclusão ==========
  const handleFinish = () => {
    const currentMonth = getCurrentMonth();

    const parsedIncomes: IncomeSource[] = incomes.map((inc, i) => ({
      id: `onb-inc-${i}-${Date.now()}`,
      label: inc.label.trim(),
      value: Number(parseFloat(inc.value).toFixed(2)),
      month: currentMonth,
    }));

    const parsedBills: FixedBill[] = bills.map((bill, i) => {
      const normalDueDate = normalizarDiaVencimento(currentMonth, parseInt(bill.dueDay));
      return {
        id: `onb-bill-${i}-${Date.now()}`,
        name: bill.name.trim(),
        value: Number(parseFloat(bill.value).toFixed(2)),
        dueDay: normalDueDate,
        category: bill.category,
        active: true,
      };
    });

    onComplete(parsedIncomes, parsedBills);
  };

  // ========== Renderização das etapas ==========
  const renderStep = () => {
    switch (step) {
      // ---- Etapa 0: Boas-vindas ----
      case 0:
        return (
          <motion.div
            key="step-welcome"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="text-center space-y-6"
          >
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center shadow-2xl shadow-zinc-900/30">
                <Coins className="w-10 h-10 text-emerald-400" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-black text-zinc-900 tracking-tight">
                Bem-vindo ao
              </h1>
              <h2 className="text-3xl font-black text-emerald-500 tracking-tight">
                Controle Financeiro
              </h2>
              <p className="mt-4 text-zinc-500 text-sm leading-relaxed max-w-sm mx-auto">
                Vamos configurar seu perfil financeiro em menos de 2 minutos.
                Cadastre suas rendas e contas fixas para que o Dashboard já
                comece funcionando para você.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-2">
              {[
                { icon: Wallet, label: "Rendas & Gastos" },
                { icon: LayoutDashboard, label: "Dashboard Completo" },
                { icon: FileText, label: "Leitor de Faturas" },
              ].map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3 flex flex-col items-center gap-2"
                >
                  <Icon className="w-5 h-5 text-emerald-500" />
                  <span className="text-[10px] font-bold text-zinc-600 text-center uppercase tracking-wider leading-tight">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        );

      // ---- Etapa 1: Rendas ----
      case 1:
        return (
          <motion.div
            key="step-incomes"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
                <Wallet className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-black text-zinc-900">Suas Rendas</h2>
                <p className="text-xs text-zinc-500">
                  Cadastre suas fontes de renda mensais.
                </p>
              </div>
            </div>

            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
              {incomes.map((inc, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-3 relative"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      Renda #{i + 1}
                    </span>
                    {incomes.length > 1 && (
                      <button
                        onClick={() => removeIncome(i)}
                        className="p-1 text-zinc-400 hover:text-rose-500 rounded-lg transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <Field
                    label="Nome da Renda"
                    placeholder="Ex: Salário, Freelance, Aluguel recebido"
                    value={inc.label}
                    onChange={(v) => handleIncomeChange(i, "label", v)}
                    error={errors[`income_label_${i}`]}
                  />
                  <Field
                    label="Valor Mensal (R$)"
                    placeholder="Ex: 5000.00"
                    type="number"
                    min="0.01"
                    value={inc.value}
                    onChange={(v) => handleIncomeChange(i, "value", v)}
                    error={errors[`income_value_${i}`]}
                  />
                </motion.div>
              ))}
            </div>

            <button
              onClick={addIncome}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-zinc-300 hover:border-emerald-400 hover:bg-emerald-50 text-zinc-500 hover:text-emerald-600 rounded-2xl text-sm font-bold transition-all"
            >
              <Plus className="w-4 h-4" />
              Adicionar outra renda
            </button>
          </motion.div>
        );

      // ---- Etapa 2: Contas Fixas ----
      case 2:
        return (
          <motion.div
            key="step-bills"
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-lg font-black text-zinc-900">Contas Fixas</h2>
                <p className="text-xs text-zinc-500">
                  Despesas recorrentes todo mês.
                </p>
              </div>
            </div>

            <div className="space-y-3 max-h-[340px] overflow-y-auto pr-1">
              {bills.map((bill, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                      Conta #{i + 1}
                    </span>
                    {bills.length > 1 && (
                      <button
                        onClick={() => removeBill(i)}
                        className="p-1 text-zinc-400 hover:text-rose-500 rounded-lg transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <Field
                    label="Nome da Conta"
                    placeholder="Ex: Aluguel, Internet, Academia"
                    value={bill.name}
                    onChange={(v) => handleBillChange(i, "name", v)}
                    error={errors[`bill_name_${i}`]}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <Field
                      label="Valor (R$)"
                      placeholder="Ex: 150.00"
                      type="number"
                      min="0.01"
                      value={bill.value}
                      onChange={(v) => handleBillChange(i, "value", v)}
                      error={errors[`bill_value_${i}`]}
                    />
                    <Field
                      label="Dia de Vencimento"
                      placeholder="Ex: 10"
                      type="number"
                      min="1"
                      value={bill.dueDay}
                      onChange={(v) => handleBillChange(i, "dueDay", v)}
                      error={errors[`bill_due_${i}`]}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-zinc-500 mb-1">
                      Categoria
                    </label>
                    <select
                      value={bill.category}
                      onChange={(e) => handleBillChange(i, "category", e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm font-semibold text-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-900 transition-all"
                    >
                      {BILL_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </motion.div>
              ))}
            </div>

            <button
              onClick={addBill}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-zinc-300 hover:border-emerald-400 hover:bg-emerald-50 text-zinc-500 hover:text-emerald-600 rounded-2xl text-sm font-bold transition-all"
            >
              <Plus className="w-4 h-4" />
              Adicionar outra conta
            </button>
          </motion.div>
        );

      // ---- Etapa 3: Conclusão ----
      case 3:
        return (
          <motion.div
            key="step-done"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center space-y-6"
          >
            <div className="flex justify-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                className="w-20 h-20 bg-emerald-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-emerald-500/30"
              >
                <CheckCircle2 className="w-10 h-10 text-white" />
              </motion.div>
            </div>

            <div>
              <h2 className="text-2xl font-black text-zinc-900 tracking-tight">
                Tudo configurado!
              </h2>
              <p className="mt-3 text-zinc-500 text-sm leading-relaxed max-w-xs mx-auto">
                Seu perfil financeiro está pronto. Você pode editar ou adicionar mais
                dados a qualquer momento dentro do app.
              </p>
            </div>

            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-2 text-left">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-3">
                Resumo do Cadastro
              </p>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-600 font-semibold">
                  Rendas cadastradas
                </span>
                <span className="font-black text-emerald-600">
                  {incomes.filter((i) => i.label && parseFloat(i.value) > 0).length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-zinc-600 font-semibold">
                  Contas fixas cadastradas
                </span>
                <span className="font-black text-zinc-900">
                  {bills.filter((b) => b.name && parseFloat(b.value) > 0).length}
                </span>
              </div>
              <div className="flex justify-between text-sm border-t border-zinc-200 pt-2 mt-2">
                <span className="text-zinc-600 font-semibold">
                  Renda total mensal
                </span>
                <span className="font-black text-emerald-600">
                  R${" "}
                  {incomes
                    .filter((i) => parseFloat(i.value) > 0)
                    .reduce((sum, i) => sum + parseFloat(i.value || "0"), 0)
                    .toFixed(2)}
                </span>
              </div>
            </div>
          </motion.div>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-zinc-50 via-white to-emerald-50/30 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-3xl shadow-2xl shadow-zinc-200 border border-zinc-200/60 w-full max-w-md overflow-hidden"
      >
        {/* Progress bar */}
        {step > 0 && step < 3 && (
          <div className="h-1 bg-zinc-100">
            <motion.div
              className="h-full bg-emerald-500 rounded-full"
              initial={{ width: "0%" }}
              animate={{ width: `${((step) / (TOTAL_STEPS - 1)) * 100}%` }}
              transition={{ duration: 0.4 }}
            />
          </div>
        )}
        {step === 3 && <div className="h-1 bg-emerald-500" />}

        {/* Content */}
        <div className="p-7">
          {/* Step indicator */}
          {step > 0 && step < 3 && (
            <div className="flex items-center gap-1.5 mb-5">
              {[1, 2].map((s) => (
                <div
                  key={s}
                  className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                    s <= step ? "bg-emerald-500" : "bg-zinc-200"
                  }`}
                />
              ))}
              <span className="text-[10px] font-black text-zinc-400 ml-1">
                {step}/2
              </span>
            </div>
          )}

          {/* Step content */}
          <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
        </div>

        {/* Footer com botões de navegação */}
        <div className="px-7 pb-7 flex items-center justify-between gap-3">
          {step > 0 && step < 3 ? (
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 px-4 py-2.5 text-zinc-500 hover:text-zinc-900 text-sm font-bold rounded-xl hover:bg-zinc-100 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
              Voltar
            </button>
          ) : (
            <div />
          )}

          {step < 3 ? (
            <button
              onClick={handleNext}
              className="flex items-center gap-2 px-6 py-2.5 bg-zinc-900 hover:bg-zinc-800 text-white text-sm font-black rounded-xl transition-all shadow-md shadow-zinc-900/20 ml-auto"
            >
              {step === 0 ? "Começar" : "Próximo"}
              <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-black rounded-xl transition-all shadow-md shadow-emerald-500/30 ml-auto"
            >
              <CheckCircle2 className="w-4 h-4" />
              Acessar o Dashboard
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
