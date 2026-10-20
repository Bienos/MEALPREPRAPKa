import "server-only";

import { unverifiedSourcesEnabled } from "@/lib/env";
import { authorizationFor, ingestionAllowed, providerById, type ProviderId } from "./providers";

/**
 * Whether this deployment reads a source now: the provider's authorization
 * (providers.ts) and, for unverified web sources, the owner's explicit choice
 * (GROCERY_UNVERIFIED_SOURCES). Every refresh asks this first.
 */
export function isSourceEnabled(id: ProviderId): boolean {
  const provider = providerById(id);
  if (!provider) return false;
  return ingestionAllowed(provider, { unverifiedSources: unverifiedSourcesEnabled() });
}

/** Why a source was not read, in Polish, for the refresh notes. */
export function disabledNote(id: ProviderId): string {
  const provider = providerById(id);
  const name = provider?.name ?? id;
  if (provider && authorizationFor(provider) === "not_configured") {
    return `${name}: wymaga umowy lub klucza, nie jest skonfigurowane.`;
  }
  return `${name}: wyłączone, brak potwierdzonej zgody na wykorzystanie danych (zob. Źródła danych).`;
}
