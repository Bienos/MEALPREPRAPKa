import { ChefHat } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrepPage() {
  return (
    <>
      <PageHeader title="Prep" subtitle="Planowanie i gotowanie na 2–4 dni" />
      <Card className="items-center py-10 text-center">
        <ChefHat className="size-10 text-primary" />
        <CardHeader className="items-center">
          <CardTitle>Wkrótce</CardTitle>
          <CardDescription>Wybór dni DT/DNT, lista prepu i porcje do lodówki pojawią się tutaj.</CardDescription>
        </CardHeader>
      </Card>
    </>
  );
}
