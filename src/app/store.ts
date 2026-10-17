/**
 * Estado central do app. Toda alteração passa por `commit(patch)`, que:
 *  1. aplica o patch no estado local (a tela atualiza na hora);
 *  2. salva no localStorage;
 *  3. envia o mesmo patch ao Firebase, se o compartilhamento estiver ativo.
 * `commit` devolve o patch inverso, usado pelo botão "Desfazer".
 */

import { useSyncExternalStore } from "react";
import type { AppData } from "../domain/types";
import { applyPatch, inversePatch, type Patch } from "../data/patch";
import {
  loadDevice,
  loadState,
  saveDevice,
  saveState,
  StorageFullError,
  type DeviceSettings,
  type PersistedState,
} from "../data/persistence";
import { FirebaseSync, type RemoteInfo, type SyncStatus } from "../data/sync/firebaseSync";

export interface AppState extends PersistedState {
  device: DeviceSettings;
  sync: SyncStatus;
  storageFull: boolean;
}

type Listener = () => void;
type RemoteListener = (info: RemoteInfo) => void;

class Store {
  private state: AppState;
  private listeners = new Set<Listener>();
  private remoteListeners = new Set<RemoteListener>();
  private sync: FirebaseSync;

  constructor() {
    const persisted = loadState();
    const device = loadDevice();
    this.sync = new FirebaseSync(device, {
      onRemoteData: (data, info) => this.receiveRemote(data, info),
      onStatus: (sync) => this.set({ sync }),
    });
    this.state = { ...persisted, device, sync: this.sync.getStatus(), storageFull: false };
  }

  getState = (): AppState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  onRemoteChange(listener: RemoteListener): () => void {
    this.remoteListeners.add(listener);
    return () => this.remoteListeners.delete(listener);
  }

  private set(partial: Partial<AppState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener();
  }

  private persist(): void {
    try {
      saveState({ data: this.state.data, onboarded: this.state.onboarded, lastBackupAt: this.state.lastBackupAt });
      if (this.state.storageFull) this.set({ storageFull: false });
    } catch (error) {
      if (error instanceof StorageFullError) this.set({ storageFull: true });
      else console.error("[store] Falha ao salvar:", error);
    }
  }

  private persistDevice(): void {
    try {
      saveDevice(this.state.device);
    } catch (error) {
      console.error("[store] Falha ao salvar preferências:", error);
    }
  }

  /** Inicia a sincronização se houver um código salvo. */
  start(): void {
    const { syncCode, joinedRooms } = this.state.device;
    if (syncCode) void this.sync.start(syncCode, this.state.data, !joinedRooms.includes(syncCode));
  }

  commit(patch: Patch): Patch {
    if (Object.keys(patch).length === 0) return {};
    const undo = inversePatch(this.state.data, patch);
    this.set({ data: applyPatch(this.state.data, patch) });
    this.persist();
    if (this.state.device.syncCode) this.sync.send(patch);
    return undo;
  }

  /** Substitui todos os dados (importação de backup). */
  replaceAll(data: AppData): Patch {
    return this.commit({
      incomes: data.incomes,
      bills: data.bills,
      invoices: data.invoices,
      plans: data.plans,
      goals: data.goals,
      settings: data.settings,
    });
  }

  private receiveRemote(data: AppData, info: RemoteInfo): void {
    this.set({ data, onboarded: this.state.onboarded || info.initial });
    this.persist();
    if (info.initial && this.state.device.syncCode) {
      const code = this.state.device.syncCode;
      if (!this.state.device.joinedRooms.includes(code)) {
        this.updateDevice({ joinedRooms: [...this.state.device.joinedRooms, code] });
      }
    }
    for (const listener of this.remoteListeners) listener(info);
  }

  completeOnboarding(): void {
    this.set({ onboarded: true });
    this.persist();
  }

  markBackupDone(): void {
    this.set({ lastBackupAt: new Date().toISOString() });
    this.persist();
  }

  updateDevice(partial: Partial<DeviceSettings>): void {
    this.set({ device: { ...this.state.device, ...partial } });
    this.persistDevice();
    this.sync.setIdentity(this.state.device);
  }

  joinRoom(code: string): void {
    this.updateDevice({ syncCode: code });
    void this.sync.start(code, this.state.data, !this.state.device.joinedRooms.includes(code));
  }

  leaveRoom(): void {
    this.sync.stop();
    this.sync.clearOutbox();
    this.updateDevice({ syncCode: undefined });
  }

  retrySync(): void {
    this.start();
  }
}

export const store = new Store();

export function useAppState<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}
