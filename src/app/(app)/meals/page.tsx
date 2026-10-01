import Link from "next/link";
import { Plus, UtensilsCrossed } from "lucide-react";

import { LibraryNotice } from "@/components/meals/library-notice";
import { MealBrowser } from "@/components/meals/meal-browser";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listAvailablePortions } from "@/lib/db/prep";
import { getMealLibrary } from "@/lib/meals/library";
import { pluralMeals, type MealLibrarySnapshot } from "@/lib/meals/types";
import { SyncButton } from "./sync-button";

// Always rendered per request: the library can change with every sync.
export const dynamic = "force-dynamic";

function subtitle({ library, fetchedAt }: MealLibrarySnapshot): string {
  const count = pluralMeals(library.meals.length);
  if (!fetchedAt) return count;
  const time = new Intl.DateTimeFormat("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }).format(
    new Date(fetchedAt),
  );
  return `${count} · pobrano ${time}`;
}

export default async function MealsPage() {
  const [snapshot, portions] = await Promise.all([getMealLibrary(), listAvailablePortions()]);
  const { library } = snapshot;

  // Prepared portions per dish, for the fridge badge and the "W lodówce" filter.
  const ready: Record<string, number> = {};
  for (const portion of portions) {
    const key = portion.batch.meal_key;
    if (key) ready[key] = (ready[key] ?? 0) + 1;
  }

  return (
    <>
      <div className="grid grid-cols-[1fr_auto_auto] items-start gap-x-2 gap-y-2">
        <PageHeader title="Posiłki" subtitle={subtitle(snapshot)} />
        <SyncButton />
        <Link
          href="/meals/nowy"
          className="flex h-10 items-center gap-1 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground"
        >
          <Plus className="size-4" strokeWidth={3} />
          Nowy
        </Link>
      </div>

      <LibraryNotice snapshot={snapshot} />

      {library.meals.length > 0 ? (
        <MealBrowser meals={library.meals} ready={ready} />
      ) : (
        <Card className="items-center py-10 text-center">
          <UtensilsCrossed className="size-10 text-primary" />
          <CardHeader className="items-center">
            <CardTitle>Brak posiłków</CardTitle>
            <CardDescription className="break-words">
              {snapshot.error ?? "Arkusz nie zawiera jeszcze żadnych posiłków."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </>
  );
}
