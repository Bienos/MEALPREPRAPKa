import Link from "next/link";
import { Refrigerator, ShoppingBasket } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { addDays, longDateLabel, todayIso } from "@/lib/date";
import { listPrepBatches, listAvailablePortions } from "@/lib/db/prep";
import {
  getActivePrepSession,
  getJustCompletedPrepSession,
  listPrepSessionItems,
} from "@/lib/db/prep-sessions";
import { getSettings } from "@/lib/db/settings";
import { listShoppingItems } from "@/lib/db/shopping";
import { buildCookingSteps } from "@/lib/meals/cooking-steps";
import { PREP_SLOT_LABELS } from "@/lib/meals/prep-plan";
import { toPrepItems } from "@/lib/meals/prep";
import type { PrepDayView, PrepItemView } from "@/lib/meals/prep-view-types";
import { PrepClient, type PrepStage } from "./prep-client";

export const dynamic = "force-dynamic";

export default async function PrepPage() {
  const settings = await getSettings();
  const today = todayIso(settings.timezone);
  const session = await getActivePrepSession();

  let stage: PrepStage;

  // The next four days, each defaulting to the configured day type. Offered
  // both on a fresh start and right after a finished prep, so there is never
  // a screen with no way to plan the next one.
  const nextDays: PrepDayView[] = Array.from({ length: 4 }, (_, index) => {
    const date = addDays(today, index);
    return { date, label: longDateLabel(date), dayType: settings.default_day_type };
  });

  // A prep finished moments ago still gets its summary screen.
  const justFinished = session ? null : await getJustCompletedPrepSession();

  if (justFinished) {
    const items = await listPrepSessionItems(justFinished.id);
    stage = {
      kind: "complete",
      portions: items.map((item) => ({
        mealName: item.meal_name,
        variant: item.variant,
        count: item.portions,
      })),
      days: nextDays,
    };
  } else if (!session) {
    stage = { kind: "start", days: nextDays };
  } else {
    const items = await listPrepSessionItems(session.id);

    if (session.status === "cooking") {
      stage = {
        kind: "cooking",
        steps: buildCookingSteps(toPrepItems(items)),
        currentStep: session.current_step,
      };
    } else {
      const [shopping, portions] = await Promise.all([listShoppingItems(), listAvailablePortions()]);
      const view: PrepItemView[] = items.map((item) => ({
        id: item.id,
        mealKey: item.meal_key,
        mealName: item.meal_name,
        variant: item.variant,
        portions: item.portions,
        kcal: item.kcal,
        protein_g: item.protein_g,
        fat_g: item.fat_g,
        carbs_g: item.carbs_g,
      }));
      stage = {
        kind: "result",
        days: session.days.length,
        slotLabel: PREP_SLOT_LABELS[session.slot],
        items: view,
        estimatedMinutes: [...new Set(items.map((item) => item.meal_key))].reduce((total, key) => {
          const item = items.find((entry) => entry.meal_key === key);
          return total + (item?.prep_minutes ?? 0);
        }, 0),
        fromFridge: portions.length,
        shoppingCount: shopping.filter((item) => !item.owned && !item.checked).length,
        short: items.length === 0,
      };
    }
  }

  // Shown as a hint on the fridge link.
  const recentBatches = session ? [] : await listPrepBatches(1);

  return (
    <>
      <PageHeader
        title="Prep"
        subtitle={
          session || justFinished
            ? "Zaplanuj, ugotuj, wstaw do lodówki"
            : "Zaplanuj 2–4 dni i przygotuj wszystko za jednym razem."
        }
      />

      <PrepClient stage={stage} />

      <nav className="flex flex-col gap-2">
        <Link
          href="/prep/lodowka"
          className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 font-semibold hover:bg-muted"
        >
          <Refrigerator className="size-5 text-accent" />
          Lodówka
          {recentBatches.length > 0 ? (
            <span className="ml-auto text-sm font-normal text-muted-foreground">
              ostatnio: {recentBatches[0].meal_name}
            </span>
          ) : null}
        </Link>
        <Link
          href="/prep/zakupy"
          className="flex min-h-14 items-center gap-3 rounded-xl border bg-card px-4 font-semibold hover:bg-muted"
        >
          <ShoppingBasket className="size-5 text-primary" />
          Zakupy
        </Link>
      </nav>
    </>
  );
}
