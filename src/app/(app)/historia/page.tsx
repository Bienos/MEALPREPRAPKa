import { ChefHat } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { addDays, longDateLabel, todayIso } from "@/lib/date";
import { listDayPlans, listEatenMealsBetween } from "@/lib/db/day-plans";
import type { DayType } from "@/lib/db/helpers";
import { listPrepBatchesBetween } from "@/lib/db/prep";
import { getSettings, getTargets } from "@/lib/db/settings";
import { buildHistory, type HistoryDay } from "@/lib/meals/history";

export const dynamic = "force-dynamic";

const DAYS_BACK = 30;

function Bar({ value, target }: { value: number; target: number }) {
  const percent = target > 0 ? Math.min(Math.round((value / target) * 100), 100) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
    </div>
  );
}

function DayCard({ day }: { day: HistoryDay }) {
  return (
    <Card className="gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-semibold first-letter:uppercase">{longDateLabel(day.date)}</h2>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
          {day.dayType}
        </span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Kalorie</span>
          <span className="font-semibold">
            {day.eaten.kcal} <span className="text-muted-foreground">/ {day.target.kcal} kcal</span>
          </span>
        </div>
        <Bar value={day.eaten.kcal} target={day.target.kcal} />

        <div className="flex items-baseline justify-between text-sm">
          <span className="text-muted-foreground">Białko</span>
          <span className="font-semibold">
            {day.eaten.protein_g} <span className="text-muted-foreground">/ {day.target.protein_g} g</span>
          </span>
        </div>
        <Bar value={day.eaten.protein_g} target={day.target.protein_g} />
      </div>

      {day.meals.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t pt-3 text-sm">
          {day.meals.map((meal, index) => (
            <li key={`${meal.name}-${index}`} className="flex justify-between gap-3">
              <span className="min-w-0 flex-1 truncate">{meal.name}</span>
              <span className="shrink-0 text-muted-foreground">
                {meal.approximate ? "~" : ""}
                {meal.kcal} kcal
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {day.cooked.length > 0 ? (
        <div className="flex items-start gap-2 border-t pt-3 text-sm text-muted-foreground">
          <ChefHat className="mt-0.5 size-4 shrink-0 text-accent" />
          <p>
            {day.cooked
              .map((cook) => `${cook.name}${cook.variant ? ` ${cook.variant}` : ""} × ${cook.portions}`)
              .join(" · ")}
          </p>
        </div>
      ) : null}
    </Card>
  );
}

export default async function HistoryPage() {
  const settings = await getSettings();
  const today = todayIso(settings.timezone);
  const from = addDays(today, -(DAYS_BACK - 1));

  const [targets, plans, meals, batches] = await Promise.all([
    getTargets(),
    listDayPlans(from, today),
    listEatenMealsBetween(from, today),
    listPrepBatchesBetween(from, today),
  ]);

  const dayTypes = Object.fromEntries(plans.map((plan) => [plan.date, plan.day_type])) as Record<
    string,
    DayType
  >;

  const days = buildHistory({
    meals,
    batches,
    dayTypes,
    targets,
    defaultDayType: settings.default_day_type,
  });

  return (
    <>
      <PageHeader title="Historia" subtitle={`Ostatnie ${DAYS_BACK} dni`} />

      {days.length === 0 ? (
        <Card className="items-center gap-2 py-10 text-center">
          <p className="font-semibold">Jeszcze nic tu nie ma</p>
          <p className="text-sm text-muted-foreground">
            Dni pojawią się tutaj, gdy oznaczysz posiłek jako zjedzony albo skończysz prep.
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {days.map((day) => (
            <DayCard key={day.date} day={day} />
          ))}
        </div>
      )}
    </>
  );
}
