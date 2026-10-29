/**
 * Persistência local (localStorage). Uma chave para os dados, uma para a fila
 * de alterações ainda não enviadas ao servidor e uma para preferências do aparelho.
 */

import { emptyData, newId, type AppData } from "../domain/types";
import { readLegacyLocalStorage } from "./legacy";
import { normalizeData } from "./normalize";
import type { Patch } from "./patch";

const STATE_KEY = "fin_v3:state";
const OUTBOX_KEY = "fin_v3:outbox";
const DEVICE_KEY = "fin_v3:device";

export interface PersistedState {
  data: AppData;
  onboarded: boolean;
  lastBackupAt?: string;
}

export interface OutboxEntry {
  id: string;
  patch: Patch;
  createdAt: number;
}

export const FONT_SCALES = [0.85, 0.925, 1, 1.1, 1.2] as const;
export type FontScale = (typeof FONT_SCALES)[number];

export interface DeviceSettings {
  deviceId: string;
  deviceName?: string;
  syncCode?: string;
  theme: "system" | "light" | "dark";
  /** Escala do texto e do layout (1 = 16px na raiz). */
  fontScale: FontScale;
  /** Salas em que este aparelho já entrou (a primeira entrada mescla dados locais). */
  joinedRooms: string[];
}

export class StorageFullError extends Error {
  constructor() {
    super("STORAGE_FULL");
  }
}

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function read<T>(key: string): T | undefined {
  try {
    const raw = storage()?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown): void {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(value));
  } catch (error) {
    if (error instanceof DOMException && (error.name === "QuotaExceededError" || error.code === 22)) {
      throw new StorageFullError();
    }
    throw error;
  }
}

export function loadState(): PersistedState {
  const saved = read<{ version: number; data: unknown; onboarded?: boolean; lastBackupAt?: string }>(STATE_KEY);
  if (saved?.version === 3) {
    return { data: normalizeData(saved.data), onboarded: saved.onboarded === true, lastBackupAt: saved.lastBackupAt };
  }
  const s = storage();
  const legacy = s ? readLegacyLocalStorage(s) : null;
  if (legacy) {
    const migrated: PersistedState = { data: legacy.data, onboarded: legacy.onboarded };
    // As chaves antigas são mantidas intactas como cópia de segurança.
    saveState(migrated);
    return migrated;
  }
  return { data: emptyData(), onboarded: false };
}

export function saveState(state: PersistedState): void {
  write(STATE_KEY, { version: 3, ...state });
}

export function loadOutbox(): OutboxEntry[] {
  return read<OutboxEntry[]>(OUTBOX_KEY) ?? [];
}

export function saveOutbox(entries: OutboxEntry[]): void {
  write(OUTBOX_KEY, entries);
}

export function loadDevice(): DeviceSettings {
  const saved = read<Partial<DeviceSettings>>(DEVICE_KEY) ?? {};
  // Migra o código de sincronização da versão anterior.
  const legacyCode = storage()?.getItem("fin_sync_code") ?? undefined;
  const device: DeviceSettings = {
    deviceId: saved.deviceId ?? newId("d"),
    deviceName: saved.deviceName,
    syncCode: saved.syncCode ?? legacyCode ?? undefined,
    theme: saved.theme ?? "dark",
    fontScale: FONT_SCALES.includes(saved.fontScale as FontScale) ? (saved.fontScale as FontScale) : 1,
    joinedRooms: saved.joinedRooms ?? [],
  };
  if (!saved.deviceId) {
    // Quem já usava um código no app antigo já tinha os dados mesclados na sala.
    if (legacyCode) device.joinedRooms = [legacyCode];
    saveDevice(device);
  }
  return device;
}

export function saveDevice(device: DeviceSettings): void {
  write(DEVICE_KEY, device);
}

/** Pede ao navegador para não apagar os dados do app (iOS limpa PWAs sem uso). */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    // Sem suporte: nada a fazer.
  }
}
