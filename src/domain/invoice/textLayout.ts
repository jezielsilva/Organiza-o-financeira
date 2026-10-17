/**
 * Reconstrói linhas de texto a partir dos fragmentos posicionados que o pdf.js
 * devolve. Faturas como a do Carrefour têm duas colunas de lançamentos por
 * página; cada coluna vira uma sequência própria de linhas, e a ordem final é
 * página 1 (esq → dir), página 2 (esq → dir)… — a mesma ordem de leitura humana.
 */

export interface TextItem {
  x: number;
  y: number;
  str: string;
}

const LINE_TOLERANCE = 3;
const MIN_COLUMN_GAP = 100;
const DATE_ONLY = /^\d{2}\/\d{2}$/;

export function groupIntoLines(items: TextItem[]): string[] {
  const sorted = items
    .filter((item) => item.str.trim().length > 0)
    .sort((a, b) => (Math.abs(b.y - a.y) > LINE_TOLERANCE ? b.y - a.y : a.x - b.x));

  const lines: string[] = [];
  let current: TextItem[] = [];
  let currentY = Number.NaN;

  const flush = () => {
    if (current.length === 0) return;
    current.sort((a, b) => a.x - b.x);
    lines.push(current.map((item) => item.str.trim()).join(" ").replace(/\s+/g, " "));
  };

  for (const item of sorted) {
    if (current.length > 0 && Math.abs(item.y - currentY) > LINE_TOLERANCE) {
      flush();
      current = [];
    }
    if (current.length === 0) currentY = item.y;
    current.push(item);
  }
  flush();
  return lines;
}

/** Posição X que separa duas colunas de lançamentos, ou `null` se a página tem uma coluna só. */
export function findColumnSplit(items: TextItem[]): number | null {
  const dateXs = items
    .filter((item) => DATE_ONLY.test(item.str.trim()))
    .map((item) => item.x)
    .sort((a, b) => a - b);
  if (dateXs.length < 4) return null;

  let maxGap = 0;
  let splitAt = -1;
  for (let i = 1; i < dateXs.length; i++) {
    const gap = dateXs[i] - dateXs[i - 1];
    if (gap > maxGap) {
      maxGap = gap;
      splitAt = i;
    }
  }
  return maxGap > MIN_COLUMN_GAP ? dateXs[splitAt] - 10 : null;
}

export function pageToLines(items: TextItem[]): string[] {
  const split = findColumnSplit(items);
  if (split === null) return groupIntoLines(items);
  return [
    ...groupIntoLines(items.filter((item) => item.x < split)),
    ...groupIntoLines(items.filter((item) => item.x >= split)),
  ];
}

export function documentToLines(pages: TextItem[][]): string[] {
  return pages.flatMap(pageToLines);
}
