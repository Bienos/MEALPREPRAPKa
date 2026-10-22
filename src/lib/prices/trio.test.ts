import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildBasket, type NeededItem, type PriceOption } from "./basket.ts";
import { buildTrio } from "./trio.ts";
import { SHOPS, type Shop, type ShopPromo } from "./types.ts";

function offer(shop: Shop, price: number): PriceOption {
  const promo: ShopPromo = {
    shop,
    productKey: `${shop}:1`,
    name: "Produkt",
    packQuantity: 500,
    packUnit: "g",
    loose: false,
    promoPrice: price,
    regularPrice: null,
    validFrom: "2026-10-19",
    validTo: null,
    conditions: "",
    appOnly: false,
    multibuy: null,
    multibuyMin: 1,
    sourceUrl: "https://example.test",
    shelf: true,
  };
  return { kind: "promo", promo };
}

const item = (name: string, quantity = 500): NeededItem => ({ id: name, name, quantity, unit: "g" });

/** prices[item][shop] in złoty; a missing shop has no price. */
function trioOf(prices: Record<string, Partial<Record<Shop, number>>>) {
  const items = Object.keys(prices).map((name) => item(name));
  const summary = buildBasket(items, SHOPS, (one, shop) => {
    const price = prices[one.name][shop];
    return price === undefined ? [] : [offer(shop, price)];
  });
  return buildTrio(summary);
}

describe("buildTrio", () => {
  test("picks the cheapest shop per item and leaves a tie without a winner", () => {
    const view = trioOf({
      jajka: { biedronka: 8, lidl: 7, auchan: 9 },
      ryz: { biedronka: 4, lidl: 4, auchan: 5 },
      skyr: { auchan: 6 },
    });
    assert.deepEqual(
      view.rows.map((row) => row.cheapest),
      ["lidl", null, null],
    );
  });

  test("compares totals only on the items all three shops price", () => {
    const view = trioOf({
      jajka: { biedronka: 8, lidl: 7, auchan: 9 },
      ryz: { biedronka: 4, lidl: 3, auchan: 5 },
      skyr: { auchan: 6 },
    });
    assert.ok(view.common);
    assert.equal(view.common.count, 2);
    assert.deepEqual(view.common.totals, { biedronka: 12, lidl: 10, auchan: 14 });
    assert.equal(view.common.cheapest, "lidl");
    assert.equal(view.common.spread, 4);
  });

  test("no cheapest when the best two cost the same", () => {
    const view = trioOf({ jajka: { biedronka: 8, lidl: 8, auchan: 9 } });
    assert.equal(view.common?.cheapest, null);
  });

  test("totals say how many items each shop has no price for", () => {
    const view = trioOf({
      jajka: { biedronka: 8, lidl: 7 },
      ryz: { biedronka: 4 },
      skyr: {},
    });
    const [biedronka, lidl, auchan] = view.totals;
    assert.deepEqual([biedronka.priced, biedronka.missing, biedronka.total], [2, 1, 12]);
    assert.deepEqual([lidl.priced, lidl.missing, lidl.total], [1, 2, 7]);
    assert.deepEqual([auchan.priced, auchan.missing], [0, 3]);
    assert.deepEqual(
      view.unpriced.map((one) => one.name),
      ["skyr"],
    );
  });

  test("the mix buys each item where it is cheapest and reports savings against a full shop", () => {
    const view = trioOf({
      jajka: { biedronka: 8, lidl: 7, auchan: 9 },
      ryz: { biedronka: 3, lidl: 4, auchan: 5 },
    });
    assert.ok(view.mix);
    assert.equal(view.mix.total, 10);
    assert.equal(view.mix.count, 2);
    assert.deepEqual(view.mix.perShop, { biedronka: 1, lidl: 1, auchan: 0 });
    // Biedronka alone is 11, Lidl 11, Auchan 14: the mix saves 1 zł.
    assert.equal(view.mix.savings, 1);
  });

  test("no savings claim when no single shop prices all the same items", () => {
    const view = trioOf({
      jajka: { biedronka: 8 },
      ryz: { lidl: 4 },
    });
    assert.ok(view.mix);
    assert.equal(view.mix.total, 12);
    assert.equal(view.mix.savings, null);
  });

  test("an empty list gives an empty view", () => {
    const view = buildTrio(buildBasket([], SHOPS, () => []));
    assert.deepEqual([view.rows.length, view.common, view.mix, view.unpriced.length], [0, null, null, 0]);
  });
});
