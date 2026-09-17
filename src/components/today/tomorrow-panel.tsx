"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DayType } from "@/lib/meals/today-view-types";

export type TomorrowPreview = {
  date: string;
  label: string;
  dayType: DayType;
  mealNames: string[];
  alreadyPlanned: boolean;
};

/** Secondary action: look at tomorrow's default day and accept it in one tap. */
export function TomorrowPanel({
  preview,
  onUse,
}: {
  preview: TomorrowPreview;
  onUse: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(preview.alreadyPlanned);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="gap-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex items-center gap-3 text-left"
      >
        <CalendarDays className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Zaplanuj jutro</span>
          <span className="block text-sm text-muted-foreground">
            {preview.label} · {preview.dayType}
            {done ? " · zaplanowane" : ""}
          </span>
        </span>
        <ChevronDown className={`size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? (
        <div className="flex flex-col gap-3 border-t pt-3">
          {preview.mealNames.length > 0 ? (
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {preview.mealNames.map((name, index) => (
                <li key={`${index}-${name}`} className="truncate">
                  {name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              Brak domyślnego dnia {preview.dayType}.{" "}
              <Link href={`/dzien-domyslny?typ=${preview.dayType}`} className="font-semibold underline-offset-2 hover:underline">
                Ustaw go
              </Link>
              .
            </p>
          )}

          {preview.mealNames.length > 0 ? (
            done ? (
              <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                <Check className="size-4" />
                Jutro zaplanowane
              </p>
            ) : (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await onUse();
                    setDone(true);
                  })
                }
              >
                {pending ? "Planuję…" : `Użyj na jutro (${preview.dayType})`}
              </Button>
            )
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
