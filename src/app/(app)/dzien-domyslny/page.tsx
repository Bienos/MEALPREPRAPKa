import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { listDefaultDayMeals } from "@/lib/db/default-day";
import { getMealLibrary } from "@/lib/meals/library";
import { variantsForDayType } from "@/lib/meals/types";
import type { DayType } from "@/lib/meals/today-view-types";
import { DEFAULT_SLOTS } from "@/lib/meals/slots";
import { DefaultDayForm, type MealOption } from "./default-day-form";

export const dynamic = "force-dynamic";

export default async function DefaultDayPage({
  searchParams,
}: {
  searchParams: Promise<{ typ?: string }>;
}) {
  const { typ } = await searchParams;
  const dayType: DayType = typ === "DNT" ? "DNT" : "DT";

  const [{ library }, template] = await Promise.all([getMealLibrary(), listDefaultDayMeals(dayType)]);

  const options: MealOption[] = variantsForDayType(library.meals, dayType).map((variant) => ({
    value: `${variant.mealKey}|${variant.variant ?? ""}`,
    label: `${variant.category} — ${variant.name}${variant.variant ? ` (${variant.variant})` : ""} · ${Math.round(variant.kcal)} kcal`,
  }));

  const selected = DEFAULT_SLOTS.map((_, index) => {
    const entry = template.find((meal) => meal.position === index);
    return entry ? `${entry.meal_key}|${entry.variant ?? ""}` : null;
  });

  return (
    <>
      <Link
        href="/"
        className="-ml-1 flex h-10 w-fit items-center gap-1 pr-2 font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-5" />
        Dziś
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-extrabold tracking-tight">Domyślny dzień</h1>
        <p className="text-muted-foreground">
          Wybierz posiłki, których używasz najczęściej. Potem wstawisz cały dzień jednym kliknięciem.
        </p>
      </header>

      {options.length === 0 ? (
        <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">
          Biblioteka posiłków jest pusta. Sprawdź połączenie z arkuszem na zakładce Posiłki.
        </p>
      ) : (
        <DefaultDayForm dayType={dayType} slots={DEFAULT_SLOTS} options={options} selected={selected} />
      )}
    </>
  );
}
