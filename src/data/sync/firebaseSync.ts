/**
 * Sincronização em tempo real via Firebase Realtime Database.
 *
 * Por que a versão anterior falhava: o app salvava rendas/contas em uma chave
 * do localStorage e enviava ao servidor a partir de outra (desatualizada), e
 * cada envio sobrescrevia a LISTA INTEIRA do domínio. Edições se perdiam.
 *
 * Como funciona agora:
 *  - Cada item vive no seu próprio caminho: `sync_rooms/<código>/v3/bills/<id>`.
 *  - Cada alteração é um patch de caminhos enviado com `update()`: só os itens
 *    alterados são gravados; o que a outra pessoa editou fica intacto.
 *  - O servidor é a fonte da verdade. A tela mostra o snapshot do Firebase, que
 *    já inclui as gravações ainda pendentes (compensação de latência do SDK).
 *  - Alterações feitas sem internet ficam numa fila persistida (outbox) e são
 *    reenviadas quando a conexão volta, mesmo que o app tenha sido fechado.
 *  - Só enviamos a fila depois de receber o primeiro snapshot do servidor, para
 *    nunca exibir uma árvore parcial.
 */

import type { FirebaseApp } from "firebase/app";
import type { Database, DatabaseReference, Unsubscribe } from "firebase/database";
import { COLLECTIONS, type AppData } from "../../domain/types";
import { convertLegacyRoom } from "../legacy";
import { isEmptyData, normalizeData } from "../normalize";
import { sanitize, type Patch } from "../patch";
import { loadOutbox, saveOutbox, type OutboxEntry } from "../persistence";
import { firebaseConfig, isFirebaseConfigured } from "./firebaseConfig";

export type SyncPhase = "off" | "unconfigured" | "connecting" | "online" | "offline" | "error";

export interface SyncStatus {
  phase: SyncPhase;
  code?: string;
  pending: number;
  lastSyncedAt?: number;
  error?: string;
}

export interface RemoteInfo {
  initial: boolean;
  fromSelf: boolean;
  byName?: string;
}

export interface SyncCallbacks {
  onRemoteData(data: AppData, info: RemoteInfo): void;
  onStatus(status: SyncStatus): void;
}

export interface SyncIdentity {
  deviceId: string;
  deviceName?: string;
}

type DatabaseModule = typeof import("firebase/database");

let dbPromise: Promise<{ db: Database; mod: DatabaseModule }> | null = null;

function loadDatabase() {
  dbPromise ??= (async () => {
    const [{ initializeApp, getApps }, mod] = await Promise.all([import("firebase/app"), import("firebase/database")]);
    const app: FirebaseApp = getApps()[0] ?? initializeApp(firebaseConfig);
    return { db: mod.getDatabase(app), mod };
  })();
  return dbPromise;
}

export function normalizeSyncCode(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
}

export function generateSyncCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/permission/i.test(message)) {
    return "O Firebase recusou o acesso (permission denied). Confira as regras do Realtime Database.";
  }
  return message;
}

/** Une dois conjuntos de dados por id. Em conflito, `primary` vence. */
export function unionData(primary: AppData, secondary: AppData): AppData {
  return {
    incomes: { ...secondary.incomes, ...primary.incomes },
    bills: { ...secondary.bills, ...primary.bills },
    invoices: { ...secondary.invoices, ...primary.invoices },
    plans: { ...secondary.plans, ...primary.plans },
    goals: { ...secondary.goals, ...primary.goals },
    settings: {
      holderRules: { ...secondary.settings.holderRules, ...primary.settings.holderRules },
      categoryBudgets: { ...secondary.settings.categoryBudgets, ...primary.settings.categoryBudgets },
    },
  };
}

/** Patch que adiciona ao servidor o que só existe localmente (sem tocar no que já existe lá). */
export function missingOnServerPatch(server: AppData, local: AppData): Patch {
  const patch: Patch = {};
  for (const collection of COLLECTIONS) {
    for (const [id, item] of Object.entries(local[collection])) {
      if (!(id in server[collection])) patch[`${collection}/${id}`] = item;
    }
  }
  for (const [name, counted] of Object.entries(local.settings.holderRules)) {
    if (!(name in server.settings.holderRules)) patch[`settings/holderRules/${name}`] = counted;
  }
  for (const [category, cents] of Object.entries(local.settings.categoryBudgets)) {
    if (!(category in server.settings.categoryBudgets)) patch[`settings/categoryBudgets/${category}`] = cents;
  }
  return patch;
}

export class FirebaseSync {
  private status: SyncStatus = { phase: "off", pending: 0 };
  private outbox: OutboxEntry[] = loadOutbox();
  private ready = false;
  private flushing = false;
  private unsubscribers: Unsubscribe[] = [];
  private roomRef: DatabaseReference | null = null;
  private mod: DatabaseModule | null = null;
  private session = 0;

  constructor(
    private identity: SyncIdentity,
    private callbacks: SyncCallbacks,
  ) {
    this.status.pending = this.outbox.length;
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  setIdentity(identity: SyncIdentity): void {
    this.identity = identity;
  }

  private setStatus(next: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...next, pending: this.outbox.length };
    this.callbacks.onStatus(this.status);
  }

  /**
   * Conecta a uma sala. `firstJoin` = primeira vez deste aparelho nesta sala:
   * os dados locais são somados aos da sala (nada é apagado de nenhum lado).
   */
  async start(code: string, localData: AppData, firstJoin: boolean): Promise<void> {
    this.stop();
    if (!isFirebaseConfigured()) {
      this.setStatus({ phase: "unconfigured", code });
      return;
    }
    const session = ++this.session;
    this.setStatus({ phase: "connecting", code, error: undefined });

    let db: Database;
    try {
      ({ db, mod: this.mod } = await loadDatabase());
    } catch (error) {
      this.setStatus({ phase: "error", error: describeError(error) });
      return;
    }
    if (session !== this.session) return;
    const { ref, onValue, get, child, update } = this.mod!;
    const roomRef = ref(db, `sync_rooms/${code}/v3`);
    this.roomRef = roomRef;

    this.unsubscribers.push(
      onValue(ref(db, ".info/connected"), (snap) => {
        if (session !== this.session) return;
        if (snap.val() === true) {
          this.setStatus({ phase: this.ready ? "online" : "connecting", error: undefined });
          void this.flush();
        } else if (this.ready) {
          this.setStatus({ phase: "offline" });
        }
      }),
    );

    let initial = true;
    this.unsubscribers.push(
      onValue(
        roomRef,
        async (snap) => {
          if (session !== this.session) return;
          const raw = snap.val() as Record<string, unknown> | null;

          if (initial) {
            initial = false;
            let server = normalizeData(raw);
            const patch: Patch = {};
            if (isEmptyData(server)) {
              // Sala nova no formato v3: traz os dados do formato antigo, se houver.
              const legacy = await get(child(ref(db, `sync_rooms/${code}`), "domains"))
                .then((s) => (s.exists() ? convertLegacyRoom({ domains: s.val() }) : null))
                .catch(() => null);
              if (legacy && !isEmptyData(legacy)) {
                Object.assign(patch, missingOnServerPatch(server, legacy));
                server = unionData(server, legacy);
              }
            }
            if (firstJoin) {
              Object.assign(patch, missingOnServerPatch(server, localData));
              server = unionData(server, localData);
            }
            if (Object.keys(patch).length > 0) {
              await update(roomRef, { ...sanitize(patch), "meta/lastWrite": this.writeStamp() }).catch((error) =>
                this.setStatus({ phase: "error", error: describeError(error) }),
              );
            }
            if (session !== this.session) return;
            this.ready = true;
            this.callbacks.onRemoteData(server, { initial: true, fromSelf: true });
            this.setStatus({ phase: "online", lastSyncedAt: Date.now() });
            void this.flush();
            return;
          }

          const lastWrite = (raw?.meta as { lastWrite?: { by?: string; name?: string } } | undefined)?.lastWrite;
          this.callbacks.onRemoteData(normalizeData(raw), {
            initial: false,
            fromSelf: !lastWrite || lastWrite.by === this.identity.deviceId,
            byName: lastWrite?.name,
          });
        },
        (error) => {
          if (session !== this.session) return;
          this.setStatus({ phase: "error", error: describeError(error) });
        },
      ),
    );
  }

  stop(): void {
    this.session++;
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.ready = false;
    this.roomRef = null;
    if (this.status.phase !== "off") this.setStatus({ phase: "off", code: undefined, error: undefined });
  }

  /** Enfileira um patch e envia assim que possível. */
  send(patch: Patch): void {
    this.outbox.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, patch, createdAt: Date.now() });
    this.persistOutbox();
    this.setStatus({});
    void this.flush();
  }

  /** Descarta alterações pendentes (ex.: ao sair da sala). */
  clearOutbox(): void {
    this.outbox = [];
    this.persistOutbox();
    this.setStatus({});
  }

  private persistOutbox(): void {
    try {
      saveOutbox(this.outbox);
    } catch {
      // Sem espaço: a fila continua em memória enquanto o app estiver aberto.
    }
  }

  private writeStamp() {
    return {
      by: this.identity.deviceId,
      name: this.identity.deviceName ?? null,
      at: this.mod!.serverTimestamp(),
    };
  }

  private async flush(): Promise<void> {
    if (!this.ready || this.flushing || !this.roomRef || !this.mod) return;
    this.flushing = true;
    const { update } = this.mod;
    const session = this.session;
    try {
      while (this.outbox.length > 0 && session === this.session) {
        const entry = this.outbox[0];
        await update(this.roomRef!, { ...sanitize(entry.patch), "meta/lastWrite": this.writeStamp() });
        this.outbox.shift();
        this.persistOutbox();
        this.setStatus({ lastSyncedAt: Date.now() });
      }
    } catch (error) {
      this.setStatus({ phase: "error", error: describeError(error) });
    } finally {
      this.flushing = false;
    }
  }
}
