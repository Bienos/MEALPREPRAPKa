/**
 * GS1 Polska eProdukty: GTIN verification and brand-owner data, available
 * by subscription. Not wired, on purpose: this deployment has no
 * subscription, and the API endpoint and its authentication are documented
 * to subscribers only. Nothing here calls GS1 or guesses an endpoint.
 *
 * To enable it: buy a tier that includes API access, put the key in
 * GS1_EPRODUKTY_API_KEY, implement `lookupGs1` against the documentation GS1
 * provides, record the licence terms in providers.ts ("granted" with the
 * contract reference), and only then let it run.
 */

export class Gs1NotConfiguredError extends Error {
  constructor() {
    super(
      "GS1 Polska eProdukty nie jest skonfigurowane: wymaga abonamentu z dostępem do API; adres i uwierzytelnienie podaje GS1 abonentom. Nic nie zostało wysłane.",
    );
    this.name = "Gs1NotConfiguredError";
  }
}

/** What is still missing before GS1 can be used, for the sources screen. */
export function gs1Missing(hasKey: boolean): string[] {
  return [
    ...(hasKey ? [] : ["klucz API (GS1_EPRODUKTY_API_KEY) z abonamentu eProdukty"]),
    "dokumentacja API od GS1 Polska (adres, uwierzytelnienie, limity)",
    "warunki licencji: czy dane można pokazywać w aplikacji",
  ];
}

/** Always refuses: see the file comment. */
export async function lookupGs1(gtin: string): Promise<never> {
  void gtin;
  throw new Gs1NotConfiguredError();
}
