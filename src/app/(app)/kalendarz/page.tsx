import Link from "next/link";
import { ChefHat, ChevronLeft, ChevronRight } from "lucide-react";

import { MealImage } from "@/components/meals/meal-image";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { longDateLabel, todayIso } from "@/lib/date";
import { listDayPlans, listPlannedMealsBetween } from "@/lib/db/day-plans";
import type { DayType } from "@/lib/db/helpers";
import { listPrepBatchesBetween } from "@/lib/db/prep";
import { getSettings, getTargets } from "@/lib/db/settings";
import { buildMonth, gridBounds, shiftMonth, type CalendarCell, type Tone } from "@/lib/meals/calendar";

export const dynamic = "force-dynamic";

const WEEKDAYS = ["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"];

const TONE_BAR: Record<Tone, string> = { ok: "bg-accent", low: "bg-primary/60", high: "bg-destructive" };

function monthTitle(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, m - 1, 1)),
  );
}

/** "2,4k": a day's calories in the little room a cell has. */
function shortKcal(kcal: number): string {
  return kcal > 0 ? `${(kcal / 1000).toFixed(1).replace(".", ",")}k` : "";
}

function Cell({ cell }: { cell: CalendarCell }) {
  const bar = cell.tone ? TONE_BAR[cell.tone] : cell.isFuture ? "bg-primary/35" : "bg-primary";
  return (
    <Link
      href={cell.isToday ? "/" : `/dzien/${cell.date}`}
      aria-label={`${cell.day}${cell.kcal ? `, ${cell.kcal} kcal` : ""}`}
      aria-current={cell.isToday ? "date" : undefined}
      className={cn(
        "relative flex h-16 min-w-0 flex-col items-center justify-between rounded-xl border bg-card p-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.97]",
        !cell.inMonth && "opacity-45",
        cell.isToday && "border-2 border-primary",
        cell.isFuture && (cell.hasEntries ? "border-dashed" : "border-transparent bg-card/50"),
      )}
    >
      <span className={cn("text-sm leading-none font-bold", cell.isToday && "text-primary")}>{cell.day}</span>
      {cell.cooked ? <ChefHat className="absolute top-1 right-1 size-3 text-accent" aria-label="Prep" /> : null}
      <span className="text-[0.65rem] leading-none font-semibold text-muted-foreground tabular-nums">
        {shortKcal(cell.kcal)}
      </span>
      <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        {cell.kcal > 0 ? (
          <span className={cn("block h-full rounded-full", bar)} style={{ width: `${Math.min(cell.fill, 1) * 100}%` }} />
        ) : null}
      </span>
    </Link>
  );
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const settings = await getSettings();
  const today = todayIso(settings.timezone);
  const { m } = await searchParams;
  const month = m && /^\d{4}-(0[1-9]|1[0-2])$/.test(m) ? m : today.slice(0, 7);
  const { from, to } = gridBounds(month);

  const [targets, plans, entries, batches] = await Promise.all([
    getTargets(),
    listDayPlans(from, to),
    listPlannedMealsBetween(from, to),
    listPrepBatchesBetween(from, to),
  ]);

  const { weeks, stats } = buildMonth({
    month,
    today,
    entries,
    dayTypes: Object.fromEntries(plans.map((plan) => [plan.date, plan.day_type])) as Record<string, DayType>,
    cookedOn: new Set(batches.map((batch) => batch.cooked_on)),
    targets,
    defaultDayType: settings.default_day_type,
  });
  const thisMonth = today.slice(0, 7);

  // The latest finished days in view, with what was eaten, so the page says something before any tap.
  const namesByDate = new Map<string, { name: string; slot: string }[]>();
  for (const entry of entries) {
    if (entry.status !== "eaten" && entry.status !== "adhoc") continue;
    namesByDate.set(entry.plan_date, [...(namesByDate.get(entry.plan_date) ?? []), { name: entry.meal_name, slot: entry.slot }]);
  }
  const recent = weeks
    .flat()
    .filter((cell) => !cell.isFuture && !cell.isToday && cell.kcal > 0)
    .reverse()
    .slice(0, 7);

  return (
    <>
      <header className="flex items-center gap-2">
        <Link
          href={`/kalendarz?m=${shiftMonth(month, -1)}`}
          aria-label="Poprzedni miesiąc"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border bg-card"
        >
          <ChevronLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight first-letter:uppercase">{monthTitle(month)}</h1>
          {month !== thisMonth ? (
            <Link href="/kalendarz" className="text-sm font-semibold text-primary">
              Wróć do dziś
            </Link>
          ) : null}
        </div>
        <Link
          href={`/kalendarz?m=${shiftMonth(month, 1)}`}
          aria-label="Następny miesiąc"
          className="flex size-11 shrink-0 items-center justify-center rounded-full border bg-card"
        >
          <ChevronRight className="size-5" />
        </Link>
      </header>

      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-7 gap-1.5 text-center text-xs font-bold text-muted-foreground">
          {WEEKDAYS.map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].date} className="grid grid-cols-7 gap-1.5">
            {week.map((cell) => (
              <Cell key={cell.date} cell={cell} />
            ))}
          </div>
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legenda">
        <li className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-accent" />w normie</li>
        <li className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-primary/60" />mało</li>
        <li className="flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-destructive" />dużo</li>
        <li className="flex items-center gap-1.5"><span className="h-3 w-4 rounded border border-dashed" />plan</li>
        <li className="flex items-center gap-1.5"><ChefHat className="size-3 text-accent" />prep</li>
      </ul>

      {stats.loggedDays > 0 ? (
        <Card className="gap-3">
          <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Podsumowanie miesiąca</h2>
          <dl className="grid grid-cols-3 gap-2 text-center">
            {[
              ["Dni zapisane", String(stats.loggedDays)],
              ["Średnio", `${stats.avgKcal.toLocaleString("pl-PL")} kcal`],
              ["Białko", `${stats.avgProtein} g`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg bg-muted/60 px-1 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="text-base font-extrabold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm text-muted-foreground">
            {stats.onTargetDays} z {stats.loggedDays} dni w granicach 10% celu.
          </p>
        </Card>
      ) : null}

      {recent.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">Ostatnie dni</h2>
          <ul className="flex flex-col gap-2">
            {recent.map((cell) => {
              const meals = namesByDate.get(cell.date) ?? [];
              return (
                <li key={cell.date}>
                  <Link
                    href={`/dzien/${cell.date}`}
                    className="flex items-center gap-3 rounded-2xl border bg-card p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.99]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold first-letter:uppercase">{longDateLabel(cell.date)}</p>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {cell.kcal.toLocaleString("pl-PL")} kcal
                        {cell.dayType ? ` · ${cell.dayType}` : ""}
                      </p>
                      <div className="mt-2 flex -space-x-2">
                        {meals.slice(0, 5).map((meal, index) => (
                          <MealImage
                            key={`${meal.name}-${index}`}
                            name={meal.name}
                            category={meal.slot}
                            className="size-8 rounded-full ring-2 ring-card"
                          />
                        ))}
                      </div>
                    </div>
                    {cell.tone ? <span className={cn("h-10 w-1.5 shrink-0 rounded-full", TONE_BAR[cell.tone])} /> : null}
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </>
  );
}
