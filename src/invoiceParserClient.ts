/**
 * Parser de Faturas Client-Side usando pdf.js
 *
 * Extrai texto de PDFs diretamente no browser, eliminando a necessidade
 * de um backend (Express + Python/pdfplumber). Reutiliza as funções de
 * parsing já existentes em utils.ts.
 */

import * as pdfjsLib from "pdfjs-dist";
import type { CardInvoice, CardPurchase } from "./types";
import { parseInvoiceLine, extractTotalValueFromText, getPurchaseFullDate } from "./utils";

// Configura o worker do pdf.js para rodar em uma Web Worker separada.
// Usa o worker empacotado do próprio pdfjs-dist via CDN para evitar
// problemas de bundling com Vite.
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

/**
 * Extrai todo o texto legível de um arquivo PDF carregado no browser.
 */
async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const textPages: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items
      .map((item: any) => item.str)
      .join(" ");
    textPages.push(pageText);
  }

  return textPages.join("\n");
}

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

/**
 * Processa um arquivo PDF de fatura inteiramente no browser e retorna
 * um objeto CardInvoice pronto para uso pelo componente.
 *
 * @param file - O arquivo PDF selecionado pelo usuário
 * @param selectedMonth - O mês de referência no formato "AAAA-MM"
 * @returns CardInvoice com os lançamentos extraídos
 */
export async function parseInvoiceClientSide(
  file: File,
  selectedMonth: string
): Promise<CardInvoice> {
  // 1. Extrai texto do PDF
  const fullText = await extractTextFromPdf(file);

  if (!fullText || fullText.trim().length < 10) {
    throw new Error(
      "Não foi possível extrair texto do PDF. O arquivo pode estar protegido, ser escaneado (imagem), ou estar vazio."
    );
  }

  // 2. Detecta o banco
  const bankName = detectBankName(fullText);

  // 3. Extrai valor total da fatura usando a função já existente no utils.ts
  const extractedTotal = extractTotalValueFromText(fullText);

  // 4. Parseia linha a linha para extrair lançamentos
  const lines = fullText.split("\n");

  // Normaliza linhas muito longas (podem estar grudadas por tabs/espaços)
  const normalizedLines: string[] = [];
  for (const line of lines) {
    if (line.length > 120 && /\d{2}\/\d{2}/.test(line)) {
      const parts = line.split(/\s{3,}/); // divide por 3+ espaços
      normalizedLines.push(...parts.map((p) => p.trim()).filter(Boolean));
    } else {
      normalizedLines.push(line);
    }
  }

  // 5. Agrupa por portadores (lógica do parser.py)
  let currentPortador = "OUTROS";
  const purchasesByPortador: Record<string, ReturnType<typeof parseInvoiceLine>[]> = {
    OUTROS: [],
  };

  for (const line of normalizedLines) {
    const cleaned = line.trim();
    if (!cleaned) continue;

    // Verifica mudança de portador
    let foundPortador = false;
    for (const p of KNOWN_PORTADORES) {
      if (cleaned.toUpperCase().includes(p) && cleaned.length < 40) {
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

  // 6. Achata os lançamentos em uma lista única de CardPurchase
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

  const needsReview = flatPurchases.length === 0;

  // 7. Calcula o total: usa o valor extraído do cabeçalho, ou soma os lançamentos
  let totalValue = extractedTotal || 0;
  if (totalValue === 0 && flatPurchases.length > 0) {
    totalValue = flatPurchases.reduce((acc, p) => {
      return acc + (p.installmentValue || p.totalValue);
    }, 0);
    totalValue = Math.round(totalValue * 100) / 100;
  }

  // 8. Monta o objeto CardInvoice final
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
