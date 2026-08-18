import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useFinancialState } from "./useFinancialState";

describe("Hook de Estado Financeiro (useFinancialState)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("deve inicializar com listas vazias e hasOnboarded=false", () => {
    const { result } = renderHook(() => useFinancialState());
    expect(result.current.incomes).toEqual([]);
    expect(result.current.fixedBills).toEqual([]);
    expect(result.current.invoices).toEqual([]);
    expect(result.current.plannedInstallments).toEqual([]);
  });

  it("deve permitir concluir o onboarding e atualizar o estado", () => {
    const { result } = renderHook(() => useFinancialState());

    act(() => {
      result.current.handleCompleteOnboarding(
        [{ id: "inc1", label: "Salário", value: 3000, month: "2026-01" }],
        [{ id: "bill1", name: "Luz", value: 150, dueDay: 10, active: true }]
      );
    });

    expect(result.current.hasOnboarded).toBe(true);
    expect(result.current.incomes).toHaveLength(1);
    expect(result.current.fixedBills).toHaveLength(1);
  });

  it("deve permitir conciliar uma simulação de parcela", () => {
    const { result } = renderHook(() => useFinancialState());

    act(() => {
      result.current.setPlannedInstallments([
        {
          id: "p1",
          description: "Smartphone",
          totalValue: 1200,
          installmentTotal: 10,
          installmentValue: 120,
          firstChargeMonth: "2026-01",
          status: "simulated",
        },
      ]);
    });

    act(() => {
      result.current.handleReconcileSimulation("p1", "confirmed_in_invoice");
    });

    expect(result.current.plannedInstallments[0].status).toBe("confirmed_in_invoice");
  });
});
