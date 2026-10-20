import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { matchCandidate, type Candidate, type Need } from "./matching.ts";
import { normalizeName, tokens, variantOf, withPolish } from "./normalize.ts";
import { parseQuantity } from "./units.ts";

const need = (name: string, unit: Need["unit"] = "g", gtin?: string): Need => ({ name, unit, gtin });
const product = (name: string, extra: Partial<Candidate> = {}): Candidate => ({ name, pack: parseQuantity(name), ...extra });
const tier = (item: Need, candidate: Candidate, excludedBrands: string[] = []) =>
  matchCandidate(item, candidate, { excludedBrands }).tier;

describe("Polish normalization", () => {
  test("letters fold, words split", () => {
    assert.deepEqual(tokens("Pierś z kurczaka, 1 kg"), ["piers", "z", "kurczaka", "1", "kg"]);
    assert.equal(normalizeName("  Łosoś  WĘDZONY "), "losos wedzony");
  });

  test("English names get their Polish words", () => {
    assert.match(withPolish("Virgin Olive Oil"), /oliwa z oliwek/);
    assert.match(withPolish("Sushi Rice"), /\bryz\b/);
    assert.match(withPolish("High Protein Milk"), /\bmleko\b/);
    assert.equal(withPolish("Twaróg chudy"), "twarog chudy");
  });

  test("variant attributes are read only from words that state them", () => {
    assert.deepEqual(variantOf("Twaróg chudy 250 g").fat, { level: "low" });
    assert.deepEqual(variantOf("Twaróg półtłusty").fat, { level: "mid" });
    assert.deepEqual(variantOf("Jogurt naturalny 2%").fat, { percent: 2 });
    assert.deepEqual(variantOf("Mleko UHT 0,5%").fat, { percent: 0.5 });
    assert.equal(variantOf("Twaróg 250 g").fat, undefined);
    // 30% in a tomato concentrate is not fat.
    assert.equal(variantOf("Koncentrat pomidorowy 30%").fat, undefined);
    assert.equal(variantOf("Ryż basmati 1 kg").rice, "basmati");
    assert.equal(variantOf("Ryż do sushi").rice, "sushi");
    assert.equal(variantOf("Jaja L z wolnego wybiegu 10 szt.").eggSize, "L");
    assert.equal(variantOf("Polędwiczki z kurczaka pieczone w marynacie").state, "cooked");
    assert.equal(variantOf("Truskawki mrożone 450 g").state, "frozen");
    assert.ok(variantOf("Oliwa z oliwek extra virgin").extraVirgin);
  });
});

describe("matching tiers", () => {
  test("the prompt's examples match exactly when every attribute is there", () => {
    assert.equal(tier(need("pierś z kurczaka"), product("Filet z piersi kurczaka 800 g")), "attributes");
    assert.equal(tier(need("ryż basmati"), product("Ryż basmati 500 g")), "attributes");
    assert.equal(tier(need("jogurt grecki naturalny"), product("Jogurt grecki naturalny 400 g")), "attributes");
    assert.equal(tier(need("jajka", "szt"), product("Jaja z wolnego wybiegu M 6 szt.")), "attributes");
    assert.equal(tier(need("oliwa z oliwek", "ml"), product("Oliwa z oliwek 100 ml")), "attributes");
  });

  test("a barcode match wins, but never on an in-store code", () => {
    assert.equal(tier(need("skyr", "g", "5900512904665"), product("Skyr", { gtin: "05900512904665" })), "gtin");
    assert.equal(tier(need("twaróg chudy", "g", "20858087"), product("Twaróg Chudy 250g", { gtin: "20858087" })), "attributes");
  });

  test("a confirmed product is a listing match", () => {
    assert.equal(tier(need("skyr"), product("Piątnica Skyr 150 g", { confirmed: true })), "listing");
    assert.equal(tier(need("skyr"), product("Piątnica Skyr 150 g", { rejected: true })), "none");
  });

  test("an attribute the product does not state is unknown, not a match", () => {
    assert.equal(tier(need("twaróg chudy"), product("Twaróg 250 g")), "category");
    assert.equal(tier(need("mozzarella light"), product("Mozzarella 125 g")), "category");
    assert.equal(tier(need("skyr"), product("Skyr naturalny", { pack: null })), "category");
    assert.equal(tier(need("skyr"), product("Skyr naturalny", { pack: { amount: 450, unit: "g" }, packAssumed: true })), "category");
  });

  test("false positives the keyword rules alone let through become substitutions", () => {
    const fatty = matchCandidate(need("twaróg chudy"), product("Twaróg tłusty 250 g"));
    assert.equal(fatty.tier, "substitution");
    assert.ok(fatty.needsApproval);
    assert.match(fatty.conflicts[0], /tłuszcz/);
    assert.equal(tier(need("twaróg chudy"), product("Twaróg półtłusty 250 g")), "substitution");
    assert.equal(tier(need("twaróg chudy"), product("Twaróg 0,5% 250 g")), "attributes");
    assert.equal(tier(need("jogurt 2%"), product("Jogurt grecki 10% 400 g")), "substitution");
    assert.equal(tier(need("jogurt 2%"), product("Jogurt naturalny 2% 370 g")), "attributes");
    assert.equal(tier(need("wołowina 5%"), product("Wołowina mielona 20% 500 g")), "substitution");
    assert.equal(tier(need("wołowina 5%"), product("Wołowina mielona 5% 400 g")), "attributes");
    assert.equal(tier(need("mozzarella light"), product("Mozzarella light 125 g")), "attributes");
    assert.equal(tier(need("ryż basmati"), product("Ryż jaśminowy 1 kg")), "substitution");
  });

  test("different products are not matched at all", () => {
    assert.equal(tier(need("pierś z kurczaka"), product("Polędwiczki z kurczaka pieczone w marynacie 350 g")), "none");
    assert.equal(tier(need("jogurt naturalny"), product("Jogurt pitny truskawkowy 360 g")), "none");
    assert.equal(tier(need("ryż"), product("Ryż do sushi 500 g")), "none");
    assert.equal(tier(need("jajka", "szt"), product("Jaja przepiórcze 18 szt")), "none");
    assert.equal(tier(need("mleko", "ml"), product("Mleko kokosowe 400 ml")), "none");
    assert.equal(tier(need("skyr"), product("Skyr szarlotka 330 g")), "none");
  });

  test("a pack in another unit can never price the item", () => {
    assert.equal(tier(need("jajka", "szt"), product("Jaja kurze 600 g")), "none");
  });

  test("excluded brands are never suggested", () => {
    assert.equal(tier(need("skyr"), product("Piątnica Skyr naturalny 450 g"), ["Piątnica"]), "none");
    assert.equal(tier(need("skyr"), product("Skyr naturalny 450 g", { brand: "Pilos" }), ["pilos"]), "none");
    assert.equal(tier(need("skyr"), product("Piątnica Skyr naturalny 450 g"), ["Pilos"]), "attributes");
  });

  test("cooked or smoked meat is not the raw meat on the list", () => {
    const cooked = matchCandidate(need("kurczak"), product("Filet z piersi kurczaka gotowany 100 g"));
    assert.equal(cooked.tier === "none" || cooked.tier === "substitution", true);
    assert.equal(tier(need("kurczak gotowy"), product("Filet z kurczaka pieczony 200 g")), "attributes");
  });

  test("English names from open data reach the Polish rules", () => {
    assert.equal(tier(need("oliwa", "ml"), product("Virgin Olive Oil 500 ml")), "attributes");
    assert.equal(tier(need("ryż"), product("Sushi Rice 500g")), "none");
  });
});
