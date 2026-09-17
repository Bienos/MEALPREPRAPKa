"use client";

import Link from "next/link";
import { useState } from "react";
import { Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { DayType } from "@/lib/meals/today-view-types";
import { saveDefaultDayAction } from "./actions";

export type MealOption = { value: string; label: string };

/**
 * One <select> per slot. Deliberately plain: this is setup done once, not the
 * daily loop, so a native picker beats a custom modal.
 */
export function DefaultDayForm({
  dayType,
  slots,
  options,
  selected,
}: {
  dayType: DayType;
  slots: readonly string[];
  options: MealOption[];
  selected: (string | null)[];
}) {
  const [values, setValues] = useState(() => slots.map((_, index) => selected[index] ?? ""));
  const other: DayType = dayType === "DT" ? "DNT" : "DT";

  return (
    <form action={saveDefaultDayAction.bind(null, dayType)} className="flex flex-col gap-5">
      <div role="group" aria-label="Typ dnia" className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
        {([dayType, other] as DayType[])
          .slice()
          .sort()
          .reverse()
          .map((type) => (
            <Link
              key={type}
              href={`/dzien-domyslny?typ=${type}`}
              aria-current={type === dayType ? "page" : undefined}
              className={cn(
                "flex h-10 items-center justify-center rounded-full text-sm font-bold transition-colors",
                type === dayType ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {type}
            </Link>
          ))}
      </div>

      <Card className="gap-4">
        {slots.map((slot, index) => (
          <label key={slot} className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">{slot}</span>
            <select
              name={`slot-${index}`}
              value={values[index]}
              onChange={(event) =>
                setValues((current) => current.map((value, i) => (i === index ? event.target.value : value)))
              }
              className="h-12 w-full rounded-lg border border-input bg-card px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            >
              <option value="">— brak —</option>
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
      </Card>

      <Button type="submit" size="lg">
        <Save />
        Zapisz domyślny {dayType}
      </Button>
    </form>
  );
}
