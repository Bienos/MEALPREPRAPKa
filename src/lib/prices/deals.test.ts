import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { countByShop, dayLabel, discountPercent, selectDeals, unitPriceLabel, type DealQuery } from "./deals.ts";
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
