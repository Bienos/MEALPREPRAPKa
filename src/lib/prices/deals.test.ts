import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  countByShop,
  dayLabel,
  discountPercent,
  highlights,
  selectDeals,
  unitPriceLabel,
  type DealQuery,
} from "./deals.ts";
import type { ShopPromo } from "./types.ts";

const deal = (over: Partial<ShopPromo>): ShopPromo => ({
  shop: "lidl",
  productKey: "k",
  name: "Filet z piersi kurczaka",
  packQuantity: 1000,
  packUnit: "g",
  loose: false,
  promoPrice: 19.99,
  regularPrice: 24.99,
  validFrom: "2026-10-19",
  validTo: "2026-10-25",
  conditions: "",
  appOnly: false,
  multibuy: null,
  multibuyMin: 1,
  sourceUrl: "https://example.com",
  ...over,
});

const query: DealQuery = { today: "2026-10-20", shop: null, search: "", mineOnly: false, when: "now" };

describe("deals", () => {
  test("the discount against the regular price, only when there is one", () => {
    assert.equal(discountPercent({ promoPrice: 19.99, regularPrice: 24.99 }), 20);
    assert.equal(discountPercent({ promoPrice: 19.99, regularPrice: null }), null);
    assert.equal(discountPercent({ promoPrice: 19.99, regularPrice: 19.99 }), null);
  });

  test("price per kilo, litre or piece, read from the pack", () => {
    assert.equal(unitPriceLabel(deal({ packQuantity: 500, promoPrice: 6.5 })), "13,00 zł/kg");
    assert.equal(unitPriceLabel(deal({ packQuantity: 750, packUnit: "ml", promoPrice: 7.5 })), "10,00 zł/l");
    assert.equal(unitPriceLabel(deal({ packQuantity: 10, packUnit: "szt", promoPrice: 12 })), "1,20 zł/szt.");
    assert.equal(unitPriceLabel(deal({ packQuantity: null, packUnit: null })), null);
    assert.equal(unitPriceLabel(deal({ loose: true, promoPrice: 8.99 })), "8,99 zł/kg");
  });

  test("this week and the next are separate; ended deals and shelf prices are left out", () => {
    const promos = [
      deal({ productKey: "now" }),
      deal({ productKey: "soon", validFrom: "2026-10-26", validTo: "2026-11-01" }),
      deal({ productKey: "ended", validTo: "2026-10-19" }),
      deal({ productKey: "shelf", shelf: true }),
    ];
    assert.deepEqual(
      selectDeals(promos, query, new Set()).map((p) => p.productKey),
      ["now"],
    );
    assert.deepEqual(
      selectDeals(promos, { ...query, when: "soon" }, new Set()).map((p) => p.productKey),
      ["soon"],
    );
  });

  test("filtered by shop and by every search word (accents ignored); biggest discount first, my list before that", () => {
    const promos = [
      deal({ productKey: "a", shop: "biedronka", name: "Pierś z kurczaka", promoPrice: 15, regularPrice: 20 }),
      deal({ productKey: "b", shop: "lidl", name: "Pierś z kurczaka Złota", promoPrice: 10, regularPrice: 20 }),
      deal({ productKey: "c", shop: "lidl", name: "Mleko 2%", promoPrice: 3, regularPrice: 3.2 }),
    ];
    assert.deepEqual(
      selectDeals(promos, { ...query, search: "piers kurczaka" }, new Set()).map((p) => p.productKey),
      ["b", "a"],
    );
    assert.deepEqual(
      selectDeals(promos, { ...query, shop: "lidl" }, new Set()).map((p) => p.productKey),
      ["b", "c"],
    );
    assert.deepEqual(
      selectDeals(promos, query, new Set(["biedronka|a"])).map((p) => p.productKey),
      ["a", "b", "c"],
    );
    assert.deepEqual(
      selectDeals(promos, { ...query, mineOnly: true }, new Set(["biedronka|a"])).map((p) => p.productKey),
      ["a"],
    );
  });

  test("counts per shop follow the search but not the shop filter", () => {
    const promos = [deal({ productKey: "a", shop: "lidl" }), deal({ productKey: "b", shop: "biedronka" })];
    const counts = countByShop(promos, { ...query, shop: "lidl" }, new Set());
    assert.deepEqual([counts.lidl, counts.biedronka, counts.auchan], [1, 1, 0]);
  });

  test("a day as 25.10", () => assert.equal(dayLabel("2026-10-25"), "25.10"));
});

describe("highlights", () => {
  const promos = [
    deal({
      productKey: "a",
      shop: "biedronka",
      name: "Świeży filet z piersi kurczaka Mega Paka",
      packQuantity: null,
      packUnit: null,
      promoPrice: 14.99,
    }),
    deal({
      productKey: "b",
      shop: "lidl",
      name: "Filet z piersi kurczaka 1 kg",
      packQuantity: 1000,
      packUnit: "g",
      promoPrice: 18.99,
    }),
    deal({
      productKey: "c",
      shop: "auchan",
      name: "Skyr naturalny Piątnica 150 g",
      packQuantity: 150,
      packUnit: "g",
      promoPrice: 2.99,
    }),
    deal({ productKey: "d", shop: "lidl", name: "Pasta do zębów", packQuantity: 75, packUnit: "ml", promoPrice: 4 }),
    deal({
      productKey: "e",
      shop: "lidl",
      name: "Filet z piersi kurczaka stary",
      packQuantity: 1000,
      packUnit: "g",
      promoPrice: 9.99,
      validTo: "2026-10-19",
    }),
  ];

  test("each staple that is on offer, cheapest per kilo first; the rest is left out", () => {
    const groups = highlights(promos, "2026-10-20");
    assert.deepEqual(
      groups.map((group) => group.label),
      ["Kurczak", "Skyr"],
    );
    const chicken = groups[0].deals.map((entry) => [entry.promo.productKey, entry.assumed]);
    assert.deepEqual(chicken, [
      ["a", true],
      ["b", false],
    ]);
  });

  test("an ended deal is not a highlight", () => {
    assert.ok(
      !highlights(promos, "2026-10-20")
        .flatMap((group) => group.deals)
        .some((entry) => entry.promo.productKey === "e"),
    );
  });
});
