/**
 * Extrai o texto posicionado de TODAS as páginas de um PDF, no navegador.
 * O worker do pdf.js é empacotado junto com o app (antes vinha de uma CDN, o
 * que quebrava a leitura offline no PWA).
 */

import type { TextItem } from "../../domain/invoice/textLayout";

export class PdfReadError extends Error {}

export async function readPdfText(file: File, onProgress?: (page: number, total: number) => void): Promise<TextItem[][]> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;

  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") {
      throw new PdfReadError("Este PDF está protegido por senha. Baixe a fatura sem senha no app do banco e tente de novo.");
    }
    throw new PdfReadError("Não consegui abrir este arquivo. Confira se é um PDF válido.");
  }

  const pages: TextItem[][] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    onProgress?.(n, pdf.numPages);
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items: TextItem[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      items.push({ x: item.transform[4], y: item.transform[5], str: item.str });
    }
    pages.push(items);
  }
  await task.destroy();
  return pages;
}
