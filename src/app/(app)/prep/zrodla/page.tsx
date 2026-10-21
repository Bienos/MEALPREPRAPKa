import Link from "next/link";
import { ChevronLeft, ExternalLink } from "lucide-react";

import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { hasGs1Credentials, unverifiedSourcesEnabled } from "@/lib/env";
import { listPriceCounts, listProviderStates, listSyncRuns, type PriceCounts, type ProviderState, type SyncRun } from "@/lib/db/grocery";
import { isSourceEnabled } from "@/lib/grocery/policy";
import { APP_USE, AUTHORIZATION_LABELS, PROVIDERS, authorizationFor, type Provider } from "@/lib/grocery/providers";
import { gs1Missing } from "@/lib/grocery/providers/gs1";
import { RETAILERS } from "@/lib/grocery/retailers";
import { cn } from "@/lib/utils";
import { lookupBarcodeAction, syncOpenPricesAction } from "./actions";
import { BarcodeLookup, SyncOpenPrices } from "./source-tools";

export const dynamic = "force-dynamic";
// The Open Prices sync reads up to 30 pages one after another.
export const maxDuration = 60;

/** Diagnostics are best effort: before the grocery migration is applied the screen still explains the policy. */
async function safely<T>(load: () => Promise<T>, fallback: T): Promise<{ value: T; failed: boolean }> {
  try {
    return { value: await load(), failed: false };
  } catch (error) {
    console.error("[grocery] sources screen:", error);
    return { value: fallback, failed: true };
  }
}

const RUN_LABELS: Record<SyncRun["status"], string> = {
  running: "w toku",
  ok: "OK",
  partial: "częściowo",
  failed: "błąd",
  skipped: "pominięte",
};

/** "20.10, 06:02" in Warsaw time. */
function when(iso: string | null): string {
  if (!iso) return "nigdy";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function SourcesPage() {
  const [states, counts, runs] = await Promise.all([
    safely(listProviderStates, [] as ProviderState[]),
    safely(listPriceCounts, [] as PriceCounts[]),
    safely(() => listSyncRuns(15), [] as SyncRun[]),
  ]);
  const unverifiedOn = unverifiedSourcesEnabled();

  return (
    <>
      <Link
        href="/prep/zakupy"
        className="-ml-1 flex h-10 w-fit items-center gap-1 pr-2 font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-5" />
        Zakupy
      </Link>
      <PageHeader title="Źródła danych" subtitle="Skąd są ceny i produkty, na jakich zasadach, i czy działają" />

      <Card className="gap-2 p-4 text-sm">
        <p className="font-bold">Zasady</p>
        <p className="text-muted-foreground">
          Aplikacja jest prywatna ({APP_USE === "personal" ? "użytek osobisty, niekomercyjny" : "użytek komercyjny"}). Cena
          jest „zweryfikowana” tylko ze źródła, które pozwala jej używać. Źródła bez potwierdzonej zgody są{" "}
          <span className="font-semibold text-foreground">{unverifiedOn ? "włączone" : "wyłączone"}</span>
          {unverifiedOn
            ? " (GROCERY_UNVERIFIED_SOURCES=on): ich ceny są oznaczone jako niezweryfikowane i nie decydują o pełnym koszyku."
            : ". Włącza je zmienna GROCERY_UNVERIFIED_SOURCES=on, wyłącznie do użytku prywatnego; i tak nie decydują o pełnym koszyku."}
        </p>
        {states.failed ? (
          <p className="text-destructive">Brak tabel źródeł w bazie: zastosuj migrację 20261020120000_grocery_foundation.sql.</p>
        ) : null}
      </Card>

      <Card className="gap-3 p-4">
        <p className="font-bold">Open Prices (Polska)</p>
        <p className="text-sm text-muted-foreground">
          Ceny z paragonów i etykiet, które ludzie zgłaszają ze zdjęciem. To historia z konkretnych sklepów, nie
          dzisiejsza cena. Aplikacja bierze tylko złotówki i sklepy w Polsce.
        </p>
        <SyncOpenPrices onSync={syncOpenPricesAction} />
      </Card>

      <Card className="gap-3 p-4">
        <p className="font-bold">Sprawdź kod EAN</p>
        <p className="text-sm text-muted-foreground">Nazwa, marka, opakowanie i wartości odżywcze z Open Food Facts.</p>
        <BarcodeLookup onLookup={lookupBarcodeAction} />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-extrabold">Wszystkie źródła</h2>
        {PROVIDERS.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            enabled={isSourceEnabled(provider.id)}
            state={states.value.find((one) => one.id === provider.id) ?? null}
            counts={counts.value.find((one) => one.provider_id === provider.id) ?? null}
            gs1={provider.id === "gs1-eprodukty" ? gs1Missing(hasGs1Credentials()) : null}
          />
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-extrabold">Ostatnie synchronizacje</h2>
        {runs.value.length === 0 ? <p className="text-sm text-muted-foreground">Jeszcze żadnej.</p> : null}
        <ul className="flex flex-col gap-2">
          {runs.value.map((run) => (
            <li key={run.id} className="rounded-xl border bg-card px-4 py-3 text-sm">
              <p className="font-semibold">
                {PROVIDERS.find((one) => one.id === run.provider_id)?.name ?? run.provider_id} ·{" "}
                <span className={cn(run.status === "failed" && "text-destructive")}>{RUN_LABELS[run.status]}</span>
                <span className="font-normal text-muted-foreground"> · {when(run.started_at)}</span>
              </p>
              <p className="text-muted-foreground">
                pobrane {run.fetched} · zapisane {run.imported} · odrzucone {run.rejected} · powtórzone {run.duplicates}
              </p>
              {Object.keys(run.issues).length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {Object.entries(run.issues)
                    .map(([code, count]) => `${ISSUE_LABELS[code] ?? code}: ${count}`)
                    .join(" · ")}
                </p>
              ) : null}
              {run.error ? <p className="text-xs text-destructive">{run.error}</p> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2 pb-4">
        <h2 className="text-lg font-extrabold">Sieci</h2>
        <p className="text-sm text-muted-foreground">
          Sieci, które aplikacja zna. Obecność na liście nie znaczy, że mamy ich ceny.
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {RETAILERS.map((retailer) => {
            const sources = PROVIDERS.filter((provider) => provider.retailers.includes(retailer.id));
            return (
              <li key={retailer.id} className="flex flex-wrap gap-x-2 border-b py-2 last:border-0">
                <span className="font-semibold">{retailer.name}</span>
                <span className="text-muted-foreground">
                  {[
                    retailer.stores ? "sklepy" : null,
                    retailer.online ? "sklep internetowy" : null,
                    retailer.wholesale ? "hurt (karta klienta)" : null,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                  {" · "}
                  {sources.length > 0 ? sources.map((one) => one.name).join(", ") : "brak źródła cen"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

const ISSUE_LABELS: Record<string, string> = {
  currency: "inna waluta",
  not_poland: "spoza Polski",
  online: "sklep internetowy",
  duplicate: "duplikat",
  no_date: "bez daty",
  no_product: "bez produktu",
  invalid_price: "błędna cena",
  future_date: "data w przyszłości",
  unreadable: "nieczytelne",
  stale: "starsze niż 90 dni",
  expired: "po terminie",
  missing_evidence: "bez dowodu",
  unverified_provider: "źródło bez zgody",
  price_out_of_range: "cena poza zakresem",
  unit_price_out_of_range: "cena/kg poza zakresem",
  price_jump: "skok ceny",
  variant_mismatch: "inny wariant",
  impossible_unit: "zła jednostka",
  bad_pack: "złe opakowanie",
  broken_response: "zepsuta odpowiedź",
};

function ProviderCard({
  provider,
  enabled,
  state,
  counts,
  gs1,
}: {
  provider: Provider;
  enabled: boolean;
  state: ProviderState | null;
  counts: PriceCounts | null;
  gs1: string[] | null;
}) {
  const personal = authorizationFor(provider);
  const commercial = authorizationFor(provider, "commercial");
  return (
    <Card className="gap-2 p-4 text-sm">
      <div className="flex items-start gap-2">
        <p className="flex-1 font-bold">{provider.name}</p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-bold",
            enabled ? "bg-accent/15 text-accent" : "bg-muted text-muted-foreground",
          )}
        >
          {enabled ? "działa" : "wyłączone"}
        </span>
      </div>
      <p className="text-muted-foreground">{provider.access}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <dt className="text-muted-foreground">Zgoda (prywatnie)</dt>
        <dd className={cn("font-semibold", personal === "unverified" && "text-destructive")}>{AUTHORIZATION_LABELS[personal]}</dd>
        <dt className="text-muted-foreground">Komercyjnie</dt>
        <dd>{AUTHORIZATION_LABELS[commercial]}</dd>
        <dt className="text-muted-foreground">Licencja</dt>
        <dd>{provider.license ?? "brak informacji"}</dd>
        <dt className="text-muted-foreground">Odświeżanie</dt>
        <dd>{provider.refresh}</dd>
        <dt className="text-muted-foreground">Limity</dt>
        <dd>{provider.rateLimit}</dd>
        {counts ? (
          <>
            <dt className="text-muted-foreground">Ceny w bazie</dt>
            <dd>
              {counts.prices}, najnowsza {when(counts.newest)}
            </dd>
          </>
        ) : null}
        {state ? (
          <>
            <dt className="text-muted-foreground">Ostatnio OK</dt>
            <dd>{when(state.lastSuccessAt)}</dd>
          </>
        ) : null}
      </dl>
      {state?.lastError ? (
        <p className="text-xs text-destructive">
          Błąd {when(state.lastFailureAt)}: {state.lastError}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Podstawa ({provider.authorization.checked}): {provider.authorization.evidence}
      </p>
      {provider.limitations.length > 0 ? (
        <ul className="list-disc pl-5 text-xs text-muted-foreground">
          {provider.limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      ) : null}
      {gs1 ? (
        <p className="text-xs text-muted-foreground">Brakuje: {gs1.join("; ")}.</p>
      ) : null}
      {provider.docsUrl ? (
        <a href={provider.docsUrl} target="_blank" rel="noreferrer" className="inline-flex w-fit items-center gap-1 text-xs font-semibold text-primary">
          Dokumentacja
          <ExternalLink className="size-3" />
        </a>
      ) : null}
    </Card>
  );
}
