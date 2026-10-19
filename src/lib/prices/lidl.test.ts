import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { parseLidlPromos } from "./lidl.ts";
import { parsePack } from "./promo.ts";

/**
 * A real lidl.pl search response from Monday 19.10.2026 (food category), with
 * only pictures, tracking scores and render metadata removed. Prices, dates
 * and fine print are as Lidl sent them.
 */
const fixture = JSON.parse(readFileSync(new URL("./fixtures/lidl-food-2026-10-19.json", import.meta.url), "utf8"));
const monday = new Date("2026-10-19T08:00:00+02:00");
const promos = parseLidlPromos(fixture, monday);
const byKey = (key: string) => {
  const promo = promos.find((p) => p.productKey === key);
  assert.ok(promo, key);
  return promo;
};

describe("parseLidlPromos", () => {
  test("keeps the 30 priced food promos and drops beer and items without a deal", () => {
    assert.equal(promos.length, 30);
    assert.ok(promos.every((p) => p.shop === "lidl"));
    assert.ok(!promos.some((p) => /pinta|nepomucen|parkside/i.test(p.name)));
  });

  test("a plain price cut: shown price, old price struck through, store dates", () => {
    const pork = byKey("lidl:11437346");
    assert.equal(pork.name, "RZEŹNIK Schab wieprzowy, XXL");
    assert.deepEqual([pork.packQuantity, pork.packUnit], [1000, "g"]);
    assert.deepEqual([pork.promoPrice, pork.regularPrice], [9.99, 16.95]);
    assert.deepEqual([pork.multibuy, pork.multibuyMin, pork.appOnly], [null, 1, false]);
    assert.deepEqual([pork.validFrom, pork.validTo], ["2026-10-19", "2026-10-21"]);
    assert.match(pork.conditions, /Limit: 9 kg na paragon/);
    assert.equal(pork.sourceUrl, "https://www.lidl.pl/p/rzeznik-schab-wieprzowy-xxl/p11437346");
  });

  test("'-50% przy zakupie 2': the shown price per pack from the 2nd pack", () => {
    const gouda = byKey("lidl:11426673");
    assert.equal(gouda.name, "PILOS Holenderska gouda w plastrach");
    assert.deepEqual([gouda.promoPrice, gouda.regularPrice, gouda.multibuyMin], [4.99, 9.99, 2]);
    assert.equal(gouda.multibuy, "-50% przy zakupie 2");
    // Lidl's own typo ("zakupoe") still reads as a two-pack deal.
    assert.equal(byKey("lidl:11029869").multibuyMin, 2);
  });

  test("'1+1 gratis' in Lidl Plus: per-pack price from the fine print, app only", () => {
    const mince = byKey("lidl:11405938");
    assert.equal(mince.name, "RZEŹNIK Mięso mielone z łopatki wieprzowej");
    assert.deepEqual([mince.promoPrice, mince.regularPrice, mince.multibuyMin], [5.49, 10.99, 2]);
    assert.deepEqual([mince.appOnly, mince.multibuy], [true, "1+1 gratis"]);
    assert.deepEqual([mince.packQuantity, mince.packUnit], [500, "g"]);
  });

  test("'2+1' and '8+4 gratis' without a stated per-pack price use the ratio", () => {
    const chocolate = byKey("lidl:11001765");
    assert.equal(chocolate.name, "FIN CARRÉ Czekolada");
    assert.deepEqual([chocolate.promoPrice, chocolate.regularPrice, chocolate.multibuyMin], [2.99, 4.49, 3]);
    const water = byKey("lidl:11411375");
    assert.deepEqual([water.promoPrice, water.regularPrice, water.multibuyMin], [1.66, 2.49, 12]);
    assert.deepEqual([water.packQuantity, water.packUnit], [1500, "ml"]);
  });

  test("a Lidl Plus price cut keeps its struck-through price", () => {
    const broccoli = byKey("lidl:11151157");
    assert.deepEqual([broccoli.promoPrice, broccoli.regularPrice, broccoli.appOnly], [3.89, 5.99, true]);
    assert.deepEqual([broccoli.validFrom, broccoli.validTo], ["2026-10-19", "2026-10-24"]);
  });

  test("a one-day deal and a 'Supercena' with nothing struck through", () => {
    const butter = byKey("lidl:11427027");
    assert.deepEqual([butter.validFrom, butter.validTo], ["2026-10-19", "2026-10-19"]);
    const eggs = byKey("lidl:11410158");
    assert.deepEqual([eggs.promoPrice, eggs.regularPrice, eggs.packQuantity, eggs.packUnit], [20.99, null, 30, "szt"]);
  });

  test("loose produce is priced per kilo and marked as sold by weight", () => {
    const apples = byKey("lidl:11214563");
    assert.equal(apples.loose, true);
    assert.deepEqual([apples.packQuantity, apples.packUnit, apples.promoPrice], [1000, "g", 2.49]);
    assert.equal(byKey("lidl:11029598").loose, false);
  });

  test("without store dates the price block's dates are used", () => {
    const chocolate = byKey("lidl:11001765");
    assert.deepEqual([chocolate.validFrom, chocolate.validTo], ["2026-10-14", "2026-10-24"]);
  });

  test("promos that already ended are left out", () => {
    const thursday = parseLidlPromos(fixture, new Date("2026-10-22T09:00:00+02:00"));
    assert.ok(thursday.every((p) => p.validTo === null || p.validTo >= "2026-10-22"));
    assert.ok(thursday.length > 0 && thursday.length < promos.length);
  });

  test("a response that no longer looks like Lidl's throws instead of returning nothing", () => {
    assert.throws(() => parseLidlPromos({ results: [] }), /format/);
    assert.throws(() => parseLidlPromos({ items: [{ product: { name: "x" } }] }), /format/);
    assert.deepEqual(parseLidlPromos({ items: [] }), []);
  });
});

describe("parsePack", () => {
  test("reads Lidl's pack texts into g, ml or szt", () => {
    assert.deepEqual(parsePack("300 g"), { quantity: 300, unit: "g" });
    assert.deepEqual(parsePack("2,5 kg"), { quantity: 2500, unit: "g" });
    assert.deepEqual(parsePack("30 szt."), { quantity: 30, unit: "szt" });
    assert.deepEqual(parsePack("4 x 125 g"), { quantity: 500, unit: "g" });
    assert.deepEqual(parsePack("Sześciosztuk, 6 x 1,5 L"), { quantity: 9000, unit: "ml" });
    assert.deepEqual(parsePack("Czterosztuk, 4x2 L"), { quantity: 8000, unit: "ml" });
    assert.deepEqual(parsePack("500 ml 1 L = 17,98"), { quantity: 500, unit: "ml" });
    assert.equal(parsePack("opakowanie"), null);
  });
});
