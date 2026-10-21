import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildBasket, priceLine, type NeededItem, type PriceOption } from "../prices/basket.ts";
import { matchPromos } from "../prices/match.ts";
import { SHOPS, type Shop, type ShopPrice, type ShopPromo } from "../prices/types.ts";
import {
  assessAll,
  assessLine,
  basketChannel,
  CANNOT_DETERMINE,
  factFromMine,
  factFromPromo,
  SPLIT_MIN_SAVING_GROSZ,
  verifiedVerdict,
  type PricingContext,
} from "./pricing.ts";

// Test data shaped like stored prices. Amounts are made up for the arithmetic, not real prices.
const ctx: PricingContext = { today: "2026-10-20", city: "Warszawa", channel: "both", loyalty: [], excludedBrands: [] };

function promo(overrides: Partial<ShopPromo>): ShopPromo {
  return {
    shop: "frisco",
    productKey: "frisco:1",
    name: "Filet z piersi kurczaka 500 g",
    packQuantity: 500,
    packUnit: "g",
    loose: false,
    promoPrice: 19.99,
    regularPrice: null,
    validFrom: "2026-10-20",
    validTo: "2026-11-19",
    conditions: "",
    appOnly: false,
    multibuy: null,
    multibuyMin: 1,
    sourceUrl: "https://www.frisco.pl/pid,1",
    shelf: true,
    fetchedAt: "2026-10-20T05:00:00Z",
    ...overrides,
  };
}
const item = (name: string, quantity: number | null, unit: NeededItem["unit"] = "g"): NeededItem => ({
  id: name,
  name,
  quantity,
  unit,
});
const lineFor = (need: NeededItem, promos: ShopPromo[], mine: ShopPrice | null = null, context = ctx) =>
  assessLine(need, matchPromos(need, promos, []), mine, context);

describe("prices as facts", () => {
  test("each source keeps its kind, channel and provider", () => {
    const frisco = factFromPromo(promo({}));
    assert.deepEqual([frisco.providerId, frisco.kind, frisco.region.channel], ["frisco-feed", "current_offer", "online"]);
    const blix = factFromPromo(promo({ shop: "biedronka", productKey: "blix:skyr", shelf: false, sourceUrl: "https://blix.pl/x" }));
    assert.deepEqual([blix.providerId, blix.kind, blix.region.national], ["blix", "published_promotion", true]);
    const everyday = factFromPromo(promo({ shop: "lidl", productKey: "lidl-everyday:ryz", validTo: "2026-12-31", sourceUrl: "https://www.lidl.pl/l" }));
    assert.deepEqual([everyday.providerId, everyday.kind], ["lidl-everyday", "published_promotion"]);
    const community = factFromPromo(promo({ shop: "lidl", productKey: "openprices:1", shelf: false, historical: "community", city: "Warszawa" }));
    assert.deepEqual([community.kind, community.region.city, community.validTo], ["community", "Warszawa", null]);
    assert.equal(factFromPromo(promo({}), true).derived, true);
  });

  test("my typed price is history from the day I typed it", () => {
    const mine: ShopPrice = { itemName: "skyr", shop: "lidl", productLabel: "", packQuantity: 450, packUnit: "g", price: 5.99, updatedAt: "2026-10-01T10:00:00Z" };
    const fact = factFromMine(mine);
    assert.deepEqual([fact.kind, fact.amountGrosz, fact.observedAt], ["manual", 599, "2026-10-01T10:00:00Z"]);
  });
});

describe("one item at one shop", () => {
  const chicken = item("pierś z kurczaka", 1000);

  test("a granted current price with an exact match is strict and counts in the reference too", () => {
    const line = lineFor(chicken, [promo({})]);
    assert.equal(line.strict.length, 1);
    assert.equal(line.reference.length, 1);
    assert.equal(line.reference[0].state, "verified_current");
    assert.equal(line.reference[0].match, "attributes");
  });

  test("an unverified source is reference only, labelled", () => {
    const line = lineFor(chicken, [promo({ shop: "biedronka", productKey: "blix:filet", shelf: false, sourceUrl: "https://blix.pl/x" })]);
    assert.equal(line.strict.length, 0);
    assert.equal(line.reference[0].state, "unverified");
  });

  test("an app-only price without the app is held, with the reason", () => {
    const appOnly = promo({ shop: "lidl", productKey: "lidl-everyday:filet", appOnly: true, shelf: false, sourceUrl: "https://www.lidl.pl/x" });
    const without = lineFor(chicken, [appOnly]);
    assert.equal(without.reference.length, 0);
    assert.match(without.held[0].reasons[0], /Lidl Plus/);
    const withApp = lineFor(chicken, [appOnly], null, { ...ctx, loyalty: ["lidl_plus"] });
    assert.equal(withApp.reference.length, 1);
  });

  test("a different variant is held as a substitution, never priced", () => {
    const line = lineFor(item("twaróg chudy", 500), [promo({ name: "Twaróg tłusty 250 g", packQuantity: 250 })]);
    assert.equal(line.reference.length, 0);
    assert.equal(line.held[0].substitution?.tier, "substitution");
  });

  test("a confirmed product is an exact match even when its name says less", () => {
    const skyr = item("skyr", 900);
    const offer = promo({ name: "Piątnica Skyr 450 g", packQuantity: 450, productKey: "frisco:9" });
    const line = assessLine(skyr, { confirmed: [offer], estimates: [] }, null, ctx);
    assert.equal(line.strict[0].match, "listing");
  });

  test("an excluded brand is dropped entirely", () => {
    const line = lineFor(item("skyr", 450), [promo({ name: "Piątnica Skyr naturalny 450 g", packQuantity: 450 })], null, {
      ...ctx,
      excludedBrands: ["piątnica"],
    });
    assert.deepEqual([line.reference.length, line.held.length], [0, 0]);
  });

  test("a community price with no pack is held, never priced at a guessed pack", () => {
    const history = promo({ shop: "lidl", productKey: "openprices:9", name: "Skyr naturalny", packQuantity: null, packUnit: null, shelf: false, historical: "community", city: "Warszawa" });
    const line = lineFor(item("skyr", 450), [history]);
    assert.equal(line.reference.length, 0);
    assert.match(line.held[0].reasons[0], /bez wagi/);
  });

  test("history fills a gap but never undercuts a current offer", () => {
    const need = item("skyr", 450);
    const current: PriceOption = { kind: "promo", promo: promo({ name: "Skyr 450 g", packQuantity: 450, promoPrice: 6.49 }), rank: 0 };
    const history: PriceOption = { kind: "promo", promo: promo({ name: "Skyr 450 g", packQuantity: 450, promoPrice: 4.99, historical: "community" }), rank: 1 };
    assert.equal(priceLine(need, [history, current]).cost?.amountGrosz, 649);
    assert.equal(priceLine(need, [history]).cost?.amountGrosz, 499);
  });
});

describe("the verdict", () => {
  const items = [item("pierś z kurczaka", 1000), item("ryż", 1000)];
  const onlyAt = (shop: Shop, byItem: Record<string, PriceOption[]>) =>
    buildBasket(items, SHOPS, (need, at) => (at === shop ? (byItem[need.name] ?? []) : []));
  const store = (name: string, price: number, key: string): PriceOption => ({
    kind: "promo",
    promo: promo({ shop: "lidl", productKey: key, name, promoPrice: price, packQuantity: 1000, shelf: false, sourceUrl: "https://www.lidl.pl/x" }),
  });

  test("no complete basket: it says so instead of naming a winner", () => {
    const strict = onlyAt("frisco", { "pierś z kurczaka": [{ kind: "promo", promo: promo({ packQuantity: 1000, promoPrice: 29.99 }) }] });
    const verdict = verifiedVerdict(strict, []);
    assert.equal(verdict.complete.length, 0);
    assert.deepEqual(verdict.coverage, [{ shop: "frisco", priced: 1, totalGrosz: 2999, missing: ["ryż"] }]);
    assert.match(CANNOT_DETERMINE, /Nie da się ustalić najtańszego pełnego koszyka/);
  });

  test("a complete online basket carries its published delivery fee; under the minimum it has no total", () => {
    const strict = onlyAt("frisco", {
      "pierś z kurczaka": [{ kind: "promo", promo: promo({ packQuantity: 1000, promoPrice: 89.99 }) }],
      ryż: [{ kind: "promo", promo: promo({ productKey: "frisco:2", name: "Ryż 1 kg", packQuantity: 1000, promoPrice: 15.99 }) }],
    });
    const verdict = verifiedVerdict(strict, []);
    assert.equal(verdict.complete.length, 1);
    // Frisco's published terms (delivery.ts): 14 zł from 100 zł.
    assert.deepEqual(verdict.complete[0], { shop: "frisco", goodsGrosz: 10598, deliveryGrosz: 1400, totalGrosz: 11998, online: true });
    const small = onlyAt("frisco", {
      "pierś z kurczaka": [{ kind: "promo", promo: promo({ packQuantity: 1000, promoPrice: 29.99 }) }],
      ryż: [{ kind: "promo", promo: promo({ productKey: "frisco:2", name: "Ryż 1 kg", packQuantity: 1000, promoPrice: 5.99 }) }],
    });
    assert.equal(verifiedVerdict(small, []).complete[0].totalGrosz, null);
  });

  test("a shop with one missing price is never ranked as complete", () => {
    const strict = buildBasket(items, SHOPS, (need, shop) =>
      shop === "lidl" && need.name === "ryż" ? [store("Ryż 1 kg", 4.99, "lidl-everyday:ryz")] : [],
    );
    assert.equal(strict.shops.find((basket) => basket.shop === "lidl")?.complete, false);
    assert.equal(verifiedVerdict(strict, []).complete.length, 0);
  });

  test("two shops are suggested only when together they are complete and the saving beats a second trip", () => {
    const priced = (shop: Shop, chicken: number | null, rice: number | null) => (need: NeededItem, at: Shop): PriceOption[] => {
      if (at !== shop) return [];
      const price = need.name === "ryż" ? rice : chicken;
      return price === null ? [] : [{ kind: "promo", promo: promo({ shop, productKey: `lidl-everyday:${shop}${need.name}`, name: need.name, promoPrice: price, packQuantity: 1000, shelf: false, sourceUrl: "https://x.pl" }) }];
    };
    const both = (a: ReturnType<typeof priced>, b: ReturnType<typeof priced>) => (need: NeededItem, at: Shop) => [...a(need, at), ...b(need, at)];
    // Lidl has only rice, Dino only chicken: neither is complete, together they are.
    const split = verifiedVerdict(buildBasket(items, SHOPS, both(priced("lidl", null, 5), priced("dino", 25, null))), []);
    assert.deepEqual(split.split?.shops, ["lidl", "dino"]);
    assert.equal(split.split?.totalGrosz, 3000);
    // Both complete; the split saves less than a trip is worth: no split.
    const close = verifiedVerdict(buildBasket(items, SHOPS, both(priced("lidl", 25, 5), priced("dino", 24, 5.5))), []);
    assert.equal(close.complete.length, 2);
    assert.ok(SPLIT_MIN_SAVING_GROSZ > 100);
    assert.equal(close.split, null);
  });

  test("a basket's channel comes from the prices it uses", () => {
    const strict = onlyAt("frisco", { "pierś z kurczaka": [{ kind: "promo", promo: promo({}) }] });
    assert.equal(basketChannel(strict.shops.find((basket) => basket.shop === "frisco")!), "online");
  });
});

describe("the whole list", () => {
  test("strict and reference summaries side by side", () => {
    const items = [item("pierś z kurczaka", 1000)];
    const frisco = promo({ packQuantity: 1000, promoPrice: 29.99 });
    const leaflet = promo({ shop: "biedronka", productKey: "blix:filet", name: "Filet z piersi kurczaka 1 kg", packQuantity: 1000, promoPrice: 19.99, shelf: false, sourceUrl: "https://blix.pl/x" });
    const { strict, reference } = assessAll(
      items,
      (shop, need) => matchPromos(need, [frisco, leaflet].filter((one) => one.shop === shop), []),
      () => null,
      ctx,
    );
    assert.equal(strict.shops.find((basket) => basket.shop === "frisco")?.complete, true);
    assert.equal(strict.shops.find((basket) => basket.shop === "biedronka")?.priced, 0);
    const biedronka = reference.shops.find((basket) => basket.shop === "biedronka")!;
    assert.deepEqual([biedronka.priced, biedronka.states], [1, { unverified: 1 }]);
  });
});
