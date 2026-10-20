import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { checkFact, countIssues, isRejected, responseIssues } from "./quality.ts";
import { NO_CONDITIONS, type PriceFact } from "./types.ts";

function fact(overrides: Partial<PriceFact> = {}): PriceFact {
  return {
    providerId: "open-prices",
    retailer: "lidl",
    productName: "Pilos Twaróg Chudy",
    amountGrosz: 359,
    currency: "PLN",
    per: "pack",
    pack: { amount: 250, unit: "g" },
    loose: false,
    priceType: "regular",
    regularGrosz: null,
    kind: "community",
    observedAt: "2026-10-05T12:00:00Z",
    validFrom: null,
    validTo: null,
    conditions: NO_CONDITIONS,
    evidence: { type: "receipt", url: "https://prices.openfoodfacts.org/prices/341363", recordId: "openprices:341363" },
    region: { channel: "store", national: false, city: "Warszawa", deliveryTowns: null },
    availability: "unknown",
    derived: false,
    ...overrides,
  };
}
const ctx = { today: "2026-10-20" };
const codes = (one: PriceFact, extra = {}) => checkFact(one, { ...ctx, ...extra }).map((issue) => issue.code);

describe("data quality", () => {
  test("a clean observation has no issues", () => {
    assert.deepEqual(codes(fact()), []);
  });

  test("invalid prices, currencies, packs and dates are rejected", () => {
    assert.ok(isRejected(checkFact(fact({ amountGrosz: 0 }), ctx)));
    assert.ok(isRejected(checkFact(fact({ amountGrosz: -5 }), ctx)));
    assert.ok(isRejected(checkFact(fact({ amountGrosz: 900_000 }), ctx)));
    assert.ok(isRejected(checkFact(fact({ currency: "EUR" }), ctx)));
    assert.ok(isRejected(checkFact(fact({ pack: { amount: 0, unit: "g" } }), ctx)));
    assert.ok(isRejected(checkFact(fact({ observedAt: "2026-11-01T00:00:00Z" }), ctx)));
    assert.ok(isRejected(checkFact(fact({ providerId: "gs1-eprodukty" }), ctx)));
  });

  test("an impossible unit for the item is rejected", () => {
    assert.deepEqual(codes(fact({ pack: { amount: 10, unit: "szt" } }), { needed: { amount: 300, unit: "g" } }), [
      "impossible_unit",
    ]);
  });

  test("warnings: stale, expired, no evidence, unverified source, odd unit price, wrong variant, price jump", () => {
    assert.deepEqual(codes(fact({ observedAt: "2026-03-01T00:00:00Z" })), ["stale"]);
    assert.deepEqual(codes(fact({ validTo: "2026-10-19" })), ["expired"]);
    assert.deepEqual(codes(fact({ evidence: null })), ["missing_evidence"]);
    assert.deepEqual(codes(fact({ providerId: "blix" })), ["unverified_provider"]);
    assert.deepEqual(codes(fact({ amountGrosz: 199_000, pack: { amount: 10, unit: "g" } })), ["unit_price_out_of_range"]);
    assert.deepEqual(codes(fact({ productName: "Twaróg tłusty" }), { expectedName: "twaróg chudy" }), ["variant_mismatch"]);
    assert.deepEqual(codes(fact({ amountGrosz: 999 }), { previous: [349, 359, 369] }), ["price_jump"]);
    assert.deepEqual(codes(fact({ amountGrosz: 379 }), { previous: [349, 359, 369] }), []);
  });

  test("the same observation twice in one import is a duplicate", () => {
    const seen = new Set<string>();
    assert.deepEqual(codes(fact(), { seen }), []);
    assert.deepEqual(codes(fact(), { seen }), ["duplicate"]);
    assert.deepEqual(codes(fact({ amountGrosz: 349 }), { seen }), []);
  });

  test("a mostly unreadable response is a broken source", () => {
    assert.equal(responseIssues({ fetched: 100, unreadable: 80 })[0].code, "broken_response");
    assert.deepEqual(responseIssues({ fetched: 100, unreadable: 3 }), []);
    assert.deepEqual(countIssues([[{ code: "stale", severity: "warn", message: "" }], []]), { stale: 1 });
  });
});
