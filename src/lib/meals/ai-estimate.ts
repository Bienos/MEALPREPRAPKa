import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

/**
 * Optional: turns a sentence like "Kebab z kurczakiem, dużo mięsa, około 900 kcal"
 * into structured macros. This is the only place the app talks to a model, and
 * it is never required — without ANTHROPIC_API_KEY the feature simply hides.
 *
 * Deliberately not a chatbot: one request in, one structured estimate out.
 */

export function hasAiEstimation(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const estimateSchema = z.object({
  food: z.string().describe("Krótka nazwa jedzenia po polsku, np. „Kebab z kurczakiem”"),
  kcal: z.number().describe("Szacowane kalorie całego opisanego posiłku"),
  protein_g: z.number().describe("Szacowane białko w gramach"),
  fat_g: z.number().describe("Szacowany tłuszcz w gramach"),
  carbs_g: z.number().describe("Szacowane węglowodany w gramach"),
  confidence: z.enum(["low", "medium", "high"]).describe("Pewność oszacowania"),
  note: z.string().describe("Jedno krótkie zdanie po polsku o założeniach przyjętych przy szacowaniu"),
});

export type FoodEstimate = z.infer<typeof estimateSchema> & { approximate: true };

const SYSTEM = [
  "Jesteś kalkulatorem wartości odżywczych dla jednej osoby prowadzącej dziennik diety.",
  "Na podstawie opisu jedzenia oszacuj kalorie i makroskładniki CAŁEJ opisanej porcji.",
  "Jeśli użytkownik podaje własne szacowanie kalorii, potraktuj je jako mocną wskazówkę.",
  "Szacuj realistycznie dla typowych polskich porcji. Nie zadawaj pytań, nie prowadź rozmowy.",
].join(" ");

/**
 * Returns null when the feature is not configured, and throws only on a real
 * API failure so the caller can show a message and fall back to Quick Add.
 */
export async function estimateFood(description: string): Promise<FoodEstimate | null> {
  if (!hasAiEstimation()) return null;

  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 4096,
    // A small extraction task: low effort keeps it fast and cheap.
    output_config: { effort: "low", format: zodOutputFormat(estimateSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: description }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Model odmówił oszacowania tego opisu.");
  }

  const parsed = response.parsed_output;
  if (!parsed) throw new Error("Nie udało się odczytać oszacowania.");

  return { ...parsed, approximate: true };
}

/** "~900 kcal · ~55 B · ~34 T · ~85 W" — uncertainty stays visible. */
export function formatEstimate(estimate: Pick<FoodEstimate, "kcal" | "protein_g" | "fat_g" | "carbs_g">): string {
  return [
    `~${Math.round(estimate.kcal)} kcal`,
    `~${Math.round(estimate.protein_g)} B`,
    `~${Math.round(estimate.fat_g)} T`,
    `~${Math.round(estimate.carbs_g)} W`,
  ].join(" · ");
}
