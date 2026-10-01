import { longDateLabel, todayIso } from "@/lib/date";
import { getSettings } from "@/lib/db/settings";
import { hasAnthropicKey } from "@/lib/env";
import { loadDayStrip, loadDayView } from "@/lib/meals/day-view";
import { TodayView } from "./today-view";

// Day state must always be read fresh from Supabase.
export const dynamic = "force-dynamic";

export default async function TodayPage() {
  const settings = await getSettings();
  const date = todayIso(settings.timezone);
  const [day, strip] = await Promise.all([loadDayView(date), loadDayStrip(date, date)]);

  return (
    <TodayView
      date={date}
      dateLabel={longDateLabel(date)}
      relativeLabel={null}
      when="today"
      dayType={day.dayType}
      target={day.target}
      initialMeals={day.meals}
      addOptions={day.addOptions}
      hasTemplate={day.hasTemplate}
      cooked={day.cooked}
      aiEnabled={hasAnthropicKey()}
      strip={strip}
    />
  );
}
