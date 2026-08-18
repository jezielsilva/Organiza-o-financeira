/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo: invoices
 * Camada: presentation (Componente UI Purchase Form Modal)
 */

import React from "react";
import { Plus } from "lucide-react";

interface PurchaseFormModalProps {
  editingPurchaseId: string | null;
  purDesc: string;
  setPurDesc: (v: string) => void;
  purValue: string;
  setPurValue: (v: string) => void;
  purDate: string;
  setPurDate: (v: string) => void;
  purCategory: string;
  setPurCategory: (v: string) => void;
  purIsInstallment: boolean;
  setPurIsInstallment: (v: boolean) => void;
  purInstallmentCurrent: string;
  setPurInstallmentCurrent: (v: string) => void;
  purInstallmentTotal: string;
  setPurInstallmentTotal: (v: string) => void;
  onSave: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export default function PurchaseFormModal({
  editingPurchaseId,
  purDesc,
  setPurDesc,
  purValue,
  setPurValue,
  purDate,
  setPurDate,
  purCategory,
  setPurCategory,
  purIsInstallment,
  setPurIsInstallment,
  purInstallmentCurrent,
  setPurInstallmentCurrent,
  purInstallmentTotal,
  setPurInstallmentTotal,
  onSave,
  onCancel,
}: PurchaseFormModalProps) {
  return (
    <form onSubmit={onSave} className="bg-zinc-50 border border-zinc-200 rounded-2xl p-6 space-y-4 shadow-sm">
      <div className="flex justify-between items-center pb-2 border-b border-zinc-200">
        <h4 className="text-xs font-black uppercase tracking-wider text-zinc-800">
          {editingPurchaseId ? "Editar Lançamento" : "Adicionar Lançamento Manual"}
        </h4>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
            Descrição do Gasto *
          </label>
          <input
            type="text"
            required
            placeholder="Ex: Supermercado Pão de Açúcar"
            value={purDesc}
            onChange={(e) => setPurDesc(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-zinc-900"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
            Valor da Parcela/Total (R$) *
          </label>
          <input
            type="number"
            step="0.01"
            required
            placeholder="0.00"
            value={purValue}
            onChange={(e) => setPurValue(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-zinc-900"
          />
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-1">
            Data da Compra
          </label>
          <input
            type="date"
            value={purDate}
            onChange={(e) => setPurDate(e.target.value)}
            className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-semibold focus:outline-hidden focus:border-zinc-900"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-zinc-200">
        <div className="flex items-center gap-4">
          <label className="inline-flex items-center gap-2 cursor-pointer text-xs font-bold text-zinc-700">
            <input
              type="checkbox"
              checked={purIsInstallment}
              onChange={(e) => setPurIsInstallment(e.target.checked)}
              className="rounded-md text-zinc-900 focus:ring-0 w-4 h-4 cursor-pointer"
            />
            <span>É Compra Parcelada?</span>
          </label>

          {purIsInstallment && (
            <div className="flex items-center gap-2 bg-white px-3 py-1 border border-zinc-200 rounded-xl text-xs">
              <span className="text-[10px] text-zinc-400 font-bold">Parcela</span>
              <input
                type="number"
                min="1"
                max="120"
                value={purInstallmentCurrent}
                onChange={(e) => setPurInstallmentCurrent(e.target.value)}
                className="w-10 text-center font-bold border-b border-zinc-300 focus:outline-hidden focus:border-zinc-900"
              />
              <span className="text-[10px] text-zinc-400 font-bold">de</span>
              <input
                type="number"
                min="1"
                max="120"
                value={purInstallmentTotal}
                onChange={(e) => setPurInstallmentTotal(e.target.value)}
                className="w-10 text-center font-bold border-b border-zinc-300 focus:outline-hidden focus:border-zinc-900"
              />
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider shadow-xs transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> Salvar Lançamento
          </button>
        </div>
      </div>
    </form>
  );
}
