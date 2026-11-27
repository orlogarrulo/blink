import { clampArtPlace, type ArtPlace } from "@/lib/art-place";
import { drawBlinkWordmark } from "@/lib/brand-mark";
import type { Area, Cup, Process } from "@/lib/catalog";
import { printWindow, setPrintMeta, type CupShape } from "@/lib/print-meta";
import { PROCESS_LABEL, freightMode, priceFor, productionDays, freightDays } from "@/lib/catalog";

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function cmyk(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((n) => n / 255);
  const k = 1 - Math.max(r, g, b);
  if (k > 0.999) return "0 / 0 / 0 / 100";
  const c = Math.round(((1 - r - k) / (1 - k)) * 100);
  const m = Math.round(((1 - g - k) / (1 - k)) * 100);
  const y = Math.round(((1 - b - k) / (1 - k)) * 100);
  return `${c} / ${m} / ${y} / ${Math.round(k * 100)}`;
}

export function nearest(rgb: [number, number, number], palette: string[]): string {
  let best = palette[0];
  let score = Infinity;
  for (const hex of palette) {
    const [r, g, b] = hexToRgb(hex);
    const d = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
    if (d < score) {
      score = d;
      best = hex;
    }
  }
  return best;
}

export function quantize(canvas: HTMLCanvasElement, palette: string[]) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx || palette.length === 0) return;
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  const inks = palette.map(hexToRgb);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    let best = 0;
    let score = Infinity;
    for (let k = 0; k < inks.length; k += 1) {
      const d = (inks[k][0] - data[i]) ** 2 + (inks[k][1] - data[i + 1]) ** 2 + (inks[k][2] - data[i + 2]) ** 2;
      if (d < score) {
        score = d;
        best = k;
      }
    }
    data[i] = inks[best][0];
    data[i + 1] = inks[best][1];
    data[i + 2] = inks[best][2];
    data[i + 3] = 255;
  }
  ctx.putImageData(frame, 0, 0);
}

function sourceSize(source: CanvasImageSource): [number, number] {
  if (source instanceof HTMLImageElement) return [source.naturalWidth || source.width, source.naturalHeight || source.height];
  if (source instanceof HTMLCanvasElement) return [source.width, source.height];
  if (source instanceof SVGImageElement) return [source.width.baseVal.value, source.height.baseVal.value];
  return [1, 1];
}

function drawFit(ctx: CanvasRenderingContext2D, source: CanvasImageSource, cx: number, cy: number, max: number) {
  const [iw, ih] = sourceSize(source);
  const scale = max / Math.max(iw, ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.drawImage(source, cx - dw / 2, cy - dh / 2, dw, dh);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const [iw, ih] = sourceSize(source);
  const scale = Math.max(w / Math.max(1, iw), h / Math.max(1, ih));
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(source, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}

export function composePattern(images: CanvasImageSource[]): HTMLCanvasElement {
  if (images.length === 1) {
    // One file: keep it at its own size and proportions so the tile stays sharp.
    const [iw, ih] = sourceSize(images[0]);
    const scale = Math.min(1, 4096 / Math.max(iw, ih));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(2, Math.round(iw * scale));
    canvas.height = Math.max(2, Math.round(ih * scale));
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(images[0], 0, 0, canvas.width, canvas.height);
    }
    return canvas;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 2000;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const band = canvas.height / Math.max(1, images.length);
  images.forEach((image, index) => drawCover(ctx, image, 0, index * band, canvas.width, band));
  return canvas;
}

export function composeLogos(images: CanvasImageSource[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1600;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  images.forEach((image, index) => {
    const x = ((index + 0.5) / images.length) * canvas.width;
    drawFit(ctx, image, x, 800, images.length === 1 ? 1280 : 720);
  });
  return canvas;
}

export function composeArts(images: CanvasImageSource[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 1600;
  const ctx = canvas.getContext("2d");
  if (!ctx || images.length === 0) return canvas;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const [logo, pattern, extra] = images;
  if (pattern) {
    const tile = 320;
    ctx.save();
    ctx.globalAlpha = 0.85;
    for (let y = 0; y < canvas.height; y += tile) {
      for (let x = 0; x < canvas.width; x += tile) ctx.drawImage(pattern, x + 8, y + 8, tile - 16, tile - 16);
    }
    ctx.restore();
  }
  if (logo) drawFit(ctx, logo, 800, pattern || extra ? 720 : 800, pattern || extra ? 980 : 1280);
  if (extra) drawFit(ctx, extra, 800, 1280, 380);
  return canvas;
}

export function paintLabel(options: {
  area: Area;
  ppm: number;
  image: CanvasImageSource | null;
  scale: number;
  shift: number;
  title: string;
  font?: string;
  ink: string;
  process: Process;
  suggest: boolean;
  palette: string[];
  inkCount: 1 | 2;
  fit?: "contain" | "cover" | "band" | "height";
  place?: "medida" | "cheio" | "margem" | "faixa" | "alto" | "chapado";
  pattern?: CanvasImageSource | null;
}): HTMLCanvasElement {
  const { area, ppm } = options;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(8, Math.round(area.w * ppm));
  canvas.height = Math.max(8, Math.round(area.h * ppm));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  if (options.process !== "serigrafia") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  if (options.pattern) drawCover(ctx, options.pattern, 0, 0, canvas.width, canvas.height);
  const title = options.title.trim();
  const place = options.place ?? "medida";
  const tune = {
    medida: { reserve: 0.26, gap: 0.04, weight: 0.42, lines: 2, stack: false },
    cheio: { reserve: 0.44, gap: 0.02, weight: 0.72, lines: 2, stack: false },
    margem: { reserve: 0.18, gap: 0.09, weight: 0.3, lines: 2, stack: false },
    faixa: { reserve: 0.16, gap: 0.03, weight: 0.82, lines: 1, stack: false },
    alto: { reserve: 0.64, gap: 0.02, weight: 0.16, lines: 8, stack: true },
    chapado: { reserve: 0.36, gap: 0.04, weight: 0.58, lines: 3, stack: false },
  }[place];
  const reserve = title && options.image ? Math.round(canvas.height * tune.reserve) : 0;
  const gap = Math.round(canvas.height * (title && options.image ? tune.gap : 0.05));
  if (options.image) {
    const source = options.image as HTMLImageElement;
    const iw = source.naturalWidth || source.width || canvas.width;
    const ih = source.naturalHeight || source.height || canvas.height;
    const fit = options.fit ?? "contain";
    const limitW = canvas.width * (place === "margem" ? 0.7 : 0.88);
    const limitH = Math.max(8, canvas.height - reserve - gap * 2);
    let placed = Math.min(limitW / iw, limitH / ih);
    // "Fill" and "height" grow the logo as far as the window allows, but never crop it.
    const maxW = canvas.width * 0.98;
    if (fit === "cover") placed = Math.min(maxW / iw, limitH / ih);
    if (fit === "height") placed = Math.min(limitH / ih, maxW / iw);
    if (fit === "band") placed = Math.min(limitW / iw, (limitH * 0.62) / ih);
    const basePlaced = Math.min(limitW / iw, limitH / ih);
    placed = Math.min(placed * options.scale, maxW / iw, (canvas.height - reserve) / ih);
    labelScales.set(canvas, Math.min(1, placed / Math.max(1e-6, basePlaced)));
    const dw = iw * placed;
    const dh = ih * placed;
    const y = Math.min(Math.max(0, gap + (limitH - dh) / 2 + options.shift), Math.max(0, canvas.height - reserve - dh));
    ctx.drawImage(source, (canvas.width - dw) / 2, y, dw, dh);
  }
  if (title) {
    const alone = !options.image;
    drawPhrase(ctx, title, options.font || "Outfit, sans-serif", options.ink, {
      x: canvas.width * (place === "margem" && alone ? 0.14 : 0.06),
      y: alone ? 0 : canvas.height - reserve,
      w: canvas.width * (place === "margem" && alone ? 0.72 : 0.88),
      h: alone ? canvas.height : reserve,
      weight: alone ? (place === "cheio" || place === "chapado" ? 0.34 : place === "margem" ? 0.12 : place === "faixa" ? 0.16 : place === "alto" ? 0.2 : 0.2) : tune.weight,
      lines: alone && place === "alto" ? 8 : alone && place === "faixa" ? 1 : alone && place === "cheio" ? 2 : tune.lines,
      stack: place === "alto",
    });
  }
  if (options.suggest) {
    const inks = options.process === "serigrafia" ? options.palette.slice(0, options.inkCount) : options.palette.slice(0, 4);
    quantize(canvas, inks);
  }
  isolateInk(canvas);
  if (options.pattern) {
    let cached: HTMLCanvasElement | null = null;
    stamps.set(canvas, () => (cached ??= paintLabel({ ...options, pattern: null })));
  }
  return canvas;
}

/** How big the logo is in a sample relative to "fit the window" (Com margem is smaller). */
const labelScales = new WeakMap<HTMLCanvasElement, number>();

/** Same label without the background pattern, for placing the logo over a tiled pattern. */
const stamps = new WeakMap<HTMLCanvasElement, () => HTMLCanvasElement>();

export function stampOf(label: HTMLCanvasElement): HTMLCanvasElement {
  return stamps.get(label)?.() ?? label;
}

function isolateInk(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  const w = canvas.width;
  const h = canvas.height;
  const total = w * h;
  // 1 = paper (clear, or white with no colour), worked out once per pixel.
  const paper = new Uint8Array(total);
  for (let p = 0, i = 0; p < total; p += 1, i += 4) {
    if (data[i + 3] < 16) {
      paper[p] = 1;
      continue;
    }
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const hi = r > g ? (r > b ? r : b) : g > b ? g : b;
    const lo = r < g ? (r < b ? r : b) : g < b ? g : b;
    if (r + g + b > 714 && hi - lo < 18) paper[p] = 1;
  }
  const seen = new Uint8Array(total);
  const stack = new Int32Array(total);
  let top = 0;
  const flood = (start: number, limit: number, clear: boolean, region: Int32Array | null) => {
    top = 0;
    stack[top++] = start;
    seen[start] = 1;
    let count = 0;
    while (top > 0) {
      const p = stack[--top];
      if (region && count < limit) region[count] = p;
      count += 1;
      if (clear) data[p * 4 + 3] = 0;
      const x = p % w;
      if (x > 0 && !seen[p - 1] && paper[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x + 1 < w && !seen[p + 1] && paper[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (p >= w && !seen[p - w] && paper[p - w]) { seen[p - w] = 1; stack[top++] = p - w; }
      if (p + w < total && !seen[p + w] && paper[p + w]) { seen[p + w] = 1; stack[top++] = p + w; }
    }
    return count;
  };
  // Paper reached from the border is background.
  for (let x = 0; x < w; x += 1) {
    if (paper[x] && !seen[x]) flood(x, 0, true, null);
    const q = (h - 1) * w + x;
    if (paper[q] && !seen[q]) flood(q, 0, true, null);
  }
  for (let y = 0; y < h; y += 1) {
    const q0 = y * w;
    const q1 = y * w + w - 1;
    if (paper[q0] && !seen[q0]) flood(q0, 0, true, null);
    if (paper[q1] && !seen[q1]) flood(q1, 0, true, null);
  }
  // Small closed paper areas (the inside of letters like o, b, g) are background too.
  const smallHole = Math.max(16, Math.round(total * 0.004));
  const region = new Int32Array(smallHole + 1);
  for (let p = 0; p < total; p += 1) {
    if (seen[p] || !paper[p]) continue;
    const count = flood(p, smallHole + 1, false, region);
    if (count <= smallHole) for (let k = 0; k < count; k += 1) data[region[k] * 4 + 3] = 0;
  }
  // Anti-aliased edges next to removed paper: take the white out of them (colour to alpha),
  // so a logo on a coloured cup has no pale outline.
  for (let p = 0; p < total; p += 1) {
    const i = p * 4;
    if (data[i + 3] < 16) continue;
    const x = p % w;
    const nearClear =
      (x > 0 && data[i - 4 + 3] === 0) || (x + 1 < w && data[i + 4 + 3] === 0) || (p >= w && data[i - w * 4 + 3] === 0) || (p + w < total && data[i + w * 4 + 3] === 0);
    if (!nearClear) continue;
    const a = Math.max(255 - data[i], 255 - data[i + 1], 255 - data[i + 2]) / 255;
    if (a <= 0.02) {
      data[i + 3] = 0;
      continue;
    }
    if (a >= 0.98) continue;
    for (let c = 0; c < 3; c += 1) data[i + c] = Math.max(0, Math.min(255, Math.round((data[i + c] - 255 * (1 - a)) / a)));
    data[i + 3] = Math.round(data[i + 3] * a);
  }
  let ink = 0;
  let lightInk = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    ink += 1;
    if ((data[i] + data[i + 1] + data[i + 2]) / 3 > 210) lightInk += 1;
  }
  ctx.putImageData(frame, 0, 0);
  if (ink > 12 && lightInk / ink > 0.6) {
    const halo = document.createElement("canvas");
    halo.width = w;
    halo.height = h;
    const pen = halo.getContext("2d");
    if (!pen) return;
    pen.drawImage(canvas, 0, 0);
    pen.globalCompositeOperation = "source-in";
    pen.fillStyle = "#6e6a66";
    pen.fillRect(0, 0, w, h);
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    const spread = Math.max(2, Math.round(w * 0.012));
    ctx.drawImage(halo, -spread, 0);
    ctx.drawImage(halo, spread, 0);
    ctx.drawImage(halo, 0, -spread);
    ctx.drawImage(halo, 0, spread);
    ctx.restore();
  }
}

function drawPhrase(
  ctx: CanvasRenderingContext2D,
  text: string,
  font: string,
  ink: string,
  box: { x: number; y: number; w: number; h: number; weight: number; lines: number; stack: boolean },
) {
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const words = box.stack ? text.split(/\s+/).filter(Boolean) : text.split(/\s+/);
  const maxW = box.w;
  let size = Math.round(box.h * box.weight);
  const linesFor = (px: number) => {
    ctx.font = `600 ${px}px ${font}`;
    if (box.stack) return words;
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxW && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  let lines = linesFor(size);
  const cap = Math.max(1, box.lines);
  const fits = (px: number, rows: string[]) => {
    ctx.font = `600 ${px}px ${font}`;
    const lineGap = px * (box.stack ? 1.12 : 1.2);
    const block = Math.max(px, (rows.length - 1) * lineGap + px);
    const wide = rows.some((line) => ctx.measureText(line).width > maxW);
    return { ok: rows.length <= cap && !wide && block <= box.h * 0.88, lineGap, block };
  };
  let laid = fits(size, lines);
  while (size > 12 && !laid.ok) {
    size -= 2;
    lines = linesFor(size);
    laid = fits(size, lines);
  }
  ctx.font = `600 ${size}px ${font}`;
  ctx.textBaseline = "top";
  const top = box.y + Math.max(0, (box.h - laid.block) / 2);
  lines.forEach((line, index) => ctx.fillText(line, box.x + box.w / 2, top + index * laid.lineGap));
}

export function dominantColors(source: HTMLCanvasElement, count: number): string[] {
  const sample = document.createElement("canvas");
  sample.width = 40;
  sample.height = Math.max(8, Math.round(40 * (source.height / Math.max(1, source.width))));
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(source, 0, 0, sample.width, sample.height);
  const frame = ctx.getImageData(0, 0, sample.width, sample.height).data;
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < frame.length; i += 4) {
    if (frame[i + 3] < 40) continue;
    const r = frame[i];
    const g = frame[i + 1];
    const b = frame[i + 2];
    if (r > 244 && g > 244 && b > 244) continue;
    const key = `${r >> 4},${g >> 4},${b >> 4}`;
    const bucket = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    bucket.n += 1;
    bucket.r += r;
    bucket.g += g;
    bucket.b += b;
    buckets.set(key, bucket);
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((bucket) => {
      const hex = (n: number) => Math.round(n / bucket.n).toString(16).padStart(2, "0");
      return `#${hex(bucket.r)}${hex(bucket.g)}${hex(bucket.b)}`;
    });
}

export function tintCanvas(source: HTMLCanvasElement, hex: string, process: Process): HTMLCanvasElement {
  const canvas = tintPixels(source, hex);
  const scaleOf = labelScales.get(source);
  if (scaleOf !== undefined) labelScales.set(canvas, scaleOf);
  if (canvas !== source && stamps.has(source)) {
    let cached: HTMLCanvasElement | null = null;
    stamps.set(canvas, () => (cached ??= tintPixels(stampOf(source), hex)));
  }
  void process;
  return canvas;
}

function tintPixels(source: HTMLCanvasElement, hex: string): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const [tr, tg, tb] = hexToRgb(hex);
  const data = frame.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha < 8) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Ink density from luminance (preserves anti-aliased edges cleanly)
    const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
    const ink = 1 - lum;
    data[i] = tr;
    data[i + 1] = tg;
    data[i + 2] = tb;
    // Soft white removal: only pure white becomes transparent, keep edges vivid
    const targetIsWhite = tr > 230 && tg > 230 && tb > 230;
    const isPureWhite = r > 245 && g > 245 && b > 245;
    if (!targetIsWhite && isPureWhite) {
      data[i + 3] = 0;
    } else {
      // Preserve more of the original alpha for vibrant colors
      const keep = Math.min(1, 0.35 + ink * 0.9);
      data[i + 3] = Math.round(alpha * keep);
    }
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

export function sheetCanvas(options: {
  event: string;
  promoter: string;
  email: string;
  phone: string;
  cup: Cup;
  process: Process;
  /** Print area actually used (e.g. the full 360° wrap); defaults to the cup's window for the process. */
  area?: { w: number; h: number; full?: boolean };
  qty: number;
  colors: { hex: string }[];
  label: HTMLCanvasElement;
  bodyColor?: string | null;
  delivery: string;
  eventDate: string;
  priceLine: string;
  freightNote?: string;
  extraRows?: [string, string][];
}): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#F6F0E6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  drawBlinkWordmark(ctx, 72, 48, 64, "#1A120C");
  ctx.font = "500 22px Outfit, sans-serif";
  ctx.fillStyle = "#7A6A5C";
  ctx.fillText("Ficha para a gráfica  ·  etiqueta IML / serigrafia / digital", 72, 148);
  ctx.fillStyle = "#1A120C";
  ctx.font = "600 36px Outfit, sans-serif";
  ctx.fillText((options.event || "Sem nome").slice(0, 42), 72, 220);
  ctx.font = "400 22px Outfit, sans-serif";
  ctx.fillStyle = "#7A6A5C";
  ctx.fillText(options.promoter || "Promotor", 72, 258);
  ctx.fillText(options.email || "Sem email", 72, 290);
  ctx.fillText(options.phone || "Sem telefone", 640, 290);

  const area = options.label;
  const maxW = 760;
  const maxH = 420;
  const scale = Math.min(maxW / area.width, maxH / area.height);
  const dw = area.width * scale;
  const dh = area.height * scale;
  const x = 72;
  const y = 340;
  ctx.strokeStyle = "#E4572E";
  ctx.lineWidth = 1;
  ctx.strokeRect(x - 18, y - 18, dw + 36, dh + 36);
  ctx.fillStyle = "#fffaf3";
  ctx.fillRect(x, y, dw, dh);
  if (options.bodyColor) {
    ctx.fillStyle = options.bodyColor;
    ctx.fillRect(x, y, dw, dh);
  }
  ctx.drawImage(area, x, y, dw, dh);
  const windowMm = options.area ?? (options.process === "iml" ? options.cup.iml : options.process === "digital" ? options.cup.digital : options.cup.screen);
  const safetyMm = options.process === "iml" ? 3 : 2;
  const margin = windowMm ? safetyMm * (dw / windowMm.w) : 8;
  ctx.strokeStyle = "#E6B325";
  ctx.setLineDash([6, 6]);
  ctx.strokeRect(x + margin, y + margin, Math.max(4, dw - margin * 2), Math.max(4, dh - margin * 2));
  ctx.setLineDash([]);

  ctx.fillStyle = "#1A120C";
  ctx.font = "500 18px Outfit, sans-serif";
  ctx.fillText(`Etiqueta desenrolada  ·  margem de segurança ${options.process === "iml" ? "3" : "2"} mm a tracejado`, 72, y + dh + 56);

  const { tier, below } = priceFor(options.cup, options.qty);
  const rows = [
    ["Modelo", `${options.cup.name}  ·  ${options.cup.cl} cl`],
    ["Processo", options.area?.full ? `${PROCESS_LABEL[options.process]}  ·  cobertura total 360°` : PROCESS_LABEL[options.process]],
    ...(windowMm ? [["Área de impressão", `${windowMm.w} × ${windowMm.h} mm`]] : []),
    ["Quantidade", `${options.qty} copos${below ? "  ·  abaixo do mínimo da tabela" : ""}`],
    ["Preço de tabela", options.priceLine],
    ["Produção estimada", `${productionDays(options.process)} dias úteis`],
    ["Frete", options.freightNote || `${freightMode(options.qty)}  ·  +${freightDays(options.qty)} dias`],
    ["Entrega estimada", options.delivery],
    ["Data do evento", options.eventDate || "—"],
  ];
  (options.extraRows || []).forEach((row) => rows.push(row));
  rows.forEach((row, index) => {
    const top = 860 + index * 52;
    ctx.fillStyle = "#fffaf3";
    ctx.fillRect(72, top, 1096, 44);
    ctx.fillStyle = "#7A6A5C";
    ctx.font = "500 16px Outfit, sans-serif";
    ctx.fillText(row[0], 92, top + 28);
    ctx.fillStyle = "#1A120C";
    ctx.font = "500 20px Outfit, sans-serif";
    ctx.fillText(row[1], 340, top + 28);
  });

  options.colors.forEach((color, index) => {
    const left = 72 + index * 360;
    ctx.fillStyle = color.hex;
    ctx.fillRect(left, 1320, 72, 72);
    ctx.fillStyle = "#1A120C";
    ctx.font = "500 18px Outfit, sans-serif";
    ctx.fillText(color.hex.toUpperCase(), left + 88, 1352);
    ctx.font = "400 18px Outfit, sans-serif";
    ctx.fillStyle = "#7A6A5C";
    ctx.fillText(cmyk(color.hex), left + 88, 1382);
  });

  ctx.fillStyle = "#7A6A5C";
  ctx.font = "400 16px Outfit, sans-serif";
  const notes = [
    "IML: 300 dpi mínimo, CMYK + Pantone. Textos em contorno (mín. 5 pt). Linhas positivas ≥ 0.15 mm. Camada White Ink se filme transparente. Sangria 2.5–5 mm. Zona segura 1.5–3 mm. Folga de costura vertical (sem sobreposição).",
    "Serigrafia: vetor, Pantone Solid Coated, sem gradiente. Linha mínima 0,35 mm (1 tinta) ou 0,60 mm (2 tintas).",
    "Digital: só ECO28, ECO30 e ECO60, a 300 dpi CMYK. O polipropileno fica translúcido onde não há tinta.",
    "Prazo é estimativa de estúdio: 8 dias úteis (serigrafia e digital) ou 20 (IML), mais o frete.",
  ];
  notes.forEach((line, index) => ctx.fillText(line, 72, 1520 + index * 32));
  return canvas;
}

export function angleSheet(rows: { name: string; labels: readonly string[]; shots: HTMLCanvasElement[] }[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1A120C";
  ctx.font = "600 28px Fraunces, serif";
  ctx.fillText("Estúdio", 48, 52);
  rows.slice(0, 2).forEach((row, rowIndex) => {
    const top = 78 + rowIndex * 830;
    ctx.fillStyle = "#6d6258";
    ctx.font = "500 16px Outfit, sans-serif";
    ctx.fillText(row.name, 48, top + 8);
    const gap = 16;
    const cellW = (1240 - 96 - gap * 2) / 3;
    const cellH = 760;
    row.shots.slice(0, 3).forEach((shot, index) => {
      const x = 48 + index * (cellW + gap);
      const y = top + 22;
      const photoH = cellH - 36;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, cellW, photoH);
      const scale = Math.min(cellW / shot.width, photoH / shot.height);
      const dw = shot.width * scale;
      const dh = shot.height * scale;
      ctx.drawImage(shot, x + (cellW - dw) / 2, y + (photoH - dh) / 2, dw, dh);
      ctx.fillStyle = "#1A120C";
      ctx.font = "500 15px Outfit, sans-serif";
      ctx.fillText(row.labels[index] || "", x, y + photoH + 22);
    });
  });
  return canvas;
}


export function techSheet(options: {
  cup: { name: string; top: number; bot: number; height: number };
  area: { w: number; h: number };
  process: string;
  label: HTMLCanvasElement | null;
  bodyColor?: string | null;
}): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Header
  ctx.fillStyle = "#1A120C";
  ctx.font = "700 48px Fraunces, serif";
  ctx.fillText(options.cup.name, 60, 80);
  ctx.font = "500 18px Outfit, sans-serif";
  ctx.fillStyle = "#7a6a5c";
  ctx.fillText(`Área de impressão: ${options.area.w} × ${options.area.h} mm  ·  ${options.process}`, 60, 115);

  // Print area box with measurements
  const boxX = 180;
  const boxY = 180;
  const boxW = 880;
  const boxH = boxW * (options.area.h / options.area.w);

  // Background color if set
  if (options.bodyColor) {
    ctx.fillStyle = options.bodyColor;
    ctx.fillRect(boxX, boxY, boxW, boxH);
  } else {
    ctx.fillStyle = "#fafaf9";
    ctx.fillRect(boxX, boxY, boxW, boxH);
  }

  // Draw the label/pattern
  if (options.label) {
    ctx.drawImage(options.label, boxX, boxY, boxW, boxH);
  }

  // Border
  ctx.strokeStyle = "#1A120C";
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // Width measurement (bottom)
  ctx.fillStyle = "#1A120C";
  ctx.font = "500 16px Outfit, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(`${options.area.w} mm`, boxX + boxW / 2, boxY + boxH + 30);
  ctx.beginPath();
  ctx.moveTo(boxX, boxY + boxH + 12);
  ctx.lineTo(boxX + boxW, boxY + boxH + 12);
  ctx.stroke();

  // Height measurement (left)
  ctx.save();
  ctx.translate(boxX - 40, boxY + boxH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(`${options.area.h} mm`, 0, 0);
  ctx.restore();

  // Cup specs
  ctx.textAlign = "left";
  ctx.font = "500 16px Outfit, sans-serif";
  ctx.fillStyle = "#1A120C";
  const specsY = boxY + boxH + 80;
  ctx.fillText(`Copo: boca ${options.cup.top} mm  ·  base ${options.cup.bot} mm  ·  altura ${options.cup.height} mm`, 60, specsY);
  ctx.fillText(`Zona segura: 1.5–3 mm (tracejado amarelo). Sangria: 2.5–5 mm (tracejado vermelho).`, 60, specsY + 28);
  ctx.fillText(`IML: sem sobreposição — folga de costura vertical. CMYK + Pantone. White Ink se transparente.`, 60, specsY + 52);

  // Safety margin (inside) - 3mm
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = "#e6b325";
  ctx.lineWidth = 1;
  const safetyMm = 2; // IML safe zone: 1.5–3 mm
  const safetyPx = safetyMm / options.area.w * boxW;
  ctx.strokeRect(boxX + safetyPx, boxY + safetyPx, boxW - safetyPx * 2, boxH - safetyPx * 2);
  ctx.setLineDash([]);

  // Bleed margin (outside) - 3mm beyond print area
  const bleedMm = 3; // IML bleed: 2.5–5 mm
  const bleedPx = bleedMm / options.area.w * boxW;
  ctx.setLineDash([3, 3]);
  ctx.strokeStyle = "#d63a3a";
  ctx.lineWidth = 1;
  ctx.strokeRect(boxX - bleedPx, boxY - bleedPx, boxW + bleedPx * 2, boxH + bleedPx * 2);
  ctx.setLineDash([]);

  // Bleed label
  ctx.fillStyle = "#d63a3a";
  ctx.font = "500 14px Outfit, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`Sangria: ${bleedMm} mm (tracejado vermelho)`, 60, specsY + 80);

  return canvas;
}

/** Bounding box of the cup in a still rendered on white (ignores the faint floor shadow). */
function cupBox(shot: HTMLCanvasElement) {
  const step = 2;
  const w = Math.floor(shot.width / step);
  const h = Math.floor(shot.height / step);
  const probe = document.createElement("canvas");
  probe.width = w;
  probe.height = h;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  if (!pctx) return { x: 0, y: 0, w: shot.width, h: shot.height };
  pctx.fillStyle = "#ffffff";
  pctx.fillRect(0, 0, w, h);
  pctx.drawImage(shot, 0, 0, w, h);
  const data = pctx.getImageData(0, 0, w, h).data;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  const minRun = Math.max(3, Math.round(w * 0.02));
  for (let y = 0; y < h; y += 1) {
    let count = 0;
    let rowMin = w;
    let rowMax = -1;
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      if (Math.min(data[i], data[i + 1], data[i + 2]) < 236) {
        count += 1;
        if (x < rowMin) rowMin = x;
        if (x > rowMax) rowMax = x;
      }
    }
    if (count < minRun) continue;
    minY = Math.min(minY, y);
    maxY = y;
    minX = Math.min(minX, rowMin);
    maxX = Math.max(maxX, rowMax);
  }
  if (maxX < 0) return { x: 0, y: 0, w: shot.width, h: shot.height };
  return { x: minX * step, y: minY * step, w: (maxX - minX + 1) * step, h: (maxY - minY + 1) * step };
}

/**
 * Page with the cup views side by side. Every cup is cropped to its own outline and drawn
 * at the same scale on the same top and bottom lines, so an upside-down view stays aligned;
 * the caption sits centred under each cup.
 */
export function viewsSheet(title: string, labels: readonly string[], shots: HTMLCanvasElement[], flips: readonly boolean[] = []): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1A120C";
  ctx.font = "600 28px Fraunces, serif";
  ctx.fillText(title, 48, 64);
  const frames = shots.slice(0, 3);
  const boxes = frames.map(cupBox);
  const gap = 36;
  const left = 56;
  const top = 200;
  const cellW = (canvas.width - left * 2 - gap * Math.max(0, frames.length - 1)) / Math.max(1, frames.length);
  const maxW = Math.max(1, ...boxes.map((box) => box.w));
  const maxH = Math.max(1, ...boxes.map((box) => box.h));
  // One scale for all, so every cup has the same size.
  const scale = Math.min((cellW * 0.92) / maxW, 980 / maxH);
  const cupH = maxH * scale;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  frames.forEach((shot, index) => {
    const box = boxes[index];
    const cx = left + index * (cellW + gap) + cellW / 2;
    const dw = box.w * scale;
    const dh = box.h * scale;
    const y = top + (cupH - dh) / 2;
    ctx.save();
    if (flips[index]) {
      ctx.translate(cx, y + dh / 2);
      ctx.rotate(Math.PI);
      ctx.drawImage(shot, box.x, box.y, box.w, box.h, -dw / 2, -dh / 2, dw, dh);
    } else {
      ctx.drawImage(shot, box.x, box.y, box.w, box.h, cx - dw / 2, y, dw, dh);
    }
    ctx.restore();
    ctx.fillStyle = "#1A120C";
    let size = 34;
    ctx.font = `600 ${size}px Outfit, sans-serif`;
    while (size > 20 && ctx.measureText(labels[index] || "").width > cellW - 8) {
      size -= 2;
      ctx.font = `600 ${size}px Outfit, sans-serif`;
    }
    ctx.fillText(labels[index] || "", cx, top + cupH + 36);
  });
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function openPdf(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, "_blank", "noopener");
  if (!opened) {
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.click();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function canvasPdf(input: HTMLCanvasElement | HTMLCanvasElement[]): Blob {
  const pages = Array.isArray(input) ? input : [input];
  const quality = 0.82;
  const pageW = 595.28;
  const pageH = 841.89;
  const encoder = new TextEncoder();
  const objects: Uint8Array[] = [];
  const push = (body: string | Uint8Array) => {
    objects.push(typeof body === "string" ? encoder.encode(body) : body);
  };
  const kids = pages.map((_, index) => `${3 + index * 3} 0 R`).join(" ");
  push("<< /Type /Catalog /Pages 2 0 R >>");
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${kids}] >>`);
  for (const canvas of pages) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const raw = atob(dataUrl.split(",")[1] || "");
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
    const imgW = pageW - 36;
    const imgH = (canvas.height / canvas.width) * imgW;
    const y = 18 + Math.max(0, (pageH - 36 - imgH) / 2);
    const content = ["q", `${imgW.toFixed(2)} 0 0 ${Math.min(imgH, pageH - 36).toFixed(2)} 18 ${y.toFixed(2)} cm`, "/Im0 Do", "Q"].join("\n");
    const pageNum = objects.length + 1;
    push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents ${pageNum + 1} 0 R /Resources << /XObject << /Im0 ${pageNum + 2} 0 R >> >> >>`,
    );
    push(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}\nendstream`);
    const imageHead = encoder.encode(
      `<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
    );
    const imageTail = encoder.encode("\nendstream");
    const image = new Uint8Array(imageHead.length + bytes.length + imageTail.length);
    image.set(imageHead, 0);
    image.set(bytes, imageHead.length);
    image.set(imageTail, imageHead.length + bytes.length);
    objects.push(image);
  }

  const chunks: Uint8Array[] = [encoder.encode("%PDF-1.4\n")];
  const offsets: number[] = [0];
  let cursor = chunks[0].length;
  objects.forEach((object, index) => {
    offsets.push(cursor);
    const head = encoder.encode(`${index + 1} 0 obj\n`);
    const foot = encoder.encode("\nendobj\n");
    chunks.push(head, object, foot);
    cursor += head.length + object.length + foot.length;
  });
  const xrefAt = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i += 1) xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  chunks.push(encoder.encode(xref));
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Blob([merged], { type: "application/pdf" });
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function knockWhite(source: HTMLCanvasElement | null): HTMLCanvasElement | null {
  if (!source) return null;
  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d", { willReadFrequently: true });
  if (!ctx) return source;
  ctx.drawImage(source, 0, 0);
  const frame = ctx.getImageData(0, 0, out.width, out.height);
  const data = frame.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > 246 && data[i + 1] > 246 && data[i + 2] > 246) data[i + 3] = 0;
  }
  ctx.putImageData(frame, 0, 0);
  return out;
}

type WrapOptions = { cup: CupShape; area: Area; /** Pixels per mm (12 for previews, lower for thumbnails). */ ppm?: number; place?: ArtPlace };

const wrapCache = new WeakMap<object, Map<string, HTMLCanvasElement | null>>();
const NO_SOURCE = {};

function inkBoxOf(image: HTMLCanvasElement) {
  const read = image.getContext("2d", { willReadFrequently: true });
  if (!read || image.width < 2 || image.height < 2) return null;
  const data = read.getImageData(0, 0, image.width, image.height).data;
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y0 = 0; y0 < image.height; y0 += 2) {
    for (let x0 = 0; x0 < image.width; x0 += 2) {
      if (data[(y0 * image.width + x0) * 4 + 3] <= 24) continue;
      if (x0 < minX) minX = x0;
      if (y0 < minY) minY = y0;
      if (x0 > maxX) maxX = x0;
      if (y0 > maxY) maxY = y0;
    }
  }
  if (maxX < 0) return null;
  return { x: minX, y: minY, w: Math.min(image.width - minX, maxX - minX + 2), h: Math.min(image.height - minY, maxY - minY + 2) };
}

/**
 * Compose the print exactly as it sits in the mould window: the canvas is the
 * print area in millimetres (12 px/mm), the pattern tiles across it and the
 * logo is placed twice, once facing the viewer and once on the back.
 * The canvas carries its mould geometry (printMetaOf) for the 3D view.
 * Without `options` the old full-circumference layout is kept.
 */
export function wrapPrint(source: HTMLCanvasElement | null, motif: HTMLCanvasElement | null, spanCover = 0.6, options?: WrapOptions): HTMLCanvasElement | null {
  if (!source && !motif) return null;
  const place = options?.place;
  const key = options
    ? `${options.cup.top}/${options.cup.bot}/${options.cup.height}/${options.area.w}/${options.area.h}/${options.area.rim ?? ""}/${options.area.full ? 1 : 0}/${options.ppm ?? 12}/${place?.yaw ?? 0}/${place?.lift ?? 0}/${place?.scale ?? 1}`
    : `legacy/${spanCover}`;
  const outer = (source ?? NO_SOURCE) as object;
  let byMotif = wrapCache.get(outer);
  if (!byMotif) {
    byMotif = new Map();
    wrapCache.set(outer, byMotif);
  }
  const motifKey = motif ? motifIds.get(motif) ?? motifIds.set(motif, `m${motifIds.size + 1}${Math.random().toString(36).slice(2, 6)}`).get(motif)! : "none";
  const cacheKey = `${motifKey}|${key}`;
  if (byMotif.has(cacheKey)) return byMotif.get(cacheKey) ?? null;
  const out = options ? composeMouldPrint(source, motif, options) : legacyWrap(source, motif, spanCover);
  byMotif.set(cacheKey, out);
  if (byMotif.size > 12) {
    const first = byMotif.keys().next().value;
    if (first !== undefined) byMotif.delete(first);
  }
  return out;
}

const motifIds = new Map<HTMLCanvasElement, string>();

/** Do the tile's opposite edges match (a seamless tile)? */
function edgeMatch(image: HTMLCanvasElement): { x: boolean; y: boolean } {
  const w = Math.min(256, image.width);
  const h = Math.min(256, image.height);
  const probe = document.createElement("canvas");
  probe.width = w;
  probe.height = h;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  if (!pctx) return { x: true, y: true };
  pctx.drawImage(image, 0, 0, w, h);
  const data = pctx.getImageData(0, 0, w, h).data;
  const lum = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return (data[i] * 0.3 + data[i + 1] * 0.59 + data[i + 2] * 0.11) * (data[i + 3] / 255);
  };
  let dx = 0;
  for (let y = 0; y < h; y += 1) dx += Math.abs(lum(0, y) - lum(w - 1, y));
  let dy = 0;
  for (let x = 0; x < w; x += 1) dy += Math.abs(lum(x, 0) - lum(x, h - 1));
  return { x: dx / h / 255 < 0.12, y: dy / w / 255 < 0.12 };
}

/**
 * Is this "pattern" really a logo (a mark on an empty background) rather than a texture?
 * A logo is never tiled: it is placed twice round the cup like a logo.
 */
const logoLikeCache = new WeakMap<HTMLCanvasElement, boolean>();
export function isLogoLike(image: HTMLCanvasElement): boolean {
  const known = logoLikeCache.get(image);
  if (known !== undefined) return known;
  const w = Math.min(200, image.width);
  const h = Math.max(2, Math.round(w * (image.height / Math.max(1, image.width))));
  const probe = document.createElement("canvas");
  probe.width = w;
  probe.height = h;
  const pctx = probe.getContext("2d", { willReadFrequently: true });
  let result = false;
  if (pctx) {
    pctx.drawImage(image, 0, 0, w, h);
    const data = pctx.getImageData(0, 0, w, h).data;
    const empty = (x: number, y: number) => {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 24) return true;
      const light = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const chroma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      return light > 236 && chroma < 20;
    };
    let border = 0;
    let borderEmpty = 0;
    let filled = 0;
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const e = empty(x, y);
        if (!e) filled += 1;
        if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) {
          border += 1;
          if (e) borderEmpty += 1;
        }
      }
    }
    result = borderEmpty / Math.max(1, border) > 0.85 && filled / (w * h) < 0.6;
  }
  logoLikeCache.set(image, result);
  return result;
}

/** Transparent copy of a logo-like image: white paper around the mark removed. */
function logoStamp(image: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return image;
  ctx.drawImage(image, 0, 0);
  isolateInk(canvas);
  return canvas;
}

/**
 * Size of one logo copy (mm). Two copies sit at 0° and 180°, so each gets half the way round;
 * on a short window the seam gap takes part of one half. A copy is always shrunk to fit, never cropped.
 */
function copySize(wMm: number, hMm: number, slotMm: number, bandH: number, share: number) {
  const fit = Math.min(slotMm * share / Math.max(0.01, wMm), (bandH * 0.82) / Math.max(0.01, hMm));
  return { w: wMm * fit, h: hMm * fit };
}

function composeMouldPrint(source: HTMLCanvasElement | null, motif: HTMLCanvasElement | null, options: WrapOptions): HTMLCanvasElement | null {
  // A logo uploaded as a "pattern" is placed like a logo, not tiled.
  const motifLogo = motif && isLogoLike(motif) ? logoStamp(motif) : null;
  const texture = motifLogo ? null : motif;
  // A texture always runs all the way round so its two edges meet.
  const win = printWindow(options.cup, options.area, Boolean(texture));
  const ppmMax = options.ppm ?? 12;
  let ppm = Math.min(ppmMax, 4096 / win.widthMm, 4096 / win.bandH);
  let H = Math.max(8, Math.round(win.bandH * ppm));
  let W = Math.max(8, Math.round(win.widthMm * ppm));

  // Pattern tile: a whole number of repeats around the cup and down the band, in whole pixels,
  // so the seam at the back is invisible.
  let seam = { x: true, y: true };
  let tileW = 0;
  let tileH = 0;
  let cols = 0;
  if (texture) {
    const aspect = Math.max(1, texture.width) / Math.max(1, texture.height);
    const rows = Math.max(1, Math.round(win.bandH / Math.min(win.bandH, Math.max(30, win.bandH * 0.5))));
    const wantH = win.bandH / rows;
    cols = Math.max(2, Math.round(win.widthMm / (wantH * aspect)));
    seam = edgeMatch(texture);
    // A tile whose sides do not match is mirrored every other repeat, so every join is continuous;
    // that needs an even number of repeats around the cup.
    if (!seam.x && cols % 2 === 1) cols += 1;
    tileW = Math.max(4, Math.round(W / cols));
    W = tileW * cols;
    ppm = W / win.widthMm;
    tileH = Math.max(4, Math.round(tileW / aspect));
    H = Math.max(8, Math.round(win.bandH * ppm));
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  if (texture) {
    // One exact tile, then repeat it with a pattern fill: no overlaps, no gaps.
    const tile = document.createElement("canvas");
    tile.width = tileW;
    tile.height = tileH;
    const tctx = tile.getContext("2d");
    if (tctx) {
      tctx.imageSmoothingEnabled = true;
      tctx.imageSmoothingQuality = "high";
      tctx.drawImage(texture, 0, 0, tileW, tileH);
      let unit: HTMLCanvasElement = tile;
      if (!seam.x || !seam.y) {
        unit = document.createElement("canvas");
        unit.width = tileW * (seam.x ? 1 : 2);
        unit.height = tileH * (seam.y ? 1 : 2);
        const uctx = unit.getContext("2d");
        if (uctx) {
          for (let ix = 0; ix < (seam.x ? 1 : 2); ix += 1) {
            for (let iy = 0; iy < (seam.y ? 1 : 2); iy += 1) {
              uctx.save();
              uctx.translate(ix ? tileW * 2 : 0, iy ? tileH * 2 : 0);
              uctx.scale(ix ? -1 : 1, iy ? -1 : 1);
              uctx.drawImage(tile, 0, 0);
              uctx.restore();
            }
          }
        }
      }
      const fill = ctx.createPattern(unit, "repeat");
      if (fill) {
        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  // Copies around the cup: the logo at 0° and 180°; a logo given as the pattern takes
  // those places when it is alone, or the two sides when there is also a logo.
  const logoSource = source ? (motif ? stampOf(source) : source) : null;
  const box = logoSource ? inkBoxOf(logoSource) : null;
  const mbox = motifLogo ? inkBoxOf(motifLogo) : null;
  const TAU = Math.PI * 2;
  const angDist = (p: number, q: number) => Math.abs(((((p - q) % TAU) + TAU + Math.PI) % TAU) - Math.PI);
  const art = clampArtPlace(options.place);
  const logoAngles = logoSource && box ? [art.yaw, art.yaw + Math.PI] : [];
  const motifAngles = motifLogo && mbox ? (logoAngles.length ? [art.yaw + Math.PI / 2, art.yaw + (3 * Math.PI) / 2] : [art.yaw, art.yaw + Math.PI]) : [];
  const centres = [...logoAngles, ...motifAngles].sort((p, q) => p - q);

  // A short window (serigrafia) leaves a seam gap. It goes between two copies (on the left
  // side, never across a copy), so every copy is whole; the canvas starts just after it.
  const gapAngle = win.full ? 0 : Math.max(0, TAU - win.span);
  let gapCentre = (3 * Math.PI) / 2;
  if (gapAngle > 0 && centres.length > 1) {
    let best = -1;
    centres.forEach((c, i) => {
      const next = i + 1 < centres.length ? centres[i + 1] : centres[0] + TAU;
      const span = next - c;
      const mid = c + span / 2;
      // Prefer the widest interval, then the one nearest the left side.
      const score = span * 10 - angDist(mid, (3 * Math.PI) / 2);
      if (score > best) {
        best = score;
        gapCentre = mid % TAU;
      }
    });
  }
  const start = win.full ? -Math.PI : gapCentre + gapAngle / 2;
  const xAt = (angle: number) => {
    let d = (angle - start) % TAU;
    if (d < 0) d += TAU;
    return (d / win.span) * W;
  };
  // Half the free angle on either side of a copy (to the next copy, or to the seam gap).
  const roomAt = (angle: number) => {
    if (centres.length < 2) return Math.PI - gapAngle / 2;
    let room = Math.PI;
    for (const other of centres) {
      if (other === angle) continue;
      for (const dir of [1, -1]) {
        let delta = ((other - angle) * dir) % TAU;
        if (delta <= 0) delta += TAU;
        const mid = angle + (dir * delta) / 2;
        const gapInside = gapAngle > 0 && angDist(mid, gapCentre) < 1e-6;
        room = Math.min(room, (delta - (gapInside ? gapAngle : 0)) / 2);
      }
    }
    return room;
  };

  type Stamp = { image: HTMLCanvasElement; box: { x: number; y: number; w: number; h: number }; wMm: number; hMm: number; plate: number };
  const place = (stamp: Stamp, angles: number[]) => {
    const dw = stamp.wMm * ppm;
    const dh = stamp.hMm * ppm;
    const pad = stamp.plate * ppm;
    const maxLiftPx = Math.max(0, (H - dh) / 2 - 1);
    const cy = H / 2 - Math.max(-maxLiftPx, Math.min(maxLiftPx, art.lift * ppm));
    const draw = (cx: number) => {
      if (pad > 0) {
        ctx.save();
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, cx - dw / 2 - pad, cy - dh / 2 - pad, dw + pad * 2, dh + pad * 2, pad * 1.4);
        ctx.fill();
        ctx.restore();
      }
      ctx.drawImage(stamp.image, stamp.box.x, stamp.box.y, stamp.box.w, stamp.box.h, cx - dw / 2, cy - dh / 2, dw, dh);
    };
    for (const angle of angles) {
      const cx = xAt(angle);
      draw(cx);
      // On a full wrap a copy that crosses the canvas edge continues on the other side.
      if (win.full) {
        if (cx - dw / 2 - pad < 0) draw(cx + W);
        if (cx + dw / 2 + pad > W) draw(cx - W);
      }
    }
  };
  const slotFor = (angles: number[]) => Math.max(4, Math.min(...angles.map(roomAt)) * 2 * win.rMid - 3);

  // The logo/phrase: two copies, front and back, together almost all the way round
  // (each up to 45% of the circumference, limited by the print height).
  if (logoSource && box) {
    const rel = Math.max(0.4, labelScales.get(source as HTMLCanvasElement) ?? 1);
    const share = (texture ? 0.4 : win.full ? 0.9 : 0.96) * rel;
    const plateK = texture ? 0.12 : 0;
    const size0 = copySize(box.w, box.h, slotFor(logoAngles) / (1 + plateK * 2), win.bandH / (1 + plateK * 2), share);
    const fitted = clampArtPlace(art, win.bandH, size0.h);
    const size = { w: size0.w * fitted.scale, h: size0.h * fitted.scale };
    place({ image: logoSource, box, wMm: size.w, hMm: size.h, plate: texture ? Math.max(2, Math.min(size.w, size.h) * plateK) : 0 }, logoAngles);
  }
  if (motifLogo && mbox) {
    const size0 = copySize(mbox.w, mbox.h, slotFor(motifAngles), win.bandH, win.full ? 0.9 : 0.96);
    const fitted = clampArtPlace(art, win.bandH, size0.h);
    const size = { w: size0.w * fitted.scale, h: size0.h * fitted.scale };
    place({ image: motifLogo, box: mbox, wMm: size.w, hMm: size.h, plate: 0 }, motifAngles);
  }

  setPrintMeta(canvas, { band0: win.band0, bandH: win.bandH, span: win.span, start, full: win.full, widthMm: win.widthMm });
  return canvas;
}

function legacyWrap(source: HTMLCanvasElement | null, motif: HTMLCanvasElement | null, spanCover: number): HTMLCanvasElement | null {
  const wrap = document.createElement("canvas");
  wrap.width = 2048;
  wrap.height = 1024;
  const ctx = wrap.getContext("2d");
  if (!ctx) return null;
  const lip = 0.18;
  const span = Math.min(Math.max(0.28, spanCover), 0.88);
  const y = lip * wrap.height;
  const band = span * wrap.height;
  if (motif) {
    const iw = Math.max(1, motif.width);
    const ih = Math.max(1, motif.height);
    const tile = Math.min(520, Math.max(iw, 180));
    const scale = tile / iw;
    const dw = iw * scale;
    const dh = ih * scale;
    for (let ty = 0; ty < wrap.height; ty += dh) {
      for (let tx = 0; tx < wrap.width; tx += dw) {
        ctx.drawImage(motif, tx - 0.5, ty - 0.5, dw + 1, dh + 1);
      }
    }
  }
  const stamp = motif ? knockWhite(source) : source;
  if (stamp) {
    const box = inkBoxOf(stamp);
    if (box) {
      const copies = 2;
      const slot = wrap.width / copies;
      // Offset so first copy is centered at front (U=0.5 maps to front of cup)
      const offset = slot / 2;
      for (let i = 0; i < copies; i += 1) {
        const scale = Math.min((slot * 0.82) / box.w, (band * 0.82) / box.h);
        const dw = box.w * scale;
        const dh = box.h * scale;
        const x = ((i * slot + offset) % wrap.width);
        ctx.drawImage(stamp, box.x, box.y, box.w, box.h, x - dw / 2, y + (band - dh) / 2, dw, dh);
      }
    }
  }
  return wrap;
}


/** Sales still for the ficha: front of the cup in the Blink studio, with the house mark and a share code. */
export function heroSheet(options: {
  cupName: string;
  process: string;
  still: HTMLCanvasElement;
  shareUrl: string;
  qr: HTMLCanvasElement | null;
}): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1648;
  canvas.height = 2336;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const w = canvas.width;
  const h = canvas.height;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#F8F3EB");
  sky.addColorStop(0.55, "#F6F0E6");
  sky.addColorStop(1, "#E8DFD2");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);

  drawBlinkWordmark(ctx, 64, 48, 64, "#1A120C");

  ctx.fillStyle = "#7A6A5C";
  ctx.font = "500 22px Outfit, sans-serif";
  ctx.fillText(`${options.cupName}  ·  ${options.process}`, 64, 148);

  const still = options.still;
  const top = 180;
  const bottom = 1880;
  const boxH = bottom - top;
  const boxW = w - 80;
  const scale = Math.min(boxW / still.width, boxH / still.height);
  const dw = still.width * scale;
  const dh = still.height * scale;
  ctx.drawImage(still, (w - dw) / 2, top + (boxH - dh) / 2, dw, dh);

  const qr = options.qr;
  const qrSize = 168;
  const qrX = 64;
  const qrY = h - 64 - qrSize;
  if (qr) {
    ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
    ctx.strokeStyle = "#E4D8C8";
    ctx.lineWidth = 2;
    ctx.strokeRect(qrX - 1, qrY - 1, qrSize + 2, qrSize + 2);
  }
  ctx.fillStyle = "#1A120C";
  ctx.font = "500 20px Outfit, sans-serif";
  ctx.fillText("As três vistas deste copo", qrX + qrSize + 28, qrY + 48);
  ctx.fillStyle = "#7A6A5C";
  ctx.font = "400 16px Outfit, sans-serif";
  const url = options.shareUrl;
  const maxW = w - (qrX + qrSize + 48) - 48;
  let shown = url;
  if (ctx.measureText(shown).width > maxW) {
    while (shown.length > 12 && ctx.measureText(`${shown}…`).width > maxW) shown = shown.slice(0, -1);
    shown = `${shown}…`;
  }
  ctx.fillText(shown, qrX + qrSize + 28, qrY + 80);
  ctx.fillText("A arte que carregaste fica nesta ficha; o endereço leva só o modelo, a cor e a posição.", qrX + qrSize + 28, qrY + 108);

  ctx.fillStyle = "#7A6A5C";
  ctx.font = "400 16px Outfit, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("© BLINK 2026", w - 64, h - 40);
  ctx.textAlign = "left";
  return canvas;
}
