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

export const KZ_PER_EUR = 1057;

export function detectMarket(): Market {
  const lang = typeof navigator === "undefined" ? "" : navigator.language || "";
  const region = lang.split("-")[1]?.toUpperCase() || "";
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  if (zone === "Africa/Luanda" || region === "AO") return "KZ";
  if (EURO.has(region) || EURO_ZONES.has(zone)) return "EUR";
  return "KZ";
}

export function dialForMarket(market: Market): string {
  return market === "EUR" ? "+351" : "+244";
}

function kzText(value: number): string {
  return `${new Intl.NumberFormat("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} Kz`;
}

function eurText(value: number): string {
  return new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(value / KZ_PER_EUR);
}

export function pricePair(kz: number, market: Market): { primary: string; secondary: string } {
  const kwanza = kzText(kz);
  const euro = eurText(kz);
  return market === "EUR" ? { primary: euro, secondary: kwanza } : { primary: kwanza, secondary: euro };
}
