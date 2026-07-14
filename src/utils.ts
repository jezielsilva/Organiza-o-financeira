/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { FixedBill, IncomeSource, CardInvoice, PlannedInstallment, MonthlyReportSummary, CardPurchase } from "./types";

// Formata valores em Reais (BRL)
export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

// Formata strings "AAAA-MM" para exibição (ex: "2026-07" -> "Julho / 2026")
export function formatMonth(yearMonth: string): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  const monthName = date.toLocaleDateString("pt-BR", { month: "long" });
  return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} de ${year}`;
}

// Retorna a diferença em meses entre duas datas "AAAA-MM" (fim - início)
export function getMonthDiff(startStr: string, endStr: string): number {
  const [startYear, startMonth] = startStr.split("-").map(Number);
  const [endYear, endMonth] = endStr.split("-").map(Number);
  return (endYear - startYear) * 12 + (endMonth - startMonth);
}

// Adiciona N meses a uma data "AAAA-MM"
export function addMonths(yearMonth: string, offset: number): string {
  const [year, month] = yearMonth.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// Gera uma lista consecutiva de meses "AAAA-MM" a partir de uma data inicial
export function getMonthsRange(startYearMonth: string, count: number): string[] {
  const list: string[] = [];
  for (let i = 0; i < count; i++) {
    list.push(addMonths(startYearMonth, i));
  }
  return list;
}

// Calcula as parcelas ativas de uma fatura para um determinado mês de destino (projeção)
export function getProjectedInvoicePurchases(
  targetMonth: string,
  invoices: CardInvoice[]
): { purchases: CardPurchase[]; sourceInvoiceMonth: string | null } {
  // 1. Procuramos se há uma fatura real para o mês alvo
  const realInvoice = invoices.find((inv) => inv.referenceMonth === targetMonth);
  if (realInvoice) {
    return { purchases: realInvoice.purchases, sourceInvoiceMonth: targetMonth };
  }

  // 2. Se não houver fatura real, procuramos a fatura real mais recente ANTES do mês alvo
  const sortedPastInvoices = invoices
    .filter((inv) => inv.referenceMonth < targetMonth)
    .sort((a, b) => b.referenceMonth.localeCompare(a.referenceMonth));

  if (sortedPastInvoices.length === 0) {
    return { purchases: [], sourceInvoiceMonth: null };
  }

  const latestInvoice = sortedPastInvoices[0];
  const diffMonths = getMonthDiff(latestInvoice.referenceMonth, targetMonth);

  // Filtramos apenas as compras parceladas que continuam ativas no mês alvo
  const projectedPurchases: CardPurchase[] = latestInvoice.purchases
    .filter((purchase) => {
      if (!purchase.isInstallment) return false;
      const current = purchase.installmentCurrent || 1;
      const total = purchase.installmentTotal || 1;
      const finalInstallmentAtTarget = current + diffMonths;
      return finalInstallmentAtTarget <= total;
    })
    .map((purchase) => {
      const current = purchase.installmentCurrent || 1;
      const total = purchase.installmentTotal || 1;
      const projectedCurrent = current + diffMonths;
      const remaining = total - projectedCurrent;

      return {
        ...purchase,
        id: `${purchase.id}-proj-${targetMonth}`,
        installmentCurrent: projectedCurrent,
        installmentsRemaining: remaining,
      };
    });

  return {
    purchases: projectedPurchases,
    sourceInvoiceMonth: latestInvoice.referenceMonth,
  };
}

// Calcula o resumo financeiro completo para um determinado mês
export function calculateReport(
  month: string,
  incomes: IncomeSource[],
  fixedBills: FixedBill[],
  invoices: CardInvoice[],
  plannedInstallments: PlannedInstallment[]
): MonthlyReportSummary {
  // 1. Renda total para este mês considerando recorrência
  const totalIncome = incomes
    .filter((inc) => {
      const isRecurrent = !inc.recurrence || inc.recurrence === "monthly";
      if (isRecurrent) {
        return inc.month <= month; // Ativo a partir do mês de cadastro
      } else {
        return inc.month === month; // Apenas no próprio mês
      }
    })
    .reduce((acc, curr) => acc + curr.value, 0);

  // 2. Contas fixas ativas
  // Contas fixas são recorrentes e ativas
  const activeBills = fixedBills.filter((bill) => bill.active);
  const totalFixedBills = activeBills.reduce((acc, curr) => acc + curr.value, 0);

  // 3. Fatura de cartão (real ou projetada)
  const { purchases: invoicePurchases } = getProjectedInvoicePurchases(month, invoices);
  const realInvoice = invoices.find((inv) => inv.referenceMonth === month);
  
  // Se houver fatura real, usamos seu total real. 
  // Senão, calculamos a soma das parcelas projetadas para este mês.
  const totalCardInvoice = realInvoice 
    ? realInvoice.totalValue 
    : invoicePurchases.reduce((acc, curr) => acc + (curr.installmentValue || 0), 0);

  // 4. Parcelas simuladas/antecipadas que caem neste mês
  // O status deve ser "simulated" (simulações ativas)
  // Uma simulação é ativa se o mês alvo estiver entre o primeiro mês de cobrança e a última parcela
  const activeSimulatedInstallments = plannedInstallments.filter((plan) => {
    if (plan.status !== "simulated") return false;
    const diff = getMonthDiff(plan.firstChargeMonth, month);
    // Deve começar em ou após o primeiro mês, e não ter esgotado as parcelas
    return diff >= 0 && diff < plan.installmentTotal;
  });

  const totalSimulated = activeSimulatedInstallments.reduce((acc, curr) => acc + curr.installmentValue, 0);

  // 5. Saldo final
  const balance = totalIncome - (totalFixedBills + totalCardInvoice + totalSimulated);

  return {
    month,
    income: totalIncome,
    fixedBills: totalFixedBills,
    cardInvoice: totalCardInvoice,
    simulatedInstallments: totalSimulated,
    balance,
  };
}

// --- Funções de Leitura Local de Faturas Carrefour ---

export interface ParsedLine {
  date: string;           // "DD/MM"
  description: string;
  totalValue: number;
  isInstallment: boolean;
  installmentCurrent?: number;
  installmentTotal?: number;
  installmentValue?: number;
  isCredit: boolean;      // true = pagamento/estorno/desconto, não é gasto
}

export function parseValorBR(v: string): number {
  return parseFloat(v.replace(/\./g, "").replace(",", "."));
}

// Dicionário de meses em português para identificar datas em formato de texto (Ex: "10 JAN", "15 MAI")
const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function parseInvoiceLine(line: string): ParsedLine | null {
  const clean = line.trim();
  if (!clean || clean.length < 8) return null;

  // Ignorar termos comuns de pagamentos, créditos, limites, etc.
  const ignorePatterns = [
    /pagamento/i, /recebido/i, /efetuado/i, /credito/i, /crédito/i, /estorno/i,
    /deb\.aut/i, /débito automático/i, /saldo anterior/i, /total da fatura/i,
    /pagamento mínimo/i, /limite de crédito/i, /encargos/i, /juros/i, /iof/i
  ];
  if (ignorePatterns.some(pat => pat.test(clean))) {
    return null;
  }

  // 1. Tenta extrair a data (Ex: "25/08", "05/12", "12 JAN", "12 Mai")
  let dateFound = "";
  let dateRegexMatch = clean.match(/(\d{2})\/(\d{2})/); // Formato "DD/MM"
  
  if (dateRegexMatch) {
    dateFound = dateRegexMatch[0];
  } else {
    // Tenta formato "DD MMM" ou "DD de MMM"
    const textDateRegex = new RegExp(`(\\d{1,2})\\s*(?:de)?\\s*(${MESES_PT.join("|")})`, "i");
    const textDateMatch = clean.match(textDateRegex);
    if (textDateMatch) {
      const day = textDateMatch[1].padStart(2, "0");
      const monthIndex = MESES_PT.indexOf(textDateMatch[2].toLowerCase()) + 1;
      const month = String(monthIndex).padStart(2, "0");
      dateFound = `${day}/${month}`;
    }
  }

  if (!dateFound) return null;

  // 2. Tenta extrair o valor monetário com vírgula decimal (Ex: "1.250,50", "30,00", "5,90")
  // Captura também um sinal de "-" no final que costuma denotar créditos ou estornos
  const valueRegex = /([\d.]+,\d{2})(-?)\s*$/;
  // Fallback se o valor estiver em algum outro ponto da linha
  const valueRegexGlobal = /([\d.]+,\d{2})(-?)/;
  
  let valueMatch = clean.match(valueRegex) || clean.match(valueRegexGlobal);
  if (!valueMatch) return null;

  const valueStr = valueMatch[1];
  const isCredit = valueMatch[2] === "-";
  const extractedValue = parseValorBR(valueStr);

  if (isNaN(extractedValue) || extractedValue <= 0) return null;

  // 3. Tenta extrair dados de parcelamento (Ex: "-3/3", "12/15", " 2/12", "1 de 5")
  const parcelRegex = /(?:-\s*|\s+)(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*$/i;
  
  // Limpa o resto da linha para achar a descrição, tirando a data e o valor
  let description = clean
    .replace(dateFound, "")
    .replace(valueMatch[0], "")
    .replace(/r\$\s*/i, "")
    .trim();

  // Verifica se há parcelas especificamente no final da descrição antes da limpeza final
  const parcelMatch = description.match(parcelRegex);
  
  if (parcelMatch) {
    const current = parseInt(parcelMatch[1], 10);
    const total = parseInt(parcelMatch[2], 10);

    // Valida se os números de parcela fazem sentido lógico
    if (current > 0 && total >= current && total <= 120) {
      // Remove o trecho de parcelas da descrição para deixá-la limpa
      description = description.replace(parcelMatch[0], "").trim();
      
      return {
        date: dateFound,
        description: description || "Gasto Cartão",
        isInstallment: true,
        installmentCurrent: current,
        installmentTotal: total,
        installmentValue: extractedValue,
        totalValue: Number((extractedValue * total).toFixed(2)),
        isCredit
      };
    }
  }

  // Se não capturou no final com traço/espaço, tenta Regex genérico em qualquer ponto da descrição (ex: "LOJA 03/10")
  const parcelRegexGeneric = /(\d{1,2})\s*\/([1-9]\d{0,1})\b/;
  const parcelMatchGeneric = description.match(parcelRegexGeneric);
  if (parcelMatchGeneric) {
    const current = parseInt(parcelMatchGeneric[1], 10);
    const total = parseInt(parcelMatchGeneric[2], 10);
    if (current > 0 && total >= current && total <= 120) {
      description = description.replace(parcelMatchGeneric[0], "").replace(/\s*-\s*$/, "").trim();
      return {
        date: dateFound,
        description: description || "Gasto Cartão",
        isInstallment: true,
        installmentCurrent: current,
        installmentTotal: total,
        installmentValue: extractedValue,
        totalValue: Number((extractedValue * total).toFixed(2)),
        isCredit
      };
    }
  }

  // Se não achou parcelas, trata como compra à vista
  return {
    date: dateFound,
    description: description.replace(/\s*-\s*$/, "").trim() || "Gasto Cartão",
    isInstallment: false,
    totalValue: extractedValue,
    isCredit
  };
}

export function getPurchaseFullDate(purchaseDateDM: string, referenceMonth: string): string {
  // purchaseDateDM é algo como "15/05"
  // referenceMonth é algo como "2026-07"
  const [refYear, refMonth] = referenceMonth.split("-").map(Number);
  const [day, month] = purchaseDateDM.split("/").map(Number);
  
  let year = refYear;
  // Se o mês da compra for maior que o mês de referência e o mês de referência for começo do ano (ex: Jan/Fev), assumimos ano anterior
  if (month > refMonth && refMonth <= 2) {
    year = refYear - 1;
  } else if (month > refMonth + 2) {
    // Se o mês for muito distante no futuro em relação ao mês da fatura, provavelmente é do ano anterior
    year = refYear - 1;
  }
  
  const yStr = year;
  const mStr = String(month).padStart(2, "0");
  const dStr = String(day).padStart(2, "0");
  return `${yStr}-${mStr}-${dStr}`;
}

export function extractTotalValueFromText(text: string): number | null {
  const lines = text.split("\n");
  
  const patterns = [
    /(?:total\s+da\s+fatura\s+atual|total\s+desta\s+fatura|valor\s+total\s+da\s+fatura|total\s+a\s+pagar|pagamento\s+mínimo|fatura\s+atual)\s*(?:r\$)?\s*([\d.]+,\d{2})/i,
    /(?:fatura\s+atual|total\s+fatura)\s*(?:r\$)?\s*([\d.]+,\d{2})/i,
    /total\s*(?:r\$)?\s*([\d.]+,\d{2})/i
  ];

  for (const pattern of patterns) {
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        return parseValorBR(match[1]);
      }
    }
  }
  return null;
}

export interface SaldosFuturos {
  totalParcelasPendentes: number;
  parcelasProximaFatura: number;
  parcelasAnuidadeFutura: number;
}

/**
 * Analisa o texto bruto buscando a seção "SALDOS FUTUROS" e extrai os valores consolidados.
 */
export function extractSaldosFuturos(text: string): SaldosFuturos {
  const res: SaldosFuturos = {
    totalParcelasPendentes: 0,
    parcelasProximaFatura: 0,
    parcelasAnuidadeFutura: 0
  };

  const totalParcelasMatch = text.match(/Total de parcelas a pagar:\s*(?:R\$\s*)?([\d.]+,\d{2})/i);
  if (totalParcelasMatch) {
    res.totalParcelasPendentes = parseValorBR(totalParcelasMatch[1]);
  }

  const proximaFaturaMatch = text.match(/Total de despesas parceladas a vencer na próxima fatura:\s*(?:R\$\s*)?([\d.]+,\d{2})/i);
  if (proximaFaturaMatch) {
    res.parcelasProximaFatura = parseValorBR(proximaFaturaMatch[1]);
  }

  const anuidadeMatch = text.match(/Total de parcelas a vencer da anuidade:\s*(?:R\$\s*)?([\d.]+,\d{2})/i);
  if (anuidadeMatch) {
    res.parcelasAnuidadeFutura = parseValorBR(anuidadeMatch[1]);
  }

  return res;
}


