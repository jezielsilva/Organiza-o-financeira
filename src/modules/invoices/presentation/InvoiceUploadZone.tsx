/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo: invoices
 * Camada: presentation (Componente UI Upload Zone)
 */

import React, { useRef } from "react";
import { Upload, Loader2 } from "lucide-react";

interface InvoiceUploadZoneProps {
  loading: boolean;
  loadingStep: string;
  error: string | null;
  dragActive: boolean;
  onFileSelected: (file: File) => void;
  onDrag: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

export default function InvoiceUploadZone({
  loading,
  loadingStep,
  error,
  dragActive,
  onFileSelected,
  onDrag,
  onDrop,
}: InvoiceUploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelected(e.target.files[0]);
    }
  };

  return (
    <div
      onDragEnter={onDrag}
      onDragLeave={onDrag}
      onDragOver={onDrag}
      onDrop={onDrop}
      className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all ${
        dragActive
          ? "border-emerald-500 bg-emerald-50/50 scale-[1.01]"
          : "border-zinc-200 dark:border-zinc-800 hover:border-emerald-400 bg-white dark:bg-zinc-900"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleInputChange}
        className="hidden"
      />

      <div className="flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          {loading ? <Loader2 className="w-7 h-7 animate-spin" /> : <Upload className="w-7 h-7" />}
        </div>

        {loading ? (
          <div className="space-y-1">
            <p className="font-semibold text-zinc-900 dark:text-zinc-100">{loadingStep}</p>
            <p className="text-xs text-zinc-500">Aguarde a leitura automática do documento...</p>
          </div>
        ) : (
          <>
            <div>
              <p className="font-semibold text-zinc-900 dark:text-zinc-100 text-lg">
                Arraste a fatura em PDF aqui
              </p>
              <p className="text-sm text-zinc-500 mt-1">
                Ou selecione o arquivo PDF do seu banco do dispositivo
              </p>
            </div>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="mt-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-colors shadow-sm"
            >
              Selecionar PDF da Fatura
            </button>
          </>
        )}

        {error && (
          <div className="mt-3 p-3 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 rounded-xl text-xs max-w-md">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
