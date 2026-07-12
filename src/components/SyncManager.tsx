/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
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
} from "lucide-react";
import {
  getSyncCode,
  setSyncCode,
  clearSyncCode,
  gerarCodigoAleatorio,
  pushToServer,
  subscribeToRemoteChanges,
  isFirebaseConfigured,
  SyncStatus,
} from "../services/syncService";

interface SyncManagerProps {
  onSyncActivated: (code: string) => Promise<void>;
  onRemoteDataReceived: (data: object) => void;
  currentAppData: object;
  dataVersion: number;
}

export default function SyncManager({
  onSyncActivated,
  onRemoteDataReceived,
  currentAppData,
  dataVersion,
}: SyncManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [syncCode, setSyncCodeState] = useState<string | null>(getSyncCode);
  const [inputCode, setInputCode] = useState("");
  const configured = isFirebaseConfigured();
  const [status, setStatus] = useState<SyncStatus>(() => {
    if (!configured) return "not_configured";
    return getSyncCode() ? "synced" : "no_code";
  });
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ─── Fechar painel ao clicar fora ──────────────────────────────────────────
  useEffect(() => {
    function handleClickOutside(e: Event) {
      const target = e.target as Node;
      // Se o clique foi em um elemento que já saiu do DOM (ex: ícones trocados) ou não existe, ignora
      if (!target || !document.body.contains(target)) return;
      
      if (panelRef.current && !panelRef.current.contains(target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // ─── Inscrição em tempo real no Firebase ───────────────────────────────────
  useEffect(() => {
    if (!syncCode || !configured) return;
    unsubscribeRef.current?.();
    const unsub = subscribeToRemoteChanges(
      (remoteData) => {
        onRemoteDataReceived(remoteData);
        setStatus("synced");
      },
      () => setStatus("error")
    );
    unsubscribeRef.current = unsub;
    return () => {
      unsub();
      unsubscribeRef.current = null;
    };
  }, [syncCode, configured, onRemoteDataReceived]);

  // ─── Auto-push quando os dados do app mudam ────────────────────────────────
  const prevVersionRef = useRef(dataVersion);
  useEffect(() => {
    if (!syncCode || !configured) return;
    if (prevVersionRef.current === dataVersion) return;
    prevVersionRef.current = dataVersion;
    setStatus("syncing");
    pushToServer(currentAppData).then((ok) => {
      setStatus(ok ? "synced" : "error");
    });
  }, [dataVersion, syncCode, currentAppData, configured]);

  // ─── Ativar código ─────────────────────────────────────────────────────────
  const handleActivate = async (code: string) => {
    const trimmed = code.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!trimmed) {
      setErrorMsg("Digite um código válido (letras e números).");
      return;
    }
    if (!configured) {
      setErrorMsg("Firebase não configurado. Veja o README.");
      return;
    }
    setErrorMsg("");
    setStatus("syncing");
    setSyncCode(trimmed);
    setSyncCodeState(trimmed);
    try {
      await onSyncActivated(trimmed);
      setStatus("synced");
      setInputCode("");
    } catch {
      setStatus("error");
      setErrorMsg("Falha ao enviar dados. Verifique as credenciais do Firebase.");
    }
  };

  // ─── Desativar sincronização ────────────────────────────────────────────────
  const handleDeactivate = () => {
    unsubscribeRef.current?.();
    unsubscribeRef.current = null;
    clearSyncCode();
    setSyncCodeState(null);
    setStatus(configured ? "no_code" : "not_configured");
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

  // ─── Helpers de UI ──────────────────────────────────────────────────────────
  const statusConfig: Record<SyncStatus, { icon: any; color: string; bg: string; label: string; dot: string }> = {
    no_code: {
      icon: CloudOff,
      color: "text-zinc-400",
      bg: "bg-zinc-100",
      label: "Compartilhar",
      dot: "bg-zinc-300",
    },
    idle: {
      icon: Cloud,
      color: "text-sky-500",
      bg: "bg-sky-50",
      label: "Conectado",
      dot: "bg-sky-400",
    },
    syncing: {
      icon: Loader2,
      color: "text-amber-500",
      bg: "bg-amber-50",
      label: "Sincronizando",
      dot: "bg-amber-400",
    },
    synced: {
      icon: CloudUpload,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      label: "Sincronizado",
      dot: "bg-emerald-400",
    },
    error: {
      icon: CloudOff,
      color: "text-rose-500",
      bg: "bg-rose-50",
      label: "Erro",
      dot: "bg-rose-400",
    },
    not_configured: {
      icon: AlertTriangle,
      color: "text-amber-600",
      bg: "bg-amber-50",
      label: "Compartilhar",
      dot: "bg-amber-400",
    },
  };

  const current = statusConfig[status];
  const StatusIcon = current.icon;

  return (
    <div className="relative" ref={panelRef}>
      {/* Botão de Status na Header */}
      <button
        id="sync-manager-toggle"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((v) => !v);
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
        }}
        title={syncCode ? `Sincronizado: ${syncCode}` : "Ativar Compartilhamento"}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all ${current.bg} border-current/20 ${current.color} hover:opacity-80`}
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${current.dot} ${status === "syncing" ? "animate-pulse" : ""}`} />
        <StatusIcon className={`w-3.5 h-3.5 shrink-0 ${status === "syncing" ? "animate-spin" : ""}`} />
        <span className="hidden sm:block">{current.label}</span>
      </button>

      {/* Painel Expandido */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 bg-white border border-zinc-200 rounded-2xl shadow-xl z-50 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {/* Header do Painel */}
            <div className="px-4 pt-4 pb-3 border-b border-zinc-100">
              <h3 className="font-black text-zinc-800 text-sm flex items-center gap-2">
                <Link className="w-4 h-4 text-emerald-500" />
                Compartilhamento
              </h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Sincronize com outra pessoa usando um código comum.
              </p>
            </div>

            <div className="p-4 space-y-4">
              {/* Aviso: Firebase não configurado */}
              {!configured && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-bold text-amber-700">Firebase não configurado</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      Adicione as credenciais do Firebase nas variáveis de ambiente{" "}
                      <code className="font-mono bg-amber-100 px-1 rounded">VITE_FIREBASE_*</code>{" "}
                      para ativar o compartilhamento em tempo real.
                    </p>
                  </div>
                </div>
              )}

              {syncCode && configured ? (
                /* Estado: Conectado */
                <>
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider mb-1">
                      Código Ativo
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xl font-black text-emerald-800 tracking-widest font-mono flex-1">
                        {syncCode}
                      </span>
                      <button
                        id="sync-copy-code-btn"
                        onClick={handleCopy}
                        className="p-1.5 rounded-lg bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-100 transition-all"
                        title="Copiar código"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-500 leading-relaxed">
                    Qualquer pessoa que digitar <strong className="text-zinc-700 font-mono">{syncCode}</strong>{" "}
                    nesta tela compartilhará os dados em <span className="text-emerald-600 font-bold">tempo real</span>.
                  </p>

                  <div className="flex items-center gap-2 text-[11px] font-semibold text-zinc-500">
                    <span className={`w-2 h-2 rounded-full ${current.dot} ${status === "syncing" ? "animate-pulse" : ""}`} />
                    {current.label}
                  </div>

                  <button
                    id="sync-deactivate-btn"
                    onClick={handleDeactivate}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-zinc-200 text-zinc-500 hover:bg-rose-50 hover:border-rose-200 hover:text-rose-600 text-xs font-bold transition-all"
                  >
                    <Link2Off className="w-3.5 h-3.5" />
                    Desconectar
                  </button>
                </>
              ) : configured ? (
                /* Estado: Desconectado, Firebase configurado */
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-wider">
                      Entrar com código
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="sync-code-input"
                        type="text"
                        value={inputCode}
                        onChange={(e) => setInputCode(e.target.value.toLowerCase())}
                        onKeyDown={(e) => e.key === "Enter" && handleActivate(inputCode)}
                        placeholder="ex: familia-santos"
                        className="flex-1 px-3 py-2 border border-zinc-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-zinc-50"
                        maxLength={32}
                      />
                      <button
                        id="sync-activate-btn"
                        onClick={() => handleActivate(inputCode)}
                        disabled={status === "syncing"}
                        className="px-3 py-2 bg-zinc-900 text-white rounded-xl text-xs font-bold hover:bg-zinc-700 transition-all disabled:opacity-50 shrink-0"
                      >
                        Entrar
                      </button>
                    </div>
                    {errorMsg && (
                      <p className="text-[11px] text-rose-500 font-semibold">{errorMsg}</p>
                    )}
                  </div>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-zinc-100" />
                    </div>
                    <div className="relative flex justify-center">
                      <span className="bg-white px-2 text-[10px] text-zinc-400 uppercase tracking-wider">ou</span>
                    </div>
                  </div>

                  <button
                    id="sync-generate-btn"
                    onClick={() => {
                      const code = gerarCodigoAleatorio();
                      setInputCode(code);
                      handleActivate(code);
                    }}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-bold transition-all"
                  >
                    <Shuffle className="w-3.5 h-3.5" />
                    Criar novo código compartilhado
                  </button>

                  <p className="text-[10px] text-zinc-400 leading-relaxed text-center">
                    Sincronização em tempo real via Firebase. Funciona no Netlify, mobile e APK.
                  </p>
                </>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
