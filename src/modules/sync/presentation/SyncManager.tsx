/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo: sync
 * Camada: presentation (Headless Sync Manager Component)
 */

import { useEffect, useRef } from "react";
import {
  pushDomainsToServer,
  subscribeToRemoteChanges,
  isFirebaseConfigured,
  SyncStatus,
  MergedDomains,
} from "../../../services/syncService";

interface SyncManagerProps {
  syncCode: string | null;
  onRemoteDataReceived: (merged: MergedDomains) => void;
  onStatusChange: (status: SyncStatus) => void;
  currentAppData: object;
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

  useEffect(() => {
    if (!syncCode || !configured) return;

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

  return null;
}
