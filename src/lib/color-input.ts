export function clampChannel(value: number, max: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(max, Math.round(value)));
}

export function rgbToHex(r: number, g: number, b: number) {
  const hex = (n: number) => clampChannel(n, 255).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

export function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace("#", "").trim();
  const full = raw.length === 3 ? raw.split("").map((char) => char + char).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return [228, 87, 46];
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToCmyk(r: number, g: number, b: number) {
  const R = clampChannel(r, 255) / 255;
  const G = clampChannel(g, 255) / 255;
  const B = clampChannel(b, 255) / 255;
  const k = 1 - Math.max(R, G, B);
  if (k >= 0.999) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - R - k) / (1 - k)) * 100),
    m: Math.round(((1 - G - k) / (1 - k)) * 100),
    y: Math.round(((1 - B - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

export function cmykToRgb(c: number, m: number, y: number, k: number): [number, number, number] {
  const C = clampChannel(c, 100) / 100;
  const M = clampChannel(m, 100) / 100;
  const Y = clampChannel(y, 100) / 100;
  const K = clampChannel(k, 100) / 100;
  return [
    Math.round(255 * (1 - C) * (1 - K)),
    Math.round(255 * (1 - M) * (1 - K)),
    Math.round(255 * (1 - Y) * (1 - K)),
  ];
}

export function cmykToHex(c: number, m: number, y: number, k: number) {
  const [r, g, b] = cmykToRgb(c, m, y, k);
  return rgbToHex(r, g, b);
}

export function parseChannel(value: string, max: number): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return clampChannel(n, max);
}
