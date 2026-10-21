import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { matchName, parseFriscoFeed, toFriscoShelfPrice } from "./frisco.ts";

const feed = JSON.parse(readFileSync(new URL("./fixtures/frisco-feed-2026-10-19.json", import.meta.url), "utf8"));
const items = parseFriscoFeed(feed);
const priceOf = (start: string) => {
  const item = items.find((candidate) => candidate.name.startsWith(start));
  assert.ok(item, start);
  return toFriscoShelfPrice(item);
};

describe("Frisco feed", () => {
  test("the pack comes from the name when it says one, else from the feed's pack size", () => {
    const eggs = priceOf("Jaja kurze z chowu ściółkowego");
    assert.deepEqual([eggs?.packQuantity, eggs?.packUnit, eggs?.loose, eggs?.price], [10, "szt", false, 13.19]);
    const milk = priceOf("Mleko 2% UHT");
    assert.deepEqual([milk?.packQuantity, milk?.packUnit, milk?.price], [1000, "ml", 3.69]);
    const baked = priceOf("Filet z piersi kurczaka pieczony");
    assert.deepEqual([baked?.packQuantity, baked?.packUnit], [200, "g"]);
    const rice = priceOf("Ryż biały (4x100g)");
    assert.deepEqual([rice?.packQuantity, rice?.packUnit, rice?.price], [400, "g", 3.49]);
  });

  test("a product sold by weight is priced at its average weight, loose", () => {
    const ham = toFriscoShelfPrice({
      ...items[0],
      name: "Szynka z Indyka (120g-180g)",
      unit: "Kilogram",
      grammage: 0.15,
      price: 6.69,
    });
    assert.deepEqual([ham?.packQuantity, ham?.packUnit, ham?.loose, ham?.price], [150, "g", true, 6.69]);
    const turkey = priceOf("Filet z piersi indyka");
    assert.deepEqual([turkey?.packQuantity, turkey?.packUnit, turkey?.loose, turkey?.price], [1000, "g", true, 53.99]);
  });

  test("a product weighed by the feed but counted in its name is priced by the weight", () => {
    const tortilla = { ...items[0], name: "Tortilla pszenna - 25 cm (4 szt.)", unit: "Kilogram" as const, grammage: 0.25, price: 4.99 };
    const shelf = toFriscoShelfPrice(tortilla);
    assert.deepEqual([shelf?.packQuantity, shelf?.packUnit, shelf?.loose], [250, "g", false]);
    assert.equal(matchName(tortilla), "Tortilla pszenna - 25 cm");
    // Eggs are sold by the piece in the feed: the count stays the pack.
    const eggs = priceOf("Jaja kurze z chowu ściółkowego");
    assert.deepEqual([eggs?.packQuantity, eggs?.packUnit], [10, "szt"]);
  });

  test("the weight range is left out of the name the matching reads", () => {
    const item = (name: string) => ({ ...items[0], name, unit: "Kilogram" as const });
    assert.equal(matchName(item("Banany kiść 4-6 szt. (800g-1200g)")), "Banany kiść");
    assert.equal(matchName(item("Filet z piersi z kurczaka 480-720g")), "Filet z piersi z kurczaka");
    assert.equal(matchName(item("Mleko 2% UHT")), "Mleko 2% UHT");
  });

  test("seasoning mixes and snacks, whose brand only the URL names, are left out", () => {
    const product = (id: number, name: string, slug: string) => ({
      id,
      name: { pl: name },
      unitOfMeasure: "Kilogram",
      packSize: 1,
      grammage: 0.4,
      price: { price: 5 },
      isAvailable: true,
      productUrl: `https://www.frisco.pl/pid,${id}/n,${slug}/stn,product`,
    });
    const parsed = parseFriscoFeed({
      products: [
        product(1, "Spaghetti Napoli", "winiary-pomysl-na...-spaghetti-napoli"),
        product(2, "pomidor oliwki", "bake-rolls-pomidor-oliwki"),
        product(3, "Makaron spaghetti", "barilla-makaron-spaghetti"),
      ],
    });
    assert.deepEqual(parsed.map((item) => item.name), ["Makaron spaghetti"]);
  });

  test("a carton of many packs for one price is left out", () => {
    assert.ok(!items.some((item) => item.price > 50 && item.name.startsWith("Ryż biały")));
  });

  test("stock and links are kept; a feed that no longer looks right throws", () => {
    assert.ok(items.some((item) => item.inStock) && items.some((item) => !item.inStock));
    assert.ok(items.every((item) => item.productKey.startsWith("frisco:")));
    assert.throws(() => parseFriscoFeed({ products: [] }), /Frisco/);
    assert.throws(() => parseFriscoFeed(null), /Frisco/);
  });
});
