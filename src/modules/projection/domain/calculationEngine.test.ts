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
    const resultado = calcularProjecao({
      mesInicial: "2026-01",
      rendas: rendasIniciais,
      contasFixas: contasFixas,
    });
    expect(resultado.meses).toHaveLength(12);
    expect(resultado.meses[0].mes).toBe("2026-01");
    expect(resultado.meses[11].mes).toBe("2026-12");
  });

  it("deve calcular corretamente a renda base e custo fixo mensal", () => {
    const resultado = calcularProjecao({
      mesInicial: "2026-01",
      rendas: rendasIniciais,
      contasFixas: contasFixas,
    });
    
    // Renda base recorrente (5000)
    expect(resultado.rendaMensalBase).toBe(5000);
    // Custo fixo mensal das contas ativas (1500)
    expect(resultado.custoFixoMensal).toBe(1500);
    // Saldo base mensal (5000 - 1500 = 3500)
    expect(resultado.saldoBasesMensal).toBe(3500);
  });

  it("deve considerar apenas contas fixas ativas", () => {
    const resultado = calcularProjecao({
      mesInicial: "2026-01",
      rendas: rendasIniciais,
      contasFixas: contasFixas,
    });
    // Deve incluir apenas Aluguel (1500), ignorando Academia (100)
    expect(resultado.custoFixoMensal).toBe(1500);
  });

  it("deve acumular o saldo corretamente mês a mês", () => {
    const resultado = calcularProjecao({
      mesInicial: "2026-01",
      rendas: rendasIniciais,
      contasFixas: contasFixas,
    });

    // Mês 1: Saldo 3500 (5000 - 1500)
    expect(resultado.meses[0].saldoMensal).toBe(3500);
    expect(resultado.meses[0].saldoAcumulado).toBe(3500);

    // Mês 2: Saldo 4500 (inclui bonus avulso 1000), Acumulado 8000
    expect(resultado.meses[1].saldoMensal).toBe(4500);
    expect(resultado.meses[1].saldoAcumulado).toBe(8000);
  });
});
