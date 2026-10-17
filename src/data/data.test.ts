import { describe, expect, it } from "vitest";
import { emptyData } from "../domain/types";
import { createBackup, parseBackup } from "./backup";
import { convertLegacy, convertLegacyRoom } from "./legacy";
import { applyPatch, inversePatch } from "./patch";
import { missingOnServerPatch, unionData } from "./sync/firebaseSync";

describe("patch", () => {
  it("aplica, apaga e desfaz por caminho sem mutar o original", () => {
    const data = emptyData();
    data.bills.a = { id: "a", name: "Luz", amountCents: 100, dueDay: 1, category: "Moradia", active: true };
    const patch = { "bills/a/active": false, "bills/b": { id: "b", name: "Água", amountCents: 50, dueDay: 2, category: "Moradia", active: true } };
    const next = applyPatch(data, patch);
    expect(next.bills.a.active).toBe(false);
    expect(next.bills.b.name).toBe("Água");
    expect(data.bills.a.active).toBe(true);
    const restored = applyPatch(next, inversePatch(data, patch));
    expect(restored).toEqual(data);
  });

  it("remove campos undefined (o Firebase rejeita)", () => {
    const next = applyPatch(emptyData(), { "plans/x": { id: "x", notes: undefined } });
    expect("notes" in (next.plans.x as object)).toBe(false);
  });
});

describe("migração do formato antigo", () => {
  const legacy = {
    incomes: [{ id: "i1", label: "Salário", value: 5000.5, month: "2026-01" }],
    fixedBills: [
      { id: "b1", name: "Luz", value: 150.1, dueDay: 10, active: true },
      { id: "b2", name: "Apagada", value: 1, dueDay: 1, active: true, deleted: true },
    ],
    invoices: [
      {
        id: "inv1",
        referenceMonth: "2026-09",
        uploadedAt: "2026-09-10T00:00:00Z",
        totalValue: 300.3,
        purchases: [
          { id: "p1", description: "IFD*Restaurante", totalValue: 50.1, isInstallment: false },
          { id: "p2", description: "Loja", totalValue: 300, isInstallment: true, installmentCurrent: 2, installmentTotal: 3, installmentValue: 100 },
        ],
      },
    ],
    plannedInstallments: [
      { id: "s1", description: "TV", totalValue: 1200, installmentTotal: 6, installmentValue: 200, firstChargeMonth: "2026-11", status: "simulated" },
    ],
  };

  it("converte reais para centavos e descarta itens apagados", () => {
    const data = convertLegacy(legacy);
    expect(data.incomes.i1.amountCents).toBe(500050);
    expect(data.bills.b1.amountCents).toBe(15010);
    expect(data.bills.b2).toBeUndefined();
    expect(data.invoices.inv1.purchases.p2).toMatchObject({ amountCents: 10000, installmentCurrent: 2, installmentTotal: 3 });
    expect(data.invoices.inv1.purchases.p1.category).toBe("Alimentação");
    expect(data.plans.s1).toMatchObject({ totalCents: 120000, installments: 6, status: "active" });
  });

  it("lê a sala de sincronização antiga", () => {
    const room = { meta: {}, domains: { fixedBills: { data: legacy.fixedBills }, incomes: { data: legacy.incomes } } };
    const data = convertLegacyRoom(room)!;
    expect(Object.keys(data.bills)).toEqual(["b1"]);
    expect(Object.keys(data.incomes)).toEqual(["i1"]);
  });
});

describe("backup", () => {
  it("exporta e importa TUDO, inclusive faturas e compras planejadas", () => {
    const data = convertLegacy({
      invoices: [{ id: "inv1", referenceMonth: "2026-09", totalValue: 10, purchases: [{ id: "p1", description: "x", totalValue: 10 }] }],
      plannedInstallments: [{ id: "s1", description: "TV", totalValue: 100, installmentTotal: 2, firstChargeMonth: "2026-11", status: "simulated" }],
    });
    const restored = parseBackup(JSON.stringify(createBackup(data)));
    expect(restored).toEqual(data);
  });

  it("aceita o backup v2 do app antigo", () => {
    const v2 = {
      configuracoes_usuario: { schemaVersion: 1, mesOnboarding: "2026-01", onboardingCompleto: true },
      transacoes_fixas: { rendas: [{ id: "i1", label: "Salário", value: 100, month: "2026-01" }], contasFixas: [] },
      meses_calculados: [],
    };
    expect(parseBackup(JSON.stringify(v2)).incomes.i1.amountCents).toBe(10000);
  });

  it("recusa arquivos que não são backup", () => {
    expect(() => parseBackup("{}")).toThrow();
    expect(() => parseBackup("não é json")).toThrow();
  });
});

describe("entrada na sala de sincronização", () => {
  it("só adiciona ao servidor o que não existe lá (nunca sobrescreve)", () => {
    const server = emptyData();
    server.bills.a = { id: "a", name: "Servidor", amountCents: 1, dueDay: 1, category: "x", active: true };
    const local = emptyData();
    local.bills.a = { id: "a", name: "Local", amountCents: 2, dueDay: 1, category: "x", active: true };
    local.bills.b = { id: "b", name: "Só local", amountCents: 3, dueDay: 1, category: "x", active: true };
    expect(Object.keys(missingOnServerPatch(server, local))).toEqual(["bills/b"]);
    expect(unionData(server, local).bills.a.name).toBe("Servidor");
  });
});
