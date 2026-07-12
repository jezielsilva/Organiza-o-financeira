/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * SyncManager — Controlador Headless de Sincronização
 *
 * Não renderiza nenhuma UI. Apenas gerencia os efeitos colaterais:
 *  1. Inscreve-se no Firebase para receber atualizações em tempo real.
 *  2. Envia push automático quando os dados do app mudam (dataVersion).
 *
 * Todo o estado de sincronização (syncCode, status) é controlado pelo App.tsx.
 */

import { useEffect, useRef } from "react";
import {
  pushDomainsToServer,
  subscribeToRemoteChanges,
  isFirebaseConfigured,
  SyncStatus,
  MergedDomains,
} from "../services/syncService";

interface SyncManagerProps {
  /** Código de sincronização ativo (null = desconectado). */
  syncCode: string | null;
  /** Chamado ao receber dados atualizados do servidor (payload esparso). */
  onRemoteDataReceived: (merged: MergedDomains) => void;
  /** Chamado para atualizar o status de sincronização no App. */
  onStatusChange: (status: SyncStatus) => void;
  /** Snapshot atual dos dados do app para enviar ao servidor. */
  currentAppData: object;
  /** Incrementado a cada mudança de dados — dispara o auto-push. */
  dataVersion: number;
}

export default function SyncManager({
  syncCode,
  onRemoteDataReceived,
  onStatusChange,
  currentAppData,
  dataVersion,
}: SyncManagerProps) {
  const configured = isFirebaseConfigured();
  const unsubscribeRef = useRef<(() => void) | null>(null);

  // ─── Listener em Tempo Real ───────────────────────────────────────────────
  useEffect(() => {
    if (!syncCode || !configured) return;

    // Cancela subscription anterior antes de criar nova (ex: troca de código)
    unsubscribeRef.current?.();

    const unsub = subscribeToRemoteChanges(
      (merged) => {
        onRemoteDataReceived(merged);
        onStatusChange("synced");
      },
      () => onStatusChange("error")
    );

    unsubscribeRef.current = unsub;
    return () => {
      unsub();
      unsubscribeRef.current = null;
    };
  }, [syncCode, configured, onRemoteDataReceived, onStatusChange]);

  // ─── Auto-Push quando os dados mudam ─────────────────────────────────────
  const prevVersionRef = useRef(dataVersion);
  useEffect(() => {
    if (!syncCode || !configured) return;
    if (prevVersionRef.current === dataVersion) return;
    prevVersionRef.current = dataVersion;

    onStatusChange("syncing");
    pushDomainsToServer(currentAppData as any).then((ok) => {
      onStatusChange(ok ? "synced" : "error");
    });
  }, [dataVersion, syncCode, configured, currentAppData, onStatusChange]);

  // Componente headless — não renderiza nada
  return null;
}
