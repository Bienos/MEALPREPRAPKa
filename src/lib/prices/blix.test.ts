import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { BLIX_SHOPS, blixUrl, parseBlixPromos } from "./blix.ts";

/**
 * Two real Blix responses from Monday 19.10.2026, as Blix sent them:
 * meat filtered by "filet z piersi kurczaka" and dairy filtered by "skyr".
 */
const read = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const monday = new Date("2026-10-19T08:00:00+02:00");
const chicken = parseBlixPromos(read("blix-mieso-filet-z-piersi-kurczaka-2026-10-19.json"), monday);
const skyr = parseBlixPromos(read("blix-nabial-skyr-2026-10-19.json"), monday);

/** A one-offer response, for the cases the saved ones do not show. */
const one = (offer: Record<string, unknown>) => ({
  offers: [
    {
      offerName: "Twaróg półtłusty Piątnica",
      brandId: 23,
      price: "4,99zł",
      leafletPage: { leafletId: 1, page: 0 },
      availabilityLabel: { class: "lav-available", message: "aktualna" },
      ...offer,
    },
  ],
  availableBrands: [{ id: 23, name: "Biedronka", slug: "biedronka" }],
});

describe("parseBlixPromos", () => {
  test("keeps priced offers from the chains priced here; Lidl comes from lidl.pl instead", () => {
    assert.deepEqual(
      chicken.map((promo) => [promo.shop, promo.promoPrice]),
      [
        ["biedronka", 14.99],
        ["biedronka", 18.99],
        ["leclerc", 16.99],
      ],
    );
    // Smaller chains with leaflets (Delikatesy Centrum, SPAR, ABC...) are not priced here.
    assert.equal(skyr.length, 12);
    assert.ok([...chicken, ...skyr].every((promo) => Object.values(BLIX_SHOPS).includes(promo.shop)));
    assert.ok(!skyr.some((promo) => /łaciaty$/i.test(promo.name) && promo.shop === "lidl"));
  });

  test("an offer with no price in the leaflet is left out, never guessed", () => {
    assert.ok(!skyr.some((promo) => /Bakoma|brzoskwinia Piątnica|Jogobella Zott/.test(promo.name)));
  });

  test("the same offer from two leaflet versions is kept once", () => {
    assert.equal(chicken.filter((promo) => /Mega Paka/.test(promo.name)).length, 1);
  });

  test("an offer is remembered by shop and folded name; the pack is read from the name when it is there", () => {
    const mega = chicken[0];
    assert.equal(mega.productKey, "blix:swiezy filet z piersi kurczaka kraina mies mega paka");
    assert.deepEqual([mega.packQuantity, mega.packUnit, mega.regularPrice, mega.appOnly], [null, null, null, false]);
    const apetina = skyr.find((promo) => promo.name.endsWith("125 g"));
    assert.deepEqual([apetina?.packQuantity, apetina?.packUnit], [125, "g"]);
    // "4-pak 150 g": one bag or all four? Asked, not assumed.
    const [rice] = parseBlixPromos(one({ offerName: "Ryż biały Kuchnia Smaku 4-pak 150 g" }), monday);
    assert.equal(rice.packQuantity, null);
  });

  test("an offer that starts in a day or two is kept, dated from then", () => {
    const leclerc = chicken.find((promo) => promo.shop === "leclerc");
    assert.deepEqual([leclerc?.validFrom, leclerc?.validTo], ["2026-10-20", "2026-10-26"]);
  });

  test("links to the leaflet page it is on, and says which leaflet in the fine print", () => {
    assert.equal(chicken[1].sourceUrl, "https://blix.pl/sklep/biedronka/gazetka/530004/?pageNumber=48");
    assert.equal(chicken[0].conditions, "Gazetka Biedronka · aktualna");
  });

  test("validity from the label: a leaflet week now, today only, or from a later day", () => {
    assert.deepEqual([chicken[0].validFrom, chicken[0].validTo], ["2026-10-19", "2026-10-25"]);
    const label = (cls: string, message: string) =>
      parseBlixPromos(one({ availabilityLabel: { class: cls, message } }), monday).map((p) => [p.validFrom, p.validTo]);
    assert.deepEqual(label("lav-ending-soon", "ostatnie 24h"), [["2026-10-19", "2026-10-19"]]);
    assert.deepEqual(label("lav-starting-soon", "już za 2 dni"), [["2026-10-21", "2026-10-27"]]);
    assert.deepEqual(label("lav-starting-soon", "od jutra"), [["2026-10-20", "2026-10-26"]]);
    assert.deepEqual(label("lav-expired", "zakończona"), []);
  });

  test("Żabka and Leclerc offers are read like the other chains', with a leaflet link each", () => {
    const response = {
      offers: [
        { offerName: "Banany Żabka", brandId: 58, price: "4,99zł", leafletPage: { leafletId: 7, page: 2 } },
        { offerName: "Banany Leclerc", brandId: 10079, price: "3,49zł", leafletPage: { leafletId: 9, page: 0 } },
      ].map((offer) => ({ ...offer, availabilityLabel: { class: "lav-available", message: "aktualna" } })),
      availableBrands: [
        { id: 58, name: "Żabka", slug: "zabka" },
        { id: 10079, name: "Leclerc", slug: "leclerc" },
      ],
    };
    assert.deepEqual(
      parseBlixPromos(response, monday).map((promo) => [promo.shop, promo.promoPrice, promo.sourceUrl]),
      [
        ["zabka", 4.99, "https://blix.pl/sklep/zabka/gazetka/7/?pageNumber=3"],
        ["leclerc", 3.49, "https://blix.pl/sklep/leclerc/gazetka/9/?pageNumber=1"],
      ],
    );
  });

  test("a response that no longer looks like Blix's throws instead of returning nothing", () => {
    assert.throws(() => parseBlixPromos({ results: [] }), /format/);
    assert.throws(() => parseBlixPromos({ offers: [{ title: "x" }] }), /format/);
    assert.deepEqual(parseBlixPromos({ offers: [] }), []);
  });
});

describe("blixUrl", () => {
  test("a grocery subcategory, the text filter in lower case, every chain's id", () => {
    const url = new URL(blixUrl({ sub: "nabial", q: "Skyr" }));
    assert.equal(url.origin + url.pathname, "https://blix.pl/produkty/artykuly-spozywcze/nabial");
    assert.deepEqual(
      [url.searchParams.get("async"), url.searchParams.get("page"), url.searchParams.get("q")],
      ["1", "1", "skyr"],
    );
    assert.equal(
      [...url.searchParams.keys()].filter((key) => key.startsWith("bids")).length,
      Object.keys(BLIX_SHOPS).length,
    );
  });

  test("no subcategory searches all groceries; later pages are asked by number", () => {
    const url = new URL(blixUrl({ sub: "", q: "tuńczyk" }, 2));
    assert.equal(url.pathname, "/produkty/artykuly-spozywcze");
    assert.deepEqual([url.searchParams.get("q"), url.searchParams.get("page")], ["tuńczyk", "2"]);
  });
});
