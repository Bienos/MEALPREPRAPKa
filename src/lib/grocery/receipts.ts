/**
 * Polish receipts (paragon fiskalny) as text: redaction, parsing and the
 * anonymized form of a price I choose to share. Pure and client-safe, so a
 * pasted receipt is read in the browser and nothing leaves the phone until I
 * review it and press save.
 *
 * Text comes from pasting (on an iPhone: photo -> hold on the text -> Kopiuj)
 * or typing. Lines look like:
 *   "PIERS KURCZ.FILET KG   0,834 x23,99   20,01C"
 *   "SKYR NAT. 150G          2 *2,99        5,98 C"
 *   "CHLEB ZYTNI                            3,99 C"
 *   "Rabat                                 -1,00 C"
 *   "SUMA PLN                             45,20"
 * Anything the parser is not sure about is shown for review, never guessed
 * into a price.
 */

import { fold } from "../prices/match.ts";
import { parseZlotyText } from "./money.ts";
import type { RetailerId } from "./retailers.ts";

/* Redaction ------------------------------------------------------------------ */

/**
 * What a receipt says about me rather than about prices: card numbers,
 * terminal and transaction ids, phone numbers, e-mail, a buyer's tax number,
 * loyalty card numbers, the cashier's name, the time of day. Removed before
 * anything is stored; the date stays (it dates the prices).
 */
const REDACTIONS: [RegExp, string][] = [
  // Whole lines named by what they are, first, so the placeholders below are never redacted again.
  [/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[e-mail]"],
  [/\b(?:moja biedronka|lidl plus|karta lojalno\S*|nr klienta|klient nr)\b[^\n]*\d[^\n]*/gi, "[karta lojalnościowa]"],
  [/(?<!\[)\b(?:karta|karty|card|nr karty)\b[^\n]*/gi, "[karta]"],
  [/(?<!\[)\b(?:nip nabywcy|nip klienta)\b[^\n]*/gi, "[NIP nabywcy]"],
  [/\b(?:tid|aid|mid|arqc|atc|auth|autoryzacj\S*|kod autoryzacji|nr transakcji|nr trans\.?|transakcja nr|nr sys\.?|terminal\S*|id terminala)\b[^\n]*/gi, "[transakcja]"],
  [/\b(?:kasjer\S*|kasa nr|obsługiwał\S*|sprzedawca)\b[^\n]*/gi, "[kasa]"],
  // Then numbers, within one line (separators are spaces or hyphens, never a line break).
  [/(?:[*xX]{4}[ -]?){2,4}\d{4}\b/g, "[karta]"],
  [/\b\d(?:[ -]?\d){12,18}\b/g, "[numer]"],
  [/(?:\+48[ -]?)?\b\d{3}[ -]\d{3}[ -]\d{3}\b/g, "[telefon]"],
  [/\b([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?\b/g, "[godzina]"],
];

export function redactReceiptText(text: string): { text: string; removed: number } {
  let removed = 0;
  let result = text;
  for (const [pattern, replacement] of REDACTIONS) {
    result = result.replace(pattern, () => {
      removed++;
      return replacement;
    });
  }
  return { text: result, removed };
}

/* Abbreviations ------------------------------------------------------------- */

/** Receipt shorthand, one folded word at a time -> the Polish word. First match wins. */
const WORDS: [RegExp, string][] = [
  [/^kurcz/, "kurczaka"],
  [/^piers/, "pierś"],
  [/^(fil|filet\w*)$/, "filet"],
  [/^(indyk|indycz)/, "indyka"],
  [/^(wol|wolow\w*)$/, "wołowina"],
  [/^(miel|mielon\w*)$/, "mielone"],
  [/^(szyn|szynk\w*)$/, "szynka"],
  [/^(jog|jogurt\w*)$/, "jogurt"],
  [/^(twar|twarog\w*)$/, "twaróg"],
  [/^wiej/, "wiejski"],
  [/^chud/, "chudy"],
  [/^poltl/, "półtłusty"],
  [/^(nat|natur\w*)$/, "naturalny"],
  [/^grec/, "grecki"],
  [/^(ows|owsian\w*)$/, "owsiane"],
  [/^platk/, "płatki"],
  [/^(mak|makar\w*)$/, "makaron"],
  [/^pomid/, "pomidory"],
  [/^ogor/, "ogórki"],
  [/^(ceb|cebul\w*)$/, "cebula"],
  [/^(papr|papryk\w*)$/, "papryka"],
  [/^(piecz|pieczar\w*)$/, "pieczarki"],
  [/^(ban|banan\w*)$/, "banany"],
  [/^jabl/, "jabłka"],
  [/^ziemn/, "ziemniaki"],
  [/^(bul|bulk\w*)$/, "bułka"],
  [/^(jaj|jaja|jajk\w*)$/, "jaja"],
];

/**
 * "PIERS KURCZ.FILET KG" -> "pierś kurczaka filet" (and sold by weight).
 * Word by word: a known abbreviation becomes its Polish word, anything else
 * keeps the receipt's own letters and numbers ("1,5l" stays "1,5l"). Only a
 * reading aid for matching and review: I correct the name before saving.
 */
export function expandReceiptName(raw: string): { name: string; byWeight: boolean } {
  // Dots, commas and slashes separate words, except inside a number ("1,5").
  const words = raw
    .toLowerCase()
    .replace(/(?<!\d)[.,/]|[.,/](?!\d)/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let byWeight = false;
  const out: string[] = [];
  words.forEach((word, index) => {
    const folded = fold(word);
    if (/^(kg|luz|luzem|waz\w*)$/.test(folded)) {
      byWeight = true;
      return;
    }
    if (/^szt$/.test(folded)) return;
    // "PL OWS" is "płatki owsiane".
    if (folded === "pl" && fold(words[index + 1] ?? "").startsWith("ows")) {
      out.push("płatki");
      return;
    }
    out.push(WORDS.find(([pattern]) => pattern.test(folded))?.[1] ?? word);
  });
  return { name: out.join(" "), byWeight };
}

/* Parsing -------------------------------------------------------------------- */

export type ReceiptLine = {
  position: number;
  raw: string;
  /** Expanded, for review; I correct it before saving. */
  name: string;
  quantity: number;
  unit: "szt" | "kg";
  unitPriceGrosz: number | null;
  totalGrosz: number;
  /** A discount printed under the line ("Rabat -1,00"), applied to it. */
  discountGrosz: number;
  /** A bottle or can deposit, not food. */
  deposit: boolean;
};

export type ParsedReceipt = {
  retailer: RetailerId | null;
  /** YYYY-MM-DD when the receipt shows a date. */
  date: string | null;
  totalGrosz: number | null;
  lines: ReceiptLine[];
  /** Lines with prices that could not be read as products, for review. */
  unread: string[];
  /** Line totals less discounts match the printed sum (null when there is no sum). */
  sumMatches: boolean | null;
};

const RETAILER_MARKERS: [RegExp, RetailerId][] = [
  [/jeronimo martins|biedronka/, "biedronka"],
  [/\blidl\b/, "lidl"],
  [/kaufland/, "kaufland"],
  [/auchan/, "auchan"],
  [/carrefour/, "carrefour"],
  [/zabka/, "zabka"],
  [/dino polska|\bdino\b/, "dino"],
  [/\baldi\b/, "aldi"],
  [/\bnetto\b/, "netto"],
  [/stokrotka/, "stokrotka"],
  [/frisco/, "frisco"],
  [/intermarche/, "intermarche"],
  [/leclerc/, "leclerc"],
  [/\bspar\b/, "spar"],
  [/selgros/, "selgros"],
  [/\bmakro\b/, "makro"],
];

const AMOUNT = String.raw`-?\d+[.,]\d{2}`;
const QTY = String.raw`\d+(?:[.,]\d{1,3})?`;
/** "NAME   qty x price   total VAT" */
const ITEM_LINE = new RegExp(String.raw`^(.*?\S)\s+(${QTY})\s*(?:szt\.?|kg)?\s*[x*×]\s*(${AMOUNT})\s+(${AMOUNT})\s*([A-G])?\s*$`, "i");
/** "qty x price   total VAT" on its own line, under a name line. */
const QTY_LINE = new RegExp(String.raw`^\s*(${QTY})\s*(?:szt\.?|kg)?\s*[x*×]\s*(${AMOUNT})\s+(${AMOUNT})\s*([A-G])?\s*$`, "i");
/** "NAME   total VAT": one piece. */
const SIMPLE_LINE = new RegExp(String.raw`^(.*?[A-Za-zĄąĆćĘęŁłŃńÓóŚśŹźŻż].*?)\s{2,}(${AMOUNT})\s*([A-G])?\s*$`);
const DISCOUNT = /^\s*(rabat|opust|upust|promocja|obnizka|zniżka|znizka|kupon)\b/i;
const DEPOSIT = /\b(kaucj|opakowanie zwrotne|butelka zwrotna)\w*/i;
const TOTAL = /^\s*(suma|razem|do zap[łl]aty)\b(?:\s*pln)?\s*:?\s*(-?\d+[.,]\d{2})/i;
const NOT_ITEMS = /\b(ptu|vat|sprzed\.?\s*opod|podatek|reszta|got[oó]wka|karta|płatno|platno|wplata|wpłata|nip|paragon|fiskaln|kasa|sprzedaż|sprzedaz)\b/i;

function toQuantity(text: string): number {
  return Number(text.replace(",", "."));
}

function dateOf(text: string): string | null {
  const iso = text.match(/\b(20\d{2})[-.](\d{2})[-.](\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const pl = text.match(/\b(\d{2})[-.](\d{2})[-.](20\d{2})\b/);
  return pl ? `${pl[3]}-${pl[2]}-${pl[1]}` : null;
}

export function parseReceiptText(input: string): ParsedReceipt {
  const rawLines = input.split(/\r?\n/).map((line) => line.replace(/\s+$/, ""));
  const folded = fold(input);
  const retailer = RETAILER_MARKERS.find(([pattern]) => pattern.test(folded))?.[1] ?? null;
  const date = dateOf(input);

  const lines: ReceiptLine[] = [];
  const unread: string[] = [];
  let totalGrosz: number | null = null;
  let pendingName: string | null = null;

  const add = (raw: string, rawName: string, quantity: number, unitPrice: string | null, total: string) => {
    const totalValue = parseZlotyText(total);
    if (totalValue === null || totalValue < 0 || !(quantity > 0)) {
      unread.push(raw);
      return;
    }
    const { name, byWeight } = expandReceiptName(rawName);
    const fractional = !Number.isInteger(quantity);
    lines.push({
      position: lines.length,
      raw,
      name,
      quantity,
      unit: byWeight || fractional ? "kg" : "szt",
      unitPriceGrosz: unitPrice ? parseZlotyText(unitPrice) : quantity === 1 ? totalValue : null,
      totalGrosz: totalValue,
      discountGrosz: 0,
      deposit: DEPOSIT.test(rawName),
    });
  };

  for (const raw of rawLines) {
    const line = raw.trim();
    if (!line) continue;
    const total = line.match(TOTAL);
    if (total) {
      totalGrosz = parseZlotyText(total[2]);
      pendingName = null;
      continue;
    }
    if (DISCOUNT.test(line)) {
      const amount = parseZlotyText(line);
      const last = lines[lines.length - 1];
      if (amount !== null && last) last.discountGrosz += Math.abs(amount);
      else unread.push(raw);
      continue;
    }
    const item = line.match(ITEM_LINE);
    if (item && !NOT_ITEMS.test(item[1])) {
      add(raw, item[1], toQuantity(item[2]), item[3], item[4]);
      pendingName = null;
      continue;
    }
    const qty = line.match(QTY_LINE);
    if (qty && pendingName) {
      add(`${pendingName} ${raw.trim()}`, pendingName, toQuantity(qty[1]), qty[2], qty[3]);
      pendingName = null;
      continue;
    }
    const simple = line.match(SIMPLE_LINE);
    if (simple && !NOT_ITEMS.test(simple[1])) {
      add(raw, simple[1], 1, null, simple[2]);
      pendingName = null;
      continue;
    }
    // A name with no amount may be followed by its quantity line.
    if (/[a-ząćęłńóśźż]{3}/i.test(line) && !/\d+[.,]\d{2}/.test(line) && !NOT_ITEMS.test(line)) {
      pendingName = line;
      continue;
    }
    pendingName = null;
    if (/\d+[.,]\d{2}/.test(line) && !NOT_ITEMS.test(line) && !dateOf(line)) unread.push(raw);
  }

  const sum = lines.reduce((acc, one) => acc + one.totalGrosz - one.discountGrosz, 0);
  return {
    retailer,
    date,
    totalGrosz,
    lines,
    unread,
    sumMatches: totalGrosz === null ? null : Math.abs(sum - totalGrosz) <= 1,
  };
}

/* Prices and sharing ---------------------------------------------------------- */

/**
 * What one unit cost on this receipt, after its discount: per kilo for
 * goods sold by weight, per piece otherwise. null for a deposit.
 */
export function linePrice(line: Pick<ReceiptLine, "quantity" | "unit" | "totalGrosz" | "discountGrosz" | "deposit">): {
  amountGrosz: number;
  per: "pack" | "kg";
} | null {
  if (line.deposit || !(line.quantity > 0)) return null;
  const paid = line.totalGrosz - line.discountGrosz;
  if (paid <= 0) return null;
  return { amountGrosz: Math.round(paid / line.quantity), per: line.unit === "kg" ? "kg" : "pack" };
}

export type Contribution = {
  retailer: RetailerId | null;
  city: string | null;
  /** The day only: never the time. */
  observedOn: string;
  productName: string;
  gtin: string | null;
  amountGrosz: number;
  per: "pack" | "kg";
};

/**
 * One line as I would share it: the chain, the town, the day, the product
 * and its price. Not the shop's address, not the time, not the receipt
 * total, not the other things I bought, not how I paid.
 */
export function toContribution(
  line: Pick<ReceiptLine, "name" | "quantity" | "unit" | "totalGrosz" | "discountGrosz" | "deposit"> & { gtin?: string | null },
  receipt: { retailer: RetailerId | null; city: string | null; date: string },
): Contribution | null {
  const price = linePrice(line);
  if (!price) return null;
  return {
    retailer: receipt.retailer,
    city: receipt.city,
    observedOn: receipt.date.slice(0, 10),
    productName: line.name,
    gtin: line.gtin ?? null,
    amountGrosz: price.amountGrosz,
    per: price.per,
  };
}

/** The queue as CSV, columns close to Open Prices' price fields, for me to upload myself. */
export function contributionsCsv(rows: Contribution[]): string {
  const header = ["date", "retailer", "city", "product_name", "product_code", "price", "currency", "price_per"];
  const escape = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  return [
    header.join(","),
    ...rows.map((row) =>
      [
        row.observedOn,
        row.retailer ?? "",
        row.city ?? "",
        row.productName,
        row.gtin ?? "",
        (row.amountGrosz / 100).toFixed(2),
        "PLN",
        row.per === "kg" ? "KILOGRAM" : "UNIT",
      ]
        .map((value) => escape(String(value)))
        .join(","),
    ),
  ].join("\n");
}
