import { describe, expect, it } from "vitest";
import {
  budgetStatus,
  categoryBreakdown,
  goalEta,
  monthlyRecap,
  reliefCalendar,
  scenarioBalance,
  simulatePurchase,
  topCategories,
} from "./insights";
import { summarizeMonth } from "./projection";
import { emptyData, type AppData, type Purchase } from "./types";

function purchase(p: Partial<Purchase> & Pick<Purchase, "id" | "amountCents">): Purchase {
  return { seq: 0, description: p.id, category: "Outros", kind: "purchase", holder: "JOAO", ...p };
}

function data(): AppData {
  const d = emptyData();
  d.incomes.s = { id: "s", label: "Salário", amountCents: 500_000, recurrence: "monthly", startMonth: "2026-01" };
  d.settings.holderRules = { MARIA: false };
  d.invoices.i = {
    id: "i",
    month: "2026-10",
    issuer: "Carrefour",
    importedAt: "",
    statementTotalCents: 0,
    cards: {},
    purchases: {
      a: purchase({ id: "a", amountCents: 30_000, category: "Mercado" }),
      b: purchase({ id: "b", amountCents: 10_000, category: "Alimentação", description: "IFD*Restaurante" }),
      c: purchase({ id: "c", amountCents: 5_000, category: "Transporte", description: "DL*UberRides" }),
      d: purchase({ id: "d", amountCents: 20_000, category: "Compras", installmentCurrent: 2, installmentTotal: 3 }),
      e: purchase({ id: "e", amountCents: 8_000, category: "Compras", installmentCurrent: 4, installmentTotal: 4 }),
      sogra: purchase({ id: "sogra", amountCents: 99_000, category: "Lazer", holder: "MARIA" }),
    },
  };
  return d;
}

describe("categorias e orçamento", () => {
  it("soma por categoria só o que conta no orçamento", () => {
    const rows = categoryBreakdown(data(), "2026-10");
    expect(rows.map((r) => [r.category, r.cents])).toEqual([
      ["Mercado", 30_000],
      ["Compras", 28_000],
      ["Alimentação", 10_000],
      ["Transporte", 5_000],
    ]);
    expect(rows.find((r) => r.category === "Lazer")).toBeUndefined();
  });

  it("agrupa as menores em Outros", () => {
    const rows = topCategories(categoryBreakdown(data(), "2026-10"), 2);
    expect(rows.map((r) => r.category)).toEqual(["Mercado", "Compras", "Outros"]);
    expect(rows[2].cents).toBe(15_000);
  });

  it("marca estouro, quase no limite e folga", () => {
    const d = data();
    d.settings.categoryBudgets = { Mercado: 25_000, Alimentação: 10_500, Transporte: 20_000 };
    const states = Object.fromEntries(budgetStatus(d, "2026-10").map((b) => [b.category, b.state]));
    expect(states).toEqual({ Mercado: "over", Alimentação: "near", Transporte: "ok" });
  });
});

describe("calendário de alívio", () => {
  it("mostra quando cada parcela termina e o alívio acumulado", () => {
    const cal = reliefCalendar(data(), "2026-10", 3);
    expect(cal[0]).toMatchObject({ month: "2026-10", freedCents: 8_000, cumulativeCents: 8_000 });
    expect(cal[1]).toMatchObject({ month: "2026-11", freedCents: 20_000, cumulativeCents: 28_000 });
    expect(cal[2].freedCents).toBe(0);
  });
});

describe("cenários e simulador", () => {
  it("conservador é pior e otimista é melhor que o realista", () => {
    const s = summarizeMonth(data(), "2026-11");
    expect(scenarioBalance(s, "conservative")).toBeLessThan(scenarioBalance(s, "realistic"));
    expect(scenarioBalance(s, "optimistic")).toBeGreaterThan(scenarioBalance(s, "realistic"));
  });

  it("encontra o mês mais apertado e um início melhor", () => {
    const sim = simulatePurchase(data(), {
      id: "x",
      description: "TV",
      totalCents: 300_000,
      installments: 3,
      firstMonth: "2026-11",
      status: "active",
      createdAt: "",
    });
    expect(sim.after[0].balanceCents).toBe(sim.before[0].balanceCents - 100_000);
    expect(sim.worst.month).toBe("2026-11");
    expect(sim.bestStart!.month > "2026-11").toBe(true);
  });
});

describe("metas", () => {
  it("prevê o mês em que a meta é atingida", () => {
    const goal = { id: "g", name: "Reserva", kind: "emergency" as const, targetCents: 1_000_00, savedCents: 400_00, monthlyCents: 200_00, createdAt: "" };
    expect(goalEta(goal, "2026-10")).toBe("2027-01");
    expect(goalEta({ ...goal, monthlyCents: 0 }, "2026-10")).toBeNull();
  });
});

describe("resumo do mês", () => {
  it("conta corridas, delivery e parcelas que terminaram", () => {
    const r = monthlyRecap(data(), "2026-10");
    expect(r.top?.category).toBe("Mercado");
    expect(r.rides).toEqual({ count: 1, cents: 5_000 });
    expect(r.delivery).toEqual({ count: 1, cents: 10_000 });
    expect(r.endingCount).toBe(1);
    expect(r.freedCents).toBe(8_000);
  });
});
