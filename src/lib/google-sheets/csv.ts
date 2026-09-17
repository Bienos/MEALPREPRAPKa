/**
 * Minimal RFC 4180 CSV parser (no dependency, matches CLAUDE.md's rule against
 * unnecessary packages). Handles quoted fields, embedded commas, embedded
 * quotes ("") and embedded newlines. \r\n and \n line endings are both accepted.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnything = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      sawAnything = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
      sawAnything = true;
    } else if (char === "\r") {
      // ignored; \n (below) ends the row
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      sawAnything = false;
    } else {
      field += char;
      sawAnything = true;
    }
  }
  if (sawAnything || field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
