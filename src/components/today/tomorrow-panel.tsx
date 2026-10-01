import Link from "next/link";
import { CalendarDays, ChevronRight } from "lucide-react";

import { Card } from "@/components/ui/card";
import { pluralMeals } from "@/lib/meals/types";
import type { TomorrowPreview } from "@/lib/meals/today-view-types";

/**
 * Tomorrow on one line. It opens tomorrow's own page, where the day can be
 * filled from the default, edited, and switched between DT and DNT, so what
 * you set up is always something you can see.
 */
export function TomorrowPanel({ preview }: { preview: TomorrowPreview }) {
  const planned = preview.count > 0;

  return (
    <Link href={`/dzien/${preview.date}`} className="rounded-xl outline-none focus-visible:ring-3 focus-visible:ring-ring/40">
      <Card className="flex-row items-center gap-3 p-4 active:scale-[0.99]">
        <CalendarDays className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">
            Jutro · <span className="first-letter:uppercase">{preview.label}</span> · {preview.dayType}
          </span>
          <span className="block truncate text-sm text-muted-foreground">
            {planned
              ? `${pluralMeals(preview.count)} · ${preview.kcal.toLocaleString("pl-PL")} kcal`
              : "Jeszcze nic nie zaplanowane. Dotknij, żeby zaplanować."}
          </span>
        </span>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
      </Card>
    </Link>
  );
}
