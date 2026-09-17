"use client";

import { useState } from "react";
import { HelpCircle, UtensilsCrossed } from "lucide-react";

import { DayTypeToggle } from "@/components/today/day-type-toggle";
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
import {
  markEatenAction,
  setDayTypeAction,
  setPortionsAction,
  undoEatenAction,
  applyDefaultDayAction,
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
}: {
  date: string;
  dateLabel: string;
  dayType: DayType;
  target: Macros;
  initialMeals: TodayMeal[];
  hasTemplate: boolean;
  tomorrow: TomorrowPreview;
}) {
  // Local source of truth so ZJEDZONE feels instant; the server write follows.
  const [meals, setMeals] = useState(initialMeals);
  const [toast, setToast] = useState<Toast>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
          onSwap={() => setNotice("Zamiana posiłków będzie dostępna wkrótce.")}
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
        <Button variant="outline" onClick={() => setNotice("Ręczne wpisywanie jedzenia będzie dostępne wkrótce.")}>
          <UtensilsCrossed />
          Zjadłem coś innego
        </Button>
        <Button variant="outline" onClick={() => setNotice("Tryb „bez gotowania” będzie dostępny wkrótce.")}>
          <HelpCircle />
          Nie chce mi się gotować
        </Button>
      </div>

      {notice && meals.length > 0 ? (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}

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
