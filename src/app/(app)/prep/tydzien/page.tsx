import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { addDays, todayIso } from "@/lib/date";
import { getSettings } from "@/lib/db/settings";
import { listShoppingItems } from "@/lib/db/shopping";
import { weekStart } from "@/lib/meals/calendar";
import type { Unit } from "@/lib/meals/ingredients";
import { loadWeek, weekRangeLabel } from "@/lib/meals/week";
import { defaultWeekStart } from "@/lib/meals/week-plan";
import { loadPricing } from "@/lib/prices/load";
import {
  answerPromoAction,
  refreshPromosAction,
  removeShopPriceAction,
  saveShopPriceAction,
  saveShopPricesAction,
} from "../zakupy/actions";
import { WeekPlanner } from "./week-planner";

export const dynamic = "force-dynamic";
// "Sprawdź promocje" reads Lidl and up to two leaflet pages per item: give it time.
export const maxDuration = 60;

/** A Monday in the address (?od=2026-10-19), or the week the screen should open on. */
function chosenStart(od: string | undefined, today: string): string {
  if (od && /^\d{4}-\d{2}-\d{2}$/.test(od) && !Number.isNaN(Date.parse(od))) return weekStart(od);
  return defaultWeekStart(today);
}

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ od?: string }> }) {
  const { od } = await searchParams;
  const settings = await getSettings();
  const start = chosenStart(od, todayIso(settings.timezone));
  const [week, shopping, pricing] = await Promise.all([loadWeek(start), listShoppingItems(), loadPricing()]);

  return (
    <>
      <Link
        href="/prep"
        className="-mb-4 -ml-1 flex h-10 w-fit items-center gap-1 pr-2 font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-5" />
        Prep
      </Link>
      <WeekPlanner
        key={start}
        start={start}
        rangeLabel={weekRangeLabel(start)}
        previousStart={addDays(start, -7)}
        nextStart={addDays(start, 7)}
        today={week.today}
        dates={week.dates}
        dayTypes={week.dayTypes}
        targets={week.targets}
        entries={week.entries}
        proposals={week.proposals}
        toBuy={shopping
          .filter((item) => !item.checked && !item.owned)
          .map((item) => ({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit as Unit | null }))}
        pricing={{
          ...pricing,
          onRefresh: refreshPromosAction,
          onSavePrice: saveShopPriceAction,
          onSavePrices: saveShopPricesAction,
          onRemovePrice: removeShopPriceAction,
          onAnswer: answerPromoAction,
        }}
      />
    </>
  );
}
