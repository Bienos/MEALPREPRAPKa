"use client";

import { useMemo, useState, useTransition } from "react";
import { HelpCircle, PencilLine, Plus, Search, Snowflake, Wine } from "lucide-react";

import { MealImage } from "@/components/meals/meal-image";
import { Sheet } from "@/components/ui/sheet";
import type { AddOption } from "@/lib/meals/today-view-types";

const MAX_RESULTS = 25;

/** Lowercase, no Polish diacritics: "Tuńczyk" and "tunczyk" match each other. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/ł/g, "l").normalize("NFD").replace(/\p{M}/gu, "").trim();
}

/** "450" or "450 kcal" typed into search means "just log 450 kcal". */
function kcalFrom(query: string): number | null {
  const match = /^(\d{2,4})\s*(kcal)?$/i.exec(query.trim());
  return match ? Number(match[1]) : null;
}

function OptionRow({ option, onAdd }: { option: AddOption; onAdd: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onAdd}
        className="flex w-full items-center gap-3 rounded-2xl border bg-card p-2 pr-3 text-left active:scale-[0.99]"
      >
        <MealImage name={option.name} category={option.category} className="size-12 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{option.name}</p>
          <p className="text-xs text-muted-foreground tabular-nums">
            {Math.round(option.kcal)} kcal · {Math.round(option.protein_g)} g białka
            {option.ready > 0 ? (
              <span className="ml-1.5 inline-flex items-center gap-0.5 font-bold text-accent">
                <Snowflake className="size-3" />×{option.ready}
              </span>
            ) : null}
          </p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Plus className="size-5" strokeWidth={3} />
        </span>
      </button>
    </li>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The one way to log food that was not on the plan. Search comes first; with
 * nothing typed it shows what is ready in the fridge and what gets eaten
 * often, so the common case is one tap. The rarer paths (typing numbers,
 * describing food for AI, dinner out, no cooking) sit at the bottom.
 */
export function AddSheet({
  open,
  onClose,
  options,
  frequentKeys,
  onAdd,
  onQuickKcal,
  onManual,
  onDinnerOut,
  onNoCook,
}: {
  open: boolean;
  onClose: () => void;
  options: AddOption[];
  /** Most eaten dishes, loaded when the sheet opens; null while loading. */
  frequentKeys: string[] | null;
  onAdd: (option: AddOption) => Promise<void>;
  onQuickKcal: (kcal: number) => Promise<void>;
  onManual: () => void;
  onDinnerOut: () => void;
  onNoCook: () => void;
}) {
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();

  const results = useMemo(() => {
    const needle = normalize(query);
    if (!needle) return [];
    // Name matches first, then dishes that only mention it in the ingredients.
    const byName = options.filter((option) => normalize(option.name).includes(needle));
    const byIngredient = options.filter(
      (option) => !byName.includes(option) && normalize(option.ingredients).includes(needle),
    );
    return [...byName, ...byIngredient].slice(0, MAX_RESULTS);
  }, [options, query]);

  const ready = options.filter((option) => option.ready > 0);
  const frequent = (frequentKeys ?? [])
    .map((key) => options.find((option) => option.mealKey === key))
    .filter((option): option is AddOption => Boolean(option) && !ready.includes(option as AddOption));
  const quickKcal = kcalFrom(query);

  function close() {
    setQuery("");
    onClose();
  }

  function add(run: () => Promise<void>) {
    startTransition(async () => {
      await run();
      close();
    });
  }

  return (
    <Sheet open={open} onClose={close} title="Dodaj jedzenie">
      <div className="flex flex-col gap-5" aria-busy={pending}>
        <label className="flex h-12 items-center gap-2 rounded-2xl border-2 border-primary/60 bg-card px-3 focus-within:border-primary">
          <Search className="size-5 shrink-0 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Szukaj posiłku albo wpisz kcal"
            className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
            enterKeyHint="search"
          />
        </label>

        {quickKcal !== null ? (
          <button
            type="button"
            onClick={() => add(() => onQuickKcal(quickKcal))}
            className="flex items-center gap-3 rounded-2xl bg-primary px-4 py-3 text-left text-primary-foreground"
          >
            <Plus className="size-5" strokeWidth={3} />
            <span className="font-bold">Dodaj {quickKcal} kcal</span>
            <span className="ml-auto text-sm opacity-80">bez makro</span>
          </button>
        ) : null}

        {query.trim() ? (
          results.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {results.map((option) => (
                <OptionRow key={option.mealKey} option={option} onAdd={() => add(() => onAdd(option))} />
              ))}
            </ul>
          ) : quickKcal === null ? (
            <p className="text-sm text-muted-foreground">
              Nic takiego w arkuszu. Wpisz same kalorie albo użyj „Wpisz ręcznie” niżej.
            </p>
          ) : null
        ) : (
          <>
            {ready.length > 0 ? (
              <Section title="Gotowe w lodówce">
                <ul className="flex flex-col gap-2">
                  {ready.map((option) => (
                    <OptionRow key={option.mealKey} option={option} onAdd={() => add(() => onAdd(option))} />
                  ))}
                </ul>
              </Section>
            ) : null}

            <Section title="Często jesz">
              {frequentKeys === null ? (
                <div className="h-16 animate-pulse rounded-2xl bg-muted" />
              ) : frequent.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {frequent.slice(0, 5).map((option) => (
                    <OptionRow key={option.mealKey} option={option} onAdd={() => add(() => onAdd(option))} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Pojawi się tu to, co jesz najczęściej.</p>
              )}
            </Section>
          </>
        )}

        <Section title="Inaczej">
          <div className="grid grid-cols-3 gap-2">
            {[
              { icon: PencilLine, label: "Wpisz ręcznie", onClick: onManual },
              { icon: Wine, label: "Na mieście", onClick: onDinnerOut },
              { icon: HelpCircle, label: "Nie gotuję", onClick: onNoCook },
            ].map(({ icon: Icon, label, onClick }) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  close();
                  onClick();
                }}
                className="flex flex-col items-center gap-1.5 rounded-2xl border bg-card px-2 py-3 text-sm font-semibold"
              >
                <Icon className="size-5 text-primary" />
                {label}
              </button>
            ))}
          </div>
        </Section>
      </div>
    </Sheet>
  );
}
