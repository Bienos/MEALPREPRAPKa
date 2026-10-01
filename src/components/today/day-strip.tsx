import Link from "next/link";

import { cn } from "@/lib/utils";
import type { DayCell, Tone } from "@/lib/meals/calendar";

const WEEKDAYS = ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"];

const TONE_DOT: Record<Tone, string> = { ok: "bg-accent", low: "bg-primary/60", high: "bg-destructive" };

function weekday(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** The dot under a day: how it went, that it is planned, or nothing yet. */
function dot(cell: DayCell): string {
  if (cell.tone) return TONE_DOT[cell.tone];
  if (cell.isToday) return cell.kcal > 0 ? "bg-primary" : "bg-border";
  if (cell.isFuture && cell.hasEntries) return "border-2 border-primary bg-transparent";
  return "bg-border";
}

/**
 * A week around the day in view. Each day shows its DT/DNT and a dot: green,
 * light or red once it is over, a ring when something is planned. Tapping a
 * day opens it, so the days around this one are one tap away.
 */
export function DayStrip({ days, selected }: { days: DayCell[]; selected: string }) {
  return (
    <nav aria-label="Dni" className="grid grid-cols-7 gap-1">
      {days.map((cell) => {
        const active = cell.date === selected;
        return (
          <Link
            key={cell.date}
            href={cell.isToday ? "/" : `/dzien/${cell.date}`}
            aria-current={active ? "date" : undefined}
            aria-label={`${weekday(cell.date)} ${cell.day}, ${cell.effectiveType}`}
            className={cn(
              "flex flex-col items-center gap-0.5 rounded-2xl py-1.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/40 active:scale-[0.96]",
              active ? "bg-foreground text-background" : "hover:bg-muted",
            )}
          >
            <span className={cn("text-[0.65rem] font-bold", active ? "opacity-80" : "text-muted-foreground")}>
              {cell.isToday && !active ? "Dziś" : weekday(cell.date)}
            </span>
            <span className={cn("text-base leading-tight font-extrabold tabular-nums", cell.isToday && !active && "text-primary")}>
              {cell.day}
            </span>
            <span className={cn("text-[0.6rem] font-bold", active ? "opacity-80" : "text-muted-foreground")}>
              {cell.effectiveType}
            </span>
            <span aria-hidden className={cn("size-2 rounded-full", dot(cell))} />
          </Link>
        );
      })}
    </nav>
  );
}
