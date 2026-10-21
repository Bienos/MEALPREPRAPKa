/**
 * Can this price be used today, and how far can it be trusted? One
 * deterministic answer per price, with the reasons, so every number on the
 * screen can say why it is (or is not) counted. Pure, client-safe.
 *
 * Order of the checks, first failure wins:
 *  1. data: PLN, a positive whole number of grosz, a known provider;
 *  2. authorization: providers that need a contract never count;
 *  3. place: the shopping town and channel (shop or online delivery);
 *  4. availability and validity dates;
 *  5. conditions: loyalty or app prices only with that app enabled;
 *  6. age: a current offer turns historical after CURRENT_DAYS, anything
 *     expires after HISTORY_DAYS;
 *  7. trust: unverified sources stay "unverified", derived prices "estimated",
 *     a verified state needs a granted provider and evidence.
 *
 * Only "verified_current" and "published_promotion" may decide the cheapest
 * complete basket (`strict`). Historical, community, estimated and unverified
 * prices are shown, labelled, as a reference (`usable`).
 */

import { fold } from "../prices/match.ts";
import { addDays } from "../date.ts";
import { authorizationFor, grantsVerifiedPrices, providerById } from "./providers.ts";
import { LOYALTY_LABELS, RETAILER_LOYALTY, type LoyaltyProgram, type PriceFact } from "./types.ts";

export type EligibilityState =
  | "verified_current"
  | "published_promotion"
  | "historical"
  | "community"
  | "estimated"
  | "unverified"
  | "expired"
  | "unavailable"
  | "invalid";

export type Assessment = {
  state: EligibilityState;
  /** Shown and counted in the labelled reference totals. */
  usable: boolean;
  /** May decide the cheapest complete basket. */
  strict: boolean;
  /** Why, in Polish, most important first. */
  reasons: string[];
};

export type EligibilityContext = {
  /** YYYY-MM-DD in the app's timezone. */
  today: string;
  city: string;
  channel: "store" | "online" | "both";
  loyalty: readonly LoyaltyProgram[];
};

/** A current offer older than this is history, not today's price. */
export const CURRENT_DAYS = 3;
/** Anything older than this is not used at all. */
export const HISTORY_DAYS = 90;

export const STATE_LABELS: Record<EligibilityState, string> = {
  verified_current: "zweryfikowana, aktualna",
  published_promotion: "oferta opublikowana",
  historical: "historyczna",
  community: "ze społeczności",
  estimated: "szacunek",
  unverified: "źródło niezweryfikowane",
  expired: "nieaktualna",
  unavailable: "niedostępna",
  invalid: "błędna",
};

const USABLE = new Set<EligibilityState>([
  "verified_current",
  "published_promotion",
  "historical",
  "community",
  "estimated",
  "unverified",
]);
const STRICT = new Set<EligibilityState>(["verified_current", "published_promotion"]);

function result(state: EligibilityState, reasons: string[]): Assessment {
  return { state, usable: USABLE.has(state), strict: STRICT.has(state), reasons };
}

/** Whole days from one YYYY-MM-DD to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function sameTown(a: string, b: string): boolean {
  return fold(a).trim() === fold(b).trim();
}

export function assessPrice(fact: PriceFact, ctx: EligibilityContext): Assessment {
  // 1. Data
  if (fact.currency !== "PLN") return result("invalid", [`waluta ${fact.currency}, nie PLN`]);
  if (!Number.isInteger(fact.amountGrosz) || fact.amountGrosz <= 0) return result("invalid", ["cena nie jest dodatnią kwotą"]);
  if (fact.pack && !(fact.pack.amount > 0)) return result("invalid", ["opakowanie bez dodatniej ilości"]);
  const provider = fact.providerId ? providerById(fact.providerId) : null;
  if (!provider) return result("invalid", ["nieznane źródło"]);

  // 2. Authorization
  const authorization = authorizationFor(provider);
  if (authorization === "not_configured") return result("invalid", [`${provider.name}: brak umowy lub klucza`]);

  // 3. Place
  if (ctx.channel === "store" && fact.region.channel === "online") {
    return result("unavailable", ["sklep internetowy, a wybrane są zakupy w sklepie"]);
  }
  if (ctx.channel === "online" && fact.region.channel === "store") {
    return result("unavailable", ["cena w sklepie stacjonarnym, a wybrane są zakupy online"]);
  }
  if (fact.region.channel === "online") {
    const towns = fact.region.deliveryTowns;
    if (towns !== "all" && towns !== null && !towns.some((town) => sameTown(town, ctx.city))) {
      return result("unavailable", [`nie dowozi do: ${ctx.city}`]);
    }
  } else if (!fact.region.national && fact.region.city && !sameTown(fact.region.city, ctx.city)) {
    return result("unavailable", [`cena ze sklepu w innym mieście (${fact.region.city})`]);
  }

  // 4. Availability and dates
  if (fact.availability === "out_of_stock") return result("unavailable", ["brak na stanie"]);
  if (fact.validTo !== null && fact.validTo < ctx.today) return result("expired", [`ważna do ${dayLabel(fact.validTo)}`]);
  if (fact.validFrom !== null && fact.validFrom > ctx.today) {
    return result("unavailable", [`obowiązuje od ${dayLabel(fact.validFrom)}`]);
  }

  // 5. Conditions
  const program = fact.conditions.loyaltyProgram ?? (fact.conditions.appOnly && fact.retailer ? (RETAILER_LOYALTY[fact.retailer] ?? null) : null);
  if (program && !ctx.loyalty.includes(program)) {
    return result("unavailable", [`tylko z ${LOYALTY_LABELS[program]}, której nie masz w ustawieniach`]);
  }
  if (!program && fact.conditions.appOnly) return result("unavailable", ["wymaga aplikacji sklepu"]);
  if (fact.priceType === "clearance") return result("unavailable", ["przecena krótkiej daty: jednorazowa, nie cena z półki"]);

  // 6. Age
  const observed = fact.observedAt.slice(0, 10);
  const age = daysBetween(observed, ctx.today);
  if (age > HISTORY_DAYS) return result("expired", [`odczyt sprzed ${age} dni`]);
  const reasons: string[] = [];
  if (program) reasons.push(`z ${LOYALTY_LABELS[program]}`);
  if (fact.conditions.minQuantity > 1) reasons.push(`przy zakupie ${fact.conditions.minQuantity} szt.`);

  // 7. Trust
  if (authorization === "unverified") {
    return result("unverified", [`${provider.name}: brak potwierdzonej zgody na wykorzystanie`, ...reasons]);
  }
  if (fact.derived) return result("estimated", ["cena lub opakowanie wyliczone, nie odczytane", ...reasons]);

  switch (fact.kind) {
    case "current_offer": {
      if (age > CURRENT_DAYS) return result("historical", [`odczyt z ${dayLabel(observed)}`, ...reasons]);
      if (!fact.evidence?.url && !fact.evidence?.recordId) return result("estimated", ["brak dowodu źródła", ...reasons]);
      if (grantsVerifiedPrices(provider)) return result("verified_current", [`odczyt z ${dayLabel(observed)}`, ...reasons]);
      return result("historical", [`odczyt z ${dayLabel(observed)}`, ...reasons]);
    }
    case "published_promotion": {
      if (!fact.evidence?.url) return result("estimated", ["brak dowodu źródła", ...reasons]);
      if (fact.validTo === null) return result("estimated", ["oferta bez daty końca", ...reasons]);
      if (grantsVerifiedPrices(provider) || authorization === "user_provided") {
        return result("published_promotion", [`ważna do ${dayLabel(fact.validTo)}`, ...reasons]);
      }
      return result("historical", [`ważna do ${dayLabel(fact.validTo)}`, ...reasons]);
    }
    case "community":
      return result("community", [`zgłoszona ${dayLabel(observed)}`, ...reasons]);
    case "receipt":
      return result("historical", [`z paragonu z ${dayLabel(observed)}`, ...reasons]);
    case "manual":
      return result("historical", [`wpisana ${dayLabel(observed)}`, ...reasons]);
    case "historical":
      return result("historical", [`odczyt z ${dayLabel(observed)}`, ...reasons]);
  }
}

/** The day a current offer stops being "current", for the screen. */
export function currentUntil(observedAt: string): string {
  return addDays(observedAt.slice(0, 10), CURRENT_DAYS);
}

/** "25.10" */
function dayLabel(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}
