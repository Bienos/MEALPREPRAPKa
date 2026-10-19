"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, ChevronLeft, ChevronRight, PencilLine, ShoppingBasket, Sparkles, Trash2 } from "lucide-react";

import { ShopPrices, type ShopPricing } from "@/components/prep/shop-prices";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sheet } from "@/components/ui/sheet";
import { longDateLabel } from "@/lib/date";
import type { NeededItem } from "@/lib/prices/basket";
import { fitsTarget, readyDayLabel, type ReadyDay } from "@/lib/meals/ready-days";
import { sumMacros, type DayType, type Macros } from "@/lib/meals/today-view-types";
import { counts, weekTarget, type WeekEntry } from "@/lib/meals/week-plan";
import { cn } from "@/lib/utils";
import { applyReadyDayToDaysAction, clearDayAction, fillWeekAction, setWeekDayTypeAction } from "./actions";

const WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

function kcal(value: number): string {
  return Math.round(value).toLocaleString("pl-PL");
}

function macros(total: Macros): string {
  return `${kcal(total.kcal)} kcal · ${Math.round(total.protein_g)} B · ${Math.round(total.fat_g)} T · ${Math.round(total.carbs_g)} W`;
}

/** "1 dzień", "3 dni". */
function daysLabel(count: number): string {
  return count === 1 ? "1 dzień" : `${count} dni`;
}

/**
 * The week in one screen: seven days, each a ready day that hits its DT/DNT
 * target, one tap to fill the empty ones, and below it what the shopping
 * costs and where. Every day is real planned meals, so Today and the
 * calendar show the same thing.
 */
export function WeekPlanner({
  start,
  rangeLabel,
  previousStart,
  nextStart,
  today,
  dates,
  dayTypes: savedDayTypes,
  targets,
  entries,
  proposals,
  toBuy,
  pricing,
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
  proposals: Record<DayType, ReadyDay[]>;
  toBuy: NeededItem[];
  pricing: ShopPricing;
}) {
  // A DT/DNT switch shows at once; the server's answer replaces it when it comes.
  const [typeOverrides, setTypeOverrides] = useState<Record<string, DayType>>({});
  const [synced, setSynced] = useState(savedDayTypes);
  if (synced !== savedDayTypes) {
    setSynced(savedDayTypes);
    setTypeOverrides({});
  }
  const dayTypes = { ...savedDayTypes, ...typeOverrides };

  const [openDate, setOpenDate] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [filling, startFill] = useTransition();

  const dayEntries = (date: string) => entries.filter((entry) => entry.date === date && counts(entry));
  const emptyDays = dates.filter((date) => date >= today && !entries.some((entry) => entry.date === date));
  const weekGoal = weekTarget(
    dates.map((date) => dayTypes[date]),
    targets,
  );
  const weekTotal = sumMacros(entries.filter(counts));
  const daysOnTarget = dates.filter((date) => {
    const planned = dayEntries(date);
    return planned.length > 0 && fitsTarget(sumMacros(planned), targets[dayTypes[date]]);
  }).length;

  /** The days right after this one, up to the end of the week, that a pick can also cover. */
  function followingDays(date: string): { date: string; dayType: DayType }[] {
    const result: { date: string; dayType: DayType }[] = [];
    for (const next of dates.slice(dates.indexOf(date) + 1)) {
      const underWay = entries.some((entry) => entry.date === next && entry.status !== "planned");
      if (next < today || underWay) break;
      result.push({ date: next, dayType: dayTypes[next] });
    }
    return result;
  }

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(null), 4000);
  }

  function fillWeek() {
    startFill(async () => {
      const filled = await fillWeekAction(start);
      flash(filled > 0 ? `Ułożone: ${daysLabel(filled)}. Lista zakupów jest gotowa.` : "Nie udało się ułożyć dni.");
    });
  }

  function switchDayType(date: string, dayType: DayType) {
    setTypeOverrides((current) => ({ ...current, [date]: dayType }));
    void setWeekDayTypeAction(date, dayType);
  }

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

      {emptyDays.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Button size="lg" className="h-16 w-full text-lg" disabled={filling} onClick={fillWeek}>
            <Sparkles className="size-5" />
            {filling
              ? "Układam…"
              : emptyDays.length === 7
                ? "Ułóż cały tydzień"
                : `Ułóż ${emptyDays.length === 1 ? "pusty dzień" : `${emptyDays.length} puste dni`}`}
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            Gotowe dni z Twojego arkusza, każdy w makro. Jedno danie z prepu na 2–3 dni, żeby gotować raz.
          </p>
        </div>
      ) : null}

      {notice ? (
        <p role="status" className="rounded-xl bg-accent/10 px-4 py-3 text-sm font-semibold text-accent">
          {notice}
        </p>
      ) : null}

      <section className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Dni</h2>
          <p className="text-sm font-semibold text-muted-foreground tabular-nums">
            {kcal(weekTotal.kcal)} / {kcal(weekGoal.kcal)} kcal · {daysOnTarget} z 7 w makro
          </p>
        </div>
        <Card className="gap-0 p-0">
          <ul>
            {dates.map((date, index) => {
              const planned = dayEntries(date);
              const total = sumMacros(planned);
              const target = targets[dayTypes[date]];
              const onTarget = planned.length > 0 && fitsTarget(total, target);
              const diff = Math.round(total.kcal - target.kcal);
              return (
                <li key={date} className="border-b last:border-0">
                  <button
                    type="button"
                    onClick={() => setOpenDate(date)}
                    className={cn(
                      "flex min-h-18 w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/60",
                      date < today && "opacity-60",
                    )}
                  >
                    <span className="flex w-11 shrink-0 flex-col items-center">
                      <span className={cn("text-sm font-bold", date === today && "text-primary")}>
                        {WEEKDAYS[index]}
                      </span>
                      <span className="text-xs text-muted-foreground">{Number(date.slice(8))}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[0.65rem] font-extrabold",
                            dayTypes[date] === "DT" ? "bg-primary/15 text-primary" : "bg-accent/15 text-accent",
                          )}
                        >
                          {dayTypes[date]}
                        </span>
                        {planned.length > 0 ? (
                          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                            {kcal(total.kcal)} kcal · {Math.round(total.protein_g)} B
                          </span>
                        ) : null}
                      </span>
                      <span className={cn("mt-0.5 block text-sm", planned.length === 0 && "text-muted-foreground")}>
                        {planned.length > 0
                          ? readyDayLabel(
                              planned.map((entry) => ({ mealKey: entry.mealKey ?? entry.id, name: entry.name })),
                            )
                          : date < today
                            ? "Nic nie zaplanowano"
                            : "Pusty dzień: wybierz gotowy"}
                      </span>
                    </span>
                    {planned.length > 0 ? (
                      onTarget ? (
                        <span
                          aria-label="W makro"
                          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
                        >
                          <Check className="size-4" strokeWidth={3} />
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs font-bold text-muted-foreground tabular-nums">
                          {diff > 0 ? "+" : "−"}
                          {kcal(Math.abs(diff))}
                        </span>
                      )
                    ) : null}
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Zakupy na te dni</h2>
        {toBuy.length > 0 ? (
          <ShopPrices items={toBuy} pricing={pricing} />
        ) : (
          <p className="text-sm text-muted-foreground">Ułóż dni, a policzę, co kupić i gdzie najtaniej.</p>
        )}
        <Button asChild variant="outline" className="w-full">
          <Link href="/prep/zakupy">
            <ShoppingBasket className="size-5" />
            Lista zakupów{toBuy.length > 0 ? ` · ${toBuy.length}` : ""}
          </Link>
        </Button>
      </section>

      <DaySheet
        key={openDate ?? "closed"}
        date={openDate}
        today={today}
        dayType={openDate ? dayTypes[openDate] : "DT"}
        target={openDate ? targets[dayTypes[openDate]] : targets.DT}
        entries={openDate ? entries.filter((entry) => entry.date === openDate) : []}
        following={openDate ? followingDays(openDate) : []}
        proposals={openDate ? proposals[dayTypes[openDate]] : []}
        onDayType={(dayType) => openDate && switchDayType(openDate, dayType)}
        onClose={() => setOpenDate(null)}
        onDone={(message) => {
          setOpenDate(null);
          flash(message);
        }}
      />
    </div>
  );
}

/* One day ------------------------------------------------------------------- */

function DaySheet({
  date,
  today,
  dayType,
  target,
  entries,
  following,
  proposals,
  onDayType,
  onClose,
  onDone,
}: {
  date: string | null;
  today: string;
  dayType: DayType;
  target: Macros;
  entries: WeekEntry[];
  /** The days right after this one that a pick can also cover, in order. */
  following: { date: string; dayType: DayType }[];
  proposals: ReadyDay[];
  onDayType: (dayType: DayType) => void;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [pending, startPending] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  // How many days the pick covers: this one, and that many minus one after it.
  const [span, setSpan] = useState(1);

  const planned = entries.filter(counts);
  const underWay = entries.some((entry) => entry.status !== "planned");
  const past = date !== null && date < today;
  const title = date ? capitalize(longDateLabel(date)) : "";

  function choose(day: ReadyDay) {
    if (!date) return;
    setChosen(day.key);
    setFailed(false);
    startPending(async () => {
      const days = [{ date, dayType }, ...following.slice(0, span - 1)];
      const applied = await applyReadyDayToDaysAction(days, day.key);
      if (applied > 0) {
        const where =
          applied > 1
            ? `${capitalize(longDateLabel(date))} i ${daysLabel(applied - 1)} dalej`
            : capitalize(longDateLabel(date));
        onDone(`${where}: ${readyDayLabel(day.items)}.`);
      } else setFailed(true);
    });
  }

  function clear() {
    if (!date) return;
    startPending(async () => {
      const ok = await clearDayAction(date);
      if (ok) onDone(`${capitalize(longDateLabel(date))} jest pusty.`);
      else setFailed(true);
    });
  }

  return (
    <Sheet open={date !== null} onClose={onClose} title={title}>
      {date ? (
        <div className="flex flex-col gap-4">
          {!past ? (
            <div className="flex rounded-full bg-muted p-1" role="radiogroup" aria-label="Rodzaj dnia">
              {(["DT", "DNT"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={dayType === option}
                  disabled={underWay}
                  onClick={() => dayType !== option && onDayType(option)}
                  className={cn(
                    "h-11 flex-1 rounded-full text-sm font-bold",
                    dayType === option ? "bg-card shadow-sm" : "text-muted-foreground",
                  )}
                >
                  {option === "DT" ? "Trening (DT)" : "Bez treningu (DNT)"}
                </button>
              ))}
            </div>
          ) : null}

          {planned.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-xl border bg-card p-4">
              <p className="text-xs font-bold tracking-wide text-muted-foreground uppercase">Teraz</p>
              <p className="font-semibold">
                {readyDayLabel(planned.map((entry) => ({ mealKey: entry.mealKey ?? entry.id, name: entry.name })))}
              </p>
              <p className="text-sm text-muted-foreground tabular-nums">{macros(sumMacros(planned))}</p>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" className="flex-1">
                  <Link href={`/dzien/${date}`}>
                    <PencilLine className="size-4" />
                    Edytuj
                  </Link>
                </Button>
                {!past && !underWay ? (
                  <Button variant="outline" size="sm" className="flex-1" disabled={pending} onClick={clear}>
                    <Trash2 className="size-4" />
                    Wyczyść
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}

          {past ? (
            <p className="text-sm text-muted-foreground">Ten dzień już minął.</p>
          ) : underWay ? (
            <p className="text-sm text-muted-foreground">
              Część tego dnia jest już zjedzona, więc go nie zamieniam. Zmienisz go w „Edytuj”.
            </p>
          ) : (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
                Gotowe dni {dayType} · cel {kcal(target.kcal)} kcal, {target.protein_g} B
              </h3>
              {following.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <p className="text-sm font-bold">Na ile dni?</p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Na ile dni">
                    {spanOptions(following.length + 1).map((option) => (
                      <button
                        key={option.days}
                        type="button"
                        role="radio"
                        aria-checked={span === option.days}
                        onClick={() => setSpan(option.days)}
                        className={cn(
                          "h-10 rounded-full border px-4 text-sm font-bold",
                          span === option.days ? "border-primary bg-primary/10 text-primary" : "bg-card",
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {span > 3 ? (
                    <p className="text-xs text-muted-foreground">
                      Większość dań trzyma się w lodówce ok. 3 dni. Przy dłuższej serii część porcji trzeba będzie
                      zamrozić.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {failed ? (
                <p className="text-sm font-semibold text-destructive">Nie udało się. Odśwież i spróbuj jeszcze raz.</p>
              ) : null}
              <ul className="flex flex-col gap-2">
                {proposals.map((day) => (
                  <li key={day.key}>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => choose(day)}
                      className={cn(
                        "flex w-full flex-col gap-1.5 rounded-xl border bg-card p-4 text-left hover:border-primary/50",
                        pending && chosen === day.key && "border-primary bg-primary/5",
                      )}
                    >
                      <span className="flex items-start gap-2">
                        <DayLines day={day} />
                        {day.fits ? (
                          <span className="shrink-0 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-bold text-accent">
                            w makro
                          </span>
                        ) : null}
                      </span>
                      <span className="text-sm text-muted-foreground tabular-nums">{macros(day.total)}</span>
                      <span className="text-sm font-bold text-primary">
                        {pending && chosen === day.key
                          ? "Wstawiam…"
                          : `${planned.length > 0 ? "Zamień na ten" : "Wybierz"}${span > 1 ? ` · ${daysLabel(span)}` : ""}`}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      ) : null}
    </Sheet>
  );
}

/** 1, 2, 3 days and "do końca tygodnia"; `max` is how many days are possible from here. */
function spanOptions(max: number): { days: number; label: string }[] {
  const options = [1, 2, 3].filter((days) => days <= max).map((days) => ({ days, label: daysLabel(days) }));
  if (max > 3) options.push({ days: max, label: "do końca tygodnia" });
  return options;
}

/** A ready day as the meals of the day: what is breakfast, what is cooked for two meals, what is a snack. */
function DayLines({ day }: { day: ReadyDay }) {
  const breakfast = day.items.find((item) => item.slot === "Śniadanie");
  const main = day.items.find((item) => item.slot === "Posiłek 2");
  const second = day.items.find((item) => item.slot === "Posiłek 3" || item.slot === "Kolacja");
  const snacks = day.items.filter((item) => item.slot === "Przekąska");
  const lines: [string, string][] = [
    ["Śniadanie", breakfast?.name ?? ""],
    ...(second?.slot === "Posiłek 3"
      ? ([["Obiad ×2", main?.name ?? ""]] as [string, string][])
      : ([
          ["Obiad", main?.name ?? ""],
          ["Kolacja", second?.name ?? ""],
        ] as [string, string][])),
    ...(snacks.length > 0 ? ([["Przekąska", snacks.map((snack) => snack.name).join(", ")]] as [string, string][]) : []),
  ];
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      {lines.map(([label, name]) => (
        <span key={label} className="flex gap-2 text-sm">
          <span className="w-20 shrink-0 text-muted-foreground">{label}</span>
          <span className="min-w-0 font-semibold">{name}</span>
        </span>
      ))}
    </span>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
