import type { Area, Cup, Process } from "@/lib/catalog";
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
  const ctx = canvas.getContext("2d");
  if (!ctx || palette.length === 0) return;
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 16) continue;
    const hex = nearest([data[i], data[i + 1], data[i + 2]], palette);
    const [r, g, b] = hexToRgb(hex);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
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
  const ctx = canvas.getContext("2d");
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
    if (fit === "cover") placed = Math.max(limitW / iw, limitH / ih);
    if (fit === "height") placed = limitH / ih;
    if (fit === "band") placed = Math.min(limitW / iw, (limitH * 0.62) / ih);
    placed *= options.scale;
    const dw = iw * placed;
    const dh = ih * placed;
    const y = gap + (limitH - dh) / 2 + options.shift;
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
  return canvas;
}

function isolateInk(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return;
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  const w = canvas.width;
  const h = canvas.height;
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  const paperAt = (i: number) => {
    if (data[i + 3] < 16) return true;
    const light = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const chroma = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    return light > 238 && chroma < 18;
  };
  for (let x = 0; x < w; x += 1) {
    stack.push(x, (h - 1) * w + x);
  }
  for (let y = 0; y < h; y += 1) stack.push(y * w, y * w + w - 1);
  while (stack.length > 0) {
    const p = stack.pop();
    if (p === undefined || seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    if (!paperAt(i)) continue;
    data[i + 3] = 0;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x + 1 < w) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y + 1 < h) stack.push(p + w);
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
  ctx.fillStyle = "#1A120C";
  ctx.font = "600 52px Fraunces, serif";
  ctx.fillText("BLINK", 72, 110);
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
  const windowMm = options.process === "iml" ? options.cup.iml : options.process === "digital" ? options.cup.digital : options.cup.screen;
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
    ["Processo", PROCESS_LABEL[options.process]],
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
    "IML: 300 dpi, CMYK, textos em contorno, base branca. Fora da janela: 2 mm acima e abaixo e 4 mm extra no topo.",
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

export function viewsSheet(title: string, labels: readonly string[], shots: HTMLCanvasElement[]): HTMLCanvasElement {
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
  const gap = 18;
  const left = 40;
  const top = 96;
  const cellW = (canvas.width - left * 2 - gap * Math.max(0, frames.length - 1)) / Math.max(1, frames.length);
  const photoH = canvas.height - top - 72;
  frames.forEach((shot, index) => {
    const x = left + index * (cellW + gap);
    ctx.fillStyle = "#f6f3ee";
    ctx.fillRect(x, top, cellW, photoH);
    const scale = Math.min(cellW / shot.width, photoH / shot.height);
    const dw = shot.width * scale;
    const dh = shot.height * scale;
    ctx.drawImage(shot, x + (cellW - dw) / 2, top + (photoH - dh) / 2, dw, dh);
    ctx.fillStyle = "#1A120C";
    ctx.font = "500 16px Outfit, sans-serif";
    ctx.fillText(labels[index] || "", x, top + photoH + 28);
  });
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

export function wrapPrint(source: HTMLCanvasElement | null, motif: HTMLCanvasElement | null, spanCover = 0.6): HTMLCanvasElement | null {
  if (!source && !motif) return null;
  const wrap = document.createElement("canvas");
  wrap.width = 2048;
  wrap.height = 1024;
  const ctx = wrap.getContext("2d");
  if (!ctx) return null;
  const lip = 0.18;
  const span = Math.min(Math.max(0.28, spanCover), 0.88);
  const y = lip * wrap.height;
  const band = span * wrap.height;
  const inkBox = (image: HTMLCanvasElement) => {
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
    return { x: minX, y: minY, w: Math.max(2, maxX - minX + 2), h: Math.max(2, maxY - minY + 2) };
  };
  if (motif) {
    const copies = 4;
    const slot = wrap.width / copies;
    const iw = motif.width || 1;
    const ih = motif.height || 1;
    for (let i = 0; i < copies; i += 1) {
      const scale = Math.max(slot / iw, band / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      ctx.save();
      ctx.beginPath();
      ctx.rect(i * slot, y, slot, band);
      ctx.clip();
      ctx.drawImage(motif, i * slot + (slot - dw) / 2, y + (band - dh) / 2, dw, dh);
      ctx.restore();
    }
  }
  if (source) {
    const box = inkBox(source);
    if (box) {
      const aspect = box.w / box.h;
      const isSmall = box.w < 200 && box.h < 200;
      const copies = isSmall ? 3 : aspect > 2.4 ? 2 : aspect < 0.85 ? 4 : 3;
      const slot = wrap.width / copies;
      for (let i = 0; i < copies; i += 1) {
        const scale = Math.min((slot * 0.82) / box.w, (band * 0.82) / box.h);
        const dw = box.w * scale;
        const dh = box.h * scale;
        ctx.drawImage(source, box.x, box.y, box.w, box.h, i * slot + (slot - dw) / 2, y + (band - dh) / 2, dw, dh);
      }
    }
  }
  return wrap;
}
