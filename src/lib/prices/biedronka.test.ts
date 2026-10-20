import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { parseCategories, parseCategoryPage, parseProductPage, parseSitemap } from "./biedronka.ts";
import { catalogCandidates } from "./match.ts";

/**
 * zakupy.biedronka.pl on 19.10.2026: part of the sitemap (its first entries
 * and a few kinds the list uses) and three product pages trimmed to the
 * parts the parser reads.
 */
const read = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
const catalogue = parseSitemap(read("biedronka-sitemap-2026-10-19.xml"));
const entry = (id: string) => {
  const found = catalogue.find((e) => e.productKey === `biedronka:${id}`);
  assert.ok(found, id);
  return found;
};

describe("parseSitemap", () => {
  test("every product page, keyed by its id and named from its address", () => {
    assert.ok(catalogue.length > 30);
    const serek = entry("0000003518");
    assert.equal(serek.name, "piatnica piatnica serek wiejski naturalny 200 g");
    assert.equal(
      serek.url,
      "https://zakupy.biedronka.pl/piatnica-piatnica-serek-wiejski-naturalny-200-g-0000003518.html",
    );
  });

  test("a sitemap with no product pages is a changed site, not an empty shop", () => {
    assert.throws(() => parseSitemap("<urlset></urlset>"), /mapę strony/);
  });
});

describe("parseProductPage", () => {
  test("a pack: the shelf price and the pack weight", () => {
    const price = parseProductPage(read("biedronka-product-0000003518.html"), entry("0000003518"));
    assert.deepEqual(
      [price?.name, price?.price, price?.packQuantity, price?.packUnit, price?.loose],
      ["Piątnica Serek wiejski naturalny 200 g", 2.99, 200, "g", false],
    );
  });

  test("fresh meat sold by weight: the price per kilo, paid for what is taken", () => {
    const price = parseProductPage(read("biedronka-product-0000000247.html"), entry("0000000247"));
    assert.deepEqual([price?.price, price?.packQuantity, price?.packUnit, price?.loose], [25.49, 1000, "g", true]);
  });

  test("out of stock online ('N/A'): the price per kilo and the weight still give the pack price", () => {
    const price = parseProductPage(read("biedronka-product-0000010575.html"), entry("0000010575"));
    // 5,90 zł / kg x 0.5 kg
    assert.deepEqual([price?.price, price?.packQuantity, price?.packUnit], [2.95, 500, "g"]);
  });

  test("eggs out of stock online: the price per piece times the pieces in the pack", () => {
    const eggs = catalogue.find((e) => e.productKey === "biedronka:0000004338");
    assert.ok(eggs);
    const price = parseProductPage(read("biedronka-product-0000004338.html"), eggs);
    // 1,15 zł / szt x 10 szt
    assert.deepEqual([price?.price, price?.packQuantity, price?.packUnit], [11.5, 10, "szt"]);
  });

  test("a page with no price at all gives nothing, never a guess", () => {
    assert.equal(
      parseProductPage("<html><h1 class='product-description__name'>X</h1></html>", entry("0000003518")),
      null,
    );
  });
});

describe("which catalogue products are read for an item", () => {
  test("the plain product first, flavoured ones left out, at most a few", () => {
    // This sample has only flavoured skyrs, so none is read for plain "skyr".
    assert.deepEqual(catalogCandidates("skyr", "g", catalogue, 4), []);
    assert.deepEqual(
      catalogCandidates("serek wiejski", "g", catalogue, 4).map((e) => e.productKey),
      ["biedronka:0000003518", "biedronka:0000004491"],
    );
    assert.ok(catalogCandidates("jajka", "szt", catalogue, 4).every((e) => /jaja/.test(e.name)));
  });
});

describe("Biedronka category page", () => {
  const html = readFileSync(new URL("./fixtures/biedronka-category-2026-10-20.html", import.meta.url), "utf8");
  const prices = parseCategoryPage(html);

  test("every tile with a price is a product, with the pack its packaging line gives", () => {
    assert.equal(prices.length, 6);
    const rice = prices.find((price) => price.name.includes("Basmati"));
    assert.deepEqual([rice?.price, rice?.packQuantity, rice?.packUnit, rice?.loose], [6.79, 500, "g", false]);
    const pieces = prices.find((price) => price.name.includes("4 x 125 g"));
    assert.deepEqual([pieces?.price, pieces?.packQuantity, pieces?.packUnit], [5.49, 500, "g"]);
    assert.ok(
      prices.every((price) => /^biedronka:\d{10}$/.test(price.productKey) && price.sourceUrl.endsWith(".html")),
    );
  });

  test("sold by weight: the price per kilo, loose", () => {
    const arborio = prices.find((price) => price.name.includes("arborio"));
    assert.deepEqual([arborio?.price, arborio?.packQuantity, arborio?.loose], [11.99, 1000, true]);
  });

  test("categories from the sitemap: only category pages, with their path in plain words", () => {
    const xml = `<urlset>
      <url><loc>https://zakupy.biedronka.pl/artykuly-spozywcze/produkty-sypkie/ryz/</loc></url>
      <url><loc>https://zakupy.biedronka.pl/gusto-bello-ryz-1-kg-0000009424.html</loc></url></urlset>`;
    assert.deepEqual(parseCategories(xml), [
      {
        url: "https://zakupy.biedronka.pl/artykuly-spozywcze/produkty-sypkie/ryz/",
        path: "artykuly spozywcze / produkty sypkie / ryz",
      },
    ]);
  });
});
