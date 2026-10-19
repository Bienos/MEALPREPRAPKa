import { CATEGORY_LABELS, formatAmount, SHOPPING_CATEGORIES, type ShoppingCategory, type Unit } from "./ingredients.ts";

type Row = {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: ShoppingCategory;
  checked: boolean;
  owned: boolean;
};

/**
 * What is still to buy, as plain text to paste into a message or a notes app:
 * grouped by aisle, without what is already bought or at home.
 */
export function shoppingText(rows: Row[]): string {
  const toBuy = rows.filter((row) => !row.checked && !row.owned);
  const sections: string[] = [];
  for (const category of SHOPPING_CATEGORIES) {
    const items = toBuy.filter((row) => row.category === category);
    if (items.length === 0) continue;
    const lines = items.map((row) => {
      const amount = formatAmount(row.quantity, row.unit as Unit | null);
      return `- ${row.name}${amount ? ` ${amount}` : ""}`;
    });
    sections.push([CATEGORY_LABELS[category], ...lines].join("\n"));
  }
  return sections.join("\n\n");
}

type Line = { name: string; unit: string | null; quantity: number | null };

/**
 * A rebuilt list must not undo what was ticked in the shop. An item stays
 * "bought" as long as the new amount is no more than what was there when it
 * was ticked, and "mam w domu" always stays.
 */
export function keepTicks<T extends Line>(
  next: T[],
  previous: (Line & { checked: boolean; owned: boolean })[],
): (T & { checked: boolean; owned: boolean })[] {
  const key = (line: Line) => `${line.name.toLowerCase()}|${line.unit ?? ""}`;
  const before = new Map(previous.map((line) => [key(line), line]));
  return next.map((line) => {
    const old = before.get(key(line));
    const notMore = old !== undefined && (line.quantity ?? 0) <= (old.quantity ?? 0);
    return { ...line, checked: Boolean(old?.checked && notMore), owned: Boolean(old?.owned) };
  });
}
