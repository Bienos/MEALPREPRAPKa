"use client";

import { useState } from "react";
import { Calculator, HelpCircle, UtensilsCrossed, Wine } from "lucide-react";

import { DayTypeToggle } from "@/components/today/day-type-toggle";
import { DinnerOutSheet } from "@/components/today/dinner-out-sheet";
import { LogOtherSheet, type LogPayload } from "@/components/today/log-other-sheet";
import { NoCookSheet } from "@/components/today/no-cook-sheet";
import { RebalanceSheet } from "@/components/today/rebalance-sheet";
import { SwapSheet } from "@/components/today/swap-sheet";
import { EmptyDay } from "@/components/today/empty-day";
import { MacroRemaining } from "@/components/today/macro-remaining";
import { NextMealCard } from "@/components/today/next-meal-card";
import { PlanList } from "@/components/today/plan-list";
import { TomorrowPanel, type TomorrowPreview } from "@/components/today/tomorrow-panel";
import { UndoToast } from "@/components/today/undo-toast";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  nextPlannedMeal,
  remainingMacros,
  rescaleMacros,
  type DayType,
  type Macros,
  type TodayMeal,
} from "@/lib/meals/today-view-types";
import type { Suggestion } from "@/lib/meals/rebalance";
import type { Candidate, NoCookOption } from "@/lib/meals/recommend";
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
  savedMealsAction,
  setDayTypeAction,
  setPortionsAction,
  swapOptionsAction,
  undoEatenAction,
} from "./actions";

type Toast = { mealId: string; message: string } | null;

export function TodayView({
  date,
  dateLabel,
  dayType,
  target,
  initialMeals,
  hasTemplate,
  tomorrow,
  aiEnabled,
}: {
  date: string;
  dateLabel: string;
  dayType: DayType;
  target: Macros;
  initialMeals: TodayMeal[];
  hasTemplate: boolean;
  tomorrow: TomorrowPreview;
  aiEnabled: boolean;
}) {
  // Local source of truth so ZJEDZONE feels instant; the server write follows.
  const [meals, setMeals] = useState(initialMeals);
  const [toast, setToast] = useState<Toast>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Exception flows live in bottom sheets so the normal one-tap path stays bare.
  const [swapFor, setSwapFor] = useState<TodayMeal | null>(null);
  const [swapOptions, setSwapOptions] = useState<Candidate[] | null>(null);
  const [savedMeals, setSavedMeals] = useState<Candidate[] | null>(null);
  const [rebalance, setRebalance] = useState<Awaited<ReturnType<typeof rebalanceAction>> | null>(null);
  const [noCook, setNoCook] = useState<Awaited<ReturnType<typeof noCookAction>> | null>(null);
  const [sheet, setSheet] = useState<"none" | "log" | "rebalance" | "nocook" | "dinner">("none");

  const next = nextPlannedMeal(meals);
  const remaining = remainingMacros(target, meals);

  function patchMeal(id: string, patch: Partial<TodayMeal>) {
    setMeals((current) => current.map((meal) => (meal.id === id ? { ...meal, ...patch } : meal)));
  }

  async function handleEaten(meal: TodayMeal) {
    patchMeal(meal.id, { status: "eaten", eatenAt: new Date().toISOString() });
    setToast({ mealId: meal.id, message: `Zjedzone: ${meal.mealName}` });
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

  /** Opening a sheet fetches its data; the sheets themselves stay presentational. */
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

  async function handleLogOther(payload: LogPayload) {
    await logOtherAction({ date, ...payload });
    // The day changed, so offer the correction straight away.
    await openRebalance();
  }

  async function handleNoCook(option: NoCookOption) {
    await logOtherAction({
      date,
      name: option.mealName,
      source: "saved_meal",
      kcal: option.kcal,
      protein_g: option.protein_g,
      fat_g: option.fat_g,
      carbs_g: option.carbs_g,
      mealKey: option.mealKey,
      variant: option.variant,
    });
  }

  async function handleAccept(suggestion: Suggestion) {
    await applySuggestionAction(suggestion);
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

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight">Dziś</h1>
          <p className="text-muted-foreground first-letter:uppercase">{dateLabel}</p>
        </div>
        <DayTypeToggle dayType={dayType} onChange={(next) => setDayTypeAction(date, next)} />
      </header>

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

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
            <CardDescription>Plan na dziś jest zamknięty.</CardDescription>
          </CardHeader>
        </Card>
      )}

      {meals.length > 0 ? <PlanList meals={meals} nextId={next?.id ?? null} /> : null}

      <MacroRemaining remaining={remaining} />

      <TomorrowPanel
        preview={tomorrow}
        onUse={async () => {
          await applyDefaultDayAction(tomorrow.date, tomorrow.dayType);
        }}
      />

      <div className="flex flex-col gap-2">
        <Button variant="outline" onClick={() => setSheet("log")}>
          <UtensilsCrossed />
          Zjadłem coś innego
        </Button>
        <Button variant="outline" onClick={() => void openNoCook()}>
          <HelpCircle />
          Nie chce mi się gotować
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => void openRebalance()}>
            <Calculator />
            Przelicz resztę dnia
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => setSheet("dinner")}>
            <Wine />
            Kolacja na mieście
          </Button>
        </div>
      </div>

      {notice && meals.length > 0 ? (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

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

      {toast ? (
        <UndoToast
          message={toast.message}
          onUndo={() => handleUndo(toast.mealId)}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
