import { useSyncExternalStore } from "react";
import { BASE_CUPS, applyCatalog, type CatalogEdit, type Cup } from "@/lib/catalog";
import { DEFAULT_KZ_PER_EUR, getKzPerEur, setKzPerEur } from "@/lib/money";

/**
 * Gestão settings, kept on this device (localStorage "blink-gestao").
 * Shape v1: { v: 1, rate, edits: { [cupId]: { name?, prices?: [{ qty, eur }] } }, added: Cup[] }.
 * Euros are the single source; Kz = eur × rate everywhere (studio, ficha, PDF).
 * Nothing is wiped: an unreadable or missing value just falls back to the shipped catalogue.
 */
export type CatalogSettings = { v: 1; rate: number; edits: Record<string, CatalogEdit>; added: Cup[] };

const KEY = "blink-gestao";
const EMPTY: CatalogSettings = { v: 1, rate: DEFAULT_KZ_PER_EUR, edits: {}, added: [] };

let current: CatalogSettings = EMPTY;
let version = 0;
let loaded = false;
const listeners = new Set<() => void>();

function num(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function cleanRows(rows: unknown): { qty: number; eur: number }[] | undefined {
  if (!Array.isArray(rows)) return undefined;
  const out = rows
    .map((row) => ({ qty: Math.max(1, Math.round(num((row as { qty?: unknown })?.qty, 0))), eur: Math.max(0, num((row as { eur?: unknown })?.eur, -1)) }))
    .filter((row) => row.qty > 0 && row.eur >= 0);
  return out.length > 0 ? out : undefined;
}

function cleanArea(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const w = num((value as { w?: unknown }).w, 0);
  const h = num((value as { h?: unknown }).h, 0);
  return w > 0 && h > 0 ? { w, h } : null;
}

function parse(raw: string | null): CatalogSettings {
  if (!raw) return EMPTY;
  try {
    const data = JSON.parse(raw) as Partial<CatalogSettings>;
    const rate = num(data.rate, DEFAULT_KZ_PER_EUR);
    const edits: Record<string, CatalogEdit> = {};
    for (const [id, edit] of Object.entries(data.edits ?? {})) {
      if (!edit || typeof edit !== "object") continue;
      const name = typeof edit.name === "string" ? edit.name.slice(0, 40) : undefined;
      edits[id] = { name, prices: cleanRows(edit.prices) };
    }
    const added: Cup[] = [];
    for (const item of Array.isArray(data.added) ? data.added : []) {
      if (!item || typeof item.id !== "string" || BASE_CUPS.some((cup) => cup.id === item.id)) continue;
      const prices = cleanRows(item.prices) ?? [{ qty: 1000, eur: 1 }];
      const height = Math.max(30, num(item.height, 120));
      const top = Math.max(20, num(item.top, 75));
      const bot = Math.max(15, Math.min(top, num(item.bot, 55)));
      const iml = cleanArea(item.iml);
      const screen = cleanArea(item.screen);
      const digital = cleanArea(item.digital);
      if (!iml && !screen && !digital) continue;
      added.push({
        id: item.id.slice(0, 15),
        name: typeof item.name === "string" && item.name.trim() ? item.name.slice(0, 40) : item.id,
        cl: Math.max(1, num(item.cl, 30)),
        useful: Math.max(1, num(item.useful, num(item.cl, 30))),
        top,
        bot,
        height,
        measured: true,
        screen,
        iml,
        digital,
        prices: prices.map((row) => ({ qty: row.qty, eur: row.eur, kz: 0 })),
        custom: true,
      });
    }
    return { v: 1, rate: rate > 0 ? rate : DEFAULT_KZ_PER_EUR, edits, added };
  } catch {
    return EMPTY;
  }
}

function apply(next: CatalogSettings) {
  current = next;
  setKzPerEur(next.rate);
  applyCatalog(next.edits, next.added, getKzPerEur());
  version += 1;
  listeners.forEach((listener) => listener());
}

/** Read the saved Gestão settings once on this device and apply them. */
export function loadCatalog() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    apply(parse(localStorage.getItem(KEY)));
  } catch {
    apply(EMPTY);
  }
  window.addEventListener("storage", (event) => {
    if (event.key === KEY) apply(parse(event.newValue));
  });
}

export function catalogSettings(): CatalogSettings {
  return current;
}

/** Save and apply at once: every price on screen follows instantly. */
export function updateCatalog(change: (draft: CatalogSettings) => CatalogSettings) {
  const next = change(structuredClone(current));
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full or blocked: still apply for this session
  }
  apply(parse(JSON.stringify(next)));
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-render when Gestão changes (name, prices, rate), here or in another tab. */
export function useCatalogVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => 0);
}
