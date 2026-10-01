import { notFound, redirect } from "next/navigation";

import { longDateLabel, relativeDayLabel, todayIso } from "@/lib/date";
import { getSettings } from "@/lib/db/settings";
import { hasAnthropicKey } from "@/lib/env";
import { loadDayView } from "@/lib/meals/day-view";
import { TodayView } from "../../today-view";

export const dynamic = "force-dynamic";

/** Any day other than today: tomorrow to plan, a past day to look back on or fix. */
export default async function DayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  // A real calendar date, not just something shaped like one ("2026-02-31").
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    notFound();
  }

  const settings = await getSettings();
  const today = todayIso(settings.timezone);
  if (date === today) redirect("/");

  const day = await loadDayView(date);

  return (
    <TodayView
      key={date}
      date={date}
      dateLabel={longDateLabel(date)}
      relativeLabel={relativeDayLabel(date, today)}
      when={date < today ? "past" : "future"}
      dayType={day.dayType}
      target={day.target}
      initialMeals={day.meals}
      addOptions={day.addOptions}
      hasTemplate={day.hasTemplate}
      cooked={day.cooked}
      aiEnabled={hasAnthropicKey()}
      tomorrow={null}
    />
  );
}
