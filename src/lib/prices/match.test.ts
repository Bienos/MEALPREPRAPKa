import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { parseBlixPromos } from "./blix.ts";
import { parseLidlPromos } from "./lidl.ts";
import { blixSearchFor, matchPromos, priceKey, promoCandidates, relevantPromos } from "./match.ts";
import type { ProductLink, ShopPromo } from "./types.ts";

const read = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const monday = new Date("2026-10-19T08:00:00+02:00");
const promos = parseLidlPromos(read("lidl-food-2026-10-19.json"), monday);
const leaflets = [
  ...parseBlixPromos(read("blix-mieso-filet-z-piersi-kurczaka-2026-10-19.json"), monday),
  ...parseBlixPromos(read("blix-nabial-skyr-2026-10-19.json"), monday),
];
const names = (itemName: string, unit: "g" | "ml" | "szt" | null = "g") =>
  promoCandidates(itemName, unit, promos).map((promo) => promo.name);

describe("promoCandidates", () => {
  test("matches this week's Lidl promos to items from the meal sheet", () => {
    assert.deepEqual(names("jajka", "szt"), ["ZŁOTA NIOSKA Świeże jaja ściółkowe, wielkość M, klasa A"]);
    assert.deepEqual(names("ziemniaki"), ["QUALITÉ SUISSE Ziemniaki jadalne"]);
    assert.deepEqual(names("jabłko"), ["Polskie jabłka czerwone, luzem"]);
    assert.deepEqual(names("warzywa"), ["Brokuły"]);
    assert.deepEqual(names("owoce jagodowe"), ["RYNECZEK LIDLA Maliny"]);
    assert.deepEqual(names("ser light"), ["PILOS Holenderska gouda w plastrach"]);
  });

  test("a broad item lists every fit, cheapest per gram first", () => {
    assert.deepEqual(names("owoce"), [
      "Polskie jabłka czerwone, luzem",
      "RYNECZEK LIDLA Winogrona ciemne, luzem",
      "RYNECZEK LIDLA Pomelo żółte, luzem",
      "RYNECZEK LIDLA Maliny",
    ]);
  });

  test("leaves out products that are not the plain ingredient, or have no rule", () => {
    assert.deepEqual(names("kurczak"), []);
    assert.deepEqual(names("banan"), []);
    assert.deepEqual(names("coś nowego"), []);
    // Frytki are potatoes, but not what "ziemniaki" means on the list.
    assert.ok(!names("ziemniaki").some((name) => /frytki/i.test(name)));
  });

  test("never suggests a pack that cannot be compared with the list amount", () => {
    // Nashi pears are sold per piece; the list counts fruit in grams.
    assert.ok(!names("owoce").some((name) => /gruszka/i.test(name)));
    assert.deepEqual(names("jajka", "g"), []);
  });
});

describe("leaflet offers (Blix)", () => {
  const leafletNames = (itemName: string) =>
    promoCandidates(itemName, "g", leaflets).map((p) => `${p.shop}: ${p.name}`);

  test("plain skyr only: no drinkable, flavoured or 'ze skyrem' products", () => {
    const skyr = leafletNames("skyr");
    assert.ok(skyr.length > 0);
    assert.ok(
      skyr.every((name) => !/pitny|do picia|jogobella|serek|truskaw|smaki/i.test(name)),
      skyr.join("\n"),
    );
  });

  test("the meals' kurczak is chicken breast, never duck or turkey", () => {
    const chicken = leafletNames("kurczak");
    assert.ok(chicken.length > 0);
    assert.ok(
      chicken.every((name) => /kurczak/i.test(name) && /(pier|filet)/i.test(name)),
      chicken.join("\n"),
    );
    assert.deepEqual(leafletNames("pierś z kurczaka"), chicken);
  });

  test("names that look close but are not the item stay out", () => {
    const offers = [
      "Jogurt Piątnica Skyr",
      "Chleb z jogurtem naturalnym Piekuś",
      "Jogurt naturalny Krasula",
      "Pomidory malinowe Aldi",
      "Borówki amerykańskie Kaufland",
      "Chleb pszenny wegetariański z fetą Netto",
      "Złoty indyk Indykpol",
      "Mięso mielone z indyka Carrefour",
      "Filet z piersi indyka Stokrotka",
      "Filet z indyka wędzony Kraina Wędlin",
      "Jogurt Pierot borówkowy",
      "Owsianka Lubella z bananami i truskawkami",
    ].map((name) => ({ ...leaflets[0], name, productKey: `blix:${name}` }));
    const fits = (itemName: string) => promoCandidates(itemName, "g", offers).map((p) => p.name);
    assert.deepEqual(fits("jogurt 2%"), ["Jogurt naturalny Krasula"]);
    assert.deepEqual(fits("owoce jagodowe"), ["Borówki amerykańskie Kaufland"]);
    assert.deepEqual(fits("feta light"), []);
    // A fruit yogurt or porridge is not "owoce".
    assert.deepEqual(fits("owoce"), ["Borówki amerykańskie Kaufland"]);
    assert.deepEqual(fits("indyk"), ["Mięso mielone z indyka Carrefour", "Filet z piersi indyka Stokrotka"]);
    assert.deepEqual(fits("szynka z indyka"), ["Filet z indyka wędzony Kraina Wędlin"]);
  });

  test("each common sheet item knows where to look in the leaflets", () => {
    assert.deepEqual(blixSearchFor("Kurczak"), { sub: "mieso", q: "filet" });
    assert.deepEqual(blixSearchFor("szynka z indyka"), {
      sub: "wedliny",
      q: "indyk",
    });
    assert.deepEqual(blixSearchFor("indyk"), { sub: "mieso", q: "indyk" });
    assert.deepEqual(blixSearchFor("skyr"), { sub: "nabial", q: "skyr" });
    assert.deepEqual(blixSearchFor("ryż microwave gotowy"), {
      sub: "ryz",
      q: "",
    });
    assert.deepEqual(blixSearchFor("warzywa / mieszanka"), {
      sub: "warzywa",
      q: "",
    });
    assert.equal(blixSearchFor("xyz"), null);
  });
});

describe("matchPromos", () => {
  const eggs = "lidl:11410158";
  const link = (productKey: string, matches: boolean, itemName = "jajka"): ProductLink => ({
    itemName,
    shop: "lidl",
    productKey,
    matches,
    packQuantity: null,
    packUnit: null,
    packLoose: false,
  });

  test("a confirmed leaflet offer with no pack takes the one I gave, sold by weight included", () => {
    const offer = leaflets.find((p) => p.shop === "biedronka" && /mega paka/i.test(p.name));
    assert.ok(offer && offer.packQuantity === null);
    const given: ProductLink = {
      ...link(offer.productKey, true, "kurczak"),
      shop: "biedronka",
      packQuantity: 1000,
      packUnit: "g",
      packLoose: true,
    };
    const match = matchPromos(
      { name: "kurczak", unit: "g" },
      leaflets.filter((p) => p.shop === "biedronka"),
      [given],
    );
    assert.deepEqual(
      match.confirmed.map((p) => [p.packQuantity, p.packUnit, p.loose]),
      [[1000, "g", true]],
    );
  });

  test("an unanswered candidate is priced as an estimate, with the pack it names", () => {
    const match = matchPromos({ name: "Jajka", unit: "szt" }, promos, []);
    assert.deepEqual(match.confirmed, []);
    assert.deepEqual(
      match.estimates.map((e) => [e.promo.productKey, e.packAssumed]),
      [[eggs, false]],
    );
  });

  test("a leaflet price with no pack gets the usual pack of that product, and says so", () => {
    const biedronka = leaflets.filter((p) => p.shop === "biedronka");
    const [first] = matchPromos({ name: "kurczak", unit: "g" }, biedronka, []).estimates;
    // Fresh chicken fillet is quoted per kilo and paid for by weight.
    assert.deepEqual(
      [first.promo.packQuantity, first.promo.packUnit, first.promo.loose, first.packAssumed],
      [1000, "g", true, true],
    );
    // Skyr: a cheap one is a small cup, a dearer one a big tub.
    const skyrOffers = leaflets.filter((p) => /islandzkiego SBA/.test(p.name));
    const sba = matchPromos({ name: "skyr", unit: "g" }, skyrOffers, []).estimates[0];
    assert.deepEqual([sba.promo.packQuantity, sba.promo.packUnit], [450, "g"]);
  });

  test("an item the list counts in grams is never priced from a pack in pieces", () => {
    const offer = {
      ...leaflets[0],
      name: "Jajka kurze M",
      productKey: "blix:jajka",
      packQuantity: null,
      packUnit: null,
    };
    assert.deepEqual(matchPromos({ name: "jajka", unit: "g" }, [offer], []).estimates, []);
    assert.equal(matchPromos({ name: "jajka", unit: "szt" }, [offer], []).estimates[0].promo.packQuantity, 10);
  });

  test("a confirmed product wins, and no estimates are made", () => {
    const match = matchPromos({ name: "jajka", unit: "szt" }, promos, [link(eggs, true)]);
    assert.deepEqual(
      match.confirmed.map((promo) => promo.productKey),
      [eggs],
    );
    assert.deepEqual(match.estimates, []);
  });

  test("a confirmed link matches even when no keyword rule would", () => {
    const match = matchPromos({ name: "deser", unit: "g" }, promos, [link("lidl:11139172", true, "deser")]);
    assert.equal(match.confirmed[0]?.name, "MCENNEDY Deser mleczny o smaku brownie");
  });

  test("a 'no' drops that offer and the next one is used", () => {
    const biedronka = leaflets.filter((p) => p.shop === "biedronka");
    const [first, second] = matchPromos({ name: "kurczak", unit: "g" }, biedronka, []).estimates;
    assert.ok(first && second);
    const next = matchPromos({ name: "kurczak", unit: "g" }, biedronka, [
      { ...link(first.promo.productKey, false, "kurczak"), shop: "biedronka" },
    ]);
    assert.deepEqual(
      next.estimates.map((e) => e.promo.productKey),
      [second.promo.productKey],
    );
  });

  test("a broad item is priced at the middle offer, not the luckiest cheap one", () => {
    const all = matchPromos({ name: "owoce", unit: "g" }, promos, []).estimates;
    assert.equal(all.length, 1);
    const sorted = promoCandidates("owoce", "g", promos);
    assert.equal(all[0].promo.productKey, sorted[Math.floor(sorted.length / 2)].productKey);
  });

  test("an item no rule knows is looked up by its own words", () => {
    assert.deepEqual(blixSearchFor("pesto"), { sub: "", q: "pesto" });
    assert.deepEqual(blixSearchFor("sos sojowy"), { sub: "", q: "sojowy" });
    assert.equal(blixSearchFor("xyz"), null);
  });

  test("answers are stored under the trimmed, lower-case item name", () => {
    assert.equal(priceKey("  Pierś z  kurczaka "), "pierś z kurczaka");
  });
});

describe("relevantPromos", () => {
  test("keeps what could be an item on the list and what I confirmed, and drops the rest", () => {
    const biedronka = leaflets.filter((p) => p.shop === "biedronka");
    const confirmed = {
      itemName: "coś",
      shop: "biedronka" as const,
      productKey: biedronka[0].productKey,
      matches: true,
      packQuantity: null,
      packUnit: null,
      packLoose: false,
    };
    const unrelated = { ...leaflets[0], name: "Kawa mielona Family Classic", productKey: "blix:kawa" };
    const kept = relevantPromos([{ name: "skyr", unit: "g" }], [...leaflets, unrelated], []);
    assert.ok(kept.length > 0 && kept.every((p) => /skyr/i.test(p.name)));
    assert.ok(!kept.some((p) => p.productKey === "blix:kawa"));
    // A confirmed product stays even when no rule would pick it.
    const withLink = relevantPromos([{ name: "skyr", unit: "g" }], [...leaflets, unrelated], [confirmed]);
    assert.ok(withLink.some((p) => p.productKey === biedronka[0].productKey));
  });
});

describe("fresh vegetables of the mix", () => {
  const promo = (name: string): ShopPromo => ({
    shop: "biedronka",
    productKey: `k:${name}`,
    name,
    packQuantity: 1000,
    packUnit: "g",
    loose: true,
    promoPrice: 5,
    regularPrice: null,
    validFrom: "2026-10-19",
    validTo: "2026-10-25",
    conditions: "",
    appOnly: false,
    multibuy: null,
    multibuyMin: 1,
    sourceUrl: "x",
  });
  const names = (item: string, ...products: string[]) =>
    promoCandidates(item, "g", products.map(promo)).map((candidate) => candidate.name);

  test("the plain vegetable, not the tin, jar, sauce or powder", () => {
    assert.deepEqual(names("pomidor", "Pomidory malinowe", "Pomidory krojone Pudliszki", "Ketchup pomidorowy"), [
      "Pomidory malinowe",
    ]);
    assert.deepEqual(names("ogórek", "Ogórek zielony", "Ogórki kiszone Polskie", "Korniszony"), ["Ogórek zielony"]);
    assert.deepEqual(names("cebula", "Cebula żółta", "Cebula prażona", "Cebula w oleju"), ["Cebula żółta"]);
    assert.deepEqual(names("papryka", "Papryka czerwona", "Papryka mielona słodka", "Papryka konserwowa"), [
      "Papryka czerwona",
    ]);
    assert.deepEqual(names("pieczarki", "Pieczarki białe", "Pieczarki marynowane", "Pieczarki w puszce"), [
      "Pieczarki białe",
    ]);
  });

  test("frozen fruit: a frozen bag of strawberries, raspberries or blueberries, never fresh fruit or ice cream", () => {
    assert.deepEqual(
      names(
        "owoce mrożone",
        "Mrożone maliny Hortex 280 g",
        "Truskawki świeże",
        "Owoce mrożone mix 450 g",
        "Lody truskawkowe mrożone",
      ),
      ["Mrożone maliny Hortex 280 g", "Owoce mrożone mix 450 g"],
    );
  });

  test("passata and tinned tomatoes are still found for their own items", () => {
    assert.deepEqual(names("passata pomidorowa", "Passata klasyczna"), ["Passata klasyczna"]);
  });
});
