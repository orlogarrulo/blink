export type Process = "serigrafia" | "iml" | "digital";

export type Area = {
  w: number;
  h: number;
  /** Free band under the rim in mm (full cover only); otherwise taken from the mould ratio. */
  rim?: number;
  /** Print all the way round and down to the base. */
  full?: boolean;
};

/** Rim lip left unprinted when the print covers the whole cup. */
export const FULL_COVER_RIM_MM = 4;

/** Whole-cup print: around the circumference at mid height, from the base to just under the rim. */
const fullAreaCache = new Map<string, Area>();

export function fullArea(cup: Cup): Area {
  const cached = fullAreaCache.get(cup.id);
  if (cached) return cached;
  const area = computeFullArea(cup);
  fullAreaCache.set(cup.id, area);
  return area;
}

function computeFullArea(cup: Cup): Area {
  const h = Math.max(10, cup.height - FULL_COVER_RIM_MM);
  const rMid = cup.top / 2 - ((cup.top - cup.bot) / 2) * ((FULL_COVER_RIM_MM + h / 2) / cup.height);
  return { w: Math.round(2 * Math.PI * rMid * 10) / 10, h, rim: FULL_COVER_RIM_MM, full: true };
}

export type PriceTier = { qty: number; kz: number };

export type Cup = {
  id: string;
  name: string;
  cl: number;
  useful: number;
  /** Body, millimetres, from re-uz.com. ECO20 is not published there. */
  top: number;
  bot: number;
  height: number;
  measured: boolean;
  screen: Area | null;
  iml: Area | null;
  digital: Area | null;
  prices: PriceTier[];
};

const tier = (rows: [number, number][]): PriceTier[] => rows.map(([qty, kz]) => ({ qty, kz }));

/**
 * Print windows are width-around × height. Where re-uz.com publishes a size it is used (URL on each cup);
 * otherwise they come from Instruções de impressão v12-2025.
 * Capacities are from the 2025 PT catalogue. Prices are the IML client table (Kz).
 * Body sizes are the manufacturer figures (height, top Ø, bottom Ø). ECO20 is not on the public spec page.
 */
export const CUPS: Cup[] = [
  {
    id: "ECO12",
    name: "ECO12",
    cl: 12,
    useful: 9,
    top: 55,
    bot: 40,
    height: 70,
    measured: true,
    // re-uz.com/en/product/reusable-cup-10-cl-ecocup-eco12 (27/11/2026): IML 150 × 70 mm, serigrafia 130 × 50 mm (listed as 50 × 130).
    screen: { w: 130, h: 50 },
    iml: { w: 150, h: 70 },
    digital: null,
    prices: tier([
      [1500, 1756.1],
      [2000, 1515.7],
      [2500, 1424],
      [3000, 1352.84],
      [25000, 1026.54],
    ]),
  },
  {
    id: "ECO18",
    name: "ECO18",
    cl: 18,
    useful: 15,
    top: 58,
    bot: 42,
    height: 95,
    measured: true,
    // re-uz.com/en/product/reusable-cup-15-cl-ecocup-eco18 (27/11/2026): IML 170 × 90 mm, serigrafia 135 × 75 mm.
    screen: { w: 135, h: 75 },
    iml: { w: 170, h: 90 },
    digital: null,
    prices: tier([
      [1200, 1728.05],
      [1500, 1616.54],
      [2100, 1471.11],
      [3000, 1311.61],
      [25200, 1187.43],
    ]),
  },
  {
    id: "ECO20",
    name: "ECO20",
    cl: 19,
    useful: 17,
    top: 66,
    bot: 48,
    height: 100,
    measured: false,
    // Not sold on re-uz.com (no ECO20 page): sizes stay from Instruções de impressão v12-2025.
    screen: { w: 162, h: 66 },
    iml: { w: 160, h: 70 },
    digital: null,
    prices: tier([
      [1200, 2154.65],
      [1500, 1650.29],
      [2100, 1523.76],
      [3000, 1404.76],
      [25440, 1316.79],
    ]),
  },
  {
    id: "ECO28",
    name: "ECO28",
    cl: 28,
    useful: 25,
    top: 73,
    bot: 54,
    height: 104,
    measured: true,
    // re-uz.com/en/product/reusable-cup-25-cl-ecocup-eco28 (27/11/2026): IML 198 × 103 mm, serigrafia 185 × 81 mm; the digital figure there (72 × 199 mm) repeats ECO30's, so digital stays as before.
    screen: { w: 185, h: 81 },
    iml: { w: 198, h: 103 },
    digital: { w: 200, h: 96 },
    prices: tier([
      [1000, 1874.93],
      [1500, 1681.34],
      [2000, 1570.59],
      [3000, 1441.21],
      [25000, 1134],
    ]),
  },
  {
    id: "ECO30",
    name: "ECO30",
    cl: 34,
    useful: 32,
    top: 73,
    bot: 54,
    height: 117,
    measured: true,
    // re-uz.com/en/product/reusable-cup-33-cl-ecocup-eco30 (27/11/2026): IML 201 × 115 mm (listed as 115 × 201), digital 199 × 72 mm (listed as 72 × 199); no screen-print size published, serigrafia stays as before.
    screen: { w: 185, h: 78 },
    iml: { w: 201, h: 115 },
    digital: { w: 199, h: 72 },
    prices: tier([
      [1000, 1874.93],
      [1500, 1681.34],
      [2000, 1570.59],
      [3000, 1441.21],
      [25000, 1134],
    ]),
  },
  {
    id: "ECO40",
    name: "ECO40",
    cl: 40,
    useful: 35,
    top: 72,
    bot: 52,
    height: 140,
    measured: true,
    // re-uz.com/en/product/reusable-cup-40-cl-ecocup-eco40 (27/11/2026): IML 185 × 106 mm (listed as 106 × 185), serigrafia 185 × 106 mm.
    screen: { w: 185, h: 106 },
    iml: { w: 185, h: 106 },
    digital: null,
    prices: tier([
      [1200, 1922.45],
      [1600, 1789.56],
      [2000, 1700.19],
      [3200, 1559.03],
      [25000, 1283.04],
    ]),
  },
  {
    id: "ECO50",
    name: "ECO50",
    cl: 50,
    useful: 45,
    top: 80,
    bot: 56,
    height: 150,
    measured: true,
    // re-uz.com/en/product/reusable-cup-45-cl-ecocup-eco50 (27/11/2026): IML 216 × 150 mm, serigrafia 190 × 118 mm.
    screen: { w: 190, h: 118 },
    iml: { w: 216, h: 150 },
    digital: null,
    prices: tier([
      [1000, 2090.93],
      [1600, 1875.96],
      [2000, 1786.59],
      [3000, 1657.21],
      [25000, 1382.4],
    ]),
  },
  {
    id: "ECO60",
    name: "ECO60",
    cl: 60,
    useful: 55,
    top: 84,
    bot: 62,
    height: 162,
    measured: true,
    // re-uz.com/en/product/reusable-cup-50-cl-ecocup-eco60 (27/11/2026): IML 226 × 159 mm, serigrafia 220 × 113 mm.
    screen: { w: 220, h: 113 },
    iml: { w: 226, h: 159 },
    digital: { w: 226.8, h: 142 },
    prices: tier([
      [1200, 2138.45],
      [1500, 2026.94],
      [2100, 1903.11],
      [3000, 1786.81],
      [25000, 1513.62],
    ]),
  },
  {
    id: "ECO90",
    name: "ECO90",
    cl: 90,
    useful: 80,
    top: 106,
    bot: 85,
    height: 137,
    measured: true,
    // re-uz.com/en/product/reusable-cup-90-cl-ecocup-eco100 (27/11/2026): sold there as ECO100 (90 cl): IML 330 × 135 mm, serigrafia 309 × 138 mm (the window is capped to the body height).
    screen: { w: 309, h: 138 },
    iml: { w: 330, h: 135 },
    digital: null,
    prices: tier([
      [1000, 2507.81],
      [2000, 2142.29],
      [2200, 2048.91],
      [3000, 1944.49],
      [25000, 1730.16],
    ]),
  },
  {
    id: "MOJITO",
    name: "Mojito",
    cl: 35,
    useful: 30,
    top: 80,
    bot: 50,
    height: 120,
    measured: true,
    // re-uz.com/en/product/glass-a-cocktail-mojito-ecocup-ecomojito (27/11/2026): serigrafia 200 × 30 mm; no IML size published (screen print only there), IML stays as before.
    screen: { w: 200, h: 30 },
    iml: { w: 195, h: 85 },
    digital: null,
    prices: tier([
      [1200, 2535],
      [1500, 2457],
      [2000, 2160],
      [3000, 2000],
      [25000, 1989],
    ]),
  },
];

export function cupById(id: string): Cup {
  return CUPS.find((cup) => cup.id === id) ?? CUPS[5];
}

export function areaFor(cup: Cup, process: Process): Area | null {
  if (process === "iml") return cup.iml;
  if (process === "digital") return cup.digital;
  return cup.screen;
}

export function processesFor(cup: Cup): Process[] {
  const list: Process[] = [];
  if (cup.screen) list.push("serigrafia");
  if (cup.iml) list.push("iml");
  if (cup.digital) list.push("digital");
  return list;
}

export function priceFor(cup: Cup, qty: number): { tier: PriceTier; below: boolean } {
  const sorted = [...cup.prices].sort((a, b) => a.qty - b.qty);
  let chosen = sorted[0];
  for (const row of sorted) {
    if (qty >= row.qty) chosen = row;
  }
  return { tier: chosen, below: qty < sorted[0].qty };
}

export const PROCESS_LABEL: Record<Process, string> = {
  serigrafia: "Serigrafia",
  iml: "Quadricromia IML",
  digital: "Digital",
};

export function productionDays(process: Process): number {
  if (process === "iml") return 20;
  return 8;
}

export function freightMode(qty: number): "aéreo" | "marítimo" {
  return qty >= 9600 ? "marítimo" : "aéreo";
}

export function freightDays(qty: number): number {
  return qty >= 9600 ? 30 : 5;
}

export function addBusinessDays(from: Date, days: number): Date {
  const date = new Date(from);
  let left = days;
  while (left > 0) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) left -= 1;
  }
  return date;
}

export function deliveryDate(qty: number, process: Process, from = new Date()): Date {
  const made = addBusinessDays(from, productionDays(process));
  const date = new Date(made);
  date.setDate(date.getDate() + freightDays(qty));
  return date;
}

export function presence(useful: number): number {
  return 0.64 + 0.36 * Math.min(1, useful / 80);
}

export const HOUSE = [
  { name: "Urucum", hex: "#E4572E", note: "Bixa orellana, o corante quente da cozinha brasileira" },
  { name: "Ipê", hex: "#E6B325", note: "Amarelo do ipê, a flor que abre a estação seca" },
  { name: "Pitanga", hex: "#D63A3A", note: "Vermelho do fruto, doce e ácido" },
] as const;

export const STOCK = [
  { name: "100 C", hex: "#F4E500" },
  { name: "116 C", hex: "#FFCD00" },
  { name: "137 C", hex: "#FFA300" },
  { name: "021 C", hex: "#FE5000" },
  { name: "Warm Red C", hex: "#F9423A" },
  { name: "485 C", hex: "#DA291C" },
  { name: "186 C", hex: "#C8102E" },
  { name: "167 C", hex: "#BE531C" },
  { name: "Verde 355 C", hex: "#009739" },
  { name: "Verde Claro", hex: "#00B14F" },
  { name: "Azul 280 C", hex: "#012169" },
  { name: "Azul Claro", hex: "#003399" },
  { name: "Black", hex: "#1A120C" },
  { name: "White", hex: "#F7F4EF" },
];
