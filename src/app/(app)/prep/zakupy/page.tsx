import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { ShoppingList, type ShoppingRow, type StapleRow } from "@/components/prep/shopping-list";
import { PageHeader } from "@/components/shell/page-header";
import { listPantryStaples } from "@/lib/db/pantry";
import { listShoppingItems } from "@/lib/db/shopping";
import type { ShoppingCategory } from "@/lib/meals/ingredients";
import { checkShoppingItemAction, ownShoppingItemAction, setStapleStockAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
  const [items, staples] = await Promise.all([listShoppingItems(), listPantryStaples()]);

  const rows: ShoppingRow[] = items.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category as ShoppingCategory,
    checked: item.checked,
    owned: item.owned,
  }));
  const stapleRows: StapleRow[] = staples.map((staple) => ({
    id: staple.id,
    name: staple.name,
    inStock: staple.in_stock,
  }));

  return (
    <>
      <Link
        href="/prep"
        className="-ml-1 flex h-10 w-fit items-center gap-1 pr-2 font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-5" />
        Prep
      </Link>
      <PageHeader title="Zakupy" subtitle="Z aktualnego prepu, bez duplikatów" />
      <ShoppingList
        items={rows}
        staples={stapleRows}
        onCheck={checkShoppingItemAction}
        onOwn={ownShoppingItemAction}
        onStaple={setStapleStockAction}
      />
    </>
  );
}
