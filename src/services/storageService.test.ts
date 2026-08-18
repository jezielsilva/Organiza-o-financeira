import { describe, it, expect, beforeEach } from "vitest";
import { loadAllData, saveAllData, UnifiedStorageRepository } from "./storageService";
import { IFinancialData } from "../types";

describe("Serviço de Armazenamento (storageService)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const dadosTeste: IFinancialData = {
    incomes: [{ id: "1", label: "Freela", value: 2000, month: "2026-01" }],
    fixedBills: [{ id: "b1", name: "Internet", value: 100, dueDay: 15, active: true }],
    invoices: [],
    plannedInstallments: [],
    hasOnboarded: true,
  };

  it("deve salvar e carregar os dados através de loadAllData / saveAllData", () => {
    saveAllData(dadosTeste);
    const carregado = loadAllData();

    expect(carregado.incomes).toHaveLength(1);
    expect(carregado.incomes[0].label).toBe("Freela");
    expect(carregado.fixedBills[0].name).toBe("Internet");
    expect(carregado.hasOnboarded).toBe(true);
  });

  it("deve funcionar corretamente através da interface do repositório unificado", () => {
    const repo = new UnifiedStorageRepository();
    repo.saveAll(dadosTeste);

    const res = repo.loadAll();
    expect(res.incomes).toHaveLength(1);

    repo.clear();
    const resAposClear = repo.loadAll();
    expect(resAposClear.incomes).toHaveLength(0);
  });
});
