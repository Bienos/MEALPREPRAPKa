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
