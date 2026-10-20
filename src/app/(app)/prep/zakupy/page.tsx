import Link from "next/link";
import { ChevronLeft, ChevronRight, Tag } from "lucide-react";

import { ShoppingList, type ShoppingRow, type StapleRow } from "@/components/prep/shopping-list";
import { PageHeader } from "@/components/shell/page-header";
import { listPantryStaples } from "@/lib/db/pantry";
import { listShoppingItems } from "@/lib/db/shopping";
import type { ShoppingCategory } from "@/lib/meals/ingredients";
import { loadPricing } from "@/lib/prices/load";
import { checkShoppingItemAction, clearCheckedAction, ownShoppingItemAction, setStapleStockAction } from "../actions";
import {
  answerPromoAction,
  refreshFeedsAction,
  refreshSweepAction,
  refreshPromosAction,
  removeShopPriceAction,
  saveShopPriceAction,
  saveShopPricesAction,
} from "./actions";

export const dynamic = "force-dynamic";
// "Sprawdź promocje" reads Lidl and up to two leaflet pages per item: give it time.
export const maxDuration = 60;

export default async function ShoppingPage() {
  const [items, staples, pricing] = await Promise.all([listShoppingItems(), listPantryStaples(), loadPricing()]);

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
      <PageHeader title="Zakupy" subtitle="Z planu tygodnia albo prepu, bez duplikatów" />
      <Link
        href="/prep/promocje"
        className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 py-3 font-semibold shadow-sm hover:bg-muted"
      >
        <Tag className="size-5 text-primary" />
        <span className="flex-1">
          Promocje tygodnia
          <span className="block text-sm font-normal text-muted-foreground">
            Gazetki i aplikacje wszystkich sklepów
          </span>
        </span>
        <ChevronRight className="size-5 text-muted-foreground" />
      </Link>
      <ShoppingList
        items={rows}
        staples={stapleRows}
        onCheck={checkShoppingItemAction}
        onOwn={ownShoppingItemAction}
        onStaple={setStapleStockAction}
        onClearChecked={clearCheckedAction}
        pricing={{
          ...pricing,
          onRefresh: refreshPromosAction,
          onRefreshSweep: refreshSweepAction,
          onRefreshFeeds: refreshFeedsAction,
          onSavePrice: saveShopPriceAction,
          onSavePrices: saveShopPricesAction,
          onRemovePrice: removeShopPriceAction,
          onAnswer: answerPromoAction,
        }}
      />
    </>
  );
}
