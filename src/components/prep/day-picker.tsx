"use client";

import { useState, useTransition } from "react";
import { ChefHat } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DayType, PrepDayView } from "@/lib/meals/prep-view-types";

/** PREP start: how many days, then DT/DNT per day, then build. */
export function DayPicker({
  initialDays,
  onBuild,
}: {
  initialDays: PrepDayView[];
  onBuild: (days: { date: string; day_type: DayType }[]) => Promise<void>;
}) {
  const [count, setCount] = useState(3);
  const [types, setTypes] = useState<Record<string, DayType>>(() =>
    Object.fromEntries(initialDays.map((day) => [day.date, day.dayType])),
  );
  const [pending, startTransition] = useTransition();
  const days = initialDays.slice(0, count);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-bold tracking-widest text-muted-foreground uppercase">Na ile dni?</h2>
        <div role="group" aria-label="Liczba dni" className="grid grid-cols-3 gap-2">
          {[2, 3, 4].map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={option === count}
              onClick={() => setCount(option)}
              className={cn(
                "h-16 rounded-xl border text-2xl font-extrabold transition-colors",
                option === count
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-muted",
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </section>

      <Card className="gap-0 p-0">
        <ul>
          {days.map((day) => {
            const dayType = types[day.date] ?? day.dayType;
            return (
              <li key={day.date} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
                <span className="min-w-0 flex-1 font-semibold first-letter:uppercase">{day.label}</span>
                <div role="group" aria-label={`Typ dnia ${day.label}`} className="flex gap-1 rounded-full bg-muted p-1">
                  {(["DT", "DNT"] as DayType[]).map((option) => (
                    <button
                      key={option}
                      type="button"
                      aria-pressed={dayType === option}
                      onClick={() => setTypes((current) => ({ ...current, [day.date]: option }))}
                      className={cn(
                        "h-9 min-w-14 rounded-full text-sm font-bold transition-colors",
                        dayType === option ? "bg-card shadow-sm" : "text-muted-foreground",
                      )}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Button
        size="lg"
        className="h-16 w-full text-xl"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await onBuild(days.map((day) => ({ date: day.date, day_type: types[day.date] ?? day.dayType })));
          })
        }
      >
        <ChefHat className="size-6" />
        {pending ? "Liczę…" : "ZBUDUJ PREP"}
      </Button>
    </div>
  );
}
