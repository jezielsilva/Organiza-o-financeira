/**
 * Parser de Faturas Client-Side usando pdf.js
 *
 * Extrai texto de PDFs diretamente no browser, eliminando a necessidade
 * de um backend (Express + Python/pdfplumber). Reutiliza as funções de
 * parsing já existentes em utils.ts.
 *
 * Suporta faturas com layout de 2 colunas (ex: Carrefour Gold Mastercard).
 */

import * as pdfjsLib from "pdfjs-dist";
import type { CardInvoice, CardPurchase } from "./types";
import { parseInvoiceLine, extractTotalValueFromText, getPurchaseFullDate } from "./utils";

// Configura o worker do pdf.js para rodar em uma Web Worker separada.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// ─── Helpers de extração de texto do PDF ────────────────────────────────────

/**
 * Agrupa itens de texto do pdf.js em linhas baseando-se nas coordenadas Y.
 * Itens na mesma faixa de Y (+-3px) são considerados da mesma linha.
 */
function buildLinesFromItems(items: any[]): string {
  if (items.length === 0) return "";

  // Ordena: Y decrescente (topo → base da página), depois X crescente (esquerda → direita)
  items.sort((a: any, b: any) => {
    const yDiff = b.transform[5] - a.transform[5];
    if (Math.abs(yDiff) > 3) return yDiff;
    return a.transform[4] - b.transform[4];
  });

  const lines: string[] = [];
  let currentY = items[0].transform[5];
  let currentLineItems: string[] = [];

  for (const item of items) {
    const y = item.transform[5];

    if (Math.abs(y - currentY) > 3) {
      if (currentLineItems.length > 0) {
        lines.push(currentLineItems.join(" "));
      }
      currentLineItems = [item.str];
      currentY = y;
    } else {
      currentLineItems.push(item.str);
    }
  }

  if (currentLineItems.length > 0) {
    lines.push(currentLineItems.join(" "));
  }

  return lines.join("\n");
}

/**
 * Extrai o texto de uma página do PDF, detectando automaticamente layouts
 * de 2 colunas (como a fatura Carrefour) e separando cada coluna para
 * evitar mesclagem de transações de colunas diferentes.
 *
 * Detecção de colunas:
 * - Busca itens que são datas no formato DD/MM (início de cada transação)
 * - Analisa as posições X dessas datas
 * - Se houver um gap > 100px entre dois clusters de datas, é layout de 2 colunas
 * - Separa itens em esquerda/direita e processa cada coluna independentemente
 */
async function extractTextFromPage(pdf: any, pageNum: number): Promise<string> {
  const page = await pdf.getPage(pageNum);
  const content = await page.getTextContent();
  const items = (content.items as any[]).filter((item: any) => item.str.trim().length > 0);

  if (items.length === 0) return "";

  // --- Detecção de layout multi-coluna usando posições X de datas ---
  const dateItems = items.filter((item: any) => /^\d{2}\/\d{2}$/.test(item.str.trim()));

  let columnSplitX = -1;

  if (dateItems.length >= 6) {
    const dateXPositions = dateItems
      .map((item: any) => item.transform[4])
      .sort((a: number, b: number) => a - b);

    // Procura o maior gap entre posições X consecutivas de datas
    let maxGap = 0;
    let gapIdx = 0;
    for (let i = 1; i < dateXPositions.length; i++) {
      const gap = dateXPositions[i] - dateXPositions[i - 1];
      if (gap > maxGap) {
        maxGap = gap;
        gapIdx = i;
      }
    }

    // Gap > 100 pontos indica 2 colunas
    if (maxGap > 100) {
      // O ponto de corte é logo antes da primeira data da coluna direita
      const rightColumnFirstDateX = dateXPositions[gapIdx];
      columnSplitX = rightColumnFirstDateX - 10;
    }
  }

  if (columnSplitX > 0) {
    // Layout de 2 colunas detectado!
    // Separa itens por posição X: esquerda vs direita do ponto de corte
    const leftItems = items.filter((item: any) => item.transform[4] < columnSplitX);
    const rightItems = items.filter((item: any) => item.transform[4] >= columnSplitX);

    const leftText = buildLinesFromItems(leftItems);
    const rightText = buildLinesFromItems(rightItems);

    // Coluna esquerda primeiro, depois coluna direita
    return leftText + "\n" + rightText;
  }

  // Layout de coluna única
  return buildLinesFromItems(items);
}

// ─── Detecção e Configuração ────────────────────────────────────────────────

/**
 * Detecta o banco emissor da fatura a partir do texto extraído.
 */
function detectBankName(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("itau") || lower.includes("itaú")) return "Itaú";
  if (lower.includes("nubank")) return "Nubank";
  if (lower.includes("inter")) return "Banco Inter";
  if (lower.includes("bradesco")) return "Bradesco";
  if (lower.includes("santander")) return "Santander";
  return "Carrefour Banco"; // Default
}

/**
 * Portadores conhecidos — nomes de titulares que podem aparecer em faturas
 * (especialmente Carrefour) para agrupar lançamentos.
 */
const KNOWN_PORTADORES = ["SILVIA SILVA", "BARBARA B PIERONI", "JEZIEL SANTOS"];

// ─── Parser Principal ───────────────────────────────────────────────────────

/**
 * Processa um arquivo PDF de fatura inteiramente no browser e retorna
 * um objeto CardInvoice pronto para uso pelo componente.
 *
 * Fluxo:
 * 1. Lê a PRIMEIRA página → extrai banco emissor e valor total da fatura
 * 2. Lê a ÚLTIMA página → extrai os lançamentos (gastos) detalhados
 * 3. Filtra apenas o que está abaixo de "LANÇAMENTOS NO BRASIL"
 * 4. Detecta portadores e parseia cada transação
 *
 * @param file - O arquivo PDF selecionado pelo usuário
 * @param selectedMonth - O mês de referência no formato "AAAA-MM"
 * @returns CardInvoice com os lançamentos extraídos
 */
export async function parseInvoiceClientSide(
  file: File,
  selectedMonth: string
): Promise<CardInvoice> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  if (pdf.numPages === 0) {
    throw new Error("O arquivo PDF está vazio ou corrompido.");
  }

  // 1. Lemos a primeira página para pegar informações do cabeçalho (Banco, Total)
  const firstPageText = await extractTextFromPage(pdf, 1);
  const bankName = detectBankName(firstPageText);
  let totalValue = extractTotalValueFromText(firstPageText) || 0;

  // 2. Lemos a ÚLTIMA página para pegar as transações detalhadas (gastos)
  const lastPageNum = pdf.numPages;
  const lastPageText = await extractTextFromPage(pdf, lastPageNum);

  // 3. Parseia linha a linha da ÚLTIMA página
  const lines = lastPageText.split("\n");

  // Localiza "LANÇAMENTOS NO BRASIL" para descartar tudo acima (cabeçalhos, limites, etc.)
  let startIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].toUpperCase();
    if (upper.includes("LANÇAMENTOS NO BRASIL") || upper.includes("LANCAMENTOS NO BRASIL") || upper.includes("LANÇAMENTOS NACIONAIS")) {
      startIndex = i + 1; // Começa na linha SEGUINTE ao cabeçalho
      break;
    }
  }

  const linesAfterHeader = lines.slice(startIndex);

  // Normaliza linhas muito longas que possam conter sub-linhas grudadas
  const normalizedLines: string[] = [];
  for (const line of linesAfterHeader) {
    if (line.length > 120 && /\d{2}\/\d{2}/.test(line)) {
      const parts = line.split(/\s{3,}/);
      normalizedLines.push(...parts.map((p) => p.trim()).filter(Boolean));
    } else {
      normalizedLines.push(line);
    }
  }

  // 4. Agrupa por portadores e extrai transações
  let currentPortador = "OUTROS";
  const purchasesByPortador: Record<string, ReturnType<typeof parseInvoiceLine>[]> = {
    OUTROS: [],
  };

  for (const line of normalizedLines) {
    const cleaned = line.trim();
    if (!cleaned) continue;

    // Ignora linhas de totais e cabeçalhos de tabela
    const upperCleaned = cleaned.toUpperCase();
    if (
      upperCleaned.includes("TOTAL DA FATURA") ||
      upperCleaned.includes("SALDO FATURA ANTERIOR") ||
      upperCleaned.includes("DATA DESCRIÇÃO") ||
      upperCleaned.includes("VALOR R$")
    ) {
      continue;
    }

    // Verifica se a linha indica mudança de portador
    let foundPortador = false;
    for (const p of KNOWN_PORTADORES) {
      if (upperCleaned.includes(p) && cleaned.length < 50) {
        currentPortador = p;
        if (!purchasesByPortador[currentPortador]) {
          purchasesByPortador[currentPortador] = [];
        }
        foundPortador = true;
        break;
      }
    }
    if (foundPortador) continue;

    // Tenta parsear a linha como um lançamento
    const parsed = parseInvoiceLine(cleaned);
    if (parsed && !parsed.isCredit) {
      if (!purchasesByPortador[currentPortador]) {
        purchasesByPortador[currentPortador] = [];
      }
      purchasesByPortador[currentPortador].push(parsed);
    }
  }

  // 5. Achata os lançamentos em uma lista única de CardPurchase
  const flatPurchases: CardPurchase[] = [];
  let purchaseIndex = 0;

  for (const [portador, items] of Object.entries(purchasesByPortador)) {
    for (const item of items) {
      if (!item) continue;

      const fullDate = getPurchaseFullDate(item.date, selectedMonth);

      flatPurchases.push({
        id: `pur-${Date.now()}-${purchaseIndex++}-${Math.random().toString(36).substr(2, 4)}`,
        description: item.description || "Compra Sem Nome",
        category: "Geral",
        purchaseDate: fullDate,
        totalValue: item.totalValue,
        isInstallment: item.isInstallment,
        installmentCurrent: item.installmentCurrent,
        installmentTotal: item.installmentTotal,
        installmentValue: item.installmentValue,
        installmentsRemaining:
          item.isInstallment && item.installmentTotal && item.installmentCurrent
            ? item.installmentTotal - item.installmentCurrent
            : undefined,
      });
    }
  }

  // Se não conseguimos extrair o total da primeira página, somamos os gastos
  if (totalValue === 0 && flatPurchases.length > 0) {
    totalValue = flatPurchases.reduce((acc, p) => {
      return acc + (p.installmentValue || p.totalValue);
    }, 0);
    totalValue = Math.round(totalValue * 100) / 100;
  }

  const needsReview = flatPurchases.length === 0;

  // 6. Monta o objeto CardInvoice final
  const cardInvoice: CardInvoice = {
    id: `inv-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    referenceMonth: selectedMonth,
    uploadedAt: new Date().toISOString(),
    fileName: file.name,
    totalValue,
    purchases: flatPurchases,
    parsedAt: new Date().toISOString(),
    needsReview,
  };

  return cardInvoice;
}
