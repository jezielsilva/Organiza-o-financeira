/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FixedBill, IncomeSource, CardInvoice, PlannedInstallment } from "../types";

// Chaves utilizadas para a persistência local
const KEYS = {
  FIXED_BILLS: "fin_fixed_bills",
  INCOMES: "fin_incomes",
  INVOICES: "fin_invoices",
  PLANNED: "fin_planned",
};

/**
 * Função utilitária para salvar dados de forma segura no LocalStorage.
 * Detecta e trata o erro de cota excedida (QuotaExceededError).
 */
export function safeSetItem(key: string, data: any): void {
  try {
    const serialized = JSON.stringify(data);
    localStorage.setItem(key, serialized);
  } catch (error: any) {
    // Detecta se o LocalStorage está cheio (QuotaExceededError)
    const isQuotaExceeded =
      error instanceof DOMException &&
      (error.code === 22 ||
        error.code === 1014 ||
        error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED");

    if (isQuotaExceeded) {
      throw new Error("STORAGE_FULL");
    }
    throw error;
  }
}

/**
 * Recupera um item do LocalStorage de forma segura.
 */
export function safeGetItem<T>(key: string, defaultValue: T): T {
  try {
    const data = localStorage.getItem(key);
    return data ? JSON.parse(data) : defaultValue;
  } catch (error) {
    console.error(`Erro ao ler chave ${key} do LocalStorage:`, error);
    return defaultValue;
  }
}

// ==========================================
// CRUD: Contas Fixas (Fixed Bills)
// ==========================================
export const fixedBillsStorage = {
  getAll: (initial: FixedBill[] = []): FixedBill[] => {
    return safeGetItem<FixedBill[]>(KEYS.FIXED_BILLS, initial);
  },
  saveAll: (bills: FixedBill[]): void => {
    safeSetItem(KEYS.FIXED_BILLS, bills);
  },
};

// ==========================================
// CRUD: Receitas (Incomes)
// ==========================================
export const incomesStorage = {
  getAll: (initial: IncomeSource[] = []): IncomeSource[] => {
    return safeGetItem<IncomeSource[]>(KEYS.INCOMES, initial);
  },
  saveAll: (incomes: IncomeSource[]): void => {
    safeSetItem(KEYS.INCOMES, incomes);
  },
};

// ==========================================
// CRUD: Faturas do Cartão (Card Invoices)
// ==========================================
export const invoicesStorage = {
  getAll: (initial: CardInvoice[] = []): CardInvoice[] => {
    return safeGetItem<CardInvoice[]>(KEYS.INVOICES, initial);
  },
  saveAll: (invoices: CardInvoice[]): void => {
    safeSetItem(KEYS.INVOICES, invoices);
  },
};

// ==========================================
// CRUD: Parcelas Simuladas (Planned Installments)
// ==========================================
export const plannedInstallmentsStorage = {
  getAll: (initial: PlannedInstallment[] = []): PlannedInstallment[] => {
    return safeGetItem<PlannedInstallment[]>(KEYS.PLANNED, initial);
  },
  saveAll: (planned: PlannedInstallment[]): void => {
    safeSetItem(KEYS.PLANNED, planned);
  },
};

// ════════════════════════════════════════════════════════════════════════════
// PERSISTÊNCIA DEFINITIVA — Schema Estruturado em 3 Domínios
//
// Chaves:
//   fin_v2:configuracoes_usuario  →  ConfiguracoesUsuario
//   fin_v2:transacoes_fixas       →  { rendas, contasFixas }
//   fin_v2:meses_calculados       →  MesCalculadoSalvo[]
//
// O prefixo "fin_v2:" isola o schema definitivo das chaves legadas (fin_*)
// e permite migrações futuras sem quebrar dados antigos.
// ════════════════════════════════════════════════════════════════════════════

import type {
  ConfiguracoesUsuario,
  MesCalculadoSalvo,
  AppStorageSchema,
} from "../types";

const SCHEMA_KEYS = {
  CONFIGURACOES: "fin_v2:configuracoes_usuario",
  TRANSACOES_FIXAS: "fin_v2:transacoes_fixas",
  MESES_CALCULADOS: "fin_v2:meses_calculados",
} as const;

/** Versão atual do schema — incrementar em caso de migração */
const SCHEMA_VERSION = 1;

// ──────────────────────────────────────────────────────────────────────────────
// configuracoes_usuario
// ──────────────────────────────────────────────────────────────────────────────
export const configuracoesStorage = {
  /**
   * Salva as configurações do usuário (metadados do onboarding).
   */
  save: (mesOnboarding: string): void => {
    const config: ConfiguracoesUsuario = {
      schemaVersion: SCHEMA_VERSION,
      mesOnboarding,
      concluidoEm: new Date().toISOString(),
      onboardingCompleto: true,
    };
    safeSetItem(SCHEMA_KEYS.CONFIGURACOES, config);
  },

  /**
   * Carrega as configurações do usuário.
   * Retorna `null` se nenhuma configuração foi salva (primeiro acesso).
   */
  load: (): ConfiguracoesUsuario | null => {
    return safeGetItem<ConfiguracoesUsuario | null>(SCHEMA_KEYS.CONFIGURACOES, null);
  },

  /**
   * Verifica se o onboarding já foi concluído.
   */
  isOnboardingCompleto: (): boolean => {
    const config = safeGetItem<ConfiguracoesUsuario | null>(
      SCHEMA_KEYS.CONFIGURACOES,
      null
    );
    return config?.onboardingCompleto === true;
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// transacoes_fixas
// ──────────────────────────────────────────────────────────────────────────────
export const transacoesFixasStorage = {
  /**
   * Salva rendas e contas fixas como domínio único.
   */
  save: (rendas: IncomeSource[], contasFixas: FixedBill[]): void => {
    safeSetItem(SCHEMA_KEYS.TRANSACOES_FIXAS, { rendas, contasFixas });
  },

  /**
   * Carrega rendas e contas fixas.
   * Retorna arrays vazios se não houver dados salvos.
   */
  load: (): { rendas: IncomeSource[]; contasFixas: FixedBill[] } => {
    return safeGetItem(SCHEMA_KEYS.TRANSACOES_FIXAS, {
      rendas: [],
      contasFixas: [],
    });
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// meses_calculados
// ──────────────────────────────────────────────────────────────────────────────
export const mesesCalculadosStorage = {
  /**
   * Salva o array de 12 meses projetados pelo Motor de Cálculo.
   */
  save: (meses: MesCalculadoSalvo[]): void => {
    safeSetItem(SCHEMA_KEYS.MESES_CALCULADOS, meses);
  },

  /**
   * Carrega os meses calculados.
   * Retorna array vazio se ainda não foram gerados.
   */
  load: (): MesCalculadoSalvo[] => {
    return safeGetItem<MesCalculadoSalvo[]>(SCHEMA_KEYS.MESES_CALCULADOS, []);
  },

  /**
   * Atualiza a fatura de cartão de um mês específico e
   * recalcula o saldoMensal e saldoAcumulado de todos os meses seguintes.
   */
  atualizarFatura: (mes: string, novaFatura: number): void => {
    const meses = safeGetItem<MesCalculadoSalvo[]>(
      SCHEMA_KEYS.MESES_CALCULADOS,
      []
    );
    if (meses.length === 0) return;

    let acumulado = 0;
    const atualizados: MesCalculadoSalvo[] = meses.map((m) => {
      const fatura = m.mes === mes ? Number(Math.max(0, novaFatura).toFixed(2)) : m.faturaCartao;
      const saldoMensal = Number((m.totalRendas - m.totalContasFixas - fatura).toFixed(2));
      acumulado = Number((acumulado + saldoMensal).toFixed(2));
      return { ...m, faturaCartao: fatura, saldoMensal, saldoAcumulado: acumulado };
    });

    safeSetItem(SCHEMA_KEYS.MESES_CALCULADOS, atualizados);
  },
};

// ──────────────────────────────────────────────────────────────────────────────
// Operações de alto nível — Load/Save Completo do App
// ──────────────────────────────────────────────────────────────────────────────

/**
 * `saveAppState` — Persiste o estado completo do app após o Onboarding.
 *
 * Salva os 3 domínios atomicamente:
 *  1. configuracoes_usuario
 *  2. transacoes_fixas (rendas + contas fixas)
 *  3. meses_calculados (projeção de 12 meses do Motor de Cálculo)
 */
export function saveAppState(
  mesOnboarding: string,
  rendas: IncomeSource[],
  contasFixas: FixedBill[],
  meses: MesCalculadoSalvo[]
): void {
  configuracoesStorage.save(mesOnboarding);
  transacoesFixasStorage.save(rendas, contasFixas);
  mesesCalculadosStorage.save(meses);
}

/**
 * `loadAppState` — Carrega o estado completo do app ao inicializar.
 *
 * Retorna `null` se o onboarding ainda não foi concluído.
 * Retorna `AppStorageSchema` com os 3 domínios se o app já foi configurado.
 */
export function loadAppState(): AppStorageSchema | null {
  const config = configuracoesStorage.load();
  if (!config?.onboardingCompleto) return null;

  const transacoes = transacoesFixasStorage.load();
  const meses = mesesCalculadosStorage.load();

  return {
    configuracoes_usuario: config,
    transacoes_fixas: transacoes,
    meses_calculados: meses,
  };
}

/**
 * `clearAppState` — Remove todos os dados do schema definitivo.
 * Útil para "Resetar App" / botão de logout.
 */
export function clearAppState(): void {
  localStorage.removeItem(SCHEMA_KEYS.CONFIGURACOES);
  localStorage.removeItem(SCHEMA_KEYS.TRANSACOES_FIXAS);
  localStorage.removeItem(SCHEMA_KEYS.MESES_CALCULADOS);
}
