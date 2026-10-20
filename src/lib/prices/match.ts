/**
 * Which promo is a shopping-list item. Deterministic keyword rules, no AI,
 * client-safe.
 *
 * A "yes" I gave once (stored by the shop's product id) matches the product
 * exactly every week it is on promo. Without one, the leaflet offers the rules
 * accept still price the item, as an estimate (marked as one, and "pasuje?"
 * can firm it up): the cheapest of them for the amount needed, or the middle
 * one for a broad item like "warzywa". A leaflet price that names no pack
 * gets the usual pack of that product. A "no" is remembered, so that offer is
 * never used for the item again.
 */

import type { Unit } from "../meals/ingredients.ts";
import { packInItemUnit } from "./basket.ts";
import { parsePack } from "./pack.ts";
import type { BlixSearch } from "./blix.ts";
import type { ProductLink, ShopPromo } from "./types.ts";

/** The key a shopping item's prices and answers are stored under. */
export function priceKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Lowercase ASCII: "Pierś z kurczaka" -> "piers z kurczaka". */
export function fold(value: string): string {
  return value.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/\p{M}/gu, "");
}

/**
 * One shopping item kind: what the item says (left), what a promo's name must
 * say (and must not), and where Blix should look for it in the leaflets.
 */
type Rule = {
  item: RegExp;
  product: RegExp;
  not?: RegExp;
  search?: BlixSearch;
};

/** One pattern that matches whenever any of these does. */
function either(...patterns: RegExp[]): RegExp {
  return new RegExp(patterns.map((pattern) => pattern.source).join("|"));
}

/** Not the plain ingredient: ready meals, cold cuts, sauces, snacks, drinks. */
const PROCESSED =
  /pasztet|parowk|serdel|kabanos|kielbas|nugget|bulion|zupa|przypraw|chips|\bsos\b|w sosie (?!wlasnym)|pierog|krokiet|pizza|zapiekank|salatk|panierk|frytk|baton|deser|lody|\bsok\b|napoj|bistro|sushi|onigiri/;

/** A flavoured dairy product, not the plain one the meals use. */
const FLAVOURED =
  /pitn|do picia|deser|lody|baton|musli|platki|owoc|truskaw|brzoskw|wisni|malin|borowk|jagod|mango|banan|wanili|czekolad|kokos|karmel|matcha|smak|jogobella|na dnie|ze skyrem|z dodatkiem|strawberr|raspberr|blueberr|vanil|filling|porzeczk|marakuj|cytryn|morel|grusz|pomarancz|wisni|jablk|cynamon|ananas|orzech|kakao|pomidor|szczypior|ziol|czosn/;

/** A fruit named as a flavour ("truskawkowa", "malinowy"), not the fruit itself. */
const FRUIT_FLAVOUR =
  /(truskaw|malin|jablk|jablecz|banan|borowk|jagod|wisni|grusz|brzoskwin|morel|sliw)k?ow(a|y|e|ych|ym)\b/;

/**
 * First rule whose item pattern fits wins, so specific items come before
 * broad ones. Blix searches are a subcategory of blix.pl/produkty/artykuly-spozywcze
 * plus a text filter (Polish letters, matched inside the offer name).
 */
const RULES: Rule[] = [
  {
    item: /kurczak gotowy|kurczak pieczony/,
    product: /kurczak\w* (pieczon|grillowan|gotowan|wedzon)/,
  },
  {
    // The meals' "kurczak" is breast: that is what the macros are counted for.
    item: /kurczak|kurczec/,
    product: /^(?=.*kurcz)(?=.*(piers|filet))/,
    not: either(/kaczk|indyk|indycz|w galarecie|marynowan|pieczon|szynk|wedzon|gotowan|parzon|grillowan/, PROCESSED),
    search: { sub: "mieso", q: "filet" },
  },
  {
    // Turkey ham is a cold cut: smoked, boiled, roasted or sliced, never the raw breast.
    item: /^(?=.*szynk)(?=.*indyk)/,
    product: /^(?=.*(szynk|poledwica|wedzon|parzon|pieczon|gotowan|w plastrach))(?=.*(indyk|indycz|drobiow))/,
    not: either(/sznycl|mielon|kotlet|klops/, PROCESSED),
    search: { sub: "wedliny", q: "indyk" },
  },
  {
    item: /szynk/,
    product: /szynk|poledwic/,
    not: PROCESSED,
    search: { sub: "wedliny", q: "szynk" },
  },
  {
    item: /indyk|indycz/,
    product: /^(?=.*(indyk|indycz))(?=.*(filet|piers|mielon|mieso|uda|udziec|gulasz|kotlet|sznycl|medalion|pask))/,
    not: either(/golonk|skrzyd|podudz|rosol|zestaw|szyj|wedzon|parzon|pieczon/, PROCESSED),
    search: { sub: "mieso", q: "indyk" },
  },
  {
    item: /wolowin/,
    product: /wolow/,
    not: either(/wieprzow|burger|tatar|flaki|szponder|rosol|kosci|ozor/, PROCESSED),
    search: { sub: "mieso", q: "wołow" },
  },
  {
    item: /tunczyk/,
    product: /tunczyk/,
    not: either(/pasta|w oleju|w oliwie|z suszon|jalapeno|mayo/, PROCESSED),
    search: { sub: "", q: "tuńczyk" },
  },
  {
    item: /losos/,
    product: /losos/,
    not: either(/wedzon|pasta/, PROCESSED),
    search: { sub: "ryby-i-owoce-morza", q: "łosoś" },
  },
  { item: /bialka jaj/, product: /bialk\w* jaj|bialka w plynie/ },
  {
    item: /jajk|\bjaja\b/,
    product: /\bjaja\b|\bjajka\b/,
    not: /czekolad|niespodzian|makaron|majonez|pasta|salatk/,
    search: { sub: "jajka", q: "" },
  },
  {
    item: /skyr/,
    product: /skyr/,
    not: FLAVOURED,
    search: { sub: "nabial", q: "skyr" },
  },
  {
    item: /twarog/,
    product: /twarog/,
    not: either(/sernik|pieczon|pasta|serek|puszyst|z dodatkiem/, FLAVOURED),
    search: { sub: "nabial", q: "twaróg" },
  },
  {
    item: /serek wiejski|cottage/,
    product: /serek wiejski|cottage/,
    not: FLAVOURED,
    search: { sub: "nabial", q: "serek wiejski" },
  },
  {
    item: /jogurt/,
    // The meals' yogurt is the plain one: natural or Greek.
    product: /^(?=.*\bjogurt\b)(?=.*(naturaln|greck))/,
    not: either(/skyr|chleb/, FLAVOURED),
    search: { sub: "nabial", q: "jogurt naturalny" },
  },
  {
    item: /mozzarell/,
    product: /mozzarell/,
    not: PROCESSED,
    search: { sub: "", q: "mozzarell" },
  },
  {
    item: /feta/,
    product: /\bfeta\b|ser\w* salatkow|ser\w* typu greckiego/,
    not: either(/jogurt|chleb|bulk|ciast/, PROCESSED),
    search: { sub: "", q: "feta" },
  },
  {
    item: /\bser\b/,
    product: /\bser\b|gouda|edam|cheddar|ementaler|podlaski|maasdam|salami ser/,
    not: either(/serek|twarog|sernik|feta|mozzarell|kremow|topion|plesn/, PROCESSED),
    search: { sub: "nabial", q: "w plastrach" },
  },
  {
    item: /mleko kokosowe|mleczko kokosowe/,
    product: /mleko kokosowe|mleczko kokosowe/,
    search: { sub: "", q: "kokosowe" },
  },
  {
    item: /\bmleko\b/,
    product: /\bmleko\b/,
    not: either(/kokos|czekolad|zageszcz|proszk|modyfikowan|ryzow|owsian|sojow|migdal/, FLAVOURED),
    search: { sub: "nabial", q: "mleko" },
  },
  {
    item: /platki/,
    product: /platki owsiane|owsian/,
    not: /baton|ciastk|granola|musli|czekolad|smoothie|napoj|owsianka|\d+ ml\b|\bmaka\b|otreb|kasza|kulki|ze smakiem|z morel|z jablk|z owocami|barista|ciasteczk|chrupki|batonik/,
    search: { sub: "platki", q: "owsian" },
  },
  {
    item: /ryz\b.*(gotow|microwave|mikrofal)/,
    product: /ryz\w*.*(gotow|mikrofal|express|ekspres)/,
    search: { sub: "ryz", q: "" },
  },
  {
    item: /\bryz\b/,
    product: /\bryz\b/,
    not: either(
      /wafl|chrup|mleko|makaron|napoj|kleik|kaszk|deser|preparowan|sushi|\bmix\b|curry|papryk|fasol|warzyw/,
      PROCESSED,
    ),
    search: { sub: "ryz", q: "" },
  },
  {
    item: /kasz/,
    product: /kasz/,
    not: either(/kaszk/, PROCESSED),
    search: { sub: "kasza", q: "" },
  },
  {
    item: /orzo/,
    product: /orzo/,
    search: { sub: "makaron", q: "orzo" },
  },
  {
    item: /makaron/,
    product: /makaron|spaghetti|penne|fusilli|tagliatelle|farfalle|rigatoni/,
    not: either(/ryzow|vermicel|mung|instant|chinsk|zupk/, PROCESSED),
    search: { sub: "makaron", q: "" },
  },
  {
    item: /chleb|pieczywo/,
    product: /chleb|pieczywo/,
    not: either(/chlebek|tostow|przekask|slodk/, PROCESSED),
    search: { sub: "pieczywo", q: "chleb" },
  },
  {
    item: /tortill/,
    product: /tortill|placki pszenne/,
    not: PROCESSED,
    search: { sub: "", q: "tortill" },
  },
  {
    item: /ziemniak/,
    product: /ziemniak/,
    not: /frytk|chips|puree|placki|salatk|kopytk|knedl/,
    search: { sub: "warzywa", q: "ziemniak" },
  },
  {
    item: /batat/,
    product: /batat/,
    not: /frytk|chips/,
    search: { sub: "warzywa", q: "batat" },
  },
  {
    item: /fasol/,
    product: /fasol/,
    not: either(/szparag|bretonsk|mung|edamame|makaron|danie/, PROCESSED),
    search: { sub: "", q: "fasol" },
  },
  {
    item: /kukurydz/,
    product: /kukurydz/,
    not: either(/chrup|platki|popcorn|chips|kurczak|maka/, PROCESSED),
    search: { sub: "", q: "kukurydz" },
  },
  {
    item: /passata|pomidor/,
    product: /passata|przecier pomidor|pomidory (krojone|w puszce)/,
    search: { sub: "", q: "passata" },
  },
  { item: /salsa/, product: /salsa/, search: { sub: "", q: "salsa" } },
  {
    item: /warzyw/,
    product: /brokul|kalafior|marchew|papryk|cukini|szpinak|warzyw|fasolka szparag|brukselk|kapust/,
    not: PROCESSED,
    search: { sub: "warzywa", q: "" },
  },
  {
    item: /banan/,
    product: /banan/,
    not: either(/chips|suszon|baton|jogurt|chlebek/, FRUIT_FLAVOUR),
    search: { sub: "owoce", q: "banan" },
  },
  {
    item: /jablk/,
    product: /jablk/,
    not: either(/\bsok\b|\bmus\b|suszon|chips|ocet|szarlot/, FRUIT_FLAVOUR),
    search: { sub: "owoce", q: "jabłk" },
  },
  {
    item: /jagod|borowk|malin|truskaw/,
    product: /malin|borowk|jagod|truskaw|owoce lesne/,
    not: either(
      /pomidor|dzem|jogurt|serek|\bsok\b|czekolad|syrop|herbat|owsiank|ciast|chlebek/,
      PROCESSED,
      FRUIT_FLAVOUR,
    ),
    search: { sub: "", q: "borówk" },
  },
  {
    item: /owoce/,
    product: /jablk|banan|gruszk|winogron|pomarancz|mandaryn|kiwi|malin|borowk|truskaw|pomelo/,
    not: either(
      /pomidor|\bsok\b|\bmus\b|suszon|chips|dzem|jogurt|serek|czekolad|baton|ciast|deser|lody|owsiank/,
      PROCESSED,
      FRUIT_FLAVOUR,
    ),
    search: { sub: "owoce", q: "" },
  },
  {
    item: /maslo orzechowe|\bpb\b/,
    product: /maslo orzechowe|maslo z orzech|krem\b.*\borzech/,
    search: { sub: "", q: "masło orzechowe" },
  },
  { item: /oliwa/, product: /oliwa/, search: { sub: "oleje", q: "oliwa" } },
  {
    item: /miod/,
    product: /\bmiod\b/,
    not: /piernik|ciastk|musztard|pitny|sztuczny|polsk\w* pitn|\bz miodem\b/,
    search: { sub: "", q: "miód" },
  },
  {
    item: /whey|odzywk|bialko/,
    product: /whey|odzywk|bialko serwatk|bialko wpc/,
    search: { sub: "", q: "odżywk" },
  },
];

/** Words too general to look an item up by. */
const STOP_WORDS = new Set(["light", "gotowy", "mieszanka", "microwave", "chudy", "naturalny", "polski"]);

/** An item no rule knows: its own words are the search, and the offer must say all of them. */
function genericRule(itemName: string): Rule | undefined {
  const words = itemName
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 4 && !STOP_WORDS.has(fold(word)));
  if (words.length === 0) return undefined;
  const stems = words.map((word) => fold(word).slice(0, Math.max(4, word.length - 1)));
  return {
    item: /./,
    product: new RegExp(stems.map((stem) => `(?=.*${stem})`).join("")),
    not: PROCESSED,
    search: { sub: "", q: words[0] },
  };
}

function ruleFor(itemName: string): Rule | undefined {
  const name = fold(itemName);
  return RULES.find((candidate) => candidate.item.test(name)) ?? genericRule(itemName);
}

/** Where Blix should look for this shopping item; null when nothing can be searched. */
export function blixSearchFor(itemName: string): BlixSearch | null {
  return ruleFor(itemName)?.search ?? null;
}

/**
 * Promos that could be this item by the rules, best first: cheapest per gram
 * (or piece). Promos whose pack cannot be compared with the list amount are
 * left out, since they could never be priced.
 */
export function promoCandidates(itemName: string, itemUnit: Unit | null, promos: ShopPromo[]): ShopPromo[] {
  const rule = ruleFor(itemName);
  if (!rule) return [];
  return promos
    .filter((promo) => {
      const product = fold(promo.name);
      if (!rule.product.test(product) || rule.not?.test(product) || NOT_PLAIN.test(product)) return false;
      // An offer without a pack size gets the usual one below; a known pack must fit the list.
      if (promo.packQuantity === null || itemUnit === null) return true;
      return packInItemUnit(promo.packQuantity, promo.packUnit, itemUnit) !== null;
    })
    .sort((a, b) => perUnit(a) - perUnit(b));
}

/** Never the plain ingredient, whatever the item: spreads, porridge, sauces, quail eggs, sausages. */
const NOT_PLAIN =
  /parowk|\bpasta\b|owsiank|do mies|przepior|konfitur|serdel|kabanos|\bsos\b|zupa|danie|salatk|musl[iy]|kasza manna/;

/**
 * The promos that could be any of these items, plus the ones I confirmed. The
 * full leaflet sweep stores thousands of offers; only these go to the screen.
 */
export function relevantPromos(
  items: { name: string; unit: Unit | null }[],
  promos: ShopPromo[],
  links: ProductLink[],
): ShopPromo[] {
  const keep = new Set<string>();
  const id = (promo: { shop: string; productKey: string }) => `${promo.shop}|${promo.productKey}`;
  for (const item of items) for (const promo of promoCandidates(item.name, item.unit, promos)) keep.add(id(promo));
  for (const link of links) if (link.matches) keep.add(id(link));
  return promos.filter((promo) => keep.has(id(promo)));
}

/** A whole shop's range holds more than food: pet food, cosmetics, baby food. */
const NOT_FOOD =
  /felix|whiskas|pedigree|kitekat|purina|sheba|friskies|vitakraft|dogway|bruno banani|perfum|toaletow|dla kota|dla psa|karma|przysmak|bezmies|\bwpc\b|whey|actimel|durex|\bzel\b|szampon|serum|balsam|krem do|mydl|gerber|bobovita|hipp|nestle nan|kaszka|dla dzieci|smoothie|\bnapoj|\bsok\b|nektar\b|\bmus\b|galaret|kisiel|budyn|o smaku|deserek|strucl|rogal|produkt 100|konfitur|powidl|drazetk|cukierk|zelk|\bguma\b|po \d+ miesia/;
/** Items that are themselves liquids, so a pack in litres is fine. */
const LIQUID = /mleko|oliwa|olej|passata|sos/;
const VOLUME = /\b\d+(?:[.,]\d+)? ?(?:l|ml)\b/;

/**
 * Catalogue products (a shop's whole range, by name) that could be this item,
 * plainest first: the shortest names are the plain product, the long ones the
 * flavoured or special versions. At most `limit`, since each one is a page to read.
 */
export function catalogCandidates<T extends { name: string }>(
  itemName: string,
  itemUnit: Unit | null,
  entries: T[],
  limit: number,
): T[] {
  const rule = ruleFor(itemName);
  if (!rule) return [];
  const liquid = LIQUID.test(fold(itemName));
  return entries
    .filter((entry) => {
      const name = fold(entry.name);
      if (!rule.product.test(name) || rule.not?.test(name) || NOT_FOOD.test(name) || NOT_PLAIN.test(name)) return false;
      // A drink is not the fruit, unless the item is itself a liquid.
      if (!liquid && VOLUME.test(name)) return false;
      // A pack in pieces can never price an item in grams, and the other way round.
      const pack = parsePack(entry.name);
      return !pack || itemUnit === null || packInItemUnit(pack.quantity, pack.unit, itemUnit) !== null;
    })
    .sort((a, b) => a.name.length - b.name.length)
    .slice(0, limit);
}

/* Category pages ------------------------------------------------------------ */

const CATEGORY_STOPWORDS = /^(light|zero|bio|na|do|z|ze|i|w|mix|mieszanka|swiez\w*)$/;

/** Start of a word, short enough to catch its other forms ("jajka" -> "jaj", "kurczak" -> "kurcz"). */
function stem(word: string): string {
  return word.slice(0, Math.max(3, word.length - 2));
}

/**
 * Category pages of a shop's online catalogue that could hold this item, best
 * first. A page lists only its first products, so the most specific shelf (the
 * last part of the path) that names the item wins; then the more of the item's
 * words the path has, the better, and the deeper (narrower) shelf wins a tie.
 */
export function categoriesFor<T extends { path: string }>(itemName: string, categories: T[], limit: number): T[] {
  const words = fold(itemName)
    .split(/[^a-z]+/)
    .filter((word) => word.length >= 3 && !CATEGORY_STOPWORDS.test(word))
    .map(stem);
  if (words.length === 0) return [];
  const matching = (text: string) =>
    words.filter((word) => text.split(/\s+/).some((part) => part.startsWith(word))).length;
  return categories
    .map((category) => {
      const parts = fold(category.path).split(" / ");
      return {
        category,
        last: matching(parts[parts.length - 1]),
        score: matching(parts.join(" ")),
        depth: parts.length,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.last - a.last || b.score - a.score || b.depth - a.depth)
    .slice(0, limit)
    .map((entry) => entry.category);
}

function perUnit(promo: ShopPromo): number {
  return promo.packQuantity ? promo.promoPrice / promo.packQuantity : Number.POSITIVE_INFINITY;
}

/* What a leaflet price without a pack is usually for ------------------------ */

type Pack = { quantity: number; unit: Unit; loose: boolean };
const pack = (quantity: number, unit: Unit, loose = false): Pack => ({ quantity, unit, loose });
/** Fresh meat and produce are quoted per kilo and paid for by what is taken. */
const perKilo = () => pack(1000, "g", true);

/**
 * First line whose item pattern fits wins. The price helps where the same
 * product comes small or big ("ryż" 2,49 is a 400 g bag, 5 zł a kilo).
 */
const USUAL_PACKS: [RegExp, (price: number) => Pack][] = [
  [/szynk/, () => pack(150, "g")],
  [/jagod|borowk|malin|truskaw/, () => pack(250, "g")],
  [/kurczak|indyk|indycz|wolowin|losos|banan|jablk|owoce|warzyw|batat/, perKilo],
  [/ziemniak/, (price) => (price >= 6 ? pack(2500, "g") : perKilo())],
  [/tunczyk/, () => pack(150, "g")],
  [/jajk|\bjaja\b/, () => pack(10, "szt")],
  [/skyr/, (price) => (price >= 3.5 ? pack(450, "g") : pack(150, "g"))],
  [/twarog/, () => pack(250, "g")],
  [/serek wiejski|cottage/, () => pack(200, "g")],
  [/jogurt/, (price) => (price >= 1.8 ? pack(400, "g") : pack(150, "g"))],
  [/mozzarell/, () => pack(125, "g")],
  [/feta/, () => pack(200, "g")],
  [/\bser\b/, () => pack(150, "g")],
  [/mleko kokosowe/, () => pack(400, "ml")],
  [/\bmleko\b/, () => pack(1000, "ml")],
  [/platki/, () => pack(500, "g")],
  [/ryz.*(gotow|microwave|mikrofal)/, () => pack(250, "g")],
  [/\bryz\b/, (price) => (price >= 3.5 ? pack(1000, "g") : pack(400, "g"))],
  [/kasz/, () => pack(400, "g")],
  [/orzo|makaron/, () => pack(500, "g")],
  [/chleb|pieczywo/, () => pack(500, "g")],
  [/tortill/, () => pack(8, "szt")],
  [/fasol|kukurydz/, () => pack(400, "g")],
  [/passata|pomidor/, () => pack(500, "g")],
  [/salsa/, () => pack(200, "g")],
  [/maslo orzechowe|\bpb\b/, () => pack(350, "g")],
  [/oliwa/, () => pack(750, "ml")],
  [/miod/, (price) => (price < 10 ? pack(250, "g") : price < 18 ? pack(400, "g") : pack(950, "g"))],
  [/whey|odzywk|bialko/, () => pack(900, "g")],
];

/**
 * The lowest believable price per kilo of fresh meat: a "steak 5,99" is one
 * steak, not a kilo, so it must not be priced as one.
 */
const MIN_PER_KILO: [RegExp, number][] = [
  [/kurczak/, 8],
  [/indyk|indycz/, 10],
  [/wolowin/, 18],
  [/losos/, 25],
];

/** An assumed per-kilo price below what that meat costs is a pack price in disguise. */
function implausible(itemName: string, price: number, usual: Pack): boolean {
  if (usual.unit !== "g") return false;
  const name = fold(itemName);
  const floor = MIN_PER_KILO.find(([item]) => item.test(name))?.[1];
  return floor !== undefined && price / (usual.quantity / 1000) < floor;
}

function usualPack(itemName: string, price: number): Pack | null {
  const name = fold(itemName);
  return USUAL_PACKS.find(([item]) => item.test(name))?.[1](price) ?? null;
}

/** An item that means "any of these": priced at the middle offer, not the cheapest lucky one. */
const BROAD = /warzyw|owoce|\bser\b/;

export type Estimate = {
  /** The promo with a pack on it: its own, or the usual one. */
  promo: ShopPromo;
  /** The offer named no pack, so the usual one was assumed. */
  packAssumed: boolean;
};

export type PromoMatch = {
  /** Products I said are this item, on promo now. These are exact. */
  confirmed: ShopPromo[];
  /** Without a confirmed product: the leaflet offers that fit, as estimates, cheapest first. */
  estimates: Estimate[];
};

/**
 * Pass one shop's promos that are valid today and that shop's answers.
 * Once a confirmed product is on promo, nothing else is used.
 */
export function matchPromos(
  item: { name: string; unit: Unit | null },
  promos: ShopPromo[],
  links: ProductLink[],
): PromoMatch {
  const key = priceKey(item.name);
  const answers = links.filter((link) => link.itemName === key);
  const yes = new Map(answers.filter((link) => link.matches).map((link) => [link.productKey, link]));
  const answered = new Set(answers.map((link) => link.productKey));

  // A leaflet price without a pack size takes the one given when it was confirmed.
  const confirmed = promos.flatMap((promo) => {
    const link = yes.get(promo.productKey);
    if (!link) return [];
    if (promo.packQuantity !== null || link.packQuantity === null) return [promo];
    return [{ ...promo, packQuantity: link.packQuantity, packUnit: link.packUnit, loose: link.packLoose }];
  });
  if (confirmed.length > 0) return { confirmed, estimates: [] };

  const estimates = promoCandidates(item.name, item.unit, promos)
    .filter((promo) => !answered.has(promo.productKey))
    .flatMap((promo): Estimate[] => {
      if (promo.packQuantity !== null) return [{ promo, packAssumed: false }];
      const usual = usualPack(item.name, promo.promoPrice);
      if (!usual || packInItemUnit(usual.quantity, usual.unit, item.unit) === null) return [];
      if (implausible(item.name, promo.promoPrice, usual)) return [];
      return [
        {
          promo: { ...promo, packQuantity: usual.quantity, packUnit: usual.unit, loose: usual.loose },
          packAssumed: true,
        },
      ];
    });

  if (BROAD.test(fold(item.name)) && estimates.length > 2) {
    return { confirmed: [], estimates: [estimates[Math.floor(estimates.length / 2)]] };
  }
  return { confirmed: [], estimates };
}
