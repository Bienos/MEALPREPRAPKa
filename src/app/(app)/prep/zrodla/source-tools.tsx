"use client";

import { RefreshCw, ScanBarcode } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BarcodeResult, SyncActionResult } from "./actions";

export function SyncOpenPrices({ onSync }: { onSync: () => Promise<SyncActionResult> }) {
  const [pending, start] = useTransition();
  const [note, setNote] = useState<SyncActionResult | null>(null);
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant="outline" disabled={pending} onClick={() => start(async () => setNote(await onSync()))}>
        <RefreshCw className={pending ? "size-4 animate-spin" : "size-4"} />
        {pending ? "Pobieram…" : "Pobierz nowe ceny z Open Prices"}
      </Button>
      {note ? <p className={note.ok ? "text-sm text-muted-foreground" : "text-sm text-destructive"}>{note.message}</p> : null}
    </div>
  );
}

const number = (value: number | null, unit: string) => (value === null ? "—" : `${String(value).replace(".", ",")} ${unit}`);

export function BarcodeLookup({ onLookup }: { onLookup: (code: string) => Promise<BarcodeResult> }) {
  const [code, setCode] = useState("");
  const [pending, start] = useTransition();
  const [result, setResult] = useState<BarcodeResult | null>(null);
  return (
    <div className="flex flex-col gap-3">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          start(async () => setResult(await onLookup(code)));
        }}
      >
        <Input
          inputMode="numeric"
          aria-label="Kod EAN"
          placeholder="np. 5905784329192"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
        <Button type="submit" disabled={pending || code.trim().length < 8} className="shrink-0">
          <ScanBarcode className="size-4" />
          Sprawdź
        </Button>
      </form>
      {result && !result.ok ? <p className="text-sm text-muted-foreground">{result.message}</p> : null}
      {result && result.ok ? (
        <div className="flex flex-col gap-1 rounded-xl border bg-card px-4 py-3 text-sm">
          <p className="font-bold">{result.name}</p>
          <p className="text-muted-foreground">
            {[result.brand, result.pack, `EAN ${result.gtin}`].filter(Boolean).join(" · ")}
          </p>
          {result.nutrition ? (
            <p className="text-muted-foreground">
              Na 100 g: {number(result.nutrition.kcal, "kcal")} · B {number(result.nutrition.proteinG, "g")} · T{" "}
              {number(result.nutrition.fatG, "g")} · W {number(result.nutrition.carbsG, "g")}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Dane produktu: Open Food Facts (ODbL){result.from === "cache" ? ", z pamięci aplikacji" : ""}.{" "}
            {result.url ? (
              <a href={result.url} target="_blank" rel="noreferrer" className="font-semibold text-primary">
                otwórz
              </a>
            ) : null}{" "}
            To opis produktu, nie dowód, że jest w polskim sklepie.
          </p>
        </div>
      ) : null}
    </div>
  );
}
