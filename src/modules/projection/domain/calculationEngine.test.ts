import { describe, it, expect } from "vitest";
import { calcularProjecao } from "./calculationEngine";
import { FixedBill, IncomeSource, CardInvoice, PlannedInstallment } from "../../../types";

describe("Motor de Cálculo de Projeção (calculationEngine)", () => {
  const rendasIniciais: IncomeSource[] = [
    { id: "1", label: "Salário Base", value: 5000, month: "2026-01", recurrence: "monthly" },
    { id: "2", label: "Bonus Avulso", value: 1000, month: "2026-02", recurrence: "single" },
  ];

  const contasFixas: FixedBill[] = [
    { id: "b1", name: "Aluguel", value: 1500, dueDay: 10, active: true },
    { id: "b2", name: "Academia Inativa", value: 100, dueDay: 5, active: false },
  ];

  const faturas: CardInvoice[] = [
    {
      id: "inv-2026-01",
      referenceMonth: "2026-01",
      uploadedAt: new Date().toISOString(),
      totalValue: 800,
      purchases: [],
      parsedAt: new Date().toISOString(),
      needsReview: false,
    },
  ];

  const parcelasSimuladas: PlannedInstallment[] = [
    {
      id: "p1",
      description: "TV 4K",
      totalValue: 2400,
      installmentTotal: 12,
      installmentValue: 200,
      firstChargeMonth: "2026-01",
      status: "simulated",
    },
  ];

  it("deve projetar 12 meses a partir do mês inicial", () => {
    const projecao = calcularProjecao("2026-01", rendasIniciais, contasFixas, faturas, parcelasSimuladas);
    expect(projecao).toHaveLength(12);
    expect(projecao[0].mes).toBe("2026-01");
    expect(projecao[11].mes).toBe("2026-12");
  });

  it("deve calcular corretamente a renda recorrente e avulsa por mês", () => {
    const projecao = calcularProjecao("2026-01", rendasIniciais, contasFixas, faturas, parcelasSimuladas);
    
    // Mês 1 (Jan/2026): Salário (5000)
    expect(projecao[0].totalRendas).toBe(5000);

    // Mês 2 (Fev/2026): Salário (5000) + Bonus Avulso (1000) = 6000
    expect(projecao[1].totalRendas).toBe(6000);

    // Mês 3 (Mar/2026): Apenas Salário (5000)
    expect(projecao[2].totalRendas).toBe(5000);
  });

  it("deve considerar apenas contas fixas ativas", () => {
    const projecao = calcularProjecao("2026-01", rendasIniciais, contasFixas, faturas, parcelasSimuladas);
    // Deve incluir apenas Aluguel (1500), ignorando Academia (100)
    expect(projecao[0].totalContasFixas).toBe(1500);
  });

  it("deve acumular o saldo corretamente mês a mês", () => {
    const projecao = calcularProjecao("2026-01", rendasIniciais, contasFixas, faturas, parcelasSimuladas);

    // Jan/2026: Renda (5000) - Fixas (1500) - Fatura (800) - Simulada (200) = Saldo 2500
    expect(projecao[0].saldoMensal).toBe(2500);
    expect(projecao[0].saldoAcumulado).toBe(2500);

    // Fev/2026: Renda (6000) - Fixas (1500) - Fatura (0) - Simulada (200) = Saldo 4300
    // Saldo acumulado: 2500 + 4300 = 6800
    expect(projecao[1].saldoMensal).toBe(4300);
    expect(projecao[1].saldoAcumulado).toBe(6800);
  });
});
