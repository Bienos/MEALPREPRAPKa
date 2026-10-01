import Link from "next/link";
import { Refrigerator, ShoppingBasket } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { addDays, longDateLabel, relativeDayLabel, todayIso } from "@/lib/date";
import { listDayPlans } from "@/lib/db/day-plans";
import { listAvailablePortions } from "@/lib/db/prep";
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
  const horizon = addDays(today, 3);
  const [session, plans, portions, shopping] = await Promise.all([
    getActivePrepSession(),
    listDayPlans(today, horizon),
    listAvailablePortions(),
    listShoppingItems(),
  ]);

  let stage: PrepStage;

  // The next four days with the type each already has. A day you have not
  // planned yet falls back to the default. Offered both on a fresh start and
  // right after a finished prep, so there is never a screen with no way to
  // plan the next one.
  const plannedTypes = new Map(plans.map((plan) => [plan.date, plan.day_type]));
  const nextDays: PrepDayView[] = Array.from({ length: 4 }, (_, index) => {
    const date = addDays(today, index);
    const long = longDateLabel(date);
    return {
      date,
      label: index <= 2 ? `${relativeDayLabel(date, today)} · ${long}` : long,
      dayType: plannedTypes.get(date) ?? settings.default_day_type,
    };
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

  const toBuy = shopping.filter((item) => !item.owned && !item.checked).length;

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
          className="flex min-h-16 items-center gap-3 rounded-xl border bg-card px-4 hover:bg-muted"
        >
          <Refrigerator className="size-5 shrink-0 text-accent" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Lodówka</span>
            <span className="block text-sm text-muted-foreground">
              {portions.length > 0
                ? `${portions.length} ugotowanych porcji czeka na zjedzenie`
                : "Tu zobaczysz, co ugotowałeś na zapas"}
            </span>
          </span>
        </Link>
        <Link
          href="/prep/zakupy"
          className="flex min-h-16 items-center gap-3 rounded-xl border bg-card px-4 hover:bg-muted"
        >
          <ShoppingBasket className="size-5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Zakupy</span>
            <span className="block text-sm text-muted-foreground">
              {shopping.length === 0
                ? "Lista zrobi się sama po zbudowaniu prepu"
                : toBuy > 0
                  ? `Zostało do kupienia: ${toBuy}`
                  : "Wszystko kupione"}
            </span>
          </span>
        </Link>
      </nav>
    </>
  );
}
