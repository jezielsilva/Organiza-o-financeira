/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo: sync
 * Camada: application
 * Hook: useSyncEngine
 */

import { useState, useCallback, useRef } from "react";
import { getSyncCode, isFirebaseConfigured, pushDomainsToServer, SyncStatus } from "../../../services/syncService";

export function useSyncEngine(currentAppData: {
  fixedBills: any[];
  incomes: any[];
  invoices: any[];
  plannedInstallments: any[];
}) {
  const [syncCode, setSyncCodeState] = useState<string | null>(getSyncCode);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => {
    if (!isFirebaseConfigured()) return "not_configured";
    return getSyncCode() ? "synced" : "no_code";
  });

  const incomingDomains = useRef<Set<string>>(new Set());

  const handleSyncActivated = useCallback(async (_code: string) => {
    await pushDomainsToServer(currentAppData);
  }, [currentAppData]);

  return {
    syncCode,
    setSyncCodeState,
    syncStatus,
    setSyncStatus,
    incomingDomains,
    handleSyncActivated,
  };
}
