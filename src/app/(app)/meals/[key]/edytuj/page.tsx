import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { MealForm } from "@/components/meals/meal-form";
import { PageHeader } from "@/components/shell/page-header";
import { cn } from "@/lib/utils";
import { getMealLibrary } from "@/lib/meals/library";
import { canEditSheet } from "@/lib/meals/library-edit";
import { primaryVariant, variantLabel } from "@/lib/meals/types";

export const dynamic = "force-dynamic";

/** `?w=dt|dnt|base` picks the variant; the default is the one shown first elsewhere. */
export default async function EditMealPage({
  params,
  searchParams,
}: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ w?: string }>;
}) {
  const [{ key }, { w }] = await Promise.all([params, searchParams]);
  const { library } = await getMealLibrary();
  const meal = library.meals.find((candidate) => candidate.key === key);
  if (!meal) notFound();

  const v = meal.variants.find((variant) => variant.key === `${key}:${w}`) ?? primaryVariant(meal);

  return (
    <>
      <Link href={`/meals/${key}`} className="-ml-1 flex h-10 w-fit items-center gap-1 pr-2 font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-5" />
        {meal.name}
      </Link>
      <PageHeader title="Edytuj posiłek" />

      {meal.variants.length > 1 ? (
        <nav aria-label="Wersja" className="grid gap-1 rounded-full bg-muted p-1" style={{ gridTemplateColumns: `repeat(${meal.variants.length}, 1fr)` }}>
          {meal.variants.map((variant) => (
            <Link
              key={variant.key}
              href={`/meals/${key}/edytuj?w=${variant.key.split(":")[1]}`}
              replace
              aria-current={variant.key === v.key ? "page" : undefined}
              className={cn(
                "flex h-11 items-center justify-center rounded-full text-sm font-bold",
                variant.key === v.key ? "bg-card shadow-sm" : "text-muted-foreground",
              )}
            >
              {variantLabel(variant.variant)}
            </Link>
          ))}
        </nav>
      ) : null}

      <MealForm
        key={v.key}
        target={{ mealKey: meal.key, variant: v.variant }}
        categories={library.categories}
        canEdit={canEditSheet()}
        initial={{
          name: meal.name,
          category: meal.category,
          variant: v.variant,
          ingredients: v.ingredients,
          kcal: v.kcal,
          protein_g: v.protein_g,
          fat_g: v.fat_g,
          carbs_g: v.carbs_g,
          prepTime: v.prepTime ?? "",
          batch: v.batch ?? "",
          fridgeLife: v.fridgeLife ?? "",
          freezable: v.freezable,
        }}
      />
    </>
  );
}
