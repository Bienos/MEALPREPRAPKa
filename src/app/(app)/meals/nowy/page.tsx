import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { MealForm } from "@/components/meals/meal-form";
import { PageHeader } from "@/components/shell/page-header";
import { getMealLibrary } from "@/lib/meals/library";
import { canEditSheet } from "@/lib/meals/library-edit";

export const dynamic = "force-dynamic";

export default async function NewMealPage() {
  const { library } = await getMealLibrary();

  return (
    <>
      <Link href="/meals" className="-ml-1 flex h-10 w-fit items-center gap-1 pr-2 font-semibold text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-5" />
        Posiłki
      </Link>
      <PageHeader title="Nowy posiłek" />
      <MealForm
        target={null}
        categories={library.categories}
        canEdit={canEditSheet()}
        initial={{
          name: "",
          category: "",
          variant: null,
          ingredients: "",
          kcal: 0,
          protein_g: 0,
          fat_g: 0,
          carbs_g: 0,
          prepTime: "",
          batch: "",
          fridgeLife: "",
          freezable: null,
        }}
      />
    </>
  );
}
