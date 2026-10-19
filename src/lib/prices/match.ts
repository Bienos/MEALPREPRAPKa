/**
 * Which promo is a shopping-list item. Deterministic keyword rules, no AI,
 * client-safe.
 *
 * A "yes" I gave once (stored by the shop's product id) matches the product
 * automatically every week it is on promo. Without one, the best keyword
 * candidate is only a suggestion: it shows "pasuje?" and stays out of the
 * total until I answer. A "no" is remembered too, so it is never asked again.
 */

import type { Unit } from "../meals/ingredients.ts";
import { packInItemUnit } from "./basket.ts";
import type { BlixSearch } from "./blix.ts";
import type { ProductLink, ShopPromo } from "./types.ts";

/** The key a shopping item's prices and answers are stored under. */
export function priceKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Lowercase ASCII: "Pierś z kurczaka" -> "piers z kurczaka". */
function fold(value: string): string {
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
  /pasztet|parowk|kabanos|kielbas|nugget|bulion|zupa|przypraw|chips|\bsos\b|w sosie (?!wlasnym)|pierog|krokiet|pizza|zapiekank|salatk|panierk|frytk|baton|deser|lody|\bsok\b|napoj|bistro|sushi|onigiri/;

/** A flavoured dairy product, not the plain one the meals use. */
const FLAVOURED =
  /pitn|do picia|deser|lody|baton|musli|platki|owoc|truskaw|brzoskw|wisni|malin|borowk|jagod|mango|banan|wanili|czekolad|kokos|karmel|matcha|smak|jogobella|na dnie|ze skyrem|z dodatkiem/;

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
    not: either(/kaczk|indyk|indycz|w galarecie|marynowan/, PROCESSED),
    search: { sub: "mieso", q: "filet" },
  },
  {
    // Turkey ham is a cold cut: smoked, boiled, roasted or sliced, never the raw breast.
    item: /^(?=.*szynk)(?=.*indyk)/,
    product: /^(?=.*(szynk|poledwic|wedzon|parzon|pieczon|gotowan|w plastrach))(?=.*(indyk|indycz|drobiow))/,
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
    not: either(/sernik|pieczon|pasta|szczypior|ziol|z dodatkiem/, FLAVOURED),
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
    product: /\bjogurt\b/,
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
    not: /baton|ciastk|granola|musli|czekolad/,
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
    not: either(/wafl|chrup|mleko|makaron|napoj|kleik|kaszk|deser|preparowan|sushi/, PROCESSED),
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
    not: /chips|suszon|baton/,
    search: { sub: "owoce", q: "banan" },
  },
  {
    item: /jablk/,
    product: /jablk/,
    not: /\bsok\b|\bmus\b|suszon|chips|ocet|szarlot/,
    search: { sub: "owoce", q: "jabłk" },
  },
  {
    item: /jagod|borowk|malin|truskaw/,
    product: /malin|borowk|jagod|truskaw|owoce lesne/,
    not: either(/pomidor|dzem|jogurt|\bsok\b|czekolad|syrop|herbat/, PROCESSED),
    search: { sub: "", q: "borówk" },
  },
  {
    item: /owoce/,
    product: /jablk|banan|gruszk|winogron|pomarancz|mandaryn|kiwi|malin|borowk|truskaw|pomelo/,
    not: /pomidor|\bsok\b|\bmus\b|suszon|chips|dzem/,
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
    not: /piernik|ciastk|musztard/,
    search: { sub: "", q: "miód" },
  },
  {
    item: /whey|odzywk|bialko/,
    product: /whey|odzywk|bialko serwatk|bialko wpc/,
    search: { sub: "", q: "odżywk" },
  },
];

function ruleFor(itemName: string): Rule | undefined {
  const name = fold(itemName);
  return RULES.find((candidate) => candidate.item.test(name));
}

/** Where Blix should look for this shopping item; null when no rule knows it. */
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
      if (!rule.product.test(product) || rule.not?.test(product)) return false;
      // An offer without a pack size is asked about once ("ile w opakowaniu?"); a known pack must fit the list.
      if (promo.packQuantity === null || itemUnit === null) return true;
      return packInItemUnit(promo.packQuantity, promo.packUnit, itemUnit) !== null;
    })
    .sort((a, b) => perUnit(a) - perUnit(b));
}

function perUnit(promo: ShopPromo): number {
  return promo.packQuantity ? promo.promoPrice / promo.packQuantity : Number.POSITIVE_INFINITY;
}

export type PromoMatch = {
  /** Products I said are this item, on promo now. These count in the total. */
  confirmed: ShopPromo[];
  /** The best unanswered candidate, shown as "pasuje?". Never counted. */
  suggestion: ShopPromo | null;
};

/**
 * Pass one shop's promos that are valid today and that shop's answers.
 * Once a confirmed product is on promo, nothing else is suggested.
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
    return [
      {
        ...promo,
        packQuantity: link.packQuantity,
        packUnit: link.packUnit,
        loose: link.packLoose,
      },
    ];
  });
  if (confirmed.length > 0) return { confirmed, suggestion: null };
  const suggestion = promoCandidates(item.name, item.unit, promos).find((promo) => !answered.has(promo.productKey));
  return { confirmed: [], suggestion: suggestion ?? null };
}
