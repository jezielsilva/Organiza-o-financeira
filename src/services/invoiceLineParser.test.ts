import { describe, it, expect } from "vitest";
import { parseInvoiceLine, parseValorBR, getPurchaseFullDate, extractTotalValueFromText } from "./invoiceLineParser";

describe("Parser de Linhas de Fatura (invoiceLineParser)", () => {
  it("deve converter strings no formato de moeda BR para float de forma precisa", () => {
    expect(parseValorBR("1.250,50")).toBe(1250.50);
    expect(parseValorBR("45,00")).toBe(45.00);
    expect(parseValorBR("0,99")).toBe(0.99);
  });

  it("deve ignorar linhas com palavras-chave de pagamentos/estornos", () => {
    expect(parseInvoiceLine("10/05 PAGAMENTO EFETUADO 500,00")).toBeNull();
    expect(parseInvoiceLine("12/05 ESTORNO DE COMPRA 45,00-")).toBeNull();
    expect(parseInvoiceLine("15/05 SALDO ANTERIOR 200,00")).toBeNull();
  });

  it("deve identificar compras normais sem parcelamento", () => {
    const res = parseInvoiceLine("15/05 UBER *TRIP 25,90");
    expect(res).not.toBeNull();
    expect(res?.date).toBe("15/05");
    expect(res?.description).toBe("UBER *TRIP");
    expect(res?.totalValue).toBe(25.90);
    expect(res?.isInstallment).toBe(false);
  });

  it("deve identificar compras parceladas (padrão XX/YY)", () => {
    const res = parseInvoiceLine("01/05 MAGAZINE LUIZA 02/10 150,00");
    expect(res).not.toBeNull();
    expect(res?.date).toBe("01/05");
    expect(res?.isInstallment).toBe(true);
    expect(res?.installmentCurrent).toBe(2);
    expect(res?.installmentTotal).toBe(10);
    expect(res?.installmentValue).toBe(150.00);
    expect(res?.totalValue).toBe(1500.00);
  });

  it("deve resolver a data completa da compra ajustando o ano fiscal", () => {
    // Compra em Dezembro (15/12) em uma fatura de Janeiro (2026-01) deve ser do ano anterior (2025)
    const fullDate = getPurchaseFullDate("15/12", "2026-01");
    expect(fullDate).toBe("2025-12-15");
  });

  it("deve extrair o total da fatura a partir do texto do PDF", () => {
    const text = "Resumo da Fatura\nTotal da fatura atual 1.450,80\nData de vencimento: 10/06";
    const total = extractTotalValueFromText(text);
    expect(total).toBe(1450.80);
  });
});
