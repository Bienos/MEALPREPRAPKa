import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { assessPrice, type EligibilityContext } from "./eligibility.ts";
import { NO_CONDITIONS, type PriceFact } from "./types.ts";

const ctx: EligibilityContext = { today: "2026-10-20", city: "Warszawa", channel: "both", loyalty: [] };

function fact(overrides: Partial<PriceFact> = {}): PriceFact {
  return {
    providerId: "frisco-feed",
    retailer: "frisco",
    productName: "Filet z piersi kurczaka 500 g",
    amountGrosz: 1899,
    currency: "PLN",
    per: "pack",
    pack: { amount: 500, unit: "g" },
    loose: false,
    priceType: "regular",
    regularGrosz: null,
    kind: "current_offer",
    observedAt: "2026-10-20T05:00:00Z",
    validFrom: "2026-10-20",
    validTo: "2026-11-19",
    conditions: NO_CONDITIONS,
    evidence: { type: "feed_record", url: "https://www.frisco.pl/pid,1", recordId: "frisco:1" },
    region: { channel: "online", national: false, city: null, deliveryTowns: ["Warszawa", "Kraków"] },
    availability: "unknown",
    derived: false,
    ...overrides,
  };
}

const state = (overrides: Partial<PriceFact>, context: Partial<EligibilityContext> = {}) =>
  assessPrice(fact(overrides), { ...ctx, ...context }).state;

describe("price eligibility", () => {
  test("a fresh price from a granted provider, with evidence, is verified and current", () => {
    const result = assessPrice(fact(), ctx);
    assert.equal(result.state, "verified_current");
    assert.ok(result.strict && result.usable);
  });

  test("bad data never becomes a price", () => {
    assert.equal(state({ currency: "EUR" }), "invalid");
    assert.equal(state({ amountGrosz: 0 }), "invalid");
    assert.equal(state({ amountGrosz: 12.5 }), "invalid");
    assert.equal(state({ pack: { amount: 0, unit: "g" } }), "invalid");
    assert.equal(state({ providerId: null }), "invalid");
    assert.equal(state({ providerId: "gs1-eprodukty" }), "invalid");
  });

  test("place: delivery town, channel and the shop's own town", () => {
    assert.equal(state({}, { city: "Lublin" }), "unavailable");
    assert.equal(state({}, { channel: "store" }), "unavailable");
    const shop = { providerId: "open-prices" as const, kind: "community" as const, region: { channel: "store" as const, national: false, city: "Warszawa", deliveryTowns: null } };
    assert.equal(state(shop), "community");
    assert.equal(state(shop, { city: "Kraków" }), "unavailable");
    assert.equal(state(shop, { channel: "online" }), "unavailable");
  });

  test("expired promotions and future ones are not used", () => {
    assert.equal(state({ validTo: "2026-10-19" }), "expired");
    assert.equal(state({ validFrom: "2026-10-23" }), "unavailable");
    assert.equal(state({ availability: "out_of_stock" }), "unavailable");
  });

  test("a loyalty price counts only with that app turned on", () => {
    const lidlPlus = {
      providerId: "lidl-everyday" as const,
      retailer: "lidl" as const,
      kind: "published_promotion" as const,
      region: { channel: "store" as const, national: true, city: null, deliveryTowns: null },
      conditions: { ...NO_CONDITIONS, appOnly: true },
    };
    const without = assessPrice(fact(lidlPlus), ctx);
    assert.equal(without.state, "unavailable");
    assert.match(without.reasons[0], /Lidl Plus/);
    assert.equal(state(lidlPlus, { loyalty: ["lidl_plus"] }), "published_promotion");
    // An app deal whose chain has no known app is not assumed to be mine.
    assert.equal(state({ ...lidlPlus, retailer: "dino" }), "unavailable");
  });

  test("age: a current offer becomes history, anything old expires", () => {
    assert.equal(state({ observedAt: "2026-10-12T05:00:00Z" }), "historical");
    assert.equal(state({ observedAt: "2026-06-01T05:00:00Z", validTo: null }), "expired");
  });

  test("trust: unverified sources stay unverified; derived prices are estimates; no evidence, no verification", () => {
    const blix = {
      providerId: "blix" as const,
      kind: "published_promotion" as const,
      region: { channel: "store" as const, national: true, city: null, deliveryTowns: null },
    };
    const result = assessPrice(fact(blix), ctx);
    assert.equal(result.state, "unverified");
    assert.ok(result.usable && !result.strict);
    assert.equal(state({ derived: true }), "estimated");
    assert.equal(state({ evidence: null }), "estimated");
    assert.equal(state({ ...blix, providerId: "lidl-everyday", validTo: null }), "estimated");
  });

  test("receipts and typed prices are history, never current", () => {
    const store = { channel: "store" as const, national: false, city: "Warszawa", deliveryTowns: null };
    assert.equal(state({ providerId: "receipts", kind: "receipt", region: store }), "historical");
    assert.equal(state({ providerId: "user-prices", kind: "manual", region: { ...store, city: null } }), "historical");
    assert.equal(assessPrice(fact({ providerId: "receipts", kind: "receipt", region: store }), ctx).strict, false);
  });
});
