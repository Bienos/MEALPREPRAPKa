import { UtensilsCrossed } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function MealsPage() {
  return (
    <>
      <PageHeader title="Posiłki" subtitle="Biblioteka posiłków z Google Sheets" />
      <Card className="items-center py-10 text-center">
        <UtensilsCrossed className="size-10 text-primary" />
        <CardHeader className="items-center">
          <CardTitle>Wkrótce</CardTitle>
          <CardDescription>Posiłki z arkusza będą tu wyświetlane jako przyjazne karty.</CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
