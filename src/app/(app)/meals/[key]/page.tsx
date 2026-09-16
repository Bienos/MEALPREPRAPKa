import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { MealDetail } from "@/components/meals/meal-detail";
import { getMealLibrary } from "@/lib/meals/library";

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
      <MealDetail meal={meal} />
    </>
  );
}
