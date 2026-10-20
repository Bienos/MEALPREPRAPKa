/**
 * Money in integer grosz (1 zł = 100 gr), so sums never drift the way
 * 0.1 + 0.2 does. Złoty appear only at the edges: reading a source and
 * showing a number. Pure, client-safe.
 */

export type Grosz = number;

/** 12.99 -> 1299. Throws on a value that is not a finite amount, so a bad source never becomes a price. */
export function toGrosz(zloty: number): Grosz {
  if (!Number.isFinite(zloty)) throw new Error(`Not an amount: ${zloty}`);
  return Math.round(zloty * 100);
}

export function toZloty(grosz: Grosz): number {
  return grosz / 100;
}

/** "12,99 zł" */
export function formatGrosz(grosz: Grosz): string {
  const sign = grosz < 0 ? "−" : "";
  const abs = Math.abs(grosz);
  return `${sign}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")} zł`;
}

/** "12,99", "12.99 zł", "12,99zł", "1 299,00" -> grosz; null when no amount is there. */
export function parseZlotyText(text: string): Grosz | null {
  const match = text.replace(/ /g, " ").match(/(-?)(\d{1,3}(?:[ ]\d{3})+|\d+)[,.](\d{2})(?!\d)/);
  if (!match) return null;
  const grosz = Number(match[2].replace(/ /g, "")) * 100 + Number(match[3]);
  return match[1] === "-" ? -grosz : grosz;
}

/** Sum of grosz amounts (integers stay integers). */
export function sumGrosz(values: Grosz[]): Grosz {
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * A share of a price, rounded to the grosz the way a till does (half up):
 * 0.834 kg at 23,99 zł/kg = 20,01 zł.
 */
export function multiplyGrosz(grosz: Grosz, factor: number): Grosz {
  return Math.round(grosz * factor + 1e-9);
}
