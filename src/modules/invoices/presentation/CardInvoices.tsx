/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo: invoices
 * Camada: presentation (Componente React UI de Faturas)
 */

import React, { useState, useRef } from "react";
import { CardInvoice, CardPurchase } from "../../../types";
import { formatCurrency, formatMonth } from "../../../core/shared/formatters";
import { FileText, AlertTriangle, Edit3, Trash2, Plus, Loader2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { parseInvoiceClientSide } from "../../../invoiceParserClient";
import InvoiceUploadZone from "./InvoiceUploadZone";
import PurchaseFormModal from "./PurchaseFormModal";

interface CardInvoicesProps {
  selectedMonth: string;
  invoices: CardInvoice[];
  setInvoices: React.Dispatch<React.SetStateAction<CardInvoice[]>>;
}

export default function CardInvoices({
  selectedMonth,
  invoices,
  setInvoices,
}: CardInvoicesProps) {
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [isAddingPurchase, setIsAddingPurchase] = useState(false);

  const [purDesc, setPurDesc] = useState("");
  const [purValue, setPurValue] = useState("");
  const [purDate, setPurDate] = useState("");
  const [purCategory, setPurCategory] = useState("Geral");
  const [purIsInstallment, setPurIsInstallment] = useState(false);
  const [purInstallmentCurrent, setPurInstallmentCurrent] = useState("1");
  const [purInstallmentTotal, setPurInstallmentTotal] = useState("10");

  const activeInvoice = invoices.find((inv) => inv.referenceMonth === selectedMonth);

  const handleFile = async (file: File) => {
    if (!file) return;

    const allowedTypes = ["application/pdf"];
    if (!allowedTypes.includes(file.type)) {
      setError("Tipo de arquivo inválido. Por favor, envie uma fatura em formato PDF.");
      return;
    }

    setLoading(true);
    setError(null);
    setLoadingStep("Extraindo texto do PDF no navegador...");

    try {
      setLoadingStep("Processando lançamentos da fatura...");
      const parsedInvoice = await parseInvoiceClientSide(file, selectedMonth);

      setInvoices((prev) => {
        const filtered = prev.filter((inv) => inv.referenceMonth !== parsedInvoice.referenceMonth);
        return [...filtered, parsedInvoice];
      });

      setLoadingStep("Concluído!");
      setTimeout(() => {
        setLoading(false);
      }, 500);

    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Erro inesperado ao processar arquivo.");
      setLoading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSavePurchase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!purDesc || !purValue || !activeInvoice) return;

    const val = parseFloat(purValue);
    if (isNaN(val) || val <= 0) return;

    let updatedPurchases: CardPurchase[] = [];

    const isInstallment = purIsInstallment;
    const current = isInstallment ? parseInt(purInstallmentCurrent) : undefined;
    const total = isInstallment ? parseInt(purInstallmentTotal) : undefined;
    const installmentValue = isInstallment ? val : undefined;
    const totalValue = isInstallment && total ? val * total : val;
    const remaining = isInstallment && total && current ? total - current : undefined;

    if (editingPurchaseId) {
      updatedPurchases = activeInvoice.purchases.map((p) =>
        p.id === editingPurchaseId
          ? {
              ...p,
              description: purDesc,
              category: purCategory,
              purchaseDate: purDate || undefined,
              totalValue,
              isInstallment,
              installmentCurrent: current,
              installmentTotal: total,
              installmentValue,
              installmentsRemaining: remaining,
            }
          : p
      );
      setEditingPurchaseId(null);
    } else {
      const newPurchase: CardPurchase = {
        id: `pur-man-${Date.now()}`,
        description: purDesc,
        category: purCategory,
        purchaseDate: purDate || undefined,
        totalValue,
        isInstallment,
        installmentCurrent: current,
        installmentTotal: total,
        installmentValue,
        installmentsRemaining: remaining,
      };
      updatedPurchases = [...activeInvoice.purchases, newPurchase];
      setIsAddingPurchase(false);
    }

    const newTotal = updatedPurchases.reduce((acc, curr) => {
      const val = curr.isInstallment ? (curr.installmentValue || 0) : curr.totalValue;
      return acc + val;
    }, 0);

    setInvoices((prev) =>
      prev.map((inv) =>
        inv.referenceMonth === selectedMonth
          ? { ...inv, purchases: updatedPurchases, totalValue: newTotal }
          : inv
      )
    );

    resetPurchaseForm();
  };

  const handleEditPurchase = (purchase: CardPurchase) => {
    setEditingPurchaseId(purchase.id);
    setIsAddingPurchase(true);
    setPurDesc(purchase.description);
    setPurCategory(purchase.category || "Geral");
    setPurDate(purchase.purchaseDate || "");
    setPurIsInstallment(purchase.isInstallment);
    
    if (purchase.isInstallment) {
      setPurValue((purchase.installmentValue || 0).toString());
      setPurInstallmentCurrent((purchase.installmentCurrent || 1).toString());
      setPurInstallmentTotal((purchase.installmentTotal || 10).toString());
    } else {
      setPurValue(purchase.totalValue.toString());
    }
  };

  const handleDeletePurchase = (purchaseId: string) => {
    if (!activeInvoice) return;
    const updated = activeInvoice.purchases.filter((p) => p.id !== purchaseId);
    const newTotal = updated.reduce((acc, curr) => {
      const val = curr.isInstallment ? (curr.installmentValue || 0) : curr.totalValue;
      return acc + val;
    }, 0);

    setInvoices((prev) =>
      prev.map((inv) =>
        inv.referenceMonth === selectedMonth
          ? { ...inv, purchases: updated, totalValue: newTotal }
          : inv
      )
    );
  };

  const handleDeleteInvoice = () => {
    if (confirm("Deseja realmente excluir todos os dados da fatura deste mês?")) {
      setInvoices((prev) => prev.filter((inv) => inv.referenceMonth !== selectedMonth));
    }
  };

  const resetPurchaseForm = () => {
    setPurDesc("");
    setPurValue("");
    setPurDate("");
    setPurCategory("Geral");
    setPurIsInstallment(false);
    setPurInstallmentCurrent("1");
    setPurInstallmentTotal("10");
    setEditingPurchaseId(null);
  };

  return (
    <div className="space-y-6" id="card-invoices-container">
      {error && (
        <div className="bg-rose-50/80 border border-rose-100 text-rose-800 p-4 rounded-xl text-xs flex gap-2 items-center">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && (
        <div className="bg-zinc-900 text-white rounded-3xl p-10 flex flex-col items-center justify-center text-center space-y-4 shadow-2xl border border-zinc-800">
          <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />
          <div className="space-y-1">
            <h4 className="font-black text-base flex items-center justify-center gap-2 tracking-tight">
              <FileText className="w-5 h-5 text-emerald-300 animate-pulse" />
              Processando Fatura
            </h4>
            <p className="text-xs text-zinc-400 max-w-sm leading-relaxed">{loadingStep}</p>
          </div>
          <div className="text-[9px] text-zinc-600 uppercase font-black tracking-widest animate-pulse mt-4">
            Isso pode levar alguns segundos...
          </div>
        </div>
      )}

      {!loading && !activeInvoice && (
        <InvoiceUploadZone
          loading={loading}
          loadingStep={loadingStep}
          error={error}
          dragActive={dragActive}
          onFileSelected={handleFile}
          onDrag={handleDrag}
          onDrop={handleDrop}
        />
      )}

      {!loading && activeInvoice && (
        <div className="space-y-6">
          <div className="bg-white border border-zinc-200 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-start gap-4">
              <div className="p-3.5 bg-zinc-900 text-emerald-400 rounded-2xl shadow-xs">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-bold text-zinc-900">
                    Fatura de {formatMonth(activeInvoice.referenceMonth)}
                  </h3>
                  {activeInvoice.needsReview && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-100 px-2.5 py-0.5 rounded-full">
                      <AlertTriangle className="w-3 h-3" /> Revisão Necessária
                    </span>
                  )}
                </div>
                <p className="text-xs text-zinc-500 mt-1">
                  Arquivo: <span className="font-semibold text-zinc-800">{activeInvoice.fileName}</span> • Lido por IA em {new Date(activeInvoice.parsedAt).toLocaleDateString("pt-BR")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-end">
              <div className="text-right">
                <span className="text-[9px] text-zinc-400 uppercase tracking-widest font-black">Valor Total</span>
                <div className="text-2xl font-black text-zinc-900">{formatCurrency(activeInvoice.totalValue)}</div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2.5 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 border border-zinc-200 rounded-xl transition-all"
                  title="Sobrescrever / Re-enviar fatura"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={(e) => e.target.files && handleFile(e.target.files[0])}
                  accept=".pdf"
                  className="hidden"
                />
                <button
                  onClick={handleDeleteInvoice}
                  className="p-2.5 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 border border-zinc-200 rounded-xl transition-all"
                  title="Excluir dados da fatura"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <AnimatePresence>
            {(isAddingPurchase || editingPurchaseId) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <PurchaseFormModal
                  editingPurchaseId={editingPurchaseId}
                  purDesc={purDesc}
                  setPurDesc={setPurDesc}
                  purValue={purValue}
                  setPurValue={setPurValue}
                  purDate={purDate}
                  setPurDate={setPurDate}
                  purCategory={purCategory}
                  setPurCategory={setPurCategory}
                  purIsInstallment={purIsInstallment}
                  setPurIsInstallment={setPurIsInstallment}
                  purInstallmentCurrent={purInstallmentCurrent}
                  setPurInstallmentCurrent={setPurInstallmentCurrent}
                  purInstallmentTotal={purInstallmentTotal}
                  setPurInstallmentTotal={setPurInstallmentTotal}
                  onSave={handleSavePurchase}
                  onCancel={resetPurchaseForm}
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="px-6 py-4.5 border-b border-zinc-150 flex justify-between items-center bg-zinc-50/50">
              <h4 className="font-black text-zinc-800 text-xs uppercase tracking-widest">Gastos Lançados na Fatura</h4>
              {!isAddingPurchase && !editingPurchaseId && (
                <button
                  onClick={() => setIsAddingPurchase(true)}
                  className="inline-flex items-center gap-1 px-3 py-2 bg-zinc-900 hover:bg-zinc-800 text-white text-[10px] font-black uppercase tracking-wider rounded-xl transition-all"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" /> Adicionar Compra
                </button>
              )}
            </div>

            <div className="block md:hidden divide-y divide-zinc-150">
              {activeInvoice.purchases.length === 0 ? (
                <div className="text-center py-10 text-zinc-400 font-bold text-xs bg-white">
                  Nenhuma compra lançada na fatura.
                </div>
              ) : (
                activeInvoice.purchases.map((pur) => {
                  const current = pur.installmentCurrent;
                  const total = pur.installmentTotal;
                  const isInstallment = pur.isInstallment;
                  const remaining = isInstallment && total && current ? total - current : 0;
                  const progressPct = isInstallment && current && total ? (current / total) * 100 : 100;

                  return (
                    <div key={pur.id} className="p-4 bg-white space-y-3.5">
                      <div className="flex justify-between items-start gap-2">
                        <div>
                          <span className="text-[10px] text-zinc-450 font-bold block mb-1">
                            {pur.purchaseDate ? new Date(pur.purchaseDate).toLocaleDateString("pt-BR") : "Sem data"}
                          </span>
                          <h5 className="text-xs font-bold text-zinc-950 leading-tight">{pur.description}</h5>
                        </div>
                        
                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-zinc-950 font-mono block">
                            {formatCurrency(isInstallment ? pur.installmentValue || 0 : pur.totalValue)}
                          </span>
                          {isInstallment && (
                            <span className="text-[9px] text-zinc-400 font-bold block mt-0.5">
                              Total: {formatCurrency(pur.totalValue)}
                            </span>
                          )}
                        </div>
                      </div>

                      {isInstallment && (
                        <div className="p-3 bg-indigo-50/20 border border-indigo-100/50 rounded-xl space-y-2">
                          <div className="flex justify-between items-center text-[10px] font-bold text-indigo-700">
                            <span>Parcelado ({current}x de {total}x)</span>
                            {remaining > 0 && <span>Faltam {remaining} meses</span>}
                          </div>
                          <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                            <div
                              className="bg-indigo-600 h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${progressPct}%` }}
                            ></div>
                          </div>
                        </div>
                      )}

                      <div className="flex justify-between items-center pt-1">
                        {!isInstallment && (
                          <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full">
                            À Vista
                          </span>
                        )}
                        {isInstallment && <div />}
                        
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleEditPurchase(pur)}
                            className="inline-flex items-center justify-center p-2 text-zinc-500 hover:text-zinc-950 hover:bg-zinc-100 rounded-lg transition-all border border-zinc-200 text-[10px] font-bold uppercase tracking-wider gap-1"
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Editar
                          </button>
                          <button
                            onClick={() => handleDeletePurchase(pur.id)}
                            className="inline-flex items-center justify-center p-2 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-zinc-200 text-[10px] font-bold uppercase tracking-wider gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-150 text-[10px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-50/20">
                    <th className="px-6 py-3">Data</th>
                    <th className="px-6 py-3">Descrição</th>
                    <th className="px-6 py-3">Tipo</th>
                    <th className="px-6 py-3 text-right">Valor Pago</th>
                    <th className="px-6 py-3 text-right">Valor Total</th>
                    <th className="px-6 py-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 text-xs text-zinc-700 font-medium">
                  {activeInvoice.purchases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-10 text-zinc-400 font-bold">
                        Nenhuma compra lançada na fatura. Clique em "Adicionar Compra" ou re-envie o arquivo.
                      </td>
                    </tr>
                  ) : (
                    activeInvoice.purchases.map((pur) => {
                      const current = pur.installmentCurrent;
                      const total = pur.installmentTotal;
                      const isInstallment = pur.isInstallment;
                      
                      const progressPct = isInstallment && current && total ? (current / total) * 100 : 100;
                      const remaining = isInstallment && total && current ? total - current : 0;

                      return (
                        <tr key={pur.id} className="hover:bg-zinc-50/60 group transition-colors duration-200">
                          <td className="px-6 py-4 whitespace-nowrap text-[10px] text-zinc-400 font-bold">
                            {pur.purchaseDate ? new Date(pur.purchaseDate).toLocaleDateString("pt-BR") : "—"}
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-bold text-zinc-800">{pur.description}</div>
                            {isInstallment && (
                              <div className="flex items-center gap-2 mt-2 max-w-[160px]">
                                <div className="w-full bg-zinc-100 h-1 rounded-full overflow-hidden">
                                  <div
                                    className="bg-indigo-600 h-1 rounded-full"
                                    style={{ width: `${progressPct}%` }}
                                  ></div>
                                </div>
                                <span className="text-[9px] font-black text-indigo-600 whitespace-nowrap shrink-0 font-mono">
                                  {current}/{total}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {isInstallment ? (
                              <div className="space-y-0.5">
                                <span className="text-[9px] font-black uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                                  Parcelado
                                </span>
                                {remaining > 0 && (
                                  <span className="text-[9px] text-zinc-400 block font-bold">
                                    Faltam {remaining} meses
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-[9px] font-black uppercase tracking-wider text-zinc-500 bg-zinc-100 border border-zinc-200 px-2 py-0.5 rounded-full">
                                  À Vista
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-right font-black text-zinc-900">
                            {isInstallment
                              ? formatCurrency(pur.installmentValue || 0)
                              : formatCurrency(pur.totalValue)}
                          </td>
                          <td className="px-6 py-4 text-right text-zinc-400 font-bold">
                            {formatCurrency(pur.totalValue)}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleEditPurchase(pur)}
                                className="p-1.5 text-zinc-400 hover:text-zinc-950 hover:bg-zinc-50 border border-transparent hover:border-zinc-200 rounded-lg transition-all"
                                title="Editar Lançamento"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeletePurchase(pur.id)}
                                className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-zinc-200 rounded-lg transition-all"
                                title="Excluir"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
