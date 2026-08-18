import { describe, it, expect } from "vitest";
import { analisarSaudeFinanceira } from "./financialHealth";
import { FixedBill, IncomeSource } from "../types";

describe("Análise de Saúde Financeira (financialHealth)", () => {
  const rendas: IncomeSource[] = [
    { id: "1", label: "Salário", value: 4000, month: "2026-01" },
  ];

  it("deve classificar como 'ideal' quando custos essenciais forem <= 50%", () => {
    const contas: FixedBill[] = [
      { id: "b1", name: "Aluguel", value: 1500, dueDay: 10, category: "Moradia", active: true },
      { id: "b2", name: "Mercado", value: 400, dueDay: 5, category: "Alimentação", active: true },
    ];

    const res = analisarSaudeFinanceira(rendas, contas);
    expect(res.comprometimentoNecessidades).toBe(47.5);
    expect(res.statusNecessidades).toBe("ideal");
    expect(res.statusMensal).toBe("positivo");
    expect(res.alerta).toBeNull();
  });

  it("deve classificar como 'critico' quando custos essenciais forem > 65%", () => {
    const contas: FixedBill[] = [
      { id: "b1", name: "Aluguel", value: 2800, dueDay: 10, category: "Moradia", active: true },
    ];

    const res = analisarSaudeFinanceira(rendas, contas);
    expect(res.comprometimentoNecessidades).toBe(70);
    expect(res.statusNecessidades).toBe("critico");
    expect(res.alerta).toContain("custos essenciais superam os 50%");
  });

  it("deve alertar sobre déficit quando despesas totais superarem a renda", () => {
    const contas: FixedBill[] = [
      { id: "b1", name: "Aluguel", value: 3000, dueDay: 10, category: "Moradia", active: true },
      { id: "b2", name: "Lazer", value: 1500, dueDay: 15, category: "Outros", active: true },
    ];

    const res = analisarSaudeFinanceira(rendas, contas);
    expect(res.statusMensal).toBe("déficit");
    expect(res.alerta).toContain("operando em déficit mensal");
  });
});
