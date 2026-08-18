/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Camada: application
 * Hook: useFinancialState
 *
 * Isola a manipulação de estado financeiro e persistência via IStorageRepository.
 */

import React, { useState, useEffect } from "react";
import { FixedBill, IncomeSource, CardInvoice, PlannedInstallment, IFinancialData } from "../../types";
import { defaultStorageRepository } from "../../services/storageService";
import { getCurrentMonth } from "../../core/shared/formatters";

export function useFinancialState() {
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentMonth());
  const [incomes, setIncomes] = useState<IncomeSource[]>([]);
  const [fixedBills, setFixedBills] = useState<FixedBill[]>([]);
  const [invoices, setInvoices] = useState<CardInvoice[]>([]);
  const [plannedInstallments, setPlannedInstallments] = useState<PlannedInstallment[]>([]);
  const [hasOnboarded, setHasOnboarded] = useState<boolean>(true);
  const [dataVersion, setDataVersion] = useState<number>(0);

  useEffect(() => {
    const data = defaultStorageRepository.loadAll();
    setIncomes(data.incomes);
    setFixedBills(data.fixedBills);
    setInvoices(data.invoices);
    setPlannedInstallments(data.plannedInstallments);
    setHasOnboarded(data.hasOnboarded);
  }, []);

  const saveAll = (
    newIncomes = incomes,
    newBills = fixedBills,
    newInvoices = invoices,
    newPlanned = plannedInstallments,
    newOnboarded = hasOnboarded
  ) => {
    const data: IFinancialData = {
      incomes: newIncomes,
      fixedBills: newBills,
      invoices: newInvoices,
      plannedInstallments: newPlanned,
      hasOnboarded: newOnboarded,
    };
    defaultStorageRepository.saveAll(data);
    setDataVersion((v) => v + 1);
  };

  const handleUpdateIncomes = (action: React.SetStateAction<IncomeSource[]>) => {
    setIncomes((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      saveAll(next, fixedBills, invoices, plannedInstallments, hasOnboarded);
      return next;
    });
  };

  const handleUpdateBills = (action: React.SetStateAction<FixedBill[]>) => {
    setFixedBills((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      saveAll(incomes, next, invoices, plannedInstallments, hasOnboarded);
      return next;
    });
  };

  const handleUpdateInvoices = (action: React.SetStateAction<CardInvoice[]>) => {
    setInvoices((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      saveAll(incomes, fixedBills, next, plannedInstallments, hasOnboarded);
      return next;
    });
  };

  const handleUpdatePlanned = (action: React.SetStateAction<PlannedInstallment[]>) => {
    setPlannedInstallments((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      saveAll(incomes, fixedBills, invoices, next, hasOnboarded);
      return next;
    });
  };

  const handleCompleteOnboarding = (newIncomes: IncomeSource[], newBills: FixedBill[]) => {
    setIncomes(newIncomes);
    setFixedBills(newBills);
    setHasOnboarded(true);
    saveAll(newIncomes, newBills, invoices, plannedInstallments, true);
  };

  const handleReconcileSimulation = (plannedId: string, status: "confirmed_in_invoice" | "archived") => {
    handleUpdatePlanned((prev) =>
      prev.map((item) => (item.id === plannedId ? { ...item, status } : item))
    );
  };

  const handleImportBackup = (importedData: any) => {
    setIncomes(importedData.incomes || []);
    setFixedBills(importedData.fixedBills || []);
    setInvoices(importedData.invoices || []);
    setPlannedInstallments(importedData.plannedInstallments || []);
    setHasOnboarded(true);
    saveAll(
      importedData.incomes || [],
      importedData.fixedBills || [],
      importedData.invoices || [],
      importedData.plannedInstallments || [],
      true
    );
  };

  return {
    selectedMonth,
    setSelectedMonth,
    incomes,
    setIncomes: handleUpdateIncomes,
    fixedBills,
    setFixedBills: handleUpdateBills,
    invoices,
    setInvoices: handleUpdateInvoices,
    plannedInstallments,
    setPlannedInstallments: handleUpdatePlanned,
    hasOnboarded,
    dataVersion,
    handleCompleteOnboarding,
    handleReconcileSimulation,
    handleImportBackup,
  };
}
