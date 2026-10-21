/**
 * GTIN (EAN) barcodes: validation by check digit and one canonical form, so
 * "5900820027834", "05900820027834" and "590 0820 027834" are one product.
 * Pure, client-safe.
 *
 * A valid check digit says the number is well formed, not that it names a
 * product or that the product is sold in Poland. Codes in the restricted
 * ranges (in-store codes for weighed goods, a chain's own short codes) mean
 * something only inside that chain and are never matched across retailers.
 */

const LENGTHS = new Set([8, 12, 13, 14]);

/** Digits only; null when what is left cannot be a GTIN length. */
export function cleanGtin(raw: string): string | null {
  const digits = raw.replace(/[\s-]/g, "");
  if (!/^\d+$/.test(digits) || !LENGTHS.has(digits.length)) return null;
  return digits;
}

/** The GS1 mod-10 check: weights 3 and 1 from the right, the last digit makes the sum a multiple of 10. */
export function hasValidCheckDigit(digits: string): boolean {
  let sum = 0;
  for (let index = digits.length - 2, weight = 3; index >= 0; index--, weight = weight === 3 ? 1 : 3) {
    sum += Number(digits[index]) * weight;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

export function isValidGtin(raw: string): boolean {
  const digits = cleanGtin(raw);
  return digits !== null && hasValidCheckDigit(digits);
}

/** The 14-digit form stored in the database, or null for an invalid code. */
export function canonicalGtin(raw: string): string | null {
  const digits = cleanGtin(raw);
  if (!digits || !hasValidCheckDigit(digits)) return null;
  return digits.padStart(14, "0");
}

/** The code as people know it: GTIN-14 with leading zeros dropped back to 13 or 8 digits. */
export function displayGtin(canonical: string): string {
  if (canonical.startsWith("000000")) return canonical.slice(6);
  if (canonical.startsWith("0")) return canonical.slice(1);
  return canonical;
}

/**
 * Restricted circulation numbers: EAN-13 starting 02, 04 or 2 (weighed and
 * in-store items) and EAN-8 starting 0 or 2 (a retailer's own codes, like
 * Lidl's "20482077"). Not a global product identity.
 */
export function isRestrictedGtin(canonical: string): boolean {
  const code = displayGtin(canonical);
  if (code.length === 8) return code[0] === "0" || code[0] === "2";
  if (code.length === 13) return code[0] === "2" || code.startsWith("02") || code.startsWith("04");
  return false;
}

/**
 * "590…" is the GS1 Polska prefix range. It says where the brand owner
 * registered the code, not where the product is made or sold.
 */
export function hasPolishPrefix(canonical: string): boolean {
  return displayGtin(canonical).startsWith("590");
}
