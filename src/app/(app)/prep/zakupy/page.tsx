import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { ShoppingList, type ShoppingRow, type StapleRow } from "@/components/prep/shopping-list";
import { PageHeader } from "@/components/shell/page-header";
import { APP_TIMEZONE, todayIso } from "@/lib/date";
import { listPantryStaples } from "@/lib/db/pantry";
import { listProductLinks, listShopPrices, listShopPromos } from "@/lib/db/prices";
import { listShoppingItems } from "@/lib/db/shopping";
import type { ShoppingCategory } from "@/lib/meals/ingredients";
import { isPromoActive } from "@/lib/prices/basket";
import { checkShoppingItemAction, clearCheckedAction, ownShoppingItemAction, setStapleStockAction } from "../actions";
import { answerPromoAction, refreshPromosAction, removeShopPriceAction, saveShopPriceAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ShoppingPage() {
  const [items, staples, promos, prices, links] = await Promise.all([
    listShoppingItems(),
    listPantryStaples(),
    listShopPromos(),
    listShopPrices(),
    listProductLinks(),
  ]);

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

  const today = todayIso();
  const lastFetch = promos.reduce<string | null>(
    (latest, promo) => (latest === null || promo.fetchedAt > latest ? promo.fetchedAt : latest),
    null,
  );

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
      <ShoppingList
        items={rows}
        staples={stapleRows}
        onCheck={checkShoppingItemAction}
        onOwn={ownShoppingItemAction}
        onStaple={setStapleStockAction}
        onClearChecked={clearCheckedAction}
        pricing={{
          promos: promos.filter((promo) => isPromoActive(promo, today)),
          prices,
          links,
          fetchedLabel: lastFetch ? fetchedLabel(lastFetch) : null,
          onRefresh: refreshPromosAction,
          onSavePrice: saveShopPriceAction,
          onRemovePrice: removeShopPriceAction,
          onAnswer: answerPromoAction,
        }}
      />
    </>
  );
}

/** "19.10, 07:02" in the app's timezone. */
function fetchedLabel(iso: string): string {
  const parts = new Intl.DateTimeFormat("pl-PL", {
    timeZone: APP_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${part("day")}.${part("month")}, ${part("hour")}:${part("minute")}`;
}
