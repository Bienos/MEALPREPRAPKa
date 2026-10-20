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
  return {
    itemName: "kurczak",
    shop: "biedronka",
    productLabel: "",
    packQuantity: 1000,
    packUnit: "g",
    price: 25,
    ...overrides,
  };
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
    const apples = promo({
      name: "Jabłka, luzem",
      loose: true,
      packQuantity: 1000,
      promoPrice: 2.49,
    });
    assert.equal(amount(costOf(item(600, "g", "jabłko"), asPromo(apples))), 1.49);
  });

  test("a multi-buy counts only when the needed packs reach it", () => {
    const mince = promo({
      promoPrice: 5.49,
      regularPrice: 10.99,
      multibuy: "1+1 gratis",
      multibuyMin: 2,
    });
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
    const deal = promo({
      regularPrice: null,
      multibuyMin: 3,
      multibuy: "-50% przy zakupie 3",
    });
    assert.equal(costOf(item(400), asPromo(deal)), null);
    assert.equal(amount(costOf(item(1500), asPromo(deal))), 30);
  });

  test("no amount on the list means one pack", () => {
    assert.equal(amount(costOf(item(null, null, "curry"), asMine(mine({ price: 4.5 })))), 4.5);
  });

  test("pieces never mix with grams, grams and millilitres do", () => {
    assert.equal(costOf(item(10, "szt", "jajka"), asPromo(promo())), "unit");
    assert.equal(
      amount(costOf(item(700, "g", "passata"), asMine(mine({ packQuantity: 500, packUnit: "ml", price: 4 })))),
      8,
    );
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

describe("estimates from leaflet offers", () => {
  const estimate = (price: number, packQuantity: number, packAssumed = false): PriceOption => ({
    kind: "promo",
    promo: promo({ promoPrice: price, packQuantity, packUnit: "g", shop: "kaufland" }),
    estimate: { packAssumed },
  });

  test("they are priced like any promo, and marked as estimates", () => {
    const cost = costOf(item(500, "g", "skyr"), estimate(4, 450, true));
    assert.ok(cost && cost !== "unit");
    assert.deepEqual([cost.amount, cost.packs, cost.estimated, cost.packAssumed], [8, 2, true, true]);
  });

  test("a pack smaller than needed means more packs; the cheapest way to cover the amount wins", () => {
    // 600 g needed: 3 x 250 g at 3 = 9, or 2 x 500 g at 5 = 10, or 1 x 1000 g at 11.
    const line = priceLine(item(600, "g", "kurczak"), [estimate(3, 250), estimate(5, 500), estimate(11, 1000)]);
    assert.deepEqual([line.cost?.amount, line.cost?.packs], [9, 3]);
    // 500 g needed in one 500 g pack at 5 beats three 250 g at 9.
    assert.equal(priceLine(item(500, "g", "kurczak"), [estimate(3, 250), estimate(5, 500)]).cost?.amount, 5);
  });

  test("an exact price is not marked as an estimate", () => {
    const cost = costOf(item(500, "g", "ryż"), { kind: "promo", promo: promo({ packQuantity: 500 }) });
    assert.ok(cost && cost !== "unit");
    assert.deepEqual([cost.estimated, cost.packAssumed], [false, false]);
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
  const prices: Partial<Record<Shop, Record<string, PriceOption[]>>> = {
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
  const summary = buildBasket(items, ["lidl", "biedronka"], (needed, shop) => prices[shop]?.[needed.name] ?? []);
  const [lidl, biedronka] = summary.shops;

  test("each shop totals what it can price; unpriced items stay out", () => {
    assert.deepEqual([lidl.total, lidl.priced, lidl.onPromo], [34, 3, 1]);
    assert.deepEqual([biedronka.total, biedronka.priced, biedronka.onPromo], [30, 2, 0]);
    assert.equal(summary.itemCount, 4);
    assert.equal(lidl.lines[3].missing, "no-price");
  });

  test("the cheaper shop is decided on items priced at both", () => {
    assert.equal(summary.compared.count, 2);
    assert.deepEqual(summary.compared.shops, ["lidl", "biedronka"]);
    assert.deepEqual(summary.compared.totals, { lidl: 26, biedronka: 30 });
    assert.equal(summary.compared.cheapest, "lidl");
  });

  test("splitting buys each compared item where it is cheaper", () => {
    assert.deepEqual(summary.split, { total: 25, savings: 1 });
  });

  test("no comparison, pointer or split when no item is priced at both shops", () => {
    const lonely = buildBasket([items[2]], ["lidl", "biedronka"], (needed, shop) => prices[shop]?.[needed.name] ?? []);
    assert.deepEqual(lonely.compared, {
      shops: [],
      count: 0,
      totals: {},
      cheapest: null,
    });
    assert.equal(lonely.split, null);
  });

  test("equal totals point at neither shop", () => {
    const same = buildBasket([items[1]], ["lidl", "biedronka"], () => [asMine(mine({ price: 5 }))]);
    assert.equal(same.compared.cheapest, null);
    assert.equal(same.split, null);
  });

  test("a shop with only a few leaflet hits does not take part in the comparison", () => {
    // Kaufland prices one item of four: shown, but not weighed against shops that price most of the list.
    const withKaufland = buildBasket(items, ["lidl", "biedronka", "kaufland"], (needed, shop) =>
      shop === "kaufland"
        ? needed.name === "ryż"
          ? [
              asPromo(
                promo({
                  shop: "kaufland",
                  productKey: "blix:ryz",
                  promoPrice: 3,
                  packQuantity: 1000,
                }),
              ),
            ]
          : []
        : (prices[shop]?.[needed.name] ?? []),
    );
    assert.deepEqual(withKaufland.compared.shops, ["lidl", "biedronka"]);
    assert.equal(withKaufland.compared.cheapest, "lidl");
    assert.deepEqual(withKaufland.shops[2].priced, 1);
  });

  test("with fewer than two shops pricing half the list, the two that price the most are compared", () => {
    const sparse = buildBasket(items, ["lidl", "biedronka", "kaufland"], (needed, shop) =>
      shop === "kaufland" || needed.name !== "ryż" ? [] : (prices[shop]?.[needed.name] ?? []),
    );
    assert.deepEqual(sparse.compared.shops, ["lidl", "biedronka"]);
    assert.equal(sparse.compared.count, 1);
    assert.equal(sparse.compared.cheapest, "biedronka");
  });
});

describe("money in whole grosz", () => {
  test("three packs at 4,99 are exactly 14,97 and a basket total adds up to the grosz", () => {
    const cost = costOf(item(1500), asPromo(promo({ packQuantity: 500, promoPrice: 4.99, multibuyMin: 1 })));
    assert.ok(cost && cost !== "unit");
    assert.equal(cost.amountGrosz, 1497);
    assert.equal(cost.amount, 14.97);
    const summary = buildBasket(
      [item(1500, "g", "a"), item(1500, "g", "b"), item(1500, "g", "c")],
      ["lidl"],
      () => [asPromo(promo({ packQuantity: 500, promoPrice: 0.1 }))],
    );
    // 9 × 0,10 zł: floats would give 0.8999999999999999.
    assert.equal(summary.shops[0].totalGrosz, 90);
    assert.equal(summary.shops[0].total, 0.9);
    assert.equal(summary.shops[0].complete, true);
  });

  test("a 1+1 offer applies to whole pairs; the odd pack is at the regular price", () => {
    const offer = promo({ packQuantity: 500, promoPrice: 5, regularPrice: 10, multibuy: "1+1 gratis", multibuyMin: 2 });
    const three = costOf(item(1500), asPromo(offer));
    assert.ok(three && three !== "unit");
    assert.equal(three.amountGrosz, 2 * 500 + 1000);
  });
});
