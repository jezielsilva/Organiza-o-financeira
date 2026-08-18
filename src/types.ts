/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Arquivo central de tipos da aplicação.
 *
 * Reexporta as entidades de domínio puras de src/core/domain/types.ts
 * e define os tipos legados do schema de persistência que ainda são usados
 * por storageService.ts, backupService.ts e App.tsx.
 */

// ─── Entidades de Domínio e Contratos SOLID ─────────────────────────────────
export * from "./core/domain/types";

// ─── Schema Legado de Persistência (v2) ─────────────────────────────────────
// Mantido para retrocompatibilidade com backupService, storageService e App.tsx

/** Configurações do usuário salvas após o onboarding */
export interface ConfiguracoesUsuario {
  schemaVersion: number;
  mesOnboarding: string; // "AAAA-MM"
  concluidoEm: string;   // ISO string
  onboardingCompleto: boolean;
}

/** Projeção mensal salva pelo Motor de Cálculo */
export interface MesCalculadoSalvo {
  mes: string;          // "AAAA-MM"
  label: string;        // "Jan/2026"
  totalRendas: number;
  totalContasFixas: number;
  faturaCartao: number;
  saldoMensal: number;
  saldoAcumulado: number;
  parcelasSimuladas?: number;
}

/**
 * Schema completo de persistência do app (formato do backup JSON).
 * Estrutura legada mantida para não quebrar importações/exportações existentes.
 */
export interface AppStorageSchema {
  configuracoes_usuario: ConfiguracoesUsuario;
  transacoes_fixas: {
    rendas: import("./core/domain/types").IncomeSource[];
    contasFixas: import("./core/domain/types").FixedBill[];
  };
  meses_calculados: MesCalculadoSalvo[];
}
