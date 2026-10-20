import assert from "node:assert/strict";
import { describe, test } from "node:test";

import type { BasketSummary, ShopBasket } from "./basket.ts";
import { bestOptions, feeFor, onlineOptions, PROVIDERS } from "./delivery.ts";

const basket = (shop: ShopBasket["shop"], priced: number, total: number, estimated = 0): ShopBasket => ({
  shop,
  lines: [],
  total,
  priced,
  onPromo: 0,
  estimated,
});
const summary = (shops: ShopBasket[], itemCount = 10, split: BasketSummary["split"] = null): BasketSummary => ({
  shops,
  itemCount,
  compared: { shops: [], count: 0, totals: {}, cheapest: null },
  split,
});
const frisco = PROVIDERS.find((one) => one.id === "frisco")!;

describe("delivery fees", () => {
  test("the published fee, free above the threshold, is an estimate; a typed checkout fee is confirmed", () => {
    assert.deepEqual(feeFor(frisco, undefined, 150).fee, 14);
    assert.deepEqual([feeFor(frisco, undefined, 320).fee, feeFor(frisco, undefined, 320).status], [0, "estimate"]);
    const typed = { provider: "frisco", fee: 9.99, freeAbove: null, minOrder: 100, confirmed: true, note: "" };
    assert.deepEqual([feeFor(frisco, typed, 150).fee, feeFor(frisco, typed, 150).status], [9.99, "confirmed"]);
  });

  test("a provider whose page names no fee is unknown, never guessed", () => {
    const auchan = PROVIDERS.find((one) => one.id === "auchan")!;
    assert.deepEqual([feeFor(auchan, undefined, 150).fee, feeFor(auchan, undefined, 150).status], [null, "unknown"]);
    const biedronka = PROVIDERS.find((one) => one.id === "biedronka")!;
    assert.equal(feeFor(biedronka, undefined, 150).status, "unknown");
  });
});

describe("online options", () => {
  const sum = summary([basket("frisco", 9, 180), basket("auchan", 8, 150), basket("biedronka", 3, 40)]);

  test("goods plus fee, availability by town, the minimum order, the missing items", () => {
    const options = onlineOptions(sum, [], "Warszawa");
    const fr = options.find((one) => one.provider.id === "frisco")!;
    assert.deepEqual(
      [fr.goods, fr.fee, fr.total, fr.feeStatus, fr.missing, fr.available],
      [180, 14, 194, "estimate", 1, true],
    );
    const au = options.find((one) => one.provider.id === "auchan")!;
    assert.deepEqual([au.goods, au.total, au.feeStatus], [150, null, "unknown"]);
    const lisek = options.find((one) => one.provider.id === "lisek")!;
    assert.deepEqual([lisek.goods, lisek.total, lisek.missing], [null, null, 10]);
  });

  test("a town the shop does not deliver to", () => {
    const options = onlineOptions(sum, [], "Zakopane");
    assert.equal(options.find((one) => one.provider.id === "frisco")!.available, false);
    assert.equal(options.find((one) => one.provider.id === "glovo")!.available, true);
  });

  test("a basket under the minimum order is flagged and never the best delivery", () => {
    const small = summary([basket("frisco", 9, 60)]);
    const options = onlineOptions(small, [], "Warszawa");
    assert.equal(options.find((one) => one.provider.id === "frisco")!.belowMinimum, true);
    assert.equal(bestOptions(small, options).online, null);
  });
});

describe("best options", () => {
  test("the cheapest shop among the most complete ones; three prices out of ten never win", () => {
    const sum = summary([
      basket("lidl", 3, 20),
      basket("biedronka", 8, 120),
      basket("auchan", 8, 110),
      basket("kaufland", 6, 50),
    ]);
    const best = bestOptions(sum, onlineOptions(sum, [], "Warszawa"));
    assert.equal(best.shop?.kind, "shop");
    if (best.shop?.kind === "shop")
      assert.deepEqual([best.shop.shop, best.shop.total, best.shop.missing], ["auchan", 110, 2]);
  });

  test("the cheapest delivery is the most complete one with a known total", () => {
    const sum = summary([basket("frisco", 9, 180), basket("auchan", 9, 120)]);
    const best = bestOptions(sum, onlineOptions(sum, [], "Warszawa"));
    // Auchan is cheaper but its fee is unknown, so its total is not known.
    assert.equal(best.online?.kind === "online" && best.online.option.provider.id, "frisco");
    const typed = [{ provider: "auchan", fee: 12, freeAbove: null, minOrder: 100, confirmed: true, note: "" }];
    const withQuote = bestOptions(sum, onlineOptions(sum, typed, "Warszawa"));
    assert.equal(withQuote.online?.kind === "online" && withQuote.online.option.provider.id, "auchan");
  });

  test("no prices at all: nothing is claimed", () => {
    const sum = summary([], 10);
    assert.deepEqual(bestOptions(sum, onlineOptions(sum, [], "Warszawa")), { shop: null, online: null, split: null });
  });
});
