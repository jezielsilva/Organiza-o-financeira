/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SyncPage — Página Completa de Sincronização Compartilhada
 *
 * Substitui o popup/modal de sincronização por uma página real de rota,
 * eliminando os problemas de z-index e stacking context do WebKit/iOS.
 */

import React, { useState } from "react";
import { motion } from "motion/react";
import {
  Cloud,
  CloudOff,
  CloudUpload,
  Link,
  Link2Off,
  Copy,
  Check,
  Loader2,
  Shuffle,
  AlertTriangle,
  Wifi,
  WifiOff,
  Users,
  Info,
} from "lucide-react";
import {
  getSyncCode,
  setSyncCode,
  clearSyncCode,
  clearDomainTimestamps,
  gerarCodigoAleatorio,
  pushDomainsToServer,
  isFirebaseConfigured,
  SyncStatus,
} from "../services/syncService";

// ──────────────────────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────────────────────

interface SyncPageProps {
  /** Código de sincronização ativo (null = desconectado). */
  syncCode: string | null;
  /** Status atual da sincronização. */
  syncStatus: SyncStatus;
  /** Callback para notificar App.tsx da mudança do código. */
  onSyncCodeChange: (code: string | null) => void;
  /** Callback para atualizar o status de sync no App. */
  onStatusChange: (status: SyncStatus) => void;
  /** Callback chamado após ativar o código — envia push inicial. */
  onSyncActivated: (code: string) => Promise<void>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Status config
// ──────────────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<SyncStatus, { icon: React.ElementType; label: string; color: string; bg: string; dot: string }> = {
  no_code: {
    icon: CloudOff,
    label: "Sem código ativo",
    color: "text-zinc-500",
    bg: "bg-zinc-100",
    dot: "bg-zinc-400",
  },
  idle: {
    icon: Cloud,
    label: "Conectado",
    color: "text-sky-600",
    bg: "bg-sky-50",
    dot: "bg-sky-400",
  },
  syncing: {
    icon: Loader2,
    label: "Sincronizando...",
    color: "text-amber-600",
    bg: "bg-amber-50",
    dot: "bg-amber-400",
  },
  synced: {
    icon: CloudUpload,
    label: "Sincronizado",
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    dot: "bg-emerald-400",
  },
  error: {
    icon: WifiOff,
    label: "Erro de conexão",
    color: "text-rose-500",
    bg: "bg-rose-50",
    dot: "bg-rose-400",
  },
  not_configured: {
    icon: AlertTriangle,
    label: "Firebase não configurado",
    color: "text-amber-600",
    bg: "bg-amber-50",
    dot: "bg-amber-300",
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Componente Principal
// ──────────────────────────────────────────────────────────────────────────────

export default function SyncPage({
  syncCode,
  syncStatus,
  onSyncCodeChange,
  onStatusChange,
  onSyncActivated,
}: SyncPageProps) {
  const [inputCode, setInputCode] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [copied, setCopied] = useState(false);

  const configured = isFirebaseConfigured();
  const status = STATUS_CONFIG[syncStatus];
  const StatusIcon = status.icon;

  // ─── Ativar código ─────────────────────────────────────────────────────────
  const handleActivate = async (code: string) => {
    const trimmed = code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!trimmed) {
      setErrorMsg("Digite um código válido (letras e números).");
      return;
    }
    if (!configured) {
      setErrorMsg("Firebase não configurado. Verifique as variáveis de ambiente.");
      return;
    }
    setErrorMsg("");
    onStatusChange("syncing");
    setSyncCode(trimmed);
    onSyncCodeChange(trimmed);
    try {
      await onSyncActivated(trimmed);
      onStatusChange("synced");
      setInputCode("");
    } catch {
      onStatusChange("error");
      setErrorMsg("Falha ao conectar. Verifique as credenciais do Firebase.");
    }
  };

  // ─── Desconectar ───────────────────────────────────────────────────────────
  const handleDeactivate = () => {
    clearSyncCode();
    clearDomainTimestamps();
    onSyncCodeChange(null);
    onStatusChange(configured ? "no_code" : "not_configured");
    setInputCode("");
    setErrorMsg("");
  };

  // ─── Copiar código ──────────────────────────────────────────────────────────
  const handleCopy = () => {
    if (!syncCode) return;
    navigator.clipboard.writeText(syncCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ─── Gerar código aleatório ─────────────────────────────────────────────────
  const handleGenerate = () => {
    const code = gerarCodigoAleatorio();
    setInputCode(code);
    handleActivate(code);
  };

  return (
    <div className="max-w-lg mx-auto space-y-6">

      {/* ─── Cabeçalho da Página ─────────────────────────────────────────── */}
      <div>
        <h2 className="text-xl font-black text-zinc-900 flex items-center gap-2.5">
          <div className="p-2 bg-zinc-900 rounded-xl">
            <Users className="w-5 h-5 text-emerald-400" />
          </div>
          Compartilhamento de Dados
        </h2>
        <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
          Sincronize seus dados financeiros em tempo real com outra pessoa usando um código compartilhado.
        </p>
      </div>

      {/* ─── Status Atual ───────────────────────────────────────────────── */}
      <motion.div
        layout
        className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${status.bg} border-current/10`}
      >
        <span
          className={`w-2.5 h-2.5 rounded-full shrink-0 ${status.dot} ${
            syncStatus === "syncing" ? "animate-pulse" : ""
          }`}
        />
        <StatusIcon
          className={`w-4 h-4 shrink-0 ${status.color} ${
            syncStatus === "syncing" ? "animate-spin" : ""
          }`}
        />
        <span className={`text-sm font-bold ${status.color}`}>{status.label}</span>
        {syncCode && (
          <span className="ml-auto text-[11px] font-mono font-bold text-zinc-500 bg-white px-2 py-0.5 rounded-lg border border-zinc-200 truncate max-w-[100px]">
            {syncCode}
          </span>
        )}
      </motion.div>

      {/* ─── Aviso Firebase não configurado ──────────────────────────────── */}
      {!configured && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3"
        >
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-700">Firebase não configurado</p>
            <p className="text-xs text-amber-600 mt-1 leading-relaxed">
              Para habilitar o compartilhamento em tempo real, adicione as credenciais do Firebase nas variáveis de ambiente{" "}
              <code className="font-mono bg-amber-100 px-1 rounded text-amber-800">VITE_FIREBASE_*</code>.
            </p>
          </div>
        </motion.div>
      )}

      {/* ─── Estado: Conectado ──────────────────────────────────────────── */}
      {syncCode && configured ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {/* Card do código ativo */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-2">
              Código Ativo
            </p>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-black text-emerald-900 tracking-widest font-mono flex-1 truncate">
                {syncCode}
              </span>
              <button
                id="sync-copy-code-btn"
                onClick={handleCopy}
                className="p-2.5 rounded-xl bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-100 transition-all shrink-0"
                title="Copiar código"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Instrução */}
          <div className="bg-white border border-zinc-200 rounded-2xl p-4 flex gap-3">
            <Info className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-600 leading-relaxed">
              Qualquer pessoa que digitar o código{" "}
              <strong className="text-zinc-900 font-mono">{syncCode}</strong> nesta tela
              terá os dados sincronizados automaticamente em{" "}
              <span className="text-emerald-600 font-bold">tempo real</span>.
            </p>
          </div>

          {/* Botão desconectar */}
          <button
            id="sync-deactivate-btn"
            onClick={handleDeactivate}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-2xl border border-zinc-200 text-zinc-500 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-sm font-bold transition-all"
          >
            <Link2Off className="w-4 h-4" />
            Desconectar e Parar Compartilhamento
          </button>
        </motion.div>

      ) : configured ? (
        /* ─── Estado: Desconectado, Firebase configurado ──────────────────── */
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          {/* Input do código */}
          <div className="space-y-2">
            <label
              htmlFor="sync-code-input"
              className="text-xs font-black text-zinc-500 uppercase tracking-wider block"
            >
              Entrar com código existente
            </label>
            <div className="flex gap-2">
              <input
                id="sync-code-input"
                type="text"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.toLowerCase())}
                onKeyDown={(e) => e.key === "Enter" && handleActivate(inputCode)}
                placeholder="ex: familia-santos"
                className="flex-1 px-4 py-3 border border-zinc-200 rounded-2xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-zinc-50 transition-all"
                maxLength={32}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
              />
              <button
                id="sync-activate-btn"
                onClick={() => handleActivate(inputCode)}
                disabled={syncStatus === "syncing" || !inputCode.trim()}
                className="px-4 py-3 bg-zinc-900 text-white rounded-2xl text-sm font-bold hover:bg-zinc-700 transition-all disabled:opacity-40 shrink-0"
              >
                Entrar
              </button>
            </div>
            {errorMsg && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-rose-500 font-semibold"
              >
                {errorMsg}
              </motion.p>
            )}
          </div>

          {/* Divisor */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-100" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-zinc-50 px-3 text-[10px] text-zinc-400 uppercase tracking-wider font-bold">
                ou
              </span>
            </div>
          </div>

          {/* Gerar novo código */}
          <button
            id="sync-generate-btn"
            onClick={handleGenerate}
            disabled={syncStatus === "syncing"}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 px-4 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-bold transition-all disabled:opacity-50 shadow-lg shadow-emerald-600/20"
          >
            <Shuffle className="w-4 h-4" />
            Criar Novo Código Compartilhado
          </button>

          <p className="text-[11px] text-zinc-400 leading-relaxed text-center">
            Sincronização bidirecional em tempo real via Firebase Realtime Database.
            Funciona no celular, web e PWA instalado.
          </p>
        </motion.div>
      ) : null}

      {/* ─── Como Funciona (Info Card) ─────────────────────────────────── */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-5 space-y-3">
        <h3 className="text-xs font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
          <Info className="w-3.5 h-3.5" />
          Como Funciona
        </h3>
        <div className="space-y-2.5 text-xs text-zinc-600 leading-relaxed">
          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">1</span>
            <p>Crie ou informe um código compartilhado na caixa acima.</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">2</span>
            <p>Compartilhe o código com quem você quiser — cônjuge, familiar, ou dupla de finanças.</p>
          </div>
          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-black text-[10px] flex items-center justify-center shrink-0 mt-0.5">3</span>
            <p>Alterações de qualquer dispositivo aparecem automaticamente para todos. A última edição vence em conflitos.</p>
          </div>
        </div>
      </div>

    </div>
  );
}
