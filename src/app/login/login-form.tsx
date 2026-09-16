"use client";

import { useActionState } from "react";
import { LogIn } from "lucide-react";

import { login, type LoginState } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      {/* Hidden username so password managers store the credential correctly. */}
      <input type="text" name="username" autoComplete="username" value="mealprep" readOnly hidden />
      <label className="flex flex-col gap-2">
        <span className="text-sm font-semibold">Hasło</span>
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          aria-invalid={state.error ? true : undefined}
        />
      </label>
      {state.error ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" size="lg" disabled={pending}>
        <LogIn />
        {pending ? "Sprawdzam…" : "Wejdź"}
      </Button>
    </form>
  );
}
