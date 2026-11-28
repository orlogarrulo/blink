export type Market = "KZ" | "EUR";

const EURO = new Set([
  "AT", "BE", "CY", "DE", "EE", "ES", "FI", "FR", "GR", "HR", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PT", "SI", "SK",
]);

const EURO_ZONES = new Set([
  "Europe/Amsterdam", "Europe/Andorra", "Europe/Athens", "Europe/Berlin", "Europe/Brussels", "Europe/Dublin",
  "Europe/Helsinki", "Europe/Lisbon", "Europe/Ljubljana", "Europe/Luxembourg", "Europe/Madrid", "Europe/Malta",
  "Europe/Monaco", "Europe/Paris", "Europe/Riga", "Europe/Rome", "Europe/Tallinn", "Europe/Vienna", "Europe/Vilnius",
  "Europe/Zagreb", "Atlantic/Azores", "Atlantic/Madeira", "Atlantic/Canary",
]);

/**
 * Default EUR → Kz rate: the rate of the IML price sheet and the freight simulation (1 € = 1147 Kz).
 * Prices are kept in euros (the single source); Kz is always euros × the current rate, so changing the
 * rate in Gestão moves every Kz figure at once.
 */
export const DEFAULT_KZ_PER_EUR = 1147;

let kzPerEur = DEFAULT_KZ_PER_EUR;

export function getKzPerEur(): number {
  return kzPerEur;
}

export function setKzPerEur(rate: number) {
  if (Number.isFinite(rate) && rate > 0) kzPerEur = rate;
}

/** Kept for older imports: the rate in force right now. */
export const KZ_PER_EUR = DEFAULT_KZ_PER_EUR;

export function detectMarket(): Market {
  const lang = typeof navigator === "undefined" ? "" : navigator.language || "";
  const region = lang.split("-")[1]?.toUpperCase() || "";
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  if (zone === "Africa/Luanda" || region === "AO") return "KZ";
  if (EURO.has(region) || EURO_ZONES.has(zone)) return "EUR";
  return "KZ";
}

const CURRENCY_KEY = "blink-moeda";

/** The currency picked on this device, or the one detected from the language/time zone. */
export function loadCurrency(): Market {
  try {
    const saved = localStorage.getItem(CURRENCY_KEY);
    if (saved === "KZ" || saved === "EUR") return saved;
  } catch {
    // no storage: fall back to detection
  }
  return detectMarket();
}

export function saveCurrency(market: Market) {
  try {
    localStorage.setItem(CURRENCY_KEY, market);
  } catch {
    // ignore
  }
}

export function dialForMarket(market: Market): string {
  return market === "EUR" ? "+351" : "+244";
}

const kzFormat = new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0, useGrouping: "always" } as unknown as Intl.NumberFormatOptions);
const eurFormat = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", useGrouping: "always" } as unknown as Intl.NumberFormatOptions);

/** 12 500 Kz */
export function formatKz(kz: number): string {
  return `${kzFormat.format(Math.round(kz))} Kz`;
}

/** 12,50 € (from euros) */
export function formatEur(eur: number): string {
  return eurFormat.format(eur);
}

/** An amount held in Kz (euros × rate), shown only in the chosen currency. */
export function money(kz: number, market: Market): string {
  return market === "EUR" ? formatEur(kz / kzPerEur) : formatKz(kz);
}

/** @deprecated two currencies side by side; kept for callers that still want both. */
export function pricePair(kz: number, market: Market): { primary: string; secondary: string } {
  const kwanza = formatKz(kz);
  const euro = formatEur(kz / kzPerEur);
  return market === "EUR" ? { primary: euro, secondary: kwanza } : { primary: kwanza, secondary: euro };
}
