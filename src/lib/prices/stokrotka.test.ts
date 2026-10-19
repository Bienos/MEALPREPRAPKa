import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { catalogCandidates } from "./match.ts";
import { parseFeed, toShelfPrice } from "./stokrotka.ts";

/** Part of sklep.stokrotka.pl's product feed on 19.10.2026: its first items and a few kinds the list uses. */
const feed = parseFeed(readFileSync(new URL("./fixtures/stokrotka-feed-2026-10-19.xml", import.meta.url), "utf8"));
const byName = (part: string) => {
  const found = feed.find((item) => item.name.includes(part));
  assert.ok(found, part);
  return found;
};

describe("parseFeed", () => {
  test("every item with an id, a title, a link and a price, keyed by its id", () => {
    assert.equal(feed.length, 20);
    const serek = byName("Serek wiejski naturalny");
    assert.deepEqual(
      [serek.productKey, serek.price, serek.inStock, serek.byWeight],
      ["stokrotka:" + serek.productKey.slice(10), 2.99, true, false],
    );
    assert.match(serek.url, /^https:\/\/sklep\.stokrotka\.pl\/produkt\//);
  });

  test("out of stock is kept, and says so", () => {
    assert.equal(byName("Oliwa Goya z Oliwek Extra Virgin 250ml").inStock, false);
  });

  test("a feed that no longer looks like the shop's throws instead of returning nothing", () => {
    assert.throws(() => parseFeed("<rss><channel></channel></rss>"), /plik z produktami/);
  });
});

describe("toShelfPrice", () => {
  test("a pack: the price and the pack named in the title", () => {
    const price = toShelfPrice(byName("Piątnica Serek wiejski naturalny"));
    assert.deepEqual([price?.price, price?.packQuantity, price?.packUnit, price?.loose], [2.99, 200, "g", false]);
    const rice = toShelfPrice(byName("Cenos Ryż biały długi"));
    // "400 g (4 x 100 g)" is one 400 g pack.
    assert.deepEqual([rice?.packQuantity, rice?.packUnit], [400, "g"]);
  });

  test("fresh meat sold by weight: the price is per kilo, paid for what is taken", () => {
    const chicken = toShelfPrice(byName("Filet z piersi kurczaka (średnia waga"));
    assert.deepEqual(
      [chicken?.price, chicken?.packQuantity, chicken?.packUnit, chicken?.loose],
      [24.99, 1000, "g", true],
    );
  });

  test("eggs in pieces and a title with no pack", () => {
    const eggs = toShelfPrice(byName("Farmio Jaja świeże"));
    assert.deepEqual([eggs?.packQuantity, eggs?.packUnit], [10, "szt"]);
    assert.equal(toShelfPrice({ ...byName("Chleb Razowy"), name: "Chleb razowy" }), null);
  });
});

describe("which feed products are used for an item", () => {
  test("the plain product, not the flavoured, the chocolate egg or the baby porridge", () => {
    const names = (item: string, unit: "g" | "szt") => catalogCandidates(item, unit, feed, 10).map((p) => p.name);
    assert.ok(names("skyr", "g").every((name) => /naturalny/.test(name)));
    assert.ok(names("jajka", "szt").every((name) => /Jaj/.test(name) && !/Milka|Owijki/.test(name)));
    assert.deepEqual(names("owoce", "g"), []);
  });
});
