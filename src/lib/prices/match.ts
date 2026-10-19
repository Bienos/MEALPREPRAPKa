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
import type { ProductLink, ShopPromo } from "./types.ts";

/** The key a shopping item's prices and answers are stored under. */
export function priceKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Lowercase ASCII: "Pierś z kurczaka" -> "piers z kurczaka". */
function fold(value: string): string {
  return value.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/\p{M}/gu, "");
}

type Rule = { item: RegExp; product: RegExp; not?: RegExp };

/** Not the plain ingredient: ready meals, cold cuts, sauces, snacks, drinks. */
const PROCESSED =
  /pasztet|parowk|kabanos|kielbas|nugget|bulion|zupa|przypraw|chips|\bsos\b|pierog|krokiet|pizza|salatk|panierk|frytk|baton|deser|lody|\bsok\b|napoj/;

/**
 * Shopping item (left) -> what a promo's name must say (right). First rule
 * whose item pattern fits wins, so specific items come before broad ones.
 */
const RULES: Rule[] = [
  { item: /piers z kurczaka|filet z kurczaka/, product: /(piers|filet)\w* z kurczaka|filet z piersi/, not: PROCESSED },
  { item: /kurczak gotowy|kurczak pieczony/, product: /kurczak\w* (pieczon|grillowan|gotowan|wedzon)/ },
  { item: /kurczak/, product: /kurczak|kurczec/, not: PROCESSED },
  { item: /szynk/, product: /szynk|poledwic/, not: PROCESSED },
  { item: /indyk/, product: /indyk|indycz/, not: PROCESSED },
  { item: /wolowin/, product: /wolow/, not: PROCESSED },
  { item: /tunczyk/, product: /tunczyk/, not: /pasta|salatk|pizza/ },
  { item: /losos/, product: /losos/, not: PROCESSED },
  { item: /bialka jaj/, product: /bialk\w* jaj|bialka w plynie/ },
  { item: /jajk|\bjaja\b/, product: /\bjaja\b|\bjajka\b/, not: /czekolad|niespodzian|makaron|majonez|pasta/ },
  { item: /skyr/, product: /skyr/ },
  { item: /twarog/, product: /twarog/, not: /sernik|deser/ },
  { item: /serek wiejski|cottage/, product: /serek wiejski|cottage/ },
  { item: /jogurt/, product: /jogurt/, not: /pitny|deser|lody|baton|musli|platki/ },
  { item: /mozzarell/, product: /mozzarell/, not: PROCESSED },
  { item: /feta/, product: /\bfeta\b|salatkow|typu greckiego/ },
  { item: /\bser\b/, product: /\bser\b|gouda|edam|cheddar|ementaler|podlaski/, not: /serek|twarog|sernik|feta|mozzarell|chips|\bsos\b/ },
  { item: /mleko kokosowe/, product: /mleko kokosowe|mleczko kokosowe/ },
  { item: /\bmleko\b/, product: /\bmleko\b/, not: /kokos|czekolad|zageszcz|proszk|modyfikowan|ryzow|owsian|sojow/ },
  { item: /platki/, product: /platki owsiane|owsian/, not: /baton|ciastk/ },
  { item: /\bryz\b/, product: /\bryz\b/, not: /wafl|chrup|mleko|makaron|napoj|kleik/ },
  { item: /makaron|orzo/, product: /makaron|spaghetti|penne|fusilli|tagliatelle|orzo/, not: PROCESSED },
  { item: /chleb|pieczywo/, product: /chleb|pieczywo|bulk|bagiet|kajzer/ },
  { item: /tortill/, product: /tortill|wrap/ },
  { item: /ziemniak/, product: /ziemniak/, not: /frytk|chips|puree|placki|salatk|kopytk|knedl/ },
  { item: /batat/, product: /batat/, not: /frytk|chips/ },
  { item: /fasol/, product: /fasol/, not: /szparag/ },
  { item: /kukurydz/, product: /kukurydz/, not: /chrup|platki|popcorn|chips/ },
  { item: /passata|pomidor/, product: /passata|przecier pomidor|pomidory (krojone|w puszce)/ },
  {
    item: /warzyw/,
    product: /brokul|kalafior|marchew|papryk|cukini|szpinak|warzyw|fasolka szparag|brukselk|kapust/,
    not: PROCESSED,
  },
  { item: /banan/, product: /banan/, not: /chips|suszon|baton/ },
  { item: /jablk/, product: /jablk/, not: /\bsok\b|\bmus\b|suszon|chips|ocet|szarlot/ },
  { item: /jagod|borowk|malin|truskaw/, product: /malin|borowk|jagod|truskaw|owoce lesne/, not: /dzem|jogurt|\bsok\b/ },
  {
    item: /owoce/,
    product: /jablk|banan|gruszk|winogron|pomarancz|mandaryn|kiwi|malin|borowk|truskaw|pomelo/,
    not: /\bsok\b|\bmus\b|suszon|chips|dzem/,
  },
  { item: /maslo orzechowe|\bpb\b/, product: /maslo orzechowe|maslo z orzech|krem\b.*\borzech/ },
  { item: /oliwa/, product: /oliwa/ },
  { item: /miod/, product: /\bmiod\b/ },
  { item: /whey|odzywk|bialko/, product: /whey|odzywk|bialko serwatk/ },
];

/**
 * Promos that could be this item by the rules, best first: cheapest per gram
 * (or piece). Promos whose pack cannot be compared with the list amount are
 * left out, since they could never be priced.
 */
export function promoCandidates(itemName: string, itemUnit: Unit | null, promos: ShopPromo[]): ShopPromo[] {
  const name = fold(itemName);
  const rule = RULES.find((candidate) => candidate.item.test(name));
  if (!rule) return [];
  return promos
    .filter((promo) => {
      const product = fold(promo.name);
      if (!rule.product.test(product) || rule.not?.test(product)) return false;
      return itemUnit === null || packInItemUnit(promo.packQuantity, promo.packUnit, itemUnit) !== null;
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
  const yes = new Set(answers.filter((link) => link.matches).map((link) => link.productKey));
  const answered = new Set(answers.map((link) => link.productKey));

  const confirmed = promos.filter((promo) => yes.has(promo.productKey));
  if (confirmed.length > 0) return { confirmed, suggestion: null };
  const suggestion = promoCandidates(item.name, item.unit, promos).find((promo) => !answered.has(promo.productKey));
  return { confirmed: [], suggestion: suggestion ?? null };
}
