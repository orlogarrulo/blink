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

export function paintLabel(options: {
  area: Area;
  ppm: number;
  image: CanvasImageSource | null;
  scale: number;
  shift: number;
  title: string;
  ink: string;
  process: Process;
  suggest: boolean;
  palette: string[];
  inkCount: 1 | 2;
  fit?: "contain" | "cover" | "band" | "height";
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
  if (options.image) {
    const source = options.image as HTMLImageElement;
    const iw = source.naturalWidth || source.width || canvas.width;
    const ih = source.naturalHeight || source.height || canvas.height;
    const fit = options.fit ?? "contain";
    let placed = Math.min(canvas.width / iw, canvas.height / ih);
    if (fit === "cover") placed = Math.max(canvas.width / iw, canvas.height / ih);
    if (fit === "height") placed = canvas.height / ih;
    if (fit === "band") placed = Math.min(canvas.width / iw, (canvas.height * 0.46) / ih);
    placed *= options.scale;
    const dw = iw * placed;
    const dh = ih * placed;
    ctx.drawImage(source, (canvas.width - dw) / 2, (canvas.height - dh) / 2 + options.shift, dw, dh);
  }
  if (options.title.trim()) {
    ctx.fillStyle = options.ink;
    const size = Math.max(14, canvas.height * 0.16);
    ctx.font = `600 ${size}px Outfit, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(options.title.trim(), canvas.width / 2, canvas.height * 0.78);
  }
  if (options.suggest) {
    const inks = options.process === "serigrafia" ? options.palette.slice(0, options.inkCount) : options.palette.slice(0, 4);
    quantize(canvas, inks);
  }
  return canvas;
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
    if (alpha < 16) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 244 && g > 244 && b > 244) continue;
    const ink = 1 - (r + g + b) / (255 * 3);
    if (process === "serigrafia") {
      data[i] = tr;
      data[i + 1] = tg;
      data[i + 2] = tb;
      data[i + 3] = Math.round(alpha * Math.min(1, ink * 1.4));
    } else {
      data[i] = Math.round(255 * (1 - ink) + tr * ink);
      data[i + 1] = Math.round(255 * (1 - ink) + tg * ink);
      data[i + 2] = Math.round(255 * (1 - ink) + tb * ink);
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
  delivery: string;
  eventDate: string;
  priceLine: string;
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
    ["Frete", `${freightMode(options.qty)}  ·  +${freightDays(options.qty)} dias`],
    ["Entrega estimada", options.delivery],
    ["Data do evento", options.eventDate || "—"],
  ];
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
    "Prazo é estimativa de estúdio: 8 dias úteis (serigrafia e digital) ou 20 (IML), mais frete da folha Ekopos.",
  ];
  notes.forEach((line, index) => ctx.fillText(line, 72, 1520 + index * 32));
  return canvas;
}

export function viewsSheet(title: string, labels: readonly string[], shots: HTMLCanvasElement[]): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1240;
  canvas.height = 1754;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#F6F0E6";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1A120C";
  ctx.font = "650 40px Fraunces, serif";
  ctx.fillText(title, 48, 72);
  const gap = 24;
  const left = 40;
  const top = 104;
  const cols = 2;
  const rows = 3;
  const cellW = (canvas.width - left * 2 - gap) / cols;
  const cellH = (canvas.height - top - 36 - gap * (rows - 1)) / rows;
  shots.slice(0, 6).forEach((shot, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const x = left + col * (cellW + gap);
    const y = top + row * (cellH + gap);
    ctx.fillStyle = "#FFFFFF";
    roundRect(ctx, x, y, cellW, cellH, 18);
    ctx.fill();
    const boxH = cellH - 48;
    const scale = Math.min((cellW - 16) / shot.width, (boxH - 8) / shot.height);
    const dw = shot.width * scale;
    const dh = shot.height * scale;
    ctx.drawImage(shot, x + (cellW - dw) / 2, y + 8 + (boxH - dh) / 2, dw, dh);
    ctx.fillStyle = "#1A120C";
    ctx.font = "500 22px Outfit, sans-serif";
    ctx.fillText(labels[index] || "", x + 16, y + cellH - 16);
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

export function canvasPdf(canvas: HTMLCanvasElement): Blob {
  const quality = 0.85;
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const raw = atob(dataUrl.split(",")[1] || "");
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  const pageW = 595.28;
  const pageH = 841.89;
  const imgW = pageW - 36;
  const imgH = (canvas.height / canvas.width) * imgW;
  const y = 18 + Math.max(0, (pageH - 36 - imgH) / 2);
  const content = [
    "q",
    `${imgW.toFixed(2)} 0 0 ${Math.min(imgH, pageH - 36).toFixed(2)} 18 ${y.toFixed(2)} cm`,
    "/Im0 Do",
    "Q",
  ].join("\n");
  const encoder = new TextEncoder();
  const objects: Uint8Array[] = [];
  const push = (body: string | Uint8Array) => {
    objects.push(typeof body === "string" ? encoder.encode(body) : body);
  };
  push("<< /Type /Catalog /Pages 2 0 R >>");
  push("<< /Type /Pages /Count 1 /Kids [3 0 R] >>");
  push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>`,
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
