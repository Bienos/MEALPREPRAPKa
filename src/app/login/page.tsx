import { ChefHat } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-8 px-4 py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        <span className="flex size-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <ChefHat className="size-8" />
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight">MealPrep</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Wejdź do aplikacji</CardTitle>
          <CardDescription>Aplikacja prywatna. Podaj hasło, aby kontynuować.</CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}
