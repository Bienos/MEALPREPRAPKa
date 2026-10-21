import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { priceSource, safeUrl } from "./source.ts";
import type { ShopPromo } from "./types.ts";

const promo = (over: Partial<ShopPromo>): ShopPromo => ({
  shop: "biedronka",
  productKey: "blix:x",
  name: "x",
  packQuantity: null,
  packUnit: null,
  loose: false,
  promoPrice: 1,
  regularPrice: null,
  validFrom: "2026-10-19",
  validTo: "2026-10-25",
  conditions: "",
  appOnly: false,
  multibuy: null,
  multibuyMin: 1,
  sourceUrl: "https://blix.pl/sklep/biedronka/gazetka/530004/?pageNumber=48",
  fetchedAt: "2026-10-20T13:12:00.000Z",
  ...over,
});

describe("priceSource", () => {
  test("a leaflet offer names the shop, the page and the day it was read", () => {
    assert.deepEqual(priceSource(promo({})), {
      label: "Gazetka Biedronka, s. 48",
      day: "20.10",
      url: "https://blix.pl/sklep/biedronka/gazetka/530004/?pageNumber=48",
    });
  });

  test("a shelf price names the shop's online shop; Lidl's own site and everyday prices say so", () => {
    assert.equal(
      priceSource(promo({ shop: "auchan", productKey: "auchan:1", shelf: true })).label,
      "Sklep online Auchan",
    );
    assert.equal(priceSource(promo({ shop: "lidl", productKey: "lidl:1" })).label, "lidl.pl");
    assert.equal(
      priceSource(promo({ shop: "lidl", productKey: "lidl-everyday:ser", shelf: true })).label,
      "Stała cena Lidla (gazetka „Rewolucja cenowa”)",
    );
  });

  test("no fetch time: no day, never a made-up one", () => {
    assert.equal(priceSource(promo({ fetchedAt: undefined })).day, null);
  });
});

describe("links from outside", () => {
  test("only http(s) and the app's own paths are linked", () => {
    assert.equal(safeUrl("https://www.frisco.pl/pid,1"), "https://www.frisco.pl/pid,1");
    assert.equal(safeUrl("/prep/paragony"), "/prep/paragony");
    assert.equal(safeUrl("javascript:alert(1)"), "#");
    assert.equal(safeUrl("//evil.example"), "#");
    assert.equal(safeUrl("data:text/html,x"), "#");
  });
});
