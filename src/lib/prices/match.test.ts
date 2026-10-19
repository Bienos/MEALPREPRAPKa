import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { parseBlixPromos } from "./blix.ts";
import { parseLidlPromos } from "./lidl.ts";
import { blixSearchFor, matchPromos, priceKey, promoCandidates } from "./match.ts";
import type { ProductLink } from "./types.ts";

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
    ].map((name) => ({ ...leaflets[0], name, productKey: `blix:${name}` }));
    const fits = (itemName: string) => promoCandidates(itemName, "g", offers).map((p) => p.name);
    assert.deepEqual(fits("jogurt 2%"), ["Jogurt naturalny Krasula"]);
    assert.deepEqual(fits("owoce jagodowe"), ["Borówki amerykańskie Kaufland"]);
    assert.deepEqual(fits("feta light"), []);
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
    assert.equal(blixSearchFor("sos sojowy"), null);
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

  test("an unanswered candidate is only a suggestion", () => {
    const match = matchPromos({ name: "Jajka", unit: "szt" }, promos, []);
    assert.deepEqual(match.confirmed, []);
    assert.equal(match.suggestion?.productKey, eggs);
  });

  test("a confirmed product wins, and nothing more is asked", () => {
    const match = matchPromos({ name: "jajka", unit: "szt" }, promos, [link(eggs, true)]);
    assert.deepEqual(
      match.confirmed.map((promo) => promo.productKey),
      [eggs],
    );
    assert.equal(match.suggestion, null);
  });

  test("a confirmed link matches even when no keyword rule would", () => {
    const match = matchPromos({ name: "deser", unit: "g" }, promos, [link("lidl:11139172", true, "deser")]);
    assert.equal(match.confirmed[0]?.name, "MCENNEDY Deser mleczny o smaku brownie");
  });

  test("a 'no' moves on to the next candidate and is not asked again", () => {
    const first = matchPromos({ name: "owoce", unit: "g" }, promos, []).suggestion;
    assert.equal(first?.name, "Polskie jabłka czerwone, luzem");
    const next = matchPromos({ name: "owoce", unit: "g" }, promos, [link(first!.productKey, false, "owoce")]);
    assert.equal(next.suggestion?.name, "RYNECZEK LIDLA Winogrona ciemne, luzem");
    assert.deepEqual(next.confirmed, []);
  });

  test("answers are stored under the trimmed, lower-case item name", () => {
    assert.equal(priceKey("  Pierś z  kurczaka "), "pierś z kurczaka");
  });
});
