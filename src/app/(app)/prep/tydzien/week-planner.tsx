"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Plus, ShoppingBasket, Sparkles } from "lucide-react";

import { MealImage } from "@/components/meals/meal-image";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { MealKind } from "@/lib/meals/slots";
import type { DayType, Macros } from "@/lib/meals/today-view-types";
import {
  WEEK_KINDS,
  WEEK_KIND_LABELS,
  counts,
  dayForNewPortion,
  entryToRemove,
  topUpPicks,
  totalOf,
  weekDishes,
  weekStatus,
  weekTarget,
  type Snack,
  type WeekDish,
  type WeekEntry,
  type WeekOption,
} from "@/lib/meals/week-plan";
import { planMealAction, removeMealAction, setDayTypeAction } from "../../actions";
import { fillWeekAction, topUpWeekAction, weekShoppingListAction } from "./actions";
import { Stepper } from "./stepper";
import { WeekAddSheet } from "./week-add-sheet";

const WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

const ADD_LABELS: Record<MealKind, string> = {
  sniadanie: "Dodaj śniadanie",
  obiad: "Dodaj obiad",
  kolacja: "Dodaj kolację",
  przekaska: "Dodaj przekąskę",
  inne: "Dodaj inne",
};

/** Above this share of the target missing, the week needs meals, not snacks. */
const SNACK_GAP_LIMIT = 0.15;

function kcal(value: number): string {
  return Math.round(value).toLocaleString("pl-PL");
}

/** "1 przekąskę", "3 przekąski", "5 przekąsek". */
function snacksLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (count === 1) return "1 przekąskę";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} przekąski`;
  return `${count} przekąsek`;
}

/** "2,4k" for the little room a day has. */
function shortKcal(value: number): string {
  return value > 0 ? `${(value / 1000).toFixed(1).replace(".", ",")}k` : "–";
}

/**
 * The week: pick what you will eat over seven days, watch it add up against
 * the DT/DNT targets, then make one shopping list. Every pick lands on a day
 * straight away, so Today shows it and ZJEDZONE works as usual.
 */
export function WeekPlanner({
  start,
  rangeLabel,
  previousStart,
  nextStart,
  today,
  dates,
  dayTypes: initialDayTypes,
  targets,
  entries: initialEntries,
  options,
  hasTemplate,
}: {
  start: string;
  rangeLabel: string;
  previousStart: string;
  nextStart: string;
  today: string;
  dates: string[];
  dayTypes: Record<string, DayType>;
  targets: Record<DayType, Macros>;
  entries: WeekEntry[];
  options: WeekOption[];
  hasTemplate: Record<DayType, boolean>;
}) {
  // Local source of truth so every tap is instant; the server write follows.
  const [entries, setEntries] = useState(initialEntries);
  const [dayTypes, setDayTypes] = useState(initialDayTypes);
  // A refresh from the server (after a day type switch or a top-up) replaces local state.
  const [synced, setSynced] = useState({ entries: initialEntries, dayTypes: initialDayTypes });
  if (synced.entries !== initialEntries || synced.dayTypes !== initialDayTypes) {
    setSynced({ entries: initialEntries, dayTypes: initialDayTypes });
    setEntries(initialEntries);
    setDayTypes(initialDayTypes);
  }

  const [sheetKind, setSheetKind] = useState<MealKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();
  // Adds still on their way to the server: temporary id → the real one.
  const adding = useRef(new Map<string, Promise<string | null>>());
  const inFlight = useRef(new Set<Promise<unknown>>());
  const nextTempId = useRef(0);

  const optionsByKey = new Map(options.map((option) => [option.mealKey, option]));
  const target = weekTarget(dates.map((date) => dayTypes[date]), targets);
  const total = totalOf(entries);
  const status = weekStatus(total, target);
  const gap = target.kcal - total.kcal;
  const dishes = weekDishes(entries);
  const openDates = dates.filter((date) => date >= today);
  const canPlan = openDates.length > 0;
  const toEat = entries.filter((entry) => entry.status === "planned" && entry.date >= today).length;
  // The type most of the week has, for the calories shown next to each dish in the picker.
  const mainType: DayType =
    dates.filter((date) => dayTypes[date] === "DT").length >= dates.length / 2 ? "DT" : "DNT";

  // What [ DOPEŁNIJ ] would add, worked out here so the button can say it.
  const snacksFor = (dayType: DayType): Snack[] =>
    options
      .filter((option) => option.kind === "przekaska")
      .map((option) => ({ mealKey: option.mealKey, name: option.name, ...option.forDay[dayType] }));
  const topUp =
    status === "under" && gap <= target.kcal * SNACK_GAP_LIMIT
      ? topUpPicks({ dates, dayTypes, entries, targets, snacks: { DT: snacksFor("DT"), DNT: snacksFor("DNT") }, today })
      : [];

  const emptyDays = openDates.filter(
    (date) => hasTemplate[dayTypes[date]] && !entries.some((entry) => entry.date === date && counts(entry)),
  );

  function track<T>(promise: Promise<T>): Promise<T> {
    inFlight.current.add(promise);
    void promise.finally(() => inFlight.current.delete(promise));
    return promise;
  }

  /** Waits for every pick still being saved, so a refresh does not lose one. */
  async function settle() {
    await Promise.allSettled([...inFlight.current]);
  }

  function add(option: WeekOption) {
    const date = dayForNewPortion(dates, entries, option.kind, today);
    if (!date) {
      setError("Ten tydzień już minął.");
      return;
    }
    setError(null);
    const version = option.forDay[dayTypes[date]];
    const tempId = `new-${(nextTempId.current += 1)}`;
    setEntries((current) => [
      ...current,
      {
        id: tempId,
        date,
        mealKey: option.mealKey,
        name: option.name,
        variant: version.variant,
        status: "planned",
        kind: option.kind,
        portions: 1,
        kcal: version.kcal,
        protein_g: version.protein_g,
        fat_g: version.fat_g,
        carbs_g: version.carbs_g,
      },
    ]);

    const saved = track(
      planMealAction(date, option.mealKey)
        .then((result) => {
          if (!result.ok) throw new Error(result.message);
          const meal = result.meal;
          setEntries((current) =>
            current.map((entry) =>
              entry.id === tempId
                ? { ...entry, id: meal.id, variant: meal.variant, kcal: meal.kcal, protein_g: meal.protein_g, fat_g: meal.fat_g, carbs_g: meal.carbs_g }
                : entry,
            ),
          );
          return meal.id;
        })
        .catch((reason: unknown) => {
          setEntries((current) => current.filter((entry) => entry.id !== tempId));
          setError(reason instanceof Error && reason.message ? reason.message : "Nie udało się zapisać. Spróbuj jeszcze raz.");
          return null;
        }),
    );
    adding.current.set(tempId, saved);
  }

  function remove(mealKey: string) {
    const entry = entryToRemove(entries, mealKey, today);
    if (!entry) return;
    setError(null);
    setEntries((current) => current.filter((candidate) => candidate.id !== entry.id));
    const pendingAdd = adding.current.get(entry.id);
    track(
      (pendingAdd ? pendingAdd.then((id) => (id ? removeMealAction(id) : undefined)) : removeMealAction(entry.id)).catch(
        () => {
          setEntries((current) => [...current, entry]);
          setError("Nie udało się usunąć. Spróbuj jeszcze raz.");
        },
      ),
    );
  }

  function toggleDay(date: string) {
    if (date < today) return;
    const next: DayType = dayTypes[date] === "DT" ? "DNT" : "DT";
    setDayTypes((current) => ({ ...current, [date]: next }));
    // Meals still to eat follow the day into its other version, as on Today.
    setEntries((current) =>
      current.map((entry) => {
        const option = entry.mealKey ? optionsByKey.get(entry.mealKey) : undefined;
        if (entry.date !== date || entry.status !== "planned" || !option) return entry;
        const version = option.forDay[next];
        return {
          ...entry,
          variant: version.variant,
          kcal: Math.round(version.kcal * entry.portions),
          protein_g: version.protein_g * entry.portions,
          fat_g: version.fat_g * entry.portions,
          carbs_g: version.carbs_g * entry.portions,
        };
      }),
    );
    startTransition(async () => {
      await settle();
      await setDayTypeAction(date, next);
    });
  }

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 3500);
  }

  function runTopUp() {
    startTransition(async () => {
      await settle();
      const added = await topUpWeekAction(start);
      flash(added > 0 ? `Dodałem ${snacksLabel(added)}.` : "Nic nie trzeba dodawać.");
    });
  }

  function fillEmptyDays() {
    startTransition(async () => {
      await settle();
      const filled = await fillWeekAction(start);
      flash(filled > 0 ? `Wstawiłem domyślny dzień na ${filled} ${filled === 1 ? "dzień" : "dni"}.` : "Nie było pustych dni.");
    });
  }

  function makeList() {
    startTransition(async () => {
      await settle();
      await weekShoppingListAction();
    });
  }

  const statusLine =
    status === "empty"
      ? "Wybierz, co chcesz jeść w tym tygodniu."
      : status === "ok"
        ? "Pasuje do Twoich makro."
        : status === "under"
          ? `Brakuje ${kcal(gap)} kcal${gap > target.kcal * SNACK_GAP_LIMIT ? ". Dodaj posiłki." : "."}`
          : `${kcal(-gap)} kcal ponad cel.`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-extrabold tracking-tight">Tydzień</h1>
          <p className="text-muted-foreground">{rangeLabel}</p>
        </div>
        <Link
          href={`/prep/tydzien?od=${previousStart}`}
          aria-label="Poprzedni tydzień"
          className="flex size-11 items-center justify-center rounded-full border bg-card hover:bg-muted"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <Link
          href={`/prep/tydzien?od=${nextStart}`}
          aria-label="Następny tydzień"
          className="flex size-11 items-center justify-center rounded-full border bg-card hover:bg-muted"
        >
          <ChevronRight className="size-5" />
        </Link>
      </header>

      <section className="flex flex-col gap-2">
        <div role="group" aria-label="Dni treningowe" className="grid grid-cols-7 gap-1">
          {dates.map((date, index) => {
            const past = date < today;
            const dayType = dayTypes[date];
            const dayKcal = totalOf(entries.filter((entry) => entry.date === date)).kcal;
            const share = dayKcal / targets[dayType].kcal;
            return (
              <button
                key={date}
                type="button"
                disabled={past || busy}
                onClick={() => toggleDay(date)}
                aria-label={`${WEEKDAYS[index]} ${Number(date.slice(8))}: ${dayType}, ${kcal(dayKcal)} kcal. Dotknij, żeby zmienić.`}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-2xl border bg-card py-2 transition-colors active:scale-[0.96] disabled:active:scale-100",
                  past && "opacity-50",
                  date === today && "border-2 border-primary",
                )}
              >
                <span className="text-[0.65rem] font-bold text-muted-foreground">{WEEKDAYS[index]}</span>
                <span className="text-base leading-none font-extrabold tabular-nums">{Number(date.slice(8))}</span>
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold",
                    dayType === "DT" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                  )}
                >
                  {dayType}
                </span>
                <span
                  className={cn(
                    "text-[0.65rem] font-semibold tabular-nums",
                    dayKcal === 0
                      ? "text-muted-foreground"
                      : share < 0.9
                        ? "text-primary"
                        : share > 1.1
                          ? "text-destructive"
                          : "text-accent",
                  )}
                >
                  {shortKcal(dayKcal)}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Dotknij dnia, żeby przełączyć trening (DT) i dzień bez treningu (DNT).</p>
      </section>

      <Card className={cn("gap-3 p-4", status === "ok" && "border-accent/40 bg-accent/5")}>
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Cały tydzień</span>
          <span className="ml-auto text-3xl font-extrabold tabular-nums">{kcal(total.kcal)}</span>
          <span className="text-sm font-semibold text-muted-foreground tabular-nums">/ {kcal(target.kcal)} kcal</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-500",
              status === "ok" ? "bg-accent" : status === "over" ? "bg-destructive" : "bg-primary",
            )}
            style={{ width: `${Math.min((total.kcal / target.kcal) * 100, 100)}%` }}
          />
        </div>
        <p
          className={cn(
            "flex items-center gap-1.5 font-semibold",
            status === "ok" ? "text-accent" : status === "over" ? "text-destructive" : "text-foreground",
          )}
        >
          {status === "ok" ? <Check className="size-5" strokeWidth={3} /> : null}
          {statusLine}
        </p>
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ["Białko", total.protein_g, target.protein_g, "bg-accent"],
              ["Węgle", total.carbs_g, target.carbs_g, "bg-primary"],
              ["Tłuszcz", total.fat_g, target.fat_g, "bg-primary/60"],
            ] as const
          ).map(([label, value, goal, color]) => (
            <div key={label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-1 text-xs">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-bold tabular-nums">
                  {kcal(value)}
                  <span className="font-normal text-muted-foreground">/{kcal(goal)}</span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className={cn("h-full rounded-full", color)} style={{ width: `${Math.min((value / goal) * 100, 100)}%` }} />
              </div>
            </div>
          ))}
        </div>

        {emptyDays.length > 0 || topUp.length > 0 ? (
          <div className="flex flex-col gap-2 pt-1">
            {emptyDays.length > 0 ? (
              <Button variant="outline" disabled={busy} onClick={fillEmptyDays}>
                <CalendarPlus className="size-5" />
                Wstaw domyślny dzień na puste ({emptyDays.length})
              </Button>
            ) : null}
            {topUp.length > 0 ? (
              <Button variant="outline" disabled={busy} onClick={runTopUp}>
                <Sparkles className="size-5" />
                Dopełnij: dodaj {snacksLabel(topUp.length)}
              </Button>
            ) : null}
          </div>
        ) : null}
        {notice ? <p className="text-sm font-semibold text-accent">{notice}</p> : null}
      </Card>

      {error ? (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}

      {WEEK_KINDS.map((kind) => {
        const picked = dishes.filter((dish) => dish.kind === kind);
        // "Inne" is the emergency food; it only shows up once something from it is planned.
        if (kind === "inne" && picked.length === 0) return null;
        const portions = picked.reduce((sum, dish) => sum + dish.count, 0);
        return (
          <section key={kind} className="flex flex-col gap-2">
            <h2 className="flex items-baseline justify-between text-xs font-bold tracking-widest text-muted-foreground uppercase">
              {WEEK_KIND_LABELS[kind]}
              {portions > 0 ? <span className="tabular-nums">{portions}×</span> : null}
            </h2>
            {picked.length > 0 ? (
              <Card className="gap-0 p-0">
                <ul>
                  {picked.map((dish) => (
                    <DishRow
                      key={dish.mealKey}
                      dish={dish}
                      perPortion={
                        totalOf(entries.filter((entry) => entry.mealKey === dish.mealKey)).kcal / Math.max(dish.count, 1)
                      }
                      category={optionsByKey.get(dish.mealKey)?.category}
                      canAdd={canPlan && optionsByKey.has(dish.mealKey)}
                      canRemove={entryToRemove(entries, dish.mealKey, today) !== null}
                      onAdd={() => {
                        const option = optionsByKey.get(dish.mealKey);
                        if (option) add(option);
                      }}
                      onRemove={() => remove(dish.mealKey)}
                    />
                  ))}
                </ul>
              </Card>
            ) : null}
            {canPlan ? (
              <button
                type="button"
                onClick={() => setSheetKind(kind)}
                className="flex h-12 items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 font-semibold text-primary hover:bg-primary/5"
              >
                <Plus className="size-5" />
                {ADD_LABELS[kind]}
              </button>
            ) : null}
          </section>
        );
      })}

      <div className="flex flex-col gap-2">
        <Button size="lg" className="h-16 w-full text-xl" disabled={busy || toEat === 0} onClick={makeList}>
          <ShoppingBasket className="size-6" />
          {busy ? "Chwila…" : "LISTA ZAKUPÓW"}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Lista ze wszystkiego, co zaplanowane od dziś. Porcje z lodówki i to, co zawsze masz w domu, pomijam.
        </p>
      </div>

      <WeekAddSheet
        open={sheetKind !== null}
        onClose={() => setSheetKind(null)}
        title={sheetKind ? WEEK_KIND_LABELS[sheetKind] : ""}
        options={sheetKind ? options.filter((option) => option.kind === sheetKind) : []}
        counts={Object.fromEntries(dishes.map((dish) => [dish.mealKey, dish.count]))}
        removable={(mealKey) => entryToRemove(entries, mealKey, today) !== null}
        dayType={mainType}
        total={total.kcal}
        target={target.kcal}
        onAdd={add}
        onRemove={remove}
      />
    </div>
  );
}

function DishRow({
  dish,
  perPortion,
  category,
  canAdd,
  canRemove,
  onAdd,
  onRemove,
}: {
  dish: WeekDish;
  perPortion: number;
  category: string | undefined;
  canAdd: boolean;
  canRemove: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-3 border-b px-3 py-2.5 last:border-0">
      <MealImage name={dish.name} category={category} className="size-12 rounded-xl" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{dish.name}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {kcal(perPortion)} kcal / porcja
          {dish.eaten > 0 ? ` · ${dish.eaten} zjedzone` : ""}
        </p>
      </div>
      <Stepper count={dish.count} canAdd={canAdd} canRemove={canRemove} onAdd={onAdd} onRemove={onRemove} label={dish.name} />
    </li>
  );
}
