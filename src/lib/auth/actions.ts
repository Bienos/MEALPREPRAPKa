"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifyPassword,
} from "@/lib/auth/session";

export type LoginState = { error?: string };

const loginSchema = z.object({
  password: z.string().min(1),
});

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ password: formData.get("password") });
  const ok = parsed.success && (await verifyPassword(parsed.data.password));

  if (!ok) {
    // Small fixed delay to make brute forcing tedious without adding infrastructure.
    await new Promise((resolve) => setTimeout(resolve, 500));
    return { error: "Nieprawidłowe hasło." };
  }

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, await createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  redirect("/");
}
