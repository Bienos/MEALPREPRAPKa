import Link from "next/link";
import { CalendarRange, ChevronRight, Refrigerator, ShoppingBasket } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { addDays, longDateLabel, relativeDayLabel, todayIso } from "@/lib/date";
import { listDayPlans, listPlannedMealsBetween } from "@/lib/db/day-plans";
import { listAvailablePortions } from "@/lib/db/prep";
import {
  getActivePrepSession,
  getJustCompletedPrepSession,
  listPrepSessionItems,
} from "@/lib/db/prep-sessions";
import { getSettings, getTargets } from "@/lib/db/settings";
import { listShoppingItems } from "@/lib/db/shopping";
import { buildCookingSteps } from "@/lib/meals/cooking-steps";
import { getMealLibrary } from "@/lib/meals/library";
import { maxPrepDays, PREP_SLOT_LABELS, PREP_SLOTS, type PrepSlot } from "@/lib/meals/prep-plan";
import { toPrepItems } from "@/lib/meals/prep";
import type { PrepDayView, PrepItemView } from "@/lib/meals/prep-view-types";
import { counts, defaultWeekStart, WEEK_TOLERANCE, weekTarget } from "@/lib/meals/week-plan";
import { PrepClient, type PrepStage } from "./prep-client";

export const dynamic = "force-dynamic";

export default async function PrepPage() {
  const settings = await getSettings();
  const today = todayIso(settings.timezone);
  const horizon = addDays(today, 3);
  const weekFrom = defaultWeekStart(today);
  const weekTo = addDays(weekFrom, 6);
  const [session, plans, portions, shopping, { library }, targets, weekPlans, weekMeals] = await Promise.all([
    getActivePrepSession(),
    listDayPlans(today, horizon),
    listAvailablePortions(),
    listShoppingItems(),
    getMealLibrary(),
    getTargets(),
    listDayPlans(weekFrom, weekTo),
    listPlannedMealsBetween(weekFrom, weekTo),
  ]);

  // How the week the week screen opens on adds up, for the card at the top.
  const weekTypes = new Map(weekPlans.map((plan) => [plan.date, plan.day_type]));
  const weekGoal = weekTarget(
    Array.from({ length: 7 }, (_, index) => weekTypes.get(addDays(weekFrom, index)) ?? settings.default_day_type),
    targets,
  ).kcal;
  const weekKcal = weekMeals.filter((meal) => counts(meal)).reduce((sum, meal) => sum + meal.kcal, 0);
  const weekMatches = Math.abs(weekKcal - weekGoal) <= weekGoal * WEEK_TOLERANCE;

  // Suppers keep a day or two, so the day picker offers only what each slot's dishes last.
  const maxDays = Object.fromEntries(
    PREP_SLOTS.map((slot) => [slot, Math.min(maxPrepDays(library.meals, slot), 4)]),
  ) as Record<PrepSlot, number>;

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
      maxDays,
    };
  } else if (!session) {
    stage = { kind: "start", days: nextDays, maxDays };
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

      <Link
        href="/prep/tydzien"
        className="flex min-h-20 items-center gap-3 rounded-2xl border-2 border-primary/30 bg-gradient-to-br from-card to-primary/10 px-4 py-3 hover:border-primary/60"
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <CalendarRange className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-lg font-extrabold">Plan tygodnia</span>
          <span className="block text-sm text-muted-foreground">
            {weekKcal > 0
              ? `${weekKcal.toLocaleString("pl-PL")} / ${weekGoal.toLocaleString("pl-PL")} kcal${weekMatches ? " · pasuje" : ""}`
              : "Wybierz jedzenie na tydzień, policzę makro i zrobię listę zakupów"}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Link>

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
