import { describe, expect, it } from "vitest";
import fixture from "./__fixtures__/carrefour-2026-10.json";
import { documentToLines, type TextItem } from "./textLayout";
import { inferEntryDate, parseStatement, prettifyDescription } from "./statementParser";
import { buildInvoice } from "./buildInvoice";

// Fatura real anonimizada (nomes trocados, boleto/CPF/endereço removidos).
const lines = documentToLines(fixture as TextItem[][]);
const parsed = parseStatement(lines, "2026-01");

describe("parseStatement (fatura Carrefour)", () => {
  it("lê cabeçalho: vencimento, mês, titular e totais", () => {
    expect(parsed.issuer).toBe("Carrefour");
    expect(parsed.dueDate).toBe("2026-10-14");
    expect(parsed.month).toBe("2026-10");
    expect(parsed.accountHolder).toBe("MARIA TITULAR");
    expect(parsed.statementTotalCents).toBe(473828);
    expect(parsed.declaredDebitsCents).toBe(473828);
    expect(parsed.futureInstallmentsCents).toBe(550370);
  });

  it("identifica todos os cartões, inclusive os que continuam na outra coluna", () => {
    expect(parsed.cards).toEqual([
      { holder: "MARIA TITULAR", last4: "6403" },
      { holder: "JOAO ADICIONAL", last4: "2890" },
      { holder: "ANA ADICIONAL", last4: "3826" },
      { holder: "JOAO ADICIONAL", last4: "9204" },
    ]);
  });

  it("a soma dos lançamentos lidos bate com o total da fatura", () => {
    expect(parsed.debitsCents).toBe(473828);
  });

  it("separa pagamentos da fatura anterior e ignora valores zerados", () => {
    expect(parsed.paymentsCents).toBe(368109 + 60544 + 21538);
    expect(parsed.entries.some((e) => /Anuidade/i.test(e.description))).toBe(false);
  });

  it("lê parcelas, IOF e compras de todas as colunas", () => {
    const renner = parsed.entries.find((e) => /^lojas renner/i.test(e.description));
    expect(renner).toMatchObject({
      installmentCurrent: 3,
      installmentTotal: 3,
      amountCents: 8394,
      holder: "MARIA TITULAR",
      cardLast4: "6403",
    });

    const iof = parsed.entries.find((e) => /^iof/i.test(e.description));
    expect(iof).toMatchObject({ kind: "fee", amountCents: 385, cardLast4: "2890" });

    const google = parsed.entries.find((e) => /^google/i.test(e.description));
    expect(google).toMatchObject({ amountCents: 499, cardLast4: "2890", date: "2026-09-30" });

    const carlos = parsed.entries.find((e) => /^carlosaugusto/i.test(e.description));
    expect(carlos).toMatchObject({ installmentCurrent: 15, installmentTotal: 15, cardLast4: "9204" });
  });

  it("totaliza por cartão", () => {
    const byCard = new Map<string, number>();
    for (const e of parsed.entries) byCard.set(e.cardLast4!, (byCard.get(e.cardLast4!) ?? 0) + e.amountCents);
    const titular = byCard.get("6403")!;
    expect(titular).toBe(8394 + 4084 + 10660 + 2399 + 5460 + 7502 + 3000 + 7908 + 17860 + 6550);
    const total = [...byCard.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(473828);
  });
});

describe("inferEntryDate", () => {
  it("compra à vista do mês anterior fica no mesmo ano", () => {
    expect(inferEntryDate(22, 9, "2026-10")).toBe("2026-09-22");
  });
  it("parcela antiga volta para o ano anterior", () => {
    expect(inferEntryDate(21, 11, "2026-10", 11)).toBe("2025-11-21");
    expect(inferEntryDate(14, 7, "2026-10", 15)).toBe("2025-07-14");
  });
  it("virada de ano: compra de dezembro na fatura de janeiro", () => {
    expect(inferEntryDate(20, 12, "2027-01")).toBe("2026-12-20");
  });
});

describe("buildInvoice", () => {
  it("preserva as marcações do usuário ao reenviar o PDF", () => {
    const first = buildInvoice(parsed, { fallbackMonth: "2026-10" });
    const target = Object.values(first.purchases).find((p) => /^grupo madero/i.test(p.description))!;
    const edited = {
      ...first,
      purchases: { ...first.purchases, [target.id]: { ...target, ignored: true, category: "Lazer" } },
    };
    const again = buildInvoice(parsed, { fallbackMonth: "2026-10", previous: edited });
    expect(again.id).toBe(first.id);
    expect(again.purchases[target.id]).toMatchObject({ ignored: true, category: "Lazer" });
    expect(Object.keys(again.purchases)).toHaveLength(Object.keys(first.purchases).length);
  });
});

describe("prettifyDescription", () => {
  it.each([
    ["SUPERMERCADO GUANABARA, RIO DE JANEIR", "Supermercado Guanabara"],
    ["RAIA4179,RIO DE JANEIR", "Raia4179"],
    ["IFD*DROGARIAS PACHECO,RIO DE JANEI", "Ifd*Drogarias Pacheco"],
    ["DL*UberRides, Sao Paulo", "DL*UberRides"],
    ["Pagamento de Fatura via PIX", "Pagamento de Fatura via Pix"],
  ])("%s → %s", (input, expected) => {
    expect(prettifyDescription(input)).toBe(expected);
  });
});