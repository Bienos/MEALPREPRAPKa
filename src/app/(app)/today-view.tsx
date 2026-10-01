"use client";

import { useState } from "react";
import { Plus, UtensilsCrossed } from "lucide-react";

import { AddSheet } from "@/components/today/add-sheet";
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
import { TomorrowPanel, type TomorrowPreview } from "@/components/today/tomorrow-panel";
import { UndoToast } from "@/components/today/undo-toast";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { Suggestion } from "@/lib/meals/rebalance";
import type { Candidate, NoCookOption } from "@/lib/meals/recommend";
import {
  isEaten,
  nextPlannedMeal,
  rescaleMacros,
  sumMacros,
  type AddOption,
  type DayType,
  type Macros,
  type TodayMeal,
} from "@/lib/meals/today-view-types";
import {
  applyDefaultDayAction,
  applySuggestionAction,
  applySwapAction,
  dinnerOutAction,
  estimateFoodAction,
  logOtherAction,
  markEatenAction,
  noCookAction,
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

type Toast = { message: string; undo: () => void } | null;
type SheetName = "none" | "add" | "log" | "rebalance" | "nocook" | "dinner";

export function TodayView({
  date,
  dateLabel,
  dayType,
  target,
  initialMeals,
  addOptions,
  hasTemplate,
  tomorrow,
  aiEnabled,
}: {
  date: string;
  dateLabel: string;
  dayType: DayType;
  target: Macros;
  initialMeals: TodayMeal[];
  addOptions: AddOption[];
  hasTemplate: boolean;
  tomorrow: TomorrowPreview;
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
  const [frequentKeys, setFrequentKeys] = useState<string[] | null>(null);
  const [savedMeals, setSavedMeals] = useState<Candidate[] | null>(null);
  const [rebalance, setRebalance] = useState<Awaited<ReturnType<typeof rebalanceAction>> | null>(null);
  const [noCook, setNoCook] = useState<Awaited<ReturnType<typeof noCookAction>> | null>(null);
  // Fridge portions taken by "Dodaj" since the page loaded.
  const [fridgeUsed, setFridgeUsed] = useState<Record<string, number>>({});

  const next = nextPlannedMeal(meals);
  const eaten = sumMacros(meals.filter(isEaten));
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
    setToast({ message: `Zjedzone: ${meal.mealName}`, undo: () => void handleUndo(meal.id) });
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
      setMeals((current) => [...current, meal].sort((a, b) => a.position - b.position));
      setError("Nie udało się usunąć. Spróbuj ponownie.");
    }
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

  /** Every way of logging extra food ends here: save, add to the list, offer undo. */
  async function logFood(input: Omit<LogOtherInput, "date">) {
    try {
      const logged = await logOtherAction({ date, ...input });
      setMeals((current) => [...current, logged]);
      if (input.fromFridge && input.mealKey) {
        const key = input.mealKey;
        setFridgeUsed((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
      }
      setToast({ message: `Dodano: ${logged.mealName}`, undo: () => void handleRemove(logged) });
    } catch {
      setError("Nie udało się dodać. Spróbuj ponownie.");
    }
  }

  async function handleAdd(option: AddOption) {
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
  async function openAdd() {
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
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight">Dziś</h1>
          <p className="text-muted-foreground first-letter:uppercase">{dateLabel}</p>
        </div>
        <DayTypeToggle dayType={dayType} onChange={(value) => setDayTypeAction(date, value)} />
      </header>

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      <DaySummary target={target} eaten={eaten} onRebalance={() => void openRebalance()} />

      {meals.length === 0 ? (
        <EmptyDay
          dayType={dayType}
          hasTemplate={hasTemplate}
          error={notice}
          onUseDefault={async () => {
            const result = await applyDefaultDayAction(date, dayType);
            setNotice(result.ok ? null : (result.message ?? "Nie udało się utworzyć planu."));
          }}
        />
      ) : next ? (
        <NextMealCard
          meal={next}
          onEaten={() => handleEaten(next)}
          onPortions={(portions) => handlePortions(next, portions)}
          onSwap={() => void openSwap(next)}
        />
      ) : (
        <Card className="items-center gap-2 border-accent/30 bg-accent/5 py-8 text-center">
          <UtensilsCrossed className="size-9 text-accent" />
          <CardHeader className="items-center">
            <CardTitle>Wszystko zjedzone</CardTitle>
            <CardDescription>Plan na dziś jest zamknięty. Coś jeszcze? Dodaj niżej.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {meals.length > 0 ? (
        <PlanList meals={meals} nextId={next?.id ?? null} onSelect={(meal) => setSelectedId(meal.id)} />
      ) : null}

      <TomorrowPanel
        preview={tomorrow}
        onUse={async () => {
          await applyDefaultDayAction(tomorrow.date, tomorrow.dayType);
        }}
      />

      {/* Room for the floating button, so it never covers the last card. */}
      <div aria-hidden className="h-10" />

      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom)+0.75rem)] z-10 mx-auto flex w-full max-w-md justify-end px-4">
        <button
          type="button"
          onClick={() => void openAdd()}
          className="pointer-events-auto flex h-14 items-center gap-2 rounded-full bg-foreground px-6 text-base font-extrabold text-background shadow-[0_12px_28px_-10px_rgba(42,38,34,0.7)] outline-none active:scale-[0.97] focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus className="size-6" strokeWidth={3} />
          Dodaj
        </button>
      </div>

      {notice && meals.length > 0 ? (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

      {selected ? (
        <MealSheet
          key={selected.id}
          meal={selected}
          onClose={() => setSelectedId(null)}
          onSave={(patch) => handleSave(selected, patch)}
          onToggleEaten={() => handleToggleEaten(selected)}
          onSwap={() => void openSwap(selected)}
          onRemove={() => handleRemove(selected)}
        />
      ) : null}

      <AddSheet
        open={sheet === "add"}
        onClose={() => setSheet("none")}
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

      {toast ? <UndoToast message={toast.message} onUndo={toast.undo} onDismiss={() => setToast(null)} /> : null}
    </div>
  );
}
