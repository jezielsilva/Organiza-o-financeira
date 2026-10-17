import { describe, expect, it } from "vitest";
import { formatBRL, parseBRL, splitInstallments, toCents } from "./money";
import { addMonths, monthDiff } from "./month";

describe("parseBRL", () => {
  it.each([
    ["1.234,56", 123456],
    ["12,50", 1250],
    ["12,5", 1250],
    ["R$ 10", 1000],
    ["10.50", 1050],
    ["1.234", 123400],
    ["3.681,09-", -368109],
    ["", null],
    ["abc", null],
  ])("%s → %s", (input, expected) => {
    expect(parseBRL(input)).toBe(expected);
  });
});

describe("dinheiro em centavos", () => {
  it("não acumula erro de ponto flutuante", () => {
    expect(toCents(0.1) + toCents(0.2)).toBe(30);
  });
  it("formata em reais", () => {
    expect(formatBRL(473828).replace(/\s/g, " ")).toBe("R$ 4.738,28");
  });
  it("divide parcelas sem perder centavos", () => {
    expect(splitInstallments(1000, 3)).toEqual([333, 333, 334]);
  });
});

describe("meses", () => {
  it("soma meses atravessando o ano", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
  it("calcula diferença", () => {
    expect(monthDiff("2025-11", "2026-10")).toBe(11);
  });
});
