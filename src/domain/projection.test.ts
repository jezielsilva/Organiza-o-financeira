import { describe, expect, it } from "vitest";
import { commitmentsFrom, invoiceShareCents, summarizeMonth } from "./projection";
import { emptyData, type AppData, type Invoice, type Purchase } from "./types";

function purchase(partial: Partial<Purchase> & Pick<Purchase, "id" | "amountCents">): Purchase {
  return { seq: 0, description: partial.id, category: "Outros", kind: "purchase", ...partial };
}

function invoice(month: string, purchases: Purchase[]): Invoice {
  return {
    id: `inv-${month}`,
    month,
    issuer: "Carrefour",
    importedAt: "2026-01-01T00:00:00Z",
    statementTotalCents: purchases.reduce((a, p) => a + p.amountCents, 0),
    accountHolder: "MARIA",
    cards: {},
    purchases: Object.fromEntries(purchases.map((p) => [p.id, p])),
  };
}

function baseData(): AppData {
  const data = emptyData();
  data.incomes.salario = { id: "salario", label: "Salário", amountCents: 1_000_000, recurrence: "monthly", startMonth: "2026-01" };
  data.bills.aluguel = { id: "aluguel", name: "Aluguel", amountCents: 300_000, dueDay: 5, category: "Moradia", active: true };
  data.bills.pausada = { id: "pausada", name: "Academia", amountCents: 10_000, dueDay: 5, category: "Saúde", active: false };
  data.settings.holderRules = { MARIA: false };
  data.invoices["inv-2026-10"] = invoice("2026-10", [
    purchase({ id: "mercado", amountCents: 50_000, holder: "JOAO" }),
    purchase({ id: "tv", amountCents: 20_000, installmentCurrent: 2, installmentTotal: 4, holder: "JOAO" }),
    purchase({ id: "sogra", amountCents: 99_900, holder: "MARIA" }),
    purchase({ id: "nao-meu", amountCents: 7_000, holder: "JOAO", ignored: true }),
    purchase({ id: "sogra-parcela", amountCents: 5_000, installmentCurrent: 1, installmentTotal: 3, holder: "MARIA" }),
  ]);
  return data;
}

describe("fatura do mês", () => {
  it("conta só os cartões incluídos e o que não foi marcado como 'não é meu'", () => {
    const data = baseData();
    expect(invoiceShareCents(data.invoices["inv-2026-10"], data.settings)).toBe(70_000);
    const summary = summarizeMonth(data, "2026-10");
    expect(summary.card).toMatchObject({ source: "invoice", totalCents: 70_000, installmentsCents: 20_000 });
    expect(summary.billsCents).toBe(300_000);
    expect(summary.balanceCents).toBe(1_000_000 - 300_000 - 70_000);
  });
});

describe("projeção de meses futuros", () => {
  it("inclui parcelas restantes e a média de gastos à vista (não fica otimista)", () => {
    const data = baseData();
    const nov = summarizeMonth(data, "2026-11");
    expect(nov.card.source).toBe("projected");
    expect(nov.card.installmentsCents).toBe(20_000); // tv 3/4
    expect(nov.card.variableEstimateCents).toBe(50_000); // mercado (a sogra e o "não é meu" ficam fora)
    expect(nov.balanceCents).toBe(1_000_000 - 300_000 - 70_000);
  });

  it("parcelas param de contar depois da última", () => {
    const data = baseData();
    expect(summarizeMonth(data, "2026-12").card.installmentsCents).toBe(20_000); // 4/4
    expect(summarizeMonth(data, "2027-01").card.installmentsCents).toBe(0);
  });

  it("compras planejadas entram nos meses certos", () => {
    const data = baseData();
    data.plans.geladeira = {
      id: "geladeira",
      description: "Geladeira",
      totalCents: 300_000,
      installments: 3,
      firstMonth: "2026-11",
      status: "active",
      createdAt: "",
    };
    expect(summarizeMonth(data, "2026-10").plannedCents).toBe(0);
    expect(summarizeMonth(data, "2026-11").plannedCents).toBe(100_000);
    expect(summarizeMonth(data, "2027-02").plannedCents).toBe(0);
  });
});

describe("o que está acabando", () => {
  it("lista parcelas pela data em que terminam", () => {
    const data = baseData();
    const list = commitmentsFrom(data, "2026-11");
    expect(list.map((c) => [c.id, c.current, c.total, c.lastMonth])).toEqual([["tv", 3, 4, "2026-12"]]);
  });
});
