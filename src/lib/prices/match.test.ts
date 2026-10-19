import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { parseLidlPromos } from "./lidl.ts";
import { matchPromos, priceKey, promoCandidates } from "./match.ts";
import type { ProductLink } from "./types.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/lidl-food-2026-10-19.json", import.meta.url), "utf8"));
const promos = parseLidlPromos(fixture, new Date("2026-10-19T08:00:00+02:00"));
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

describe("matchPromos", () => {
  const eggs = "lidl:11410158";
  const link = (productKey: string, matches: boolean, itemName = "jajka"): ProductLink => ({
    itemName,
    shop: "lidl",
    productKey,
    matches,
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
