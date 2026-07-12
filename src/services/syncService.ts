/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * syncService — Sincronização Bidirecional em Tempo Real via Firebase Realtime Database
 *
 * Arquitetura:
 *  - Real-time Listeners via `onValue` do Firebase SDK (WebSocket sob o capô).
 *  - Política de resolução de conflitos: "Last Write Wins" por DOMÍNIO de dados.
 *    → Campos diferentes (ex: fixedBills vs invoices) são mesclados independentemente.
 *    → Um campo só é sobrescrito se o timestamp remoto for MAIOR que o local.
 *  - Anti-loop: cada cliente possui um `deviceId` persistido em sessionStorage.
 *    O payload enviado inclui `_writtenBy: deviceId`. O listener ignora eventos
 *    cujo `_writtenBy` seja o próprio `deviceId`.
 *
 * Estrutura no Firebase:
 *  sync_rooms/<code>/
 *    meta:
 *      _writtenBy: string       ← deviceId de quem fez o último push
 *      _updatedAt:  number      ← timestamp Unix ms do push
 *    domains:
 *      fixedBills:
 *        _updatedAt: number
 *        data: FixedBill[]
 *      incomes:
 *        _updatedAt: number
 *        data: IncomeSource[]
 *      invoices:
 *        _updatedAt: number
 *        data: CardInvoice[]
 *      plannedInstallments:
 *        _updatedAt: number
 *        data: PlannedInstallment[]
 */

import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getDatabase,
  ref,
  set,
  update,
  onValue,
  off,
  Database,
  DataSnapshot,
} from "firebase/database";

// ──────────────────────────────────────────────────────────────────────────────
// Configuração do Firebase
// ──────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "COLE_AQUI",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "COLE_AQUI",
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL       || "COLE_AQUI",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "COLE_AQUI",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "COLE_AQUI",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "COLE_AQUI",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "COLE_AQUI",
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     || undefined,
};

// ──────────────────────────────────────────────────────────────────────────────
// Device Identity — Anti-loop de eco
// Cada aba/dispositivo ganha um ID único persistido na sessão.
// ──────────────────────────────────────────────────────────────────────────────
const DEVICE_ID_KEY = "fin_sync_device_id";

function getDeviceId(): string {
  let id = sessionStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
    sessionStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

const DEVICE_ID = getDeviceId();

// ──────────────────────────────────────────────────────────────────────────────
// Firebase Lazy Init
// ──────────────────────────────────────────────────────────────────────────────
let app: FirebaseApp;
let db: Database;

function getFirebase(): { app: FirebaseApp; db: Database } {
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getDatabase(app);
  }
  return { app, db };
}

/** Verifica se o Firebase está configurado (credenciais não são placeholder). */
export function isFirebaseConfigured(): boolean {
  return (
    firebaseConfig.databaseURL !== "COLE_AQUI" &&
    firebaseConfig.databaseURL !== "" &&
    !firebaseConfig.databaseURL.includes("COLE_AQUI")
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Gerenciamento do Código de Sincronização
// ──────────────────────────────────────────────────────────────────────────────
const SYNC_CODE_KEY = "fin_sync_code";

export function getSyncCode(): string | null {
  return localStorage.getItem(SYNC_CODE_KEY);
}

export function setSyncCode(code: string): void {
  localStorage.setItem(SYNC_CODE_KEY, code);
}

export function clearSyncCode(): void {
  localStorage.removeItem(SYNC_CODE_KEY);
}

export function gerarCodigoAleatorio(): string {
  return Math.random().toString(36).substring(2, 8).toLowerCase();
}

// ──────────────────────────────────────────────────────────────────────────────
// Tipos da camada de sincronização
// ──────────────────────────────────────────────────────────────────────────────
export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "no_code" | "not_configured";

/**
 * Envelope de um domínio sincronizável.
 * Cada domínio tem seu próprio `_updatedAt` para resolução de conflitos independente.
 */
export interface SyncDomain<T> {
  _updatedAt: number;
  data: T;
}

/**
 * Payload completo enviado/recebido do Firebase.
 * A chave `meta` carrega informações de rastreamento para o anti-loop.
 */
export interface SyncPayload {
  meta: {
    _writtenBy: string;  // deviceId do autor desta escrita
    _updatedAt: number;  // timestamp desta escrita
  };
  domains: {
    fixedBills?:           SyncDomain<any[]>;
    incomes?:              SyncDomain<any[]>;
    invoices?:             SyncDomain<any[]>;
    plannedInstallments?:  SyncDomain<any[]>;
  };
}

/**
 * Resultado parcial da resolução de conflitos.
 * Apenas os domínios que precisam ser aplicados localmente são retornados.
 */
export interface MergedDomains {
  fixedBills?:           any[];
  incomes?:              any[];
  invoices?:             any[];
  plannedInstallments?:  any[];
}

// ──────────────────────────────────────────────────────────────────────────────
// Gerenciamento de timestamps locais por domínio
// Persiste o `_updatedAt` da última vez que cada domínio foi salvo localmente.
// ──────────────────────────────────────────────────────────────────────────────
const DOMAIN_TIMESTAMPS_KEY = "fin_sync_domain_timestamps";

type DomainTimestamps = Record<string, number>;

function getDomainTimestamps(): DomainTimestamps {
  try {
    const raw = localStorage.getItem(DOMAIN_TIMESTAMPS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function setDomainTimestamp(domain: string, ts: number): void {
  const timestamps = getDomainTimestamps();
  timestamps[domain] = ts;
  localStorage.setItem(DOMAIN_TIMESTAMPS_KEY, JSON.stringify(timestamps));
}

export function clearDomainTimestamps(): void {
  localStorage.removeItem(DOMAIN_TIMESTAMPS_KEY);
}

// ──────────────────────────────────────────────────────────────────────────────
// PUSH BIDIRECIONAL — Envia apenas os domínios alterados desde o último push
// ──────────────────────────────────────────────────────────────────────────────

/**
 * `pushDomainsToServer` — Envia um subconjunto de domínios alterados para o Firebase.
 *
 * Política: Cada domínio é enviado com o timestamp atual.
 * O listener remoto só aplica um domínio se o timestamp remoto for maior que o local.
 *
 * @param domains - Mapa de domínios alterados com seus dados atualizados.
 */
export async function pushDomainsToServer(
  domains: Partial<Record<keyof MergedDomains, any[]>>
): Promise<boolean> {
  const code = getSyncCode();
  if (!code || !isFirebaseConfigured()) return false;

  try {
    const { db } = getFirebase();
    const now = Date.now();

    // Monta apenas os domínios enviados com timestamp individual
    const domainsPayload: SyncPayload["domains"] = {};
    for (const [key, data] of Object.entries(domains)) {
      const domainKey = key as keyof MergedDomains;
      (domainsPayload as any)[domainKey] = {
        _updatedAt: now,
        data,
      } satisfies SyncDomain<any[]>;
      // Atualiza o timestamp local do domínio imediatamente após envio
      setDomainTimestamp(domainKey, now);
    }

    const payload: SyncPayload = {
      meta: {
        _writtenBy: DEVICE_ID,
        _updatedAt: now,
      },
      domains: domainsPayload,
    };

    const roomRef = ref(db, `sync_rooms/${code}`);
    // `update` é não-destrutivo: não apaga domínios não enviados (merge parcial)
    await update(roomRef, {
      "meta/_writtenBy": payload.meta._writtenBy,
      "meta/_updatedAt": payload.meta._updatedAt,
      ...Object.fromEntries(
        Object.entries(domainsPayload).map(([k, v]) => [`domains/${k}`, v])
      ),
    });

    return true;
  } catch (err) {
    console.error("[syncService] Falha ao enviar domínios para o Firebase:", err);
    return false;
  }
}

/**
 * `pushToServer` — Atalho legado que envia todos os domínios de uma vez.
 * Mantido para compatibilidade com o SyncManager existente.
 */
export async function pushToServer(data: {
  fixedBills: any[];
  incomes: any[];
  invoices: any[];
  plannedInstallments: any[];
}): Promise<boolean> {
  return pushDomainsToServer(data);
}

// ──────────────────────────────────────────────────────────────────────────────
// RESOLUÇÃO DE CONFLITOS — "Last Write Wins" por Domínio
// ──────────────────────────────────────────────────────────────────────────────

/**
 * `resolveConflicts` — Compara os timestamps remotos vs. locais domínio a domínio.
 *
 * Política: "Last Write Wins" por campo.
 * Resultado: Retorna apenas os domínios remotos que são mais recentes que os locais,
 * portanto que precisam ser aplicados ao estado local.
 */
function resolveConflicts(
  remoteDomains: SyncPayload["domains"]
): MergedDomains {
  const localTimestamps = getDomainTimestamps();
  const merged: MergedDomains = {};
  const domainKeys: Array<keyof MergedDomains> = [
    "fixedBills",
    "incomes",
    "invoices",
    "plannedInstallments",
  ];

  for (const key of domainKeys) {
    const remote = remoteDomains[key] as SyncDomain<any[]> | undefined;
    if (!remote) continue;

    const localTs = localTimestamps[key] ?? 0;

    if (remote._updatedAt > localTs) {
      // Dado remoto mais recente — aplica e atualiza timestamp local
      (merged as any)[key] = remote.data;
      setDomainTimestamp(key, remote._updatedAt);
      console.info(
        `[syncService] Domínio "${key}" atualizado remotamente ` +
        `(remoto: ${remote._updatedAt} > local: ${localTs})`
      );
    } else {
      console.info(
        `[syncService] Domínio "${key}" ignorado — dado local mais recente ` +
        `(local: ${localTs} >= remoto: ${remote._updatedAt})`
      );
    }
  }

  return merged;
}

// ──────────────────────────────────────────────────────────────────────────────
// LISTENER BIDIRECIONAL em Tempo Real
// ──────────────────────────────────────────────────────────────────────────────

/**
 * `subscribeToRemoteChanges` — Inscreve-se em atualizações em tempo real do Firebase.
 *
 * Anti-loop garantido por 3 camadas:
 *  1. `_writtenBy`: ignora eventos escritos pelo próprio dispositivo.
 *  2. `isFirstCall`: ignora o primeiro snapshot (dados do Firebase ao conectar).
 *  3. Resolução de conflitos por timestamp: só aplica domínios mais recentes que o local.
 *
 * Retorna um `unsubscribe()` para cancelar o listener.
 */
export function subscribeToRemoteChanges(
  onDataReceived: (merged: MergedDomains) => void,
  onError?: (err: Error) => void
): () => void {
  const code = getSyncCode();
  if (!code || !isFirebaseConfigured()) return () => {};

  try {
    const { db } = getFirebase();
    const roomRef = ref(db, `sync_rooms/${code}`);

    let isFirstCall = true;

    const handleSnapshot = (snapshot: DataSnapshot) => {
      const remoteRoom = snapshot.val() as SyncPayload | null;

      // Ignora snapshot vazio
      if (!remoteRoom?.meta || !remoteRoom?.domains) return;

      // ─── Camada 1: Anti-loop por deviceId ───────────────────────────────
      // Ignora qualquer evento cujo autor seja o próprio dispositivo.
      if (remoteRoom.meta._writtenBy === DEVICE_ID) {
        return;
      }

      // ─── Camada 2: Ignora o primeiro snapshot (estado inicial do Firebase) ──
      if (isFirstCall) {
        isFirstCall = false;
        return;
      }

      // ─── Camada 3: Resolução de conflitos "Last Write Wins" por domínio ──
      const merged = resolveConflicts(remoteRoom.domains);

      // Só dispara callback se houver ao menos 1 domínio a ser aplicado
      if (Object.keys(merged).length > 0) {
        onDataReceived(merged);
      }
    };

    onValue(roomRef, handleSnapshot, (error) => {
      console.error("[syncService] Erro no listener do Firebase:", error);
      onError?.(error);
    });

    return () => off(roomRef, "value", handleSnapshot);
  } catch (err) {
    console.error("[syncService] Falha ao inscrever no Firebase:", err);
    return () => {};
  }
}
