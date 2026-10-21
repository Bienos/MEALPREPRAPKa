"use client";

import { Plus, ScanText, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatGrosz, parseZlotyText } from "@/lib/grocery/money";
import { parseReceiptText, redactReceiptText } from "@/lib/grocery/receipts";
import { RETAILERS, type RetailerId } from "@/lib/grocery/retailers";
import { cn } from "@/lib/utils";
import type { SaveReceiptResult, saveReceiptAction } from "./actions";

type Row = {
  key: number;
  include: boolean;
  raw: string;
  name: string;
  gtin: string;
  quantity: string;
  unit: "szt" | "kg";
  total: string;
  discountGrosz: number;
  deposit: boolean;
  share: boolean;
};

const zl = (grosz: number) => (grosz / 100).toFixed(2).replace(".", ",");

/**
 * A new receipt: paste its text (read on the phone itself, so the photo never
 * leaves it) or type the lines, review and correct every line, save it as
 * mine. Each line can be shared anonymized, only if I tick it.
 */
export function ReceiptEditor({
  city: defaultCity,
  today,
  onSave,
}: {
  city: string;
  today: string;
  onSave: typeof saveReceiptAction;
}) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [retailer, setRetailer] = useState<RetailerId | "">("");
  const [storeLabel, setStoreLabel] = useState("");
  const [city, setCity] = useState(defaultCity);
  const [date, setDate] = useState(today);
  const [printedTotal, setPrintedTotal] = useState<number | null>(null);
  const [unread, setUnread] = useState<string[]>([]);
  const [removed, setRemoved] = useState(0);
  const [result, setResult] = useState<SaveReceiptResult | null>(null);
  const [saving, startSaving] = useTransition();
  const [nextKey, setNextKey] = useState(1);

  function read() {
    const redacted = redactReceiptText(text);
    const parsed = parseReceiptText(redacted.text);
    setText(redacted.text);
    setRemoved(redacted.removed);
    setRetailer(parsed.retailer ?? "");
    if (parsed.date && parsed.date <= today) setDate(parsed.date);
    setPrintedTotal(parsed.totalGrosz);
    setUnread(parsed.unread);
    setRows(
      parsed.lines.map((line, index) => ({
        key: index + 1,
        include: !line.deposit,
        raw: line.raw,
        name: line.name,
        gtin: "",
        quantity: String(line.quantity).replace(".", ","),
        unit: line.unit,
        total: zl(line.totalGrosz),
        discountGrosz: line.discountGrosz,
        deposit: line.deposit,
        share: false,
      })),
    );
    setNextKey(parsed.lines.length + 1);
    setResult(null);
  }

  function addRow() {
    setRows((current) => [
      ...current,
      { key: nextKey, include: true, raw: "", name: "", gtin: "", quantity: "1", unit: "szt", total: "", discountGrosz: 0, deposit: false, share: false },
    ]);
    setNextKey((key) => key + 1);
  }

  const update = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const included = rows.filter((row) => row.include);
  const valid = included.filter((row) => {
    const quantity = Number(row.quantity.replace(",", "."));
    return row.name.trim().length > 0 && quantity > 0 && parseZlotyText(row.total) !== null;
  });
  const sum = included.reduce((acc, row) => acc + (parseZlotyText(row.total) ?? 0) - row.discountGrosz, 0);

  function save() {
    startSaving(async () => {
      const response = await onSave({
        retailer: retailer || null,
        storeLabel,
        city: city.trim() || null,
        purchasedOn: date,
        totalGrosz: printedTotal,
        text,
        lines: valid.map((row) => {
          const quantity = Number(row.quantity.replace(",", "."));
          const totalGrosz = parseZlotyText(row.total) ?? 0;
          return {
            raw: row.raw,
            name: row.name.trim(),
            gtin: row.gtin.trim() || null,
            quantity,
            unit: row.unit,
            unitPriceGrosz: quantity > 0 ? Math.round(totalGrosz / quantity) || null : null,
            totalGrosz,
            discountGrosz: row.discountGrosz,
            deposit: row.deposit,
            share: row.share,
          };
        }),
      });
      setResult(response);
      if (response.ok) {
        setText("");
        setRows([]);
        setUnread([]);
        setPrintedTotal(null);
      }
    });
  }

  return (
    <Card className="gap-3 p-4">
      <p className="font-bold">Nowy paragon</p>
      <p className="text-sm text-muted-foreground">
        Zrób zdjęcie paragonu aparatem, przytrzymaj palec na tekście, „Zaznacz wszystko”, „Kopiuj” i wklej tutaj. Zdjęcie
        zostaje w telefonie. Albo dodaj pozycje ręcznie.
      </p>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={5}
        placeholder={"PIERS KURCZ.FILET KG  0,834 x23,99  20,01C\nSKYR NAT. 150G  2 *2,99  5,98C\nSUMA PLN 26,00"}
        className="w-full rounded-xl border bg-card px-3 py-2 font-mono text-sm"
        aria-label="Tekst paragonu"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" onClick={read} disabled={text.trim().length < 5}>
          <ScanText className="size-4" />
          Odczytaj tekst
        </Button>
        <Button type="button" variant="ghost" onClick={addRow}>
          <Plus className="size-4" />
          Dodaj pozycję ręcznie
        </Button>
      </div>
      {removed > 0 ? (
        <p className="text-xs text-muted-foreground">
          Usunięto {removed} {removed === 1 ? "dane osobowe" : "fragmentów z danymi osobowymi"} (karta, transakcja,
          telefon, godzina) przed czymkolwiek innym.
        </p>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Sklep
              <select
                value={retailer}
                onChange={(event) => setRetailer(event.target.value as RetailerId | "")}
                className="h-11 rounded-xl border bg-card px-2 text-sm"
              >
                <option value="">inny</option>
                {RETAILERS.map((one) => (
                  <option key={one.id} value={one.id}>
                    {one.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Data
              <Input type="date" value={date} max={today} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Miasto
              <Input value={city} onChange={(event) => setCity(event.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold">
              Który sklep (tylko dla Ciebie)
              <Input value={storeLabel} onChange={(event) => setStoreLabel(event.target.value)} placeholder="np. Puławska" />
            </label>
          </div>

          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li key={row.key} className={cn("flex flex-col gap-2 rounded-xl border px-3 py-2", !row.include && "opacity-50")}>
                {row.raw ? <p className="truncate font-mono text-xs text-muted-foreground">{row.raw}</p> : null}
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={row.include}
                    onChange={(event) => update(row.key, { include: event.target.checked })}
                    className="size-5 shrink-0"
                    aria-label="Zapisz tę pozycję"
                  />
                  <Input value={row.name} onChange={(event) => update(row.key, { name: event.target.value })} aria-label="Nazwa produktu" placeholder="nazwa produktu" />
                  <button type="button" onClick={() => setRows((current) => current.filter((one) => one.key !== row.key))} aria-label="Usuń pozycję" className="shrink-0 text-muted-foreground">
                    <Trash2 className="size-4" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <Input value={row.quantity} onChange={(event) => update(row.key, { quantity: event.target.value })} inputMode="decimal" aria-label="Ilość" className="w-20" />
                  <div className="flex rounded-full bg-muted p-1" role="radiogroup" aria-label="Jednostka">
                    {(["szt", "kg"] as const).map((unit) => (
                      <button key={unit} type="button" role="radio" aria-checked={row.unit === unit} onClick={() => update(row.key, { unit })} className={cn("h-9 rounded-full px-3 text-sm font-bold", row.unit === unit ? "bg-card shadow-sm" : "text-muted-foreground")}>
                        {unit}
                      </button>
                    ))}
                  </div>
                  <Input value={row.total} onChange={(event) => update(row.key, { total: event.target.value })} inputMode="decimal" aria-label="Razem, zł" placeholder="zł" className="w-24" />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  {row.discountGrosz > 0 ? <span className="text-muted-foreground">rabat −{zl(row.discountGrosz)} zł</span> : null}
                  {row.deposit ? <span className="text-muted-foreground">kaucja, nie jedzenie</span> : null}
                  <Input value={row.gtin} onChange={(event) => update(row.key, { gtin: event.target.value })} inputMode="numeric" placeholder="EAN (opcjonalnie)" aria-label="Kod EAN" className="h-9 w-40 text-xs" />
                  {!row.deposit ? (
                    <label className="flex items-center gap-1.5 font-semibold">
                      <input type="checkbox" checked={row.share} onChange={(event) => update(row.key, { share: event.target.checked })} className="size-4" />
                      udostępnij anonimowo
                    </label>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
          {unread.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Nieodczytane linie z kwotą ({unread.length}): {unread.slice(0, 3).join(" | ")}
              {unread.length > 3 ? " …" : ""}. Dodaj je ręcznie, jeśli to produkty.
            </p>
          ) : null}
          <p className="text-sm">
            Razem pozycje: <span className="font-bold">{formatGrosz(sum)}</span>
            {printedTotal !== null ? (
              <span className={cn(Math.abs(sum - printedTotal) <= 1 ? "text-accent" : "text-destructive")}>
                {" "}
                · na paragonie {formatGrosz(printedTotal)}
                {Math.abs(sum - printedTotal) <= 1 ? ", zgadza się" : ", nie zgadza się: sprawdź pozycje"}
              </span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            Zapisujesz prywatnie: ceny trafią do Twojej historii. Udostępnione pozycje czekają w kolejce na Twój eksport:
            tylko sieć, miasto, dzień, produkt i cena.
          </p>
          <Button type="button" onClick={save} disabled={saving || valid.length === 0}>
            {saving ? "Zapisuję…" : `Zapisz prywatnie (${valid.length})`}
          </Button>
        </>
      ) : null}
      {result ? (
        <p className={result.ok ? "text-sm text-accent" : "text-sm text-destructive"}>
          {result.ok ? "Zapisane. Ceny są w Twojej historii." : result.message}
        </p>
      ) : null}
    </Card>
  );
}
