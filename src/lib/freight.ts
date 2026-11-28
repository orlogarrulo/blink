import { getKzPerEur } from "@/lib/money";

// Transporte aéreo do ECO40.
// Caixa: 400 copos, 14,3 kg, 59 × 36,7 × 29,6 cm.
// Peso taxável = maior entre o peso real, o volumétrico (cm/6000) e 19 kg.
// Tarifa TAP de referência: 7,50 €/kg. Sobretaxas fixas 50 € (combustível 40 + segurança 10).
// Taxa LIS–LAD 20 €. Direitos 30% e IVA 14% sobre a fatura de fábrica mais o transporte.
// Despachante 70 €. Câmbio da folha: 1147 Kz/€.
// A 4800 copos (12 caixas) a tabela deixa a simulação e usa o orçamento real Rangel: 1 846,70 €.

const PER_BOX = 400;
const BOX_KG = 14.3;
const LENGTH = 59;
const WIDTH = 36.7;
const HEIGHT = 29.6;
const RATE = 7.5;
const MIN_KG = 19;
const SURCHARGES = 50;
const AIRPORT = 20;
const BROKER = 70;
const DUTY = 0.3;
const VAT = 0.14;
/** Rate of the sheet; the live rate (editable in Gestão) comes from getKzPerEur(). */
export const SHEET_KZ_PER_EUR = 1147;
const REAL_12_BOXES_EUR = 1846.70188;

export type AirFreight = {
  boxes: number;
  realKg: number;
  volumeKg: number;
  chargeableKg: number;
  eur: number;
  kz: number;
  source: "simulacao" | "rangel";
};

export const BOX_CUPS = 400;

export function chargedQty(qty: number, _minimum: number, exactTiers: number[]): number {
  const asked = Math.max(0, Math.floor(qty) || 0);
  if (asked <= 0) return 0;
  if (exactTiers.includes(asked)) return asked;
  if (asked < BOX_CUPS) return BOX_CUPS;
  return asked;
}

function factoryEur(qty: number): number {
  if (qty >= 4800) return 0.3336;
  if (qty >= 2400) return 0.354;
  return 0.392;
}

export function airFreight(qty: number, scale = 1): AirFreight | null {
  if (qty <= 0) return null;
  const weight = scale > 0 ? scale : 1;
  const boxes = qty / PER_BOX;
  const realKg = boxes * BOX_KG * weight;
  const volumeKg = ((LENGTH * WIDTH * HEIGHT * boxes) / 6000) * weight;
  const chargeableKg = Math.max(realKg, volumeKg, MIN_KG);
  if (qty >= 4800 && Math.abs(weight - 1) < 0.001) {
    const eur = REAL_12_BOXES_EUR * (qty / 4800);
    return { boxes, realKg, volumeKg, chargeableKg, eur, kz: eur * getKzPerEur(), source: "rangel" };
  }
  const freight = chargeableKg * RATE;
  const transport = freight + SURCHARGES;
  const invoice = factoryEur(qty) * qty * weight;
  const duty = (invoice + transport) * DUTY;
  const vat = (invoice + transport + duty) * VAT;
  const eur = transport + AIRPORT + duty + vat + BROKER;
  return { boxes, realKg, volumeKg, chargeableKg, eur, kz: eur * getKzPerEur(), source: "simulacao" };
}

function coneVolume(top: number, bot: number, height: number) {
  const radius = top / 2;
  const foot = bot / 2;
  return (Math.PI * height * (radius * radius + radius * foot + foot * foot)) / 3;
}

export function cupWeightScale(cup: { top: number; bot: number; height: number }) {
  const eco = coneVolume(72, 52, 140);
  const own = coneVolume(cup.top, cup.bot, cup.height);
  return eco > 0 ? own / eco : 1;
}
