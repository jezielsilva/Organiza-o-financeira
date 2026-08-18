/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Módulo de serviço focado exclusivamente no parsing textual de linhas de faturas (SRP).
 */

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

export interface SaldosFuturos {
  totalParcelasPendentes: number;
  parcelasProximaFatura: number;
  parcelasAnuidadeFutura: number;
}

export function parseValorBR(v: string): number {
  return parseFloat(v.replace(/\./g, "").replace(",", "."));
}

const MESES_PT = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function parseInvoiceLine(line: string): ParsedLine | null {
  const clean = line.trim();
  if (!clean || clean.length < 8) return null;

  const ignorePatterns = [
    /pagamento/i, /recebido/i, /efetuado/i, /credito/i, /crédito/i, /estorno/i,
    /deb\.aut/i, /débito automático/i, /saldo anterior/i, /total da fatura/i,
    /pagamento mínimo/i, /limite de crédito/i, /encargos/i, /juros/i, /iof/i
  ];
  if (ignorePatterns.some(pat => pat.test(clean))) {
    return null;
  }

  let dateFound = "";
  let dateRegexMatch = clean.match(/(\d{2})\/(\d{2})/);
  
  if (dateRegexMatch) {
    dateFound = dateRegexMatch[0];
  } else {
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

  const valueRegex = /([\d.]+,\d{2})(-?)\s*$/;
  const valueRegexGlobal = /([\d.]+,\d{2})(-?)/;
  
  let valueMatch = clean.match(valueRegex) || clean.match(valueRegexGlobal);
  if (!valueMatch) return null;

  const valueStr = valueMatch[1];
  const isCredit = valueMatch[2] === "-";
  const extractedValue = parseValorBR(valueStr);

  if (isNaN(extractedValue) || extractedValue <= 0) return null;

  const parcelRegex = /(?:-\s*|\s+)(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\s*$/i;
  
  let description = clean
    .replace(dateFound, "")
    .replace(valueMatch[0], "")
    .replace(/r\$\s*/i, "")
    .trim();

  const parcelMatch = description.match(parcelRegex);
  
  if (parcelMatch) {
    const current = parseInt(parcelMatch[1], 10);
    const total = parseInt(parcelMatch[2], 10);

    if (current > 0 && total >= current && total <= 120) {
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

  return {
    date: dateFound,
    description: description.replace(/\s*-\s*$/, "").trim() || "Gasto Cartão",
    isInstallment: false,
    totalValue: extractedValue,
    isCredit
  };
}

export function getPurchaseFullDate(purchaseDateDM: string, referenceMonth: string): string {
  const [refYear, refMonth] = referenceMonth.split("-").map(Number);
  const [day, month] = purchaseDateDM.split("/").map(Number);
  
  let year = refYear;
  if (month > refMonth && refMonth <= 2) {
    year = refYear - 1;
  } else if (month > refMonth + 2) {
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
    /(?:total\s+da\s+fatura\s+atual|total\s+desta\s+fatura|valor\s+total\s+da\s+fatura|total\s+a\s+pagar|fatura\s+atual)\s*(?:r\$)?\s*([\d.]+,\d{2})/i,
    /(?:fatura\s+atual|total\s+fatura|total\s+da\s+sua\s+fatura)\s*(?:r\$)?\s*([\d.]+,\d{2})/i,
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
