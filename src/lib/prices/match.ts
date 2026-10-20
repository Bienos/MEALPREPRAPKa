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
  /pasztet|parowk|serdel|kabanos|kielbas|nugget|bulion|zupa|przypraw|chips|\bsos\b|w sosie (?!wlasnym)|pierog|krokiet|pizza|zapiekank|salatk|panierk|frytk|baton|deser|lody|\bsok\b|napoj|bistro|sushi|onigiri|kebab|smoothie|chrupk|\blays\b|crunchips|pringles|doritos|cheetos/;

/** A name that lists several foods ("mozzarella, pomidor, cebula czerwona") is a dish, not the vegetable. */
const LISTED = /,[^,]+,/;

/** A flavoured dairy product, not the plain one the meals use. */
const FLAVOURED =
  /pitn|do picia|deser|lody|baton|musli|platki|owoc|truskaw|brzoskw|wisni|malin|borowk|jagod|mango|banan|wanili|czekolad|kokos|karmel|matcha|smak|jogobella|na dnie|ze skyrem|z dodatkiem|strawberr|raspberr|blueberr|vanil|filling|porzeczk|marakuj|cytryn|morel|grusz|pomarancz|wisni|jablk|cynamon|ananas|orzech|kakao|pomidor|szczypior|ziol|czosn|szarlot|sernik|tiramisu|pistacj|ciastk|cookie|kawow|latte|miodow/;

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
    // "Mięso drobiowe": any raw poultry cut, chicken or turkey, not cold cuts or ready meals.
    item: /drobi|\bdrob\b/,
    product:
      /^(?=.*(kurcz|indyk|indycz|drob))(?=.*(piers|filet|udz|udo\b|podudz|skrzyd|mielon|poledwicz|tusz|cwiartk|gulasz))/,
    not: either(
      /szynk|wedzon|gotowan|parzon|pieczon|grillowan|panier|nugget|parowk|kielbas|pasztet|w galarecie|filetki/,
      PROCESSED,
    ),
    search: { sub: "mieso", q: "drób" },
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
    not: either(/golonk|skrzyd|podudz|rosol|zestaw|szyj|wedzon|parzon|pieczon|filetk|z indykiem/, PROCESSED),
    search: { sub: "mieso", q: "indyk" },
  },
  {
    item: /wolowin/,
    product: /wolow/,
    not: either(/wieprzow|burger|tatar|flaki|szponder|rosol|kosci|ozor|\bloj\b|smalec|tluszcz/, PROCESSED),
    search: { sub: "mieso", q: "wołow" },
  },
  {
    item: /wieprzow|schab|karkowk|lopatk/,
    product: /wieprzow|schab|karkowk|lopatk/,
    not: either(
      /kielbas|szynk|boczek|salami|kabanos|parowk|wedzon|gotowan|w galarecie|konserw|pasztet|kosc|zeberk|golonk|w sloj|sloik/,
      PROCESSED,
    ),
    search: { sub: "mieso", q: "wieprzowina" },
  },
  {
    item: /mielon/,
    product: /mielon/,
    not: either(/kotlet|pulpet|burger|gotow|mrozon|sos|pasztet|kebab|panier|zapiekank/, PROCESSED),
    search: { sub: "mieso", q: "mielone" },
  },
  {
    item: /tunczyk/,
    product: /tunczyk/,
    not: either(/pasta|w oleju|w oliwie|z suszon|jalapeno|mayo|z warzyw|mexican|meksyk|z fasol|z ryz|z makaron|z kukurydz/, PROCESSED),
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
    not: either(/serek|twarog|sernik|feta|mozzarell|kremow|\bkrem\b|topion|plesn|smarow/, PROCESSED),
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
    item: /\borzo\b/,
    product: /\borzo\b/,
    search: { sub: "makaron", q: "orzo" },
  },
  {
    item: /makaron/,
    product: /makaron|spaghetti|penne|fusilli|tagliatelle|farfalle|rigatoni/,
    not: either(
      /ryzow|vermicel|mung|instant|chinsk|zupk|udon|soba|ramen|sojow|konjac|\bsery\b|bolognes|carbonar|napolitan|z mies|z sosem/,
      PROCESSED,
    ),
    search: { sub: "makaron", q: "" },
  },
  {
    item: /chleb|pieczywo/,
    product: /chleb|pieczywo/,
    not: either(/chlebek|tostow|przekask|slodk|chrupk|wafl|bulk|bagiet|tortill|krakers|sonko|\bwasa\b|pieczywo lekk/, PROCESSED),
    search: { sub: "pieczywo", q: "chleb" },
  },
  {
    item: /tortill/,
    product: /tortill|placki pszenne/,
    not: either(/z mies|z kurcz|z warzyw|z wolow|z indyk|z serem|wrap z|danie|gotow/, PROCESSED),
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
    not: either(/szparag|bretonsk|mung|edamame|makaron|danie|pasta/, PROCESSED),
    search: { sub: "", q: "fasol" },
  },
  {
    item: /kukurydz/,
    product: /kukurydz/,
    not: either(/chrup|platki|popcorn|chips|kurczak|maka/, PROCESSED),
    search: { sub: "", q: "kukurydz" },
  },
  {
    // Fresh vegetables of the mix that stands in for "warzywa": the plain vegetable, not the jar, tin or sauce.
    item: /^(?!.*(passata|krojon|puszk|puszc|suszon|przecier)).*pomidor/,
    product: /pomidor/,
    not: either(
      /krojon|puszk|puszc|suszon|passata|przecier|koncentrat|ketchup|w oleju|salsa|pesto|\bsok\b|\bcale\b|bez skork|pelati|obran|pomidorow/,
      PROCESSED,
      LISTED,
    ),
    search: { sub: "warzywa", q: "pomidor" },
  },
  {
    item: /ogork|ogorek/,
    product: /ogorek|ogorki/,
    not: either(/kiszon|malosoln|konserw|korniszon|marynow|w zalewie|kanapk|\bsos\b|ogorkow|dziadun/, PROCESSED, LISTED),
    search: { sub: "warzywa", q: "ogórek" },
  },
  {
    item: /cebul/,
    product: /cebul/,
    not: either(/w oleju|prazon|kiszon|marynow|konserw|krojon|mrozon|szczypior|chrupiac|smazon|w platkach|cebulow|dymk|szalot/, PROCESSED, LISTED),
    search: { sub: "warzywa", q: "cebula" },
  },
  {
    item: /papryk/,
    product: /papryk/,
    not: either(
      /mielon|proszek|konserw|marynow|w zalewie|ajvar|nadziew|wedzon|w oleju|pasta|mrozon|ostra|jalapeno|hummus|paprykow/,
      PROCESSED,
      LISTED,
    ),
    search: { sub: "warzywa", q: "papryka" },
  },
  {
    item: /pieczark/,
    product: /pieczark/,
    not: either(/konserw|marynow|puszk|puszc|w zalewie|mrozon|krem|farsz|nadziew|grillowan|suszon/, PROCESSED, LISTED),
    search: { sub: "warzywa", q: "pieczarki" },
  },
  {
    item: /passata|pomidor/,
    product: /passata|przecier pomidor|pomidory (krojone|w puszce)/,
    search: { sub: "", q: "passata" },
  },
  { item: /salsa/, product: /salsa/, not: /\bdip\b|serow/, search: { sub: "", q: "salsa" } },
  {
    item: /warzyw/,
    product: /brokul|kalafior|marchew|papryk|cukini|szpinak|warzyw|fasolka szparag|brukselk|kapust/,
    not: PROCESSED,
    search: { sub: "warzywa", q: "" },
  },
  {
    item: /banan/,
    product: /banan/,
    not: either(/chips|suszon|baton|jogurt|chlebek|koktajl|smoothie|\bmus\b|napoj|shake|\bsmak|mleko|milch/, FRUIT_FLAVOUR, LISTED),
    search: { sub: "owoce", q: "banan" },
  },
  {
    item: /jablk/,
    product: /jablk/,
    not: either(/\bsok\b|\bmus\b|suszon|chips|ocet|szarlot|napoj|koktajl|smoothie|\bsmak/, FRUIT_FLAVOUR, LISTED),
    search: { sub: "owoce", q: "jabłk" },
  },
  {
    // Frozen strawberries, blueberries or raspberries (a mix counts): the bag must say frozen.
    item: /owoce mrozon|mrozone owoce/,
    product: /^(?=.*mrozon)(?=.*(truskaw|malin|jagod|borowk|owoc))/,
    not: either(/lody|sorbet|deser|smoothie|koktajl|ciast|w czekoladzie/, PROCESSED),
    search: { sub: "", q: "mrożone owoce" },
  },
  {
    item: /jagod|borowk|malin|truskaw/,
    product: /malin|borowk|jagod|truskaw|owoce lesne/,
    not: either(
      /pomidor|dzem|jogurt|serek|\bsok\b|czekolad|syrop|herbat|napar|owsiank|ciast|chlebek|\bsmak|o smaku|\bwoda\b|napoj|koktajl|yopro/,
      PROCESSED,
      FRUIT_FLAVOUR,
    ),
    search: { sub: "", q: "borówk" },
  },
  {
    item: /owoce/,
    product: /jablk|banan|gruszk|winogron|pomarancz|mandaryn|kiwi|malin|borowk|truskaw|pomelo/,
    not: either(
      /pomidor|\bsok\b|\bmus\b|suszon|chips|dzem|jogurt|serek|czekolad|baton|ciast|deser|lody|owsiank|\bsmak|o smaku|\bwoda\b|napoj|koktajl/,
      PROCESSED,
      FRUIT_FLAVOUR,
    ),
    search: { sub: "owoce", q: "" },
  },
  {
    item: /maslo orzechowe|\bpb\b/,
    product: /maslo orzechowe|maslo z orzech|krem\b.*\borzech/,
    not: either(/baton|snack|ciastk|wafel|wafl|czekolad|drazet/, PROCESSED),
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
    product: /whey|odzywk\w* bialk|bialko serwatk|bialko wpc|\bwpc\b|\bwpi\b/,
    not: /wlos|kosmet|szampon|balsam|krem do|skor|twarz|roslin|nawoz|kwiat|\bbar\b|baton|wafel|ciastk|cookie|napoj|drink|\bshake\b|pudding|jogurt|skyr|deser/,
    search: { sub: "", q: "odżywk" },
  },
];

/** Words too general to look an item up by. */
const STOP_WORDS = new Set(["light", "gotowy", "mieszanka", "microwave", "chudy", "naturalny", "polski", "bez", "lub", "dla", "the"]);

/** Sweets and snacks that carry an ingredient's name ("ciasteczka kakaowe", "pestki"). */
const SNACKS = /ciastk|ciastecz|herbatnik|draz|baton|wafel|wafl|cukierk|lizak|zelk|chrup|chips|krakers|jerky|przekask/;

/**
 * An item no rule knows: its own words are the search, and the offer must
 * say all of them. A short word must be the whole word ("pesto" is not
 * "pestki"); longer ones may end differently ("sojowy" / "sojowa").
 */
function genericRule(itemName: string): Rule | undefined {
  const words = itemName
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 3 && !STOP_WORDS.has(fold(word)));
  // Short words ("sos") must be in the offer too, but alone they say too little to look anything up.
  if (!words.some((word) => word.length >= 4)) return undefined;
  const patterns = words.map((word) => {
    const folded = fold(word);
    return folded.length <= 5 ? `\\b${folded}\\b` : folded.slice(0, folded.length - 1);
  });
  const snacks = SNACKS.test(fold(itemName));
  return {
    item: /./,
    product: new RegExp(patterns.map((pattern) => `(?=.*${pattern})`).join("")),
    // A flavour of the thing ("Curry Flavour", "o smaku curry") is not the thing.
    not: either(PROCESSED, /\bsmak|o smaku|flavou?r/, ...(snacks ? [] : [SNACKS])),
    search: { sub: "", q: words.find((word) => word.length >= 4) ?? words[0] },
  };
}

function ruleFor(itemName: string): Rule | undefined {
  const name = fold(itemName);
  return RULES.find((candidate) => candidate.item.test(name)) ?? genericRule(itemName);
}

/**
 * The keyword rules alone: could this product be the item (its kind, not yet
 * its variant). `grocery/matching.ts` adds the variant checks on top.
 */
export function ruleAccepts(itemName: string, productName: string): boolean {
  const rule = ruleFor(itemName);
  if (!rule) return false;
  const product = fold(productName);
  return rule.product.test(product) && !rule.not?.test(product) && !NOT_PLAIN.test(product);
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
  [/owoce mrozon|mrozone owoce/, () => pack(450, "g")],
  [/jagod|borowk|malin|truskaw/, () => pack(250, "g")],
  [
    /kurczak|indyk|indycz|drobi|\bdrob\b|wolowin|wieprzow|schab|karkowk|lopatk|mielon|losos|banan|jablk|owoce|warzyw|batat/,
    perKilo,
  ],
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
  [/^(?!.*(passata|krojon|puszk|puszc|suszon|przecier)).*pomidor|ogork|ogorek|cebul|papryk|pieczark/, perKilo],
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
  [/kurczak|drobi|\bdrob\b/, 6],
  [/indyk|indycz/, 10],
  [/wolowin/, 18],
  [/wieprzow|schab|karkowk|lopatk|mielon/, 12],
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
      // The leaflet's pack field is empty but its name says "400 g": that is the pack, not an assumption.
      const named = parsePack(promo.name);
      if (named && packInItemUnit(named.quantity, named.unit, item.unit) !== null) {
        return [{ promo: { ...promo, packQuantity: named.quantity, packUnit: named.unit }, packAssumed: false }];
      }
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
