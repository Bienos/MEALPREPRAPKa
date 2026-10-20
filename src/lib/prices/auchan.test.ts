import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { parseAuchanCategories, parseAuchanCategoryPage } from "./auchan.ts";
import { categoriesFor } from "./match.ts";

/** Real zakupy.auchan.pl data from 20.10.2026: a few of a dairy category's products, in the page's own state. */
const state = readFileSync(new URL("./fixtures/auchan-category-2026-10-20.json", import.meta.url), "utf8");
const page = (json = state) => `<html><script>window.__INITIAL_STATE__={"data":${json}}</script></html>`;
const products = parseAuchanCategoryPage(page(), "https://zakupy.auchan.pl/categories/x/1");

const sitemap = `<urlset>
  <url><loc>https://zakupy.auchan.pl/categories/artykuły-spożywcze/mleko-nabiał-i-jaja/jaja/2370</loc></url>
  <url><loc>https://zakupy.auchan.pl/categories/artykuły-spożywcze/mleko-nabiał-i-jaja/jaja/jaja-ściółkowe/2371</loc></url>
  <url><loc>https://zakupy.auchan.pl/categories/dom-i-ogród/pranie/płyny/5954</loc></url>
</urlset>`;

describe("Auchan categories", () => {
  test("the food shelves, with their path in plain words; other departments are left out", () => {
    const categories = parseAuchanCategories(sitemap);
    assert.deepEqual(
      categories.map((category) => category.path),
      [
        "artykuły spożywcze / mleko nabiał i jaja / jaja",
        "artykuły spożywcze / mleko nabiał i jaja / jaja / jaja ściółkowe",
      ],
    );
    assert.throws(() => parseAuchanCategories("<urlset></urlset>"), /Auchan/);
  });

  test("the shelf that names the item last comes first, the narrower one on a tie", () => {
    const categories = parseAuchanCategories(sitemap);
    assert.equal(categoriesFor("jajka", categories, 1)[0].path.endsWith("jaja ściółkowe"), true);
    assert.deepEqual(categoriesFor("pasta do zębów", categories, 3), []);
  });
});

describe("Auchan category page", () => {
  test("every product in stock is priced, the pack from its name", () => {
    assert.equal(products.length, 7);
    const quark = products.find((product) => product.name === "Twaróg wiejski lekki 0% Piątnica 250 g");
    assert.deepEqual([quark?.price, quark?.packQuantity, quark?.packUnit, quark?.loose], [4.85, 250, "g", false]);
    assert.ok(products.every((product) => product.productKey.startsWith("auchan:") && product.price > 0));
  });

  test("a pack the name does not give comes from the price per kilo; sold by weight is loose per kilo", () => {
    const entity = (name: string, label: string, unit: number) => ({
      productEntities: {
        a: {
          retailerProductId: "1",
          available: true,
          name,
          price: { current: { amount: "6.00" }, unit: { label, current: { amount: String(unit) } } },
        },
      },
    });
    const [flour] = parseAuchanCategoryPage(page(JSON.stringify(entity("Mąka pszenna", "fop.price.per.kg", 3))), "u");
    assert.deepEqual([flour.packQuantity, flour.packUnit, flour.loose], [2000, "g", false]);
    const [fillet] = parseAuchanCategoryPage(
      page(JSON.stringify(entity("Filet z kurczaka Auchan na wagę ok. 500 g", "fop.price.per.kg", 24.8))),
      "u",
    );
    assert.deepEqual([fillet.price, fillet.packQuantity, fillet.packUnit, fillet.loose], [24.8, 1000, "g", true]);
    const [eggs] = parseAuchanCategoryPage(page(JSON.stringify(entity("Jaja", "fop.price.per.each", 0.6))), "u");
    assert.deepEqual([eggs.packQuantity, eggs.packUnit], [10, "szt"]);
  });

  test("a product out of stock is left out; a page that is not the shop's throws", () => {
    const gone = state.replace(/"available": true/g, '"available": false');
    assert.equal(parseAuchanCategoryPage(page(gone), "u").length, 0);
    assert.throws(() => parseAuchanCategoryPage("<html></html>", "u"), /Auchan/);
  });
});
