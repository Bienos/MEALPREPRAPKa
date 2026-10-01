import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, PencilLine } from "lucide-react";

import { MealDetail } from "@/components/meals/meal-detail";
import { Button } from "@/components/ui/button";
import { getMealLibrary } from "@/lib/meals/library";
import { AddToToday } from "./add-to-today";

export const dynamic = "force-dynamic";

export default async function MealPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const { library } = await getMealLibrary();
  const meal = library.meals.find((candidate) => candidate.key === key);
  if (!meal) notFound();

  return (
    <>
      <Link href="/meals" className="-ml-1 flex h-10 w-fit items-center gap-1 pr-2 font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-5" />
        Posiłki
      </Link>
      <MealDetail
        meal={meal}
        actions={
          <>
            <Button asChild size="lg" variant="outline" className="px-5">
              <Link href={`/meals/${meal.key}/edytuj`}>
                <PencilLine />
                Edytuj
              </Link>
            </Button>
            <AddToToday mealKey={meal.key} />
          </>
        }
      />
    </>
  );
}
