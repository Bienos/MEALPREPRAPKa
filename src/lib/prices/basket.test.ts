import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildBasket, costOf, isPromoActive, priceLine, type NeededItem, type PriceOption } from "./basket.ts";
import type { Shop, ShopPrice, ShopPromo } from "./types.ts";

function promo(overrides: Partial<ShopPromo> = {}): ShopPromo {
  return {
    shop: "lidl",
    productKey: "lidl:1",
    name: "Filet z piersi kurczaka",
    packQuantity: 500,
    packUnit: "g",
    loose: false,
    promoPrice: 10,
    regularPrice: 15,
    validFrom: "2026-10-19",
    validTo: "2026-10-21",
    conditions: "",
    appOnly: false,
    multibuy: null,
    multibuyMin: 1,
    sourceUrl: "https://www.lidl.pl/p/x/p1",
    ...overrides,
  };
}

function mine(overrides: Partial<ShopPrice> = {}): ShopPrice {
  return { itemName: "kurczak", shop: "biedronka", productLabel: "", packQuantity: 1000, packUnit: "g", price: 25, ...overrides };
}

const item = (quantity: number | null, unit: NeededItem["unit"] = "g", name = "kurczak"): NeededItem => ({
  id: `${name}-${quantity}`,
  name,
  quantity,
  unit,
});
const asPromo = (p: ShopPromo): PriceOption => ({ kind: "promo", promo: p });
const asMine = (p: ShopPrice): PriceOption => ({ kind: "mine", price: p });
const amount = (cost: ReturnType<typeof costOf>) => (cost && cost !== "unit" ? cost.amount : cost);

describe("costOf", () => {
  test("whole packs: ceil(needed / pack) x price", () => {
    const cost = costOf(item(1400), asPromo(promo()));
    assert.ok(cost && cost !== "unit");
    assert.deepEqual([cost.packs, cost.amount, cost.onPromo], [3, 30, true]);
    assert.equal(amount(costOf(item(1000), asPromo(promo()))), 20);
    assert.equal(amount(costOf(item(1400), asMine(mine()))), 50);
  });

  test("loose produce costs exactly what is taken", () => {
    const apples = promo({ name: "Jabłka, luzem", loose: true, packQuantity: 1000, promoPrice: 2.49 });
    assert.equal(amount(costOf(item(600, "g", "jabłko"), asPromo(apples))), 1.49);
  });

  test("a multi-buy counts only when the needed packs reach it", () => {
    const mince = promo({ promoPrice: 5.49, regularPrice: 10.99, multibuy: "1+1 gratis", multibuyMin: 2 });
    const two = costOf(item(1000), asPromo(mince));
    assert.ok(two && two !== "unit");
    assert.deepEqual([two.packs, two.amount, two.onPromo], [2, 10.98, true]);
    const one = costOf(item(400), asPromo(mince));
    assert.ok(one && one !== "unit");
    assert.deepEqual([one.amount, one.onPromo], [10.99, false]);
    // Three packs: one pair on the deal, the third at the regular price.
    assert.equal(amount(costOf(item(1400), asPromo(mince))), 21.97);
  });

  test("a multi-buy without a known regular price cannot price the leftover packs", () => {
    const deal = promo({ regularPrice: null, multibuyMin: 3, multibuy: "-50% przy zakupie 3" });
    assert.equal(costOf(item(400), asPromo(deal)), null);
    assert.equal(amount(costOf(item(1500), asPromo(deal))), 30);
  });

  test("no amount on the list means one pack", () => {
    assert.equal(amount(costOf(item(null, null, "curry"), asMine(mine({ price: 4.5 })))), 4.5);
  });

  test("pieces never mix with grams, grams and millilitres do", () => {
    assert.equal(costOf(item(10, "szt", "jajka"), asPromo(promo())), "unit");
    assert.equal(amount(costOf(item(700, "g", "passata"), asMine(mine({ packQuantity: 500, packUnit: "ml", price: 4 })))), 8);
  });
});

describe("priceLine", () => {
  test("takes the cheaper of a promo and my own price", () => {
    const line = priceLine(item(1000), [asMine(mine({ price: 18 })), asPromo(promo())]);
    assert.equal(line.cost?.amount, 18);
    assert.equal(line.cost?.option.kind, "mine");
  });

  test("says why an item has no price", () => {
    assert.equal(priceLine(item(500), []).missing, "no-price");
    assert.equal(priceLine(item(6, "szt", "jajka"), [asMine(mine())]).missing, "unit");
  });
});

describe("isPromoActive", () => {
  test("valid from the first to the last day, open-ended when there is no end", () => {
    assert.equal(isPromoActive(promo(), "2026-10-18"), false);
    assert.equal(isPromoActive(promo(), "2026-10-19"), true);
    assert.equal(isPromoActive(promo(), "2026-10-21"), true);
    assert.equal(isPromoActive(promo(), "2026-10-22"), false);
    assert.equal(isPromoActive(promo({ validTo: null }), "2026-12-01"), true);
  });
});

describe("buildBasket", () => {
  const items: NeededItem[] = [
    item(1000, "g", "kurczak"),
    item(1000, "g", "ryż"),
    item(500, "g", "skyr"),
    item(null, null, "curry"),
  ];
  // Lidl: kurczak on promo (20), ryż (6), skyr (8). Biedronka: kurczak 25, ryż 5, no skyr. Curry nowhere.
  const prices: Record<Shop, Record<string, PriceOption[]>> = {
    lidl: {
      kurczak: [asPromo(promo())],
      ryż: [asMine(mine({ shop: "lidl", itemName: "ryż", price: 6 }))],
      skyr: [asMine(mine({ shop: "lidl", itemName: "skyr", packQuantity: 500, price: 8 }))],
    },
    biedronka: {
      kurczak: [asMine(mine())],
      ryż: [asMine(mine({ itemName: "ryż", price: 5 }))],
    },
  };
  const summary = buildBasket(items, ["lidl", "biedronka"], (needed, shop) => prices[shop][needed.name] ?? []);
  const [lidl, biedronka] = summary.shops;

  test("each shop totals what it can price; unpriced items stay out", () => {
    assert.deepEqual([lidl.total, lidl.priced, lidl.onPromo], [34, 3, 1]);
    assert.deepEqual([biedronka.total, biedronka.priced, biedronka.onPromo], [30, 2, 0]);
    assert.equal(summary.itemCount, 4);
    assert.equal(lidl.lines[3].missing, "no-price");
  });

  test("the cheaper shop is decided on items priced at both", () => {
    assert.equal(summary.compared.count, 2);
    assert.deepEqual(summary.compared.totals, { lidl: 26, biedronka: 30 });
    assert.equal(summary.compared.cheapest, "lidl");
  });

  test("splitting buys each compared item where it is cheaper", () => {
    assert.deepEqual(summary.split, { total: 25, savings: 1 });
  });

  test("no comparison, pointer or split when no item is priced at both shops", () => {
    const lonely = buildBasket([items[2]], ["lidl", "biedronka"], (needed, shop) => prices[shop][needed.name] ?? []);
    assert.deepEqual(lonely.compared, { count: 0, totals: { lidl: 0, biedronka: 0 }, cheapest: null });
    assert.equal(lonely.split, null);
  });

  test("equal totals point at neither shop", () => {
    const same = buildBasket([items[1]], ["lidl", "biedronka"], () => [asMine(mine({ price: 5 }))]);
    assert.equal(same.compared.cheapest, null);
    assert.equal(same.split, null);
  });
});
