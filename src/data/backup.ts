/**
 * Backup completo: rendas, contas fixas, faturas (com todos os lançamentos e
 * marcações), compras planejadas e configurações de portadores.
 */

import type { AppData } from "../domain/types";
import { convertLegacyBackup } from "./legacy";
import { isEmptyData, normalizeData } from "./normalize";

export const BACKUP_APP = "controle-financeiro";
export const BACKUP_VERSION = 3;

export interface BackupFile {
  app: typeof BACKUP_APP;
  version: number;
  exportedAt: string;
  data: AppData;
}

export function createBackup(data: AppData, now = new Date()): BackupFile {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: now.toISOString(), data };
}

export function backupFileName(now = new Date()): string {
  return `controle-financeiro-backup-${now.toISOString().slice(0, 10)}.json`;
}

export class BackupError extends Error {}

/** Lê um backup (formato atual ou dos formatos antigos do app). */
export function parseBackup(text: string): AppData {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new BackupError("O arquivo não é um JSON válido. Escolha o arquivo .json gerado pelo app.");
  }
  if (typeof json !== "object" || json === null) {
    throw new BackupError("O arquivo não parece ser um backup deste app.");
  }
  const raw = json as Record<string, unknown>;
  const data =
    raw.app === BACKUP_APP && typeof raw.version === "number"
      ? normalizeData(raw.data)
      : convertLegacyBackup(raw);
  if (!data || isEmptyData(data)) {
    throw new BackupError("Não encontrei dados neste arquivo. Ele é mesmo um backup do Controle Financeiro?");
  }
  return data;
}

export function downloadJson(fileName: string, content: unknown): void {
  const blob = new Blob([JSON.stringify(content, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
