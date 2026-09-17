import assert from "node:assert/strict";
import { test } from "node:test";

import { parseCsv } from "./csv.ts";

test("parses plain rows", () => {
  assert.deepEqual(parseCsv("a,b,c\n1,2,3\n"), [
    ["a", "b", "c"],
    ["1", "2", "3"],
  ]);
});

test("handles a file with no trailing newline", () => {
  assert.deepEqual(parseCsv("a,b\n1,2"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("handles CRLF line endings", () => {
  assert.deepEqual(parseCsv("a,b\r\n1,2\r\n"), [
    ["a", "b"],
    ["1", "2"],
  ]);
});

test("unquotes fields with embedded commas", () => {
  assert.deepEqual(parseCsv('name,note\n"Chicken, Rice",ok\n'), [
    ["name", "note"],
    ["Chicken, Rice", "ok"],
  ]);
});

test("unescapes doubled quotes inside quoted fields", () => {
  assert.deepEqual(parseCsv('a\n"say ""hi"""\n'), [["a"], ['say "hi"']]);
});

test("keeps embedded newlines inside quoted fields as part of the field", () => {
  assert.deepEqual(parseCsv('a,b\n"line1\nline2",x\n'), [
    ["a", "b"],
    ["line1\nline2", "x"],
  ]);
});

test("keeps empty rows as a single empty-string cell", () => {
  assert.deepEqual(parseCsv("a,b\n\n1,2\n"), [["a", "b"], [""], ["1", "2"]]);
});

test("returns an empty array for an empty string", () => {
  assert.deepEqual(parseCsv(""), []);
});
