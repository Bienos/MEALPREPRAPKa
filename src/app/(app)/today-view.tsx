"use client";

import { useState } from "react";
import Link from "next/link";
import { ChefHat, ChevronLeft, UtensilsCrossed } from "lucide-react";

import { AddSheet, type AddMode } from "@/components/today/add-sheet";
import { DayDone } from "@/components/today/day-done";
import { DayStrip } from "@/components/today/day-strip";
import { DaySummary } from "@/components/today/day-summary";
import { DayTypeToggle } from "@/components/today/day-type-toggle";
import { DinnerOutSheet } from "@/components/today/dinner-out-sheet";
import { EmptyDay } from "@/components/today/empty-day";
import { LogOtherSheet, type LogPayload } from "@/components/today/log-other-sheet";
import { MealSheet } from "@/components/today/meal-sheet";
import { NextMealCard } from "@/components/today/next-meal-card";
import { NoCookSheet } from "@/components/today/no-cook-sheet";
import { PlanList } from "@/components/today/plan-list";
import { RebalanceSheet } from "@/components/today/rebalance-sheet";
import { SwapSheet } from "@/components/today/swap-sheet";
import { UndoToast } from "@/components/today/undo-toast";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Suggestion } from "@/lib/meals/rebalance";
import type { Candidate, NoCookOption } from "@/lib/meals/recommend";
import {
  isEaten,
  nextPlannedMeal,
  rescaleMacros,
  sortDay,
  sumMacros,
  type AddOption,
  type DayType,
  type DayWhen,
  type Macros,
  type TodayMeal,
} from "@/lib/meals/today-view-types";
import type { DayCell } from "@/lib/meals/calendar";
import {
  applyDefaultDayAction,
  applySuggestionAction,
  applySwapAction,
  dinnerOutAction,
  estimateFoodAction,
  logOtherAction,
  markEatenAction,
  noCookAction,
  planMealAction,
  rebalanceAction,
  removeMealAction,
  savedMealsAction,
  setDayTypeAction,
  setPortionsAction,
  swapOptionsAction,
  undoEatenAction,
  updateMealAction,
  type LogOtherInput,
} from "./actions";

type Toast = { message: string; actionLabel?: string; action: () => void } | null;
type SheetName = "none" | "add" | "log" | "rebalance" | "nocook" | "dinner";

/** What "Dodaj" may do on each kind of day. */
const ADD_MODES: Record<DayWhen, AddMode[]> = {
  today: ["eat", "plan"],
  past: ["eat"],
  future: ["plan"],
};

/**
 * One day. Today is the main screen; the same screen opens for any other day
 * from the calendar, where it shows what was eaten (past) or is planned
 * (future) and everything can be changed.
 */
export function TodayView({
  date,
  dateLabel,
  relativeLabel,
  when,
  dayType,
  target,
  initialMeals,
  addOptions,
  hasTemplate,
  cooked,
  strip,
  aiEnabled,
}: {
  date: string;
  dateLabel: string;
  /** "Jutro", "Wczoraj"... for the days that are not today. */
  relativeLabel: string | null;
  when: DayWhen;
  dayType: DayType;
  target: Macros;
  initialMeals: TodayMeal[];
  addOptions: AddOption[];
  hasTemplate: boolean;
  /** Preps cooked on this day. */
  cooked: string[];
  /** The days around this one, for the strip at the top. */
  strip: DayCell[];
  aiEnabled: boolean;
}) {
  // Local source of truth so every tap feels instant; the server write follows.
  const [meals, setMeals] = useState(initialMeals);
  // When the server sends a fresh day (after a refresh), it replaces local state.
  const [syncedMeals, setSyncedMeals] = useState(initialMeals);
  if (initialMeals !== syncedMeals) {
    setSyncedMeals(initialMeals);
    setMeals(initialMeals);
  }

  const [toast, setToast] = useState<Toast>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetName>("none");
  // Exception flows live in bottom sheets so the normal one-tap path stays bare.
  const [swapFor, setSwapFor] = useState<TodayMeal | null>(null);
  const [swapOptions, setSwapOptions] = useState<Candidate[] | null>(null);
  // Remounting the Dodaj sheet is how it starts fresh, in the mode that was asked for.
  const [addSession, setAddSession] = useState<{ id: number; mode: AddMode; replacing: TodayMeal | null }>({
    id: 0,
    mode: ADD_MODES[when][0],
    replacing: null,
  });
  const [frequentKeys, setFrequentKeys] = useState<string[] | null>(null);
  const [savedMeals, setSavedMeals] = useState<Candidate[] | null>(null);
  const [rebalance, setRebalance] = useState<Awaited<ReturnType<typeof rebalanceAction>> | null>(null);
  const [noCook, setNoCook] = useState<Awaited<ReturnType<typeof noCookAction>> | null>(null);
  // Fridge portions taken by "Dodaj" since the page loaded.
  const [fridgeUsed, setFridgeUsed] = useState<Record<string, number>>({});

  const isToday = when === "today";
  const tomorrow = strip.find((cell) => cell.date > date) ?? null;
  const next = isToday ? nextPlannedMeal(meals) : undefined;
  const eaten = sumMacros(meals.filter(isEaten));
  // A future day has nothing eaten yet, so its summary adds up what is planned.
  const shown = when === "future" ? sumMacros(meals.filter((meal) => meal.status !== "skipped")) : eaten;
  const selected = meals.find((meal) => meal.id === selectedId) ?? null;
  const options = addOptions.map((option) => ({
    ...option,
    ready: Math.max(option.ready - (fridgeUsed[option.mealKey] ?? 0), 0),
  }));

  function patchMeal(id: string, patch: Partial<TodayMeal>) {
    setMeals((current) => current.map((meal) => (meal.id === id ? { ...meal, ...patch } : meal)));
  }

  async function handleEaten(meal: TodayMeal) {
    patchMeal(meal.id, { status: "eaten", eatenAt: new Date().toISOString() });
    setToast({ message: `Zjedzone: ${meal.mealName}`, action: () => void handleUndo(meal.id) });
    try {
      await markEatenAction(meal.id);
    } catch {
      patchMeal(meal.id, { status: "planned", eatenAt: null });
      setToast(null);
      setError("Nie udało się zapisać. Spróbuj ponownie.");
    }
  }

  async function handleUndo(mealId: string) {
    patchMeal(mealId, { status: "planned", eatenAt: null });
    setToast(null);
    try {
      await undoEatenAction(mealId);
    } catch {
      setError("Nie udało się cofnąć. Odśwież stronę.");
    }
  }

  async function handleRemove(meal: TodayMeal) {
    setMeals((current) => current.filter((candidate) => candidate.id !== meal.id));
    setToast(null);
    try {
      await removeMealAction(meal.id);
    } catch {
      setMeals((current) => sortDay([...current, meal]));
      setError("Nie udało się usunąć. Spróbuj ponownie.");
    }
  }

  /** "Usuń z dnia": gone, and the toast offers the obvious next step, putting something else there. */
  async function handleRemoveAndOffer(meal: TodayMeal) {
    await handleRemove(meal);
    setToast({
      message: `Usunięto: ${meal.mealName}`,
      actionLabel: "Dodaj inny",
      action: () => {
        setToast(null);
        void openAdd("plan");
      },
    });
  }

  function handleToggleEaten(meal: TodayMeal) {
    if (meal.status === "planned") void handleEaten(meal);
    else if (meal.status === "eaten") void handleUndo(meal.id);
    // Food logged outside the plan has no planned state to go back to.
    else if (meal.status === "adhoc") void handleRemove(meal);
  }

  async function handleSave(meal: TodayMeal, patch: Macros & { portions: number }) {
    const previous = { ...meal };
    patchMeal(meal.id, patch);
    try {
      await updateMealAction(meal.id, patch);
    } catch {
      patchMeal(meal.id, previous);
      setError("Nie udało się zapisać zmian.");
    }
  }

  async function handlePortions(meal: TodayMeal, portions: number) {
    const previous = { kcal: meal.kcal, protein_g: meal.protein_g, fat_g: meal.fat_g, carbs_g: meal.carbs_g };
    patchMeal(meal.id, { portions, ...rescaleMacros(meal, portions) });
    try {
      await setPortionsAction(meal.id, portions);
    } catch {
      patchMeal(meal.id, { portions: meal.portions, ...previous });
      setError("Nie udało się zmienić porcji.");
    }
  }

  /** Food eaten outside the plan: saved, added to the list, with undo. */
  async function logFood(input: Omit<LogOtherInput, "date">) {
    try {
      const logged = await logOtherAction({ date, ...input });
      setMeals((current) => sortDay([...current, logged]));
      if (input.fromFridge && input.mealKey) {
        const key = input.mealKey;
        setFridgeUsed((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
      }
      setToast({ message: `Dodano: ${logged.mealName}`, action: () => void handleRemove(logged) });
    } catch {
      setError("Nie udało się dodać. Spróbuj ponownie.");
    }
  }

  /** A library dish put on the day's list to eat later. */
  async function planFood(option: AddOption) {
    try {
      const result = await planMealAction(date, option.mealKey);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMeals((current) => sortDay([...current, result.meal]));
      setToast({ message: `Dodano do planu: ${option.name}`, action: () => void handleRemove(result.meal) });
    } catch {
      setError("Nie udało się dodać. Spróbuj ponownie.");
    }
  }

  /** A planned meal swapped for any dish from the library. */
  async function replaceMeal(meal: TodayMeal, option: AddOption) {
    const before = { ...meal };
    patchMeal(meal.id, {
      mealKey: option.mealKey,
      mealName: option.name,
      variant: option.variant,
      kcal: Math.round(option.kcal * meal.portions),
      protein_g: option.protein_g * meal.portions,
      fat_g: option.fat_g * meal.portions,
      carbs_g: option.carbs_g * meal.portions,
      prepared: option.ready > 0,
    });
    try {
      await applySwapAction(meal.id, {
        mealKey: option.mealKey,
        mealName: option.name,
        variant: option.variant,
        kcal: option.kcal,
        protein_g: option.protein_g,
        fat_g: option.fat_g,
        carbs_g: option.carbs_g,
      });
    } catch {
      patchMeal(meal.id, before);
      setError("Nie udało się zamienić. Spróbuj ponownie.");
    }
  }

  async function handleAdd(option: AddOption, mode: AddMode) {
    if (addSession.replacing) await replaceMeal(addSession.replacing, option);
    else if (mode === "plan") await planFood(option);
    else {
      await logFood({
        name: option.name,
        source: "saved_meal",
        kcal: option.kcal,
        protein_g: option.protein_g,
        fat_g: option.fat_g,
        carbs_g: option.carbs_g,
        mealKey: option.mealKey,
        variant: option.variant,
        fromFridge: option.ready > 0,
      });
    }
  }

  async function handleLogOther(payload: LogPayload) {
    await logFood(payload);
  }

  async function handleNoCook(option: NoCookOption) {
    await logFood({
      name: option.mealName,
      source: "saved_meal",
      kcal: option.kcal,
      protein_g: option.protein_g,
      fat_g: option.fat_g,
      carbs_g: option.carbs_g,
      mealKey: option.mealKey,
      variant: option.variant,
      fromFridge: option.ready,
    });
  }

  /** Opening a sheet fetches its data; the sheets themselves stay presentational. */
  async function openAdd(mode?: AddMode, replacing: TodayMeal | null = null) {
    setAddSession((current) => ({ id: current.id + 1, mode: mode ?? ADD_MODES[when][0], replacing }));
    setSheet("add");
    if (frequentKeys === null) {
      try {
        setFrequentKeys((await savedMealsAction(dayType)).map((candidate) => candidate.mealKey));
      } catch {
        setFrequentKeys([]);
      }
    }
  }

  async function openSwap(meal: TodayMeal) {
    setSwapFor(meal);
    setSwapOptions(null);
    setSwapOptions(await swapOptionsAction(meal.id, date, dayType));
  }

  async function openRebalance() {
    setSheet("rebalance");
    setRebalance(null);
    setRebalance(await rebalanceAction(date, dayType));
  }

  async function openNoCook() {
    setSheet("nocook");
    setNoCook(null);
    setNoCook(await noCookAction(date, dayType));
  }

  async function loadSavedMeals() {
    setSavedMeals(null);
    setSavedMeals(await savedMealsAction(dayType));
  }

  async function handleAccept(suggestion: Suggestion) {
    await applySuggestionAction(suggestion);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        {isToday ? null : (
          <Link
            href="/kalendarz"
            className="-ml-1 flex h-9 w-fit items-center gap-1 pr-2 font-semibold text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-5" />
            Kalendarz
          </Link>
        )}
        {isToday ? (
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold tracking-tight">Dziś</h1>
              <p className="text-muted-foreground first-letter:uppercase">{dateLabel}</p>
            </div>
            <DayTypeToggle dayType={dayType} onChange={(value) => setDayTypeAction(date, value)} />
          </div>
        ) : (
          <>
            <h1 className="text-2xl leading-tight font-extrabold tracking-tight first-letter:uppercase">{dateLabel}</h1>
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground">{relativeLabel}</p>
              <DayTypeToggle dayType={dayType} onChange={(value) => setDayTypeAction(date, value)} />
            </div>
          </>
        )}
      </header>

      <DayStrip days={strip} selected={date} />

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      {meals.length === 0 ? (
        when === "past" ? (
          <Card className="items-center gap-2 py-8 text-center">
            <UtensilsCrossed className="size-9 text-muted-foreground" />
            <CardHeader className="items-center">
              <CardTitle>Nic nie zapisano tego dnia</CardTitle>
              <CardDescription>Jeśli coś jadłeś, dodaj to przyciskiem Dodaj.</CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <EmptyDay
            dayType={dayType}
            hasTemplate={hasTemplate}
            error={notice}
            forTomorrow={!isToday}
            onUseDefault={async () => {
              const result = await applyDefaultDayAction(date, dayType);
              setNotice(result.ok ? null : (result.message ?? "Nie udało się utworzyć planu."));
            }}
          />
        )
      ) : next ? (
        <NextMealCard
          meal={next}
          onEaten={() => handleEaten(next)}
          onPortions={(portions) => handlePortions(next, portions)}
          onSwap={() => void openSwap(next)}
        />
      ) : isToday && tomorrow ? (
        <DayDone eaten={eaten} target={target} tomorrowDate={tomorrow.date} tomorrowPlanned={tomorrow.hasEntries} />
      ) : null}

      <DaySummary
        target={target}
        eaten={shown}
        kind={isToday ? "left" : when === "past" ? "eaten" : "planned"}
        onAdd={() => void openAdd()}
        onRebalance={when === "past" || meals.length === 0 ? undefined : () => void openRebalance()}
      />

      {meals.length > 0 ? (
        <PlanList meals={meals} nextId={next?.id ?? null} onSelect={(meal) => setSelectedId(meal.id)} />
      ) : null}

      {cooked.length > 0 ? (
        <Card className="flex-row items-start gap-3 p-4">
          <ChefHat className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <p className="font-semibold">Ugotowane tego dnia</p>
            <p className="text-sm text-muted-foreground">{cooked.join(" · ")}</p>
          </div>
        </Card>
      ) : null}

      {notice && meals.length > 0 ? (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {selected ? (
        <MealSheet
          key={selected.id}
          meal={selected}
          canEat={when !== "future"}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => handleSave(selected, patch)}
          onToggleEaten={() => handleToggleEaten(selected)}
          onSwap={() => void openSwap(selected)}
          onRemove={() => handleRemoveAndOffer(selected)}
        />
      ) : null}

      <AddSheet
        key={addSession.id}
        open={sheet === "add"}
        onClose={() => setSheet("none")}
        modes={ADD_MODES[when]}
        startMode={addSession.mode}
        replacing={addSession.replacing ? { name: addSession.replacing.mealName } : null}
        options={options}
        frequentKeys={frequentKeys}
        onAdd={handleAdd}
        onQuickKcal={(kcal) => logFood({ name: "Szybkie dodanie", source: "quick_add", kcal })}
        onManual={() => setSheet("log")}
        onDinnerOut={() => setSheet("dinner")}
        onNoCook={() => void openNoCook()}
      />

      <SwapSheet
        open={swapFor !== null}
        onClose={() => setSwapFor(null)}
        onSearch={() => swapFor && void openAdd("plan", swapFor)}
        mealName={swapFor?.mealName ?? ""}
        options={swapOptions}
        onUse={async (candidate) => {
          if (!swapFor) return;
          patchMeal(swapFor.id, {
            mealKey: candidate.mealKey,
            mealName: candidate.mealName,
            variant: candidate.variant,
            kcal: Math.round(candidate.kcal * swapFor.portions),
            protein_g: candidate.protein_g * swapFor.portions,
            fat_g: candidate.fat_g * swapFor.portions,
            carbs_g: candidate.carbs_g * swapFor.portions,
            prepared: candidate.ready,
          });
          await applySwapAction(swapFor.id, candidate);
        }}
      />

      <LogOtherSheet
        open={sheet === "log"}
        onClose={() => setSheet("none")}
        aiEnabled={aiEnabled}
        savedMeals={savedMeals}
        onOpenSaved={() => void loadSavedMeals()}
        onEstimate={estimateFoodAction}
        onLog={handleLogOther}
      />

      <RebalanceSheet
        open={sheet === "rebalance"}
        onClose={() => setSheet("none")}
        data={rebalance}
        onAccept={handleAccept}
      />

      <NoCookSheet
        open={sheet === "nocook"}
        onClose={() => setSheet("none")}
        data={noCook}
        onUse={handleNoCook}
      />

      <DinnerOutSheet
        open={sheet === "dinner"}
        onClose={() => setSheet("none")}
        onPlan={(reserve, preserveProtein) => dinnerOutAction(date, dayType, reserve, preserveProtein)}
        onAccept={handleAccept}
      />

      {toast ? (
        <UndoToast
          message={toast.message}
          actionLabel={toast.actionLabel}
          onAction={toast.action}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
