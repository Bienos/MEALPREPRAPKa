/**
 * Polish product names, made comparable: folded letters, a few English names
 * translated (Open Food Facts and Open Prices often carry them), and the
 * attributes that tell variants of one product apart. Pure, client-safe.
 *
 * Attributes are read only from words that say them ("chudy", "2%",
 * "basmati", "L"); a name that says nothing about fat has no fat attribute,
 * which the matcher treats as unknown, never as a match.
 */

import { fold } from "../prices/match.ts";

export { fold };

/** Lowercase ASCII words: "Pierś z kurczaka, 1 kg" -> ["piers", "z", "kurczaka", "1", "kg"]. */
export function tokens(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9%]+/)
    .filter(Boolean);
}

/** Folded, single-spaced: the stored `normalized_name`. */
export function normalizeName(text: string): string {
  return tokens(text).join(" ");
}

/**
 * English product words with their Polish equivalent appended, so the Polish
 * keyword rules can read "Virgin Olive Oil" or "Chicken breast fillet".
 * Applied to folded text.
 */
const ENGLISH: [RegExp, string][] = [
  [/\bchicken breast\b|\bchicken fillet\b/, "filet z piersi kurczaka"],
  [/\bchicken\b/, "kurczak"],
  [/\bturkey\b/, "indyk"],
  [/\bbeef\b/, "wolowina"],
  [/\bpork\b/, "wieprzowina"],
  [/\bsalmon\b/, "losos"],
  [/\btuna\b/, "tunczyk"],
  [/\beggs?\b/, "jaja"],
  [/\bcottage cheese\b/, "serek wiejski"],
  [/\bgreek yog(h)?urt\b/, "jogurt grecki"],
  [/\bnatural yog(h)?urt\b|\bplain yog(h)?urt\b/, "jogurt naturalny"],
  [/\byog(h)?urt\b/, "jogurt"],
  [/\bmilk\b/, "mleko"],
  [/\bcheese\b/, "ser"],
  [/\bolive oil\b/, "oliwa z oliwek"],
  [/\brapeseed oil\b/, "olej rzepakowy"],
  [/\brice\b/, "ryz"],
  [/\bpasta\b|\bspaghetti\b/, "makaron"],
  [/\boats?\b|\boat flakes\b|\brolled oats\b/, "platki owsiane"],
  [/\bbread\b/, "chleb"],
  [/\bpotato(es)?\b/, "ziemniaki"],
  [/\btomato(es)?\b/, "pomidor"],
  [/\bcucumbers?\b/, "ogorek"],
  [/\bonions?\b/, "cebula"],
  [/\bpeppers?\b|\bpaprika\b/, "papryka"],
  [/\bmushrooms?\b/, "pieczarki"],
  [/\bbeans?\b/, "fasola"],
  [/\bcorn\b|\bsweetcorn\b/, "kukurydza"],
  [/\bbananas?\b/, "banan"],
  [/\bapples?\b/, "jablko"],
  [/\bhoney\b/, "miod"],
  [/\bpeanut butter\b/, "maslo orzechowe"],
  [/\bfrozen\b/, "mrozone"],
  [/\bsoy sauce\b/, "sos sojowy"],
];

/** Folded text with Polish words added for English ones; Polish text comes back unchanged. */
export function withPolish(text: string): string {
  const folded = fold(text);
  const added = ENGLISH.filter(([pattern]) => pattern.test(folded)).map(([, polish]) => polish);
  return added.length > 0 ? `${folded} ${added.join(" ")}` : folded;
}

/* Variants ------------------------------------------------------------------ */

export type FatLevel = "low" | "mid" | "full";
export type ProductState = "cooked" | "smoked" | "frozen" | "canned" | "dried";

export type Variant = {
  fat?: { level?: FatLevel; percent?: number };
  rice?: "basmati" | "jasminowy" | "brazowy" | "parboiled" | "dlugoziarnisty" | "sushi" | "dziki" | "arborio";
  eggSize?: "S" | "M" | "L" | "XL";
  state?: ProductState;
  wholegrain?: boolean;
  lactoseFree?: boolean;
  organic?: boolean;
  extraVirgin?: boolean;
};

/** Which family a product's fat words and percentages belong to, for the thresholds below. */
type Family = "twarog" | "mleko" | "jogurt" | "ser" | "mieso";

function familyOf(folded: string): Family | null {
  if (/twarog|twarozek/.test(folded)) return "twarog";
  if (/\bjogurt|skyr/.test(folded)) return "jogurt";
  if (/\bmleko\b|\bmleka\b/.test(folded) && !/kokos|czekolad/.test(folded)) return "mleko";
  if (/mozzarell|\bfeta\b|\bser\b|gouda|edam|serek/.test(folded)) return "ser";
  if (/wolow|indyk|indycz|kurcz|wieprz|mielon/.test(folded)) return "mieso";
  return null;
}

/** Highest fat percent each level allows, per family (a typical Polish label). */
const FAT_LIMITS: Record<Family, { low: number; mid: number }> = {
  twarog: { low: 1, mid: 5 },
  mleko: { low: 0.5, mid: 2 },
  jogurt: { low: 1, mid: 3 },
  ser: { low: 12, mid: 20 },
  mieso: { low: 5, mid: 15 },
};

export function fatLevelOf(percent: number, family: Family | null): FatLevel | null {
  if (!family) return null;
  const limits = FAT_LIMITS[family];
  return percent <= limits.low ? "low" : percent <= limits.mid ? "mid" : "full";
}

/** First that fits wins: basmati is long-grain too, but a bag that says basmati is basmati. */
const RICE_TYPES: [RegExp, NonNullable<Variant["rice"]>][] = [
  [/basmati/, "basmati"],
  [/jasmin/, "jasminowy"],
  [/brazow|pelnoziarn/, "brazowy"],
  [/parboil/, "parboiled"],
  [/sushi/, "sushi"],
  [/\bdziki/, "dziki"],
  [/arborio|risotto/, "arborio"],
  [/dlugoziarn/, "dlugoziarnisty"],
];

/** The variant attributes a name states. */
export function variantOf(name: string): Variant {
  const text = withPolish(name);
  const variant: Variant = {};
  const family = familyOf(text);

  // Fat: words first, then a percentage where the family makes it a fat content.
  let level: FatLevel | undefined;
  if (/\bbez ?tluszcz|beztluszcz|\b0 ?% ?tluszcz/.test(text)) level = "low";
  else if (/poltlust/.test(text)) level = "mid";
  else if (/pelnotlust|\btlust/.test(text)) level = "full";
  else if (/\bchud|\blight\b|\blekk(i|a|ie)\b|\bfit\b|\bzero tluszczu/.test(text)) level = "low";
  const percentMatch = family ? text.match(/(\d+(?:[.,]\d+)?)\s*%/) : null;
  const percent = percentMatch ? Number(percentMatch[1].replace(",", ".")) : undefined;
  if (level !== undefined || percent !== undefined) {
    variant.fat = {};
    if (level !== undefined) variant.fat.level = level;
    if (percent !== undefined && percent <= 60) variant.fat.percent = percent;
  }

  if (/\bryz/.test(text)) {
    const rice = RICE_TYPES.find(([pattern]) => pattern.test(text))?.[1];
    if (rice) variant.rice = rice;
  }

  if (/\bjaj/.test(text)) {
    const size = text.match(/\b(xl|l|m|s)\b(?!\s*(?:g|kg|ml))/)?.[1];
    if (size) variant.eggSize = size.toUpperCase() as Variant["eggSize"];
  }

  if (/mrozon|mrozone|frozen/.test(text)) variant.state = "frozen";
  else if (/wedzon/.test(text)) variant.state = "smoked";
  else if (/gotowan|gotowy|gotowe|pieczon|grillowan|smazon|sous vide|\bmicrowave|mikrofal/.test(text)) variant.state = "cooked";
  else if (/w puszce|\bpuszk|konserw|w zalewie|w sosie wlasnym|w oleju/.test(text)) variant.state = "canned";
  else if (/suszon/.test(text)) variant.state = "dried";

  if (/pelnoziarn|razow|graham|\bwholegrain|whole grain/.test(text)) variant.wholegrain = true;
  if (/bez laktozy|lactose free|laktozy 0/.test(text)) variant.lactoseFree = true;
  if (/\bbio\b|\beko\b|ekologiczn|organic/.test(text)) variant.organic = true;
  if (/extra virgin|extra vergine|z pierwszego tloczenia/.test(text)) variant.extraVirgin = true;
  return variant;
}

export { familyOf };

/* Kinds ---------------------------------------------------------------------- */

/**
 * Within a family, kinds that are different products: raspberries are not
 * strawberries, penne is not spaghetti, a yellow pepper is not a red one.
 * The family is read from the item; the kind from both.
 */
const KIND_FAMILIES: { family: RegExp; label: string; kinds: [RegExp, string][] }[] = [
  {
    family: /truskaw|malin|borowk|jagod/,
    label: "owoc",
    kinds: [[/truskaw/, "truskawki"], [/malin/, "maliny"], [/borowk/, "borówki"], [/jagod/, "jagody"]],
  },
  {
    family: /makaron|spaghetti|penne|fusilli|swiderk|tagliatelle|farfalle|kokardk|rigatoni|muszel|nitk|lasagn|kolank/,
    label: "kształt makaronu",
    kinds: [
      [/spaghetti/, "spaghetti"],
      [/penne|piorka|piora/, "penne"],
      [/fusilli|swiderk/, "świderki"],
      [/tagliatelle|wstazk/, "tagliatelle"],
      [/farfalle|kokardk/, "kokardki"],
      [/rigatoni/, "rigatoni"],
      [/muszel|conchigl/, "muszelki"],
      [/\bnitk/, "nitki"],
      [/lasagn/, "lasagne"],
      [/kolank|kolanka/, "kolanka"],
      [/udon/, "udon"],
    ],
  },
  {
    family: /\bser\b|gouda|edam|cheddar|ementa|maasdam|tylzyck|podlask|parmez/,
    label: "rodzaj sera",
    kinds: [
      [/gouda/, "gouda"],
      [/edam/, "edam"],
      [/cheddar/, "cheddar"],
      [/ementa/, "ementaler"],
      [/maasdam/, "maasdam"],
      [/tylzyck/, "tylżycki"],
      [/podlask/, "podlaski"],
      [/parmez|parmigian/, "parmezan"],
      [/carsk/, "carski"],
      [/\bkrem/, "kremowy"],
    ],
  },
  {
    family: /papryk|cebul|fasol/,
    label: "kolor",
    kinds: [[/czerwon/, "czerwona"], [/zolt/, "żółta"], [/zielon/, "zielona"], [/\bbial/, "biała"], [/czarn/, "czarna"]],
  },
  {
    family: /pomidor/,
    label: "odmiana pomidorów",
    kinds: [[/koktajl|cherry|czeresn/, "koktajlowe"], [/malinow/, "malinowe"], [/bawole serce/, "bawole serce"]],
  },
  {
    family: /\bmiod/,
    label: "rodzaj miodu",
    kinds: [
      [/wielokwiat/, "wielokwiatowy"],
      [/lipow/, "lipowy"],
      [/gryczan/, "gryczany"],
      [/\blesn/, "leśny"],
      [/akacj/, "akacjowy"],
      [/rzepak/, "rzepakowy"],
      [/spadziow/, "spadziowy"],
    ],
  },
  {
    family: /\bjaj/,
    label: "chów",
    kinds: [
      [/ekolog|\bbio\b|\bchow 0\b/, "ekologiczne"],
      [/wolnego wybiegu|wolny wybieg|z wybiegu/, "z wolnego wybiegu"],
      [/sciolk|scielk/, "ściółkowe"],
      [/klatk/, "klatkowe"],
    ],
  },
  {
    family: /chleb|pieczyw|\bbulk/,
    label: "mąka",
    kinds: [[/zytn/, "żytni"], [/pszenn/, "pszenny"], [/orkisz/, "orkiszowy"], [/graham/, "graham"], [/wieloziarn/, "wieloziarnisty"]],
  },
  {
    family: /jogurt/,
    label: "rodzaj jogurtu",
    kinds: [[/grecki|greek|typu greckiego/, "grecki"], [/naturaln/, "naturalny"]],
  },
];

export type KindCheck = { label: string; need: string; product: string | "mix" | null };

/**
 * For each family the item belongs to and names a kind of: the product's
 * kind (null when it names none, "mix" when it names several).
 */
export function compareKinds(needName: string, productName: string): KindCheck[] {
  const need = withPolish(needName);
  const product = withPolish(productName);
  const checks: KindCheck[] = [];
  for (const family of KIND_FAMILIES) {
    if (!family.family.test(need)) continue;
    const needKind = family.kinds.find(([pattern]) => pattern.test(need))?.[1];
    if (!needKind) continue;
    const found = [...new Set(family.kinds.filter(([pattern]) => pattern.test(product)).map(([, kind]) => kind))];
    // "Jogurt grecki naturalny" is a Greek yogurt: the first kind listed wins inside one name.
    const productKind = family.label === "rodzaj jogurtu" ? (found[0] ?? null) : found.length > 1 ? "mix" : (found[0] ?? null);
    checks.push({ label: family.label, need: needKind, product: productKind });
  }
  return checks;
}

/** Words a kind, an attribute or a family already accounts for, so they are not asked for twice. */
const ACCOUNTED =
  /^(z|ze|w|we|do|na|i|bez|lub|typu|oraz|the|of|pieczywo|owoce|warzywa|mieso|ser|makaron|chudy|chuda|chude|light|lekki|lekka|lekkie|poltlusty|poltlusta|tlusty|tlusta|pelnotlusty|fit|gotowy|gotowa|gotowe|gotowany|microwave|mrozone|mrozony|mrozona|konserwowa|konserwowy|bio|eko|extra|virgin|pelnoziarnisty|pelnoziarnista|razowy|razowa|naturalny|naturalna|grecki|szt|kg|g|ml|l)$/;

/** Start of a word, enough to catch its other forms: "kurczaka" -> "kurcz", "jajka" -> "jaj". */
export function wordStem(word: string): string {
  const folded = fold(word);
  if (/^jaj/.test(folded)) return "jaj";
  if (folded.length <= 4) return folded;
  return folded.length <= 7 ? folded.slice(0, folded.length - 2) : folded.slice(0, folded.length - 3);
}

/** The item's own words that the product does not say ("plastrach" for "szynka z indyka w plastrach"). */
export function missingWords(needName: string, productName: string): string[] {
  const kindWords = new Set(
    KIND_FAMILIES.flatMap((family) => family.kinds)
      .map(([pattern]) => pattern)
      .flatMap((pattern) => tokens(needName).filter((word) => pattern.test(word))),
  );
  const productTokens = tokens(withPolish(productName));
  return tokens(needName)
    .filter((word) => !ACCOUNTED.test(word) && !/\d/.test(word) && !kindWords.has(word))
    .filter((word) => {
      const stem = wordStem(word);
      return !productTokens.some((token) => token.startsWith(stem));
    });
}
