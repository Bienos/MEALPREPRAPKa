"use client";

import { useState, useTransition } from "react";
import { ChevronLeft, Bookmark, PencilLine, Plus, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet } from "@/components/ui/sheet";
import type { Candidate } from "@/lib/meals/recommend";

export type EstimateView = {
  food: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  confidence: "low" | "medium" | "high";
  note: string;
};

export type LogPayload = {
  name: string;
  source: "saved_meal" | "quick_add" | "ai_estimate" | "manual";
  kcal: number;
  protein_g?: number;
  fat_g?: number;
  carbs_g?: number;
  mealKey?: string | null;
  variant?: "DT" | "DNT" | null;
  approximate?: boolean;
};

type Mode = "menu" | "saved" | "quick" | "describe" | "manual";

/**
 * [ ZJADŁEM COŚ INNEGO ]. Options are ordered the way they are most often
 * needed: a meal you already have, then a quick number, then a description,
 * then full manual entry. No database search opens first.
 */
export function LogOtherSheet({
  open,
  onClose,
  aiEnabled,
  savedMeals,
  onOpenSaved,
  onEstimate,
  onLog,
}: {
  open: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  /** null until the saved meals have been fetched. */
  savedMeals: Candidate[] | null;
  onOpenSaved: () => void;
  onEstimate: (description: string) => Promise<{ ok: true; estimate: EstimateView } | { ok: false; message: string }>;
  onLog: (payload: LogPayload) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>("menu");

  function close() {
    setMode("menu");
    onClose();
  }

  return (
    <Sheet open={open} onClose={close} title={mode === "menu" ? "Zjadłem coś innego" : title(mode)}>
      {mode !== "menu" ? (
        <button
          type="button"
          onClick={() => setMode("menu")}
          className="-ml-1 mb-3 flex h-9 items-center gap-1 text-sm font-semibold text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
          Wróć
        </button>
      ) : null}

      {mode === "menu" ? (
        <ul className="flex flex-col gap-2">
          <MenuItem
            icon={Bookmark}
            label="Zapisany posiłek"
            hint="Z Twojej biblioteki"
            onClick={() => {
              onOpenSaved();
              setMode("saved");
            }}
          />
          <MenuItem icon={Plus} label="Szybkie dodanie" hint="Same kalorie wystarczą" onClick={() => setMode("quick")} />
          {aiEnabled ? (
            <MenuItem icon={Sparkles} label="Opisz jedzenie" hint="Oszacuje makro z opisu" onClick={() => setMode("describe")} />
          ) : null}
          <MenuItem icon={PencilLine} label="Wpis ręczny" hint="Nazwa i pełne makro" onClick={() => setMode("manual")} />
        </ul>
      ) : null}

      {mode === "saved" ? <SavedMeals meals={savedMeals} onLog={onLog} onDone={close} /> : null}
      {mode === "quick" ? <QuickAdd onLog={onLog} onDone={close} /> : null}
      {mode === "describe" ? <Describe onEstimate={onEstimate} onLog={onLog} onDone={close} /> : null}
      {mode === "manual" ? <ManualEntry onLog={onLog} onDone={close} /> : null}
    </Sheet>
  );
}

function title(mode: Mode): string {
  if (mode === "saved") return "Zapisany posiłek";
  if (mode === "quick") return "Szybkie dodanie";
  if (mode === "describe") return "Opisz jedzenie";
  return "Wpis ręczny";
}

function MenuItem({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: typeof Bookmark;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full min-h-16 items-center gap-3 rounded-xl border bg-card px-4 text-left hover:bg-muted"
      >
        <Icon className="size-5 shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          <span className="block font-bold">{label}</span>
          <span className="block text-sm text-muted-foreground">{hint}</span>
        </span>
      </button>
    </li>
  );
}

function SavedMeals({
  meals,
  onLog,
  onDone,
}: {
  meals: Candidate[] | null;
  onLog: (payload: LogPayload) => Promise<void>;
  onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();

  if (meals === null) {
    return <p className="py-6 text-center text-muted-foreground">Wczytuję…</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {meals.map((meal) => (
        <li key={`${meal.mealKey}-${meal.variant}`}>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await onLog({
                  name: meal.mealName,
                  source: "saved_meal",
                  kcal: meal.kcal,
                  protein_g: meal.protein_g,
                  fat_g: meal.fat_g,
                  carbs_g: meal.carbs_g,
                  mealKey: meal.mealKey,
                  variant: meal.variant,
                });
                onDone();
              })
            }
            className="flex w-full min-h-16 items-center gap-3 rounded-xl border bg-card px-4 py-2 text-left hover:bg-muted disabled:opacity-60"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">{meal.mealName}</span>
              <span className="block text-sm text-muted-foreground">
                {Math.round(meal.kcal)} kcal · {Math.round(meal.protein_g)} B
                {meal.variant ? ` · ${meal.variant}` : ""}
              </span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function NumberField({
  label,
  value,
  onChange,
  required,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold">
        {label}
        {required ? "" : <span className="font-normal text-muted-foreground"> (opcjonalnie)</span>}
      </span>
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function QuickAdd({ onLog, onDone }: { onLog: (payload: LogPayload) => Promise<void>; onDone: () => void }) {
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [pending, startTransition] = useTransition();

  const kcalValue = Number(kcal);
  const valid = kcal.trim() !== "" && Number.isFinite(kcalValue) && kcalValue > 0;
  const partial = valid && (protein.trim() === "" || fat.trim() === "" || carbs.trim() === "");

  const optional = (value: string) => (value.trim() === "" ? undefined : Number(value));

  return (
    <div className="flex flex-col gap-4">
      <NumberField label="Kalorie" value={kcal} onChange={setKcal} required autoFocus />
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Białko" value={protein} onChange={setProtein} />
        <NumberField label="Tłuszcz" value={fat} onChange={setFat} />
        <NumberField label="Węgle" value={carbs} onChange={setCarbs} />
      </div>
      {partial ? (
        <p className="text-sm text-muted-foreground">
          Zapiszemy to jako szacunek — brakujące makro policzymy jako 0.
        </p>
      ) : null}
      <Button
        size="lg"
        disabled={!valid || pending}
        onClick={() =>
          startTransition(async () => {
            await onLog({
              name: "Szybkie dodanie",
              source: "quick_add",
              kcal: kcalValue,
              protein_g: optional(protein),
              fat_g: optional(fat),
              carbs_g: optional(carbs),
            });
            onDone();
          })
        }
      >
        {pending ? "Zapisuję…" : "ZAPISZ"}
      </Button>
    </div>
  );
}

function Describe({
  onEstimate,
  onLog,
  onDone,
}: {
  onEstimate: (description: string) => Promise<{ ok: true; estimate: EstimateView } | { ok: false; message: string }>;
  onLog: (payload: LogPayload) => Promise<void>;
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const [estimate, setEstimate] = useState<EstimateView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Co zjadłeś?</span>
        <textarea
          value={text}
          autoFocus
          rows={3}
          onChange={(event) => setText(event.target.value)}
          placeholder="Kebab z kurczakiem, dużo mięsa, mało sosu, około 900 kcal"
          className="w-full rounded-lg border border-input bg-card px-4 py-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
        />
      </label>

      {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}

      {estimate ? (
        <div className="rounded-xl border bg-card p-4">
          <p className="font-bold">{estimate.food}</p>
          <p className="mt-1 text-2xl font-extrabold">~{Math.round(estimate.kcal)} kcal</p>
          <p className="text-muted-foreground">
            ~{Math.round(estimate.protein_g)} B · ~{Math.round(estimate.fat_g)} T · ~{Math.round(estimate.carbs_g)} W
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Pewność: {estimate.confidence === "high" ? "wysoka" : estimate.confidence === "medium" ? "średnia" : "niska"}.{" "}
            {estimate.note}
          </p>
        </div>
      ) : null}

      {estimate ? (
        <Button
          size="lg"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await onLog({
                name: estimate.food,
                source: "ai_estimate",
                kcal: estimate.kcal,
                protein_g: estimate.protein_g,
                fat_g: estimate.fat_g,
                carbs_g: estimate.carbs_g,
                approximate: true,
              });
              onDone();
            })
          }
        >
          {pending ? "Zapisuję…" : "UŻYJ SZACUNKU"}
        </Button>
      ) : (
        <Button
          size="lg"
          disabled={text.trim().length < 3 || pending}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const result = await onEstimate(text.trim());
              if (result.ok) setEstimate(result.estimate);
              else setError(result.message);
            })
          }
        >
          {pending ? "Szacuję…" : "OSZACUJ"}
        </Button>
      )}
    </div>
  );
}

function ManualEntry({ onLog, onDone }: { onLog: (payload: LogPayload) => Promise<void>; onDone: () => void }) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [pending, startTransition] = useTransition();

  const valid = name.trim() !== "" && Number(kcal) > 0;

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold">Nazwa</span>
        <Input value={name} autoFocus onChange={(event) => setName(event.target.value)} />
      </label>
      <NumberField label="Kalorie" value={kcal} onChange={setKcal} required />
      <div className="grid grid-cols-3 gap-2">
        <NumberField label="Białko" value={protein} onChange={setProtein} />
        <NumberField label="Tłuszcz" value={fat} onChange={setFat} />
        <NumberField label="Węgle" value={carbs} onChange={setCarbs} />
      </div>
      <Button
        size="lg"
        disabled={!valid || pending}
        onClick={() =>
          startTransition(async () => {
            await onLog({
              name: name.trim(),
              source: "manual",
              kcal: Number(kcal),
              protein_g: protein.trim() === "" ? undefined : Number(protein),
              fat_g: fat.trim() === "" ? undefined : Number(fat),
              carbs_g: carbs.trim() === "" ? undefined : Number(carbs),
            });
            onDone();
          })
        }
      >
        {pending ? "Zapisuję…" : "ZAPISZ"}
      </Button>
    </div>
  );
}
