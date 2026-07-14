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
import { safeGetItem, safeSetItem } from "./storageService";

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

export interface SyncDomain<T> {
  _updatedAt: number;
  data: T;
}

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

export interface MergedDomains {
  fixedBills?:           any[];
  incomes?:              any[];
  invoices?:             any[];
  plannedInstallments?:  any[];
}

// ──────────────────────────────────────────────────────────────────────────────
// PUSH BIDIRECIONAL — Envia apenas os domínios alterados desde o último push
// ──────────────────────────────────────────────────────────────────────────────

/**
 * `pushDomainsToServer` — Envia o estado atual com tombstones e timestamps para o Firebase.
 */
export async function pushDomainsToServer(
  domains: Partial<Record<keyof MergedDomains, any[]>>
): Promise<boolean> {
  const code = getSyncCode();
  if (!code || !isFirebaseConfigured()) return false;

  try {
    const { db } = getFirebase();
    const now = Date.now();

    const storageKeys = {
      fixedBills: "fin_fixed_bills",
      incomes: "fin_incomes",
      invoices: "fin_invoices",
      plannedInstallments: "fin_planned",
    };

    const domainsPayload: SyncPayload["domains"] = {};
    for (const key of Object.keys(domains)) {
      const domainKey = key as keyof MergedDomains;
      const sKey = storageKeys[domainKey];
      // Carrega a lista crua (com tombstones e timestamps individuais) do LocalStorage
      const rawList = safeGetItem<any[]>(sKey, []);

      domainsPayload[domainKey] = {
        _updatedAt: now,
        data: rawList,
      };
    }

    const payload: SyncPayload = {
      meta: {
        _writtenBy: DEVICE_ID,
        _updatedAt: now,
      },
      domains: domainsPayload,
    };

    const roomRef = ref(db, `sync_rooms/${code}`);
    // `update` é não-destrutivo: não apaga domínios não enviados (merge parcial no nível raiz do DB)
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
// RESOLUÇÃO DE CONFLITOS — Mesclagem Fina por Item (Fine-Grained Merge)
// ──────────────────────────────────────────────────────────────────────────────

function mergeRemoteWithLocal(localItems: any[], remoteItems: any[]): { mergedList: any[]; localHasNewer: boolean } {
  const localMap = new Map<string, any>();
  for (const item of localItems) {
    localMap.set(item.id, item);
  }

  const remoteMap = new Map<string, any>();
  for (const item of remoteItems) {
    remoteMap.set(item.id, item);
  }

  const allIds = new Set([...localMap.keys(), ...remoteMap.keys()]);
  const mergedList: any[] = [];
  let localHasNewer = false;

  for (const id of allIds) {
    const localItem = localMap.get(id);
    const remoteItem = remoteMap.get(id);

    if (localItem && remoteItem) {
      const localTs = localItem.updatedAt || 0;
      const remoteTs = remoteItem.updatedAt || 0;

      if (remoteTs > localTs) {
        mergedList.push(remoteItem);
      } else {
        mergedList.push(localItem);
        if (localTs > remoteTs) {
          localHasNewer = true;
        }
      }
    } else if (remoteItem) {
      mergedList.push(remoteItem);
    } else if (localItem) {
      mergedList.push(localItem);
      localHasNewer = true;
    }
  }

  return { mergedList, localHasNewer };
}

/**
 * `resolveConflicts` — Mescla item por item utilizando timestamps individuais.
 * Retorna os domínios que tiveram atualizações efetivas para o React.
 */
function resolveConflicts(
  remoteDomains: SyncPayload["domains"]
): { merged: MergedDomains; needsPushBack: Partial<Record<keyof MergedDomains, boolean>> } {
  const merged: MergedDomains = {};
  const needsPushBack: Partial<Record<keyof MergedDomains, boolean>> = {};

  const domainKeys: Array<keyof MergedDomains> = [
    "fixedBills",
    "incomes",
    "invoices",
    "plannedInstallments",
  ];

  const storageKeys = {
    fixedBills: "fin_fixed_bills",
    incomes: "fin_incomes",
    invoices: "fin_invoices",
    plannedInstallments: "fin_planned",
  };

  for (const key of domainKeys) {
    const remoteDomain = remoteDomains[key];
    if (!remoteDomain || !remoteDomain.data) continue;

    const sKey = storageKeys[key];
    const localRaw = safeGetItem<any[]>(sKey, []);
    const remoteRaw = remoteDomain.data;

    // Executa a mesclagem fina item por item
    const { mergedList, localHasNewer } = mergeRemoteWithLocal(localRaw, remoteRaw);

    // Se temos dados locais mais novos, sinalizamos que precisamos sincronizar de volta com o Firebase
    if (localHasNewer) {
      needsPushBack[key] = true;
    }

    // Persiste a lista completa (com tombstones/deleted: true) localmente no LocalStorage
    safeSetItem(sKey, mergedList);

    // Atualiza a chave unificada "fin_v2:transacoes_fixas" se for fixedBills ou incomes
    if (key === "fixedBills" || key === "incomes") {
      const v2Key = "fin_v2:transacoes_fixas";
      const v2Data = safeGetItem<{ rendas: any[]; contasFixas: any[] }>(v2Key, { rendas: [], contasFixas: [] });
      if (key === "fixedBills") {
        safeSetItem(v2Key, { ...v2Data, contasFixas: mergedList });
      } else {
        safeSetItem(v2Key, { ...v2Data, rendas: mergedList });
      }
    }

    // Filtra apenas os registros ativos (não deletados) para o estado do React
    const activeLocal = localRaw.filter((item: any) => !item.deleted);
    const activeMerged = mergedList.filter((item: any) => !item.deleted);

    // Dispara a atualização do React apenas se a lista ativa resultante for diferente da anterior
    const isDiff = JSON.stringify(activeLocal) !== JSON.stringify(activeMerged);
    if (isDiff) {
      (merged as any)[key] = activeMerged;
      console.info(`[syncService] Domínio "${key}" atualizado via mesclagem por item.`);
    }
  }

  return { merged, needsPushBack };
}

// ──────────────────────────────────────────────────────────────────────────────
// LISTENER BIDIRECIONAL em Tempo Real
// ──────────────────────────────────────────────────────────────────────────────

/**
 * `subscribeToRemoteChanges` — Inscreve-se em atualizações em tempo real do Firebase.
 * O primeiro snapshot recebido ao conectar é processado para sincronizar o estado inicial imediatamente.
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

    const handleSnapshot = (snapshot: DataSnapshot) => {
      const remoteRoom = snapshot.val() as SyncPayload | null;

      // Ignora snapshot vazio
      if (!remoteRoom?.meta || !remoteRoom?.domains) return;

      // Ignora alterações cujo autor seja este próprio dispositivo
      if (remoteRoom.meta._writtenBy === DEVICE_ID) {
        return;
      }

      // Processa a mesclagem e verifica se o estado local possui dados mais recentes
      const { merged, needsPushBack } = resolveConflicts(remoteRoom.domains);

      // Se houver domínios com dados locais mais novos, força um push back para o Firebase
      if (Object.keys(needsPushBack).length > 0) {
        console.info("[syncService] Dados locais mais novos detectados no carregamento. Atualizando servidor...");
        const pushPayload: any = {};
        for (const k of Object.keys(needsPushBack)) {
          pushPayload[k] = []; // O pushDomainsToServer irá ignorar o dado do argumento e ler a lista crua com tombstones do LocalStorage
        }
        pushDomainsToServer(pushPayload);
      }

      // Dispara o callback para o React se houver mudanças nas listas ativas
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

const DOMAIN_TIMESTAMPS_KEY = "fin_sync_domain_timestamps";

export function clearDomainTimestamps(): void {
  localStorage.removeItem(DOMAIN_TIMESTAMPS_KEY);
}


