/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Core Domain — Entidades de Domínio Puras e Contratos SOLID.
 * NÃO redefine AppStorageSchema (mantido em src/types.ts por retrocompatibilidade com legado).
 */

// Conta fixa mensal
export interface FixedBill {
  id: string;
  name: string;
  value: number;
  dueDay: number;
  category?: string;
  active: boolean;
}

// Renda mensal
export interface IncomeSource {
  id: string;
  label: string;
  value: number;
  month: string;
  recurrence?: "monthly" | "single";
}

// Compra individual do cartão
export interface CardPurchase {
  id: string;
  description: string;
  category?: string;
  purchaseDate?: string;
  totalValue: number;
  isInstallment: boolean;
  installmentCurrent?: number;
  installmentTotal?: number;
  installmentValue?: number;
  installmentsRemaining?: number;
}

// Fatura do cartão
export interface CardInvoice {
  id: string;
  referenceMonth: string;
  uploadedAt: string;
  fileName?: string;
  totalValue: number;
  purchases: CardPurchase[];
  parsedAt: string;
  needsReview: boolean;
}

// Compra parcelada simulada
export interface PlannedInstallment {
  id: string;
  description: string;
  totalValue: number;
  installmentTotal: number;
  installmentValue: number;
  firstChargeMonth: string;
  status: "simulated" | "confirmed_in_invoice" | "archived";
  notes?: string;
}

/**
 * SOLID — Interface Contracts (Dependency Inversion Principle)
 */

export interface IFinancialData {
  incomes: IncomeSource[];
  fixedBills: FixedBill[];
  invoices: CardInvoice[];
  plannedInstallments: PlannedInstallment[];
  hasOnboarded: boolean;
}

export interface IStorageRepository {
  loadAll(): IFinancialData;
  saveAll(data: IFinancialData): void;
  clear(): void;
}

export interface ISyncProvider {
  syncCode: string | null;
  setSyncCode(code: string | null): void;
  clearSyncCode(): void;
  isConfigured(): boolean;
  pushDomains(domains: Partial<Record<string, any[]>>): Promise<boolean>;
  subscribe(onData: (data: Partial<Record<string, any[]>>) => void, onError: (err: any) => void): () => void;
}

export interface IInvoiceParseOptions {
  referenceMonth: string;
}

export interface IInvoiceParser {
  parse(file: File, options: IInvoiceParseOptions): Promise<CardInvoice>;
}

// Resumo mensal usado em relatórios
export interface MonthlyReportSummary {
  month: string;
  income: number;
  fixedBills: number;
  cardInvoice: number;
  simulatedInstallments: number;
  balance: number;
  // Campos opcionais usados em projeções multi-mês
  label?: string;
  cumulativeBalance?: number;
  totalIncome?: number;
  totalFixed?: number;
  totalInvoice?: number;
  totalPlanned?: number;
}
