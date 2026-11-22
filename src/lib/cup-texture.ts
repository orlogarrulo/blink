type Fit = "contain" | "cover" | "band" | "height";

export type HeroTextureInput = {
  pattern: CanvasImageSource | null;
  logo: CanvasImageSource | null;
  phrase: string;
  font: string;
  ink: string;
  printW: number;
  printH: number;
  fit: Fit;
  scale: number;
};

function sourceSize(source: CanvasImageSource): [number, number] {
  if (source instanceof HTMLImageElement) return [source.naturalWidth || source.width, source.naturalHeight || source.height];
  if (source instanceof HTMLCanvasElement) return [source.width, source.height];
  if (source instanceof SVGImageElement) return [source.width.baseVal.value || 1, source.height.baseVal.value || 1];
  if ("width" in source && "height" in source) return [Number(source.width) || 1, Number(source.height) || 1];
  return [1, 1];
}

function textureSize(printW: number, printH: number) {
  const aspect = Math.max(0.4, printW) / Math.max(1, printH);
  const height = 2048;
  const width = Math.max(1024, Math.round(height * aspect));
  return { width: Math.min(4096, width), height };
}

/** Repeat the pattern across the unrolled print so a tile stays sharp around the cup. */
export function tilePattern(pattern: CanvasImageSource, printW: number, printH: number) {
  const { width, height } = textureSize(printW, printH);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const [iw, ih] = sourceSize(pattern);
  const dh = height;
  const dw = Math.max(1, dh * (iw / Math.max(1, ih)));
  for (let x = -1; x < width + dw; x += dw) ctx.drawImage(pattern, x, 0, dw + 1, dh + 1);
  return canvas;
}

function knockPaper(source: CanvasImageSource) {
  const [iw, ih] = sourceSize(source);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(iw));
  canvas.height = Math.max(1, Math.round(ih));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = frame.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    if (data[i] > 244 && data[i + 1] > 244 && data[i + 2] > 244) data[i + 3] = 0;
  }
  ctx.putImageData(frame, 0, 0);
  return canvas;
}

function drawLogo(ctx: CanvasRenderingContext2D, logo: CanvasImageSource, fit: Fit, scale: number, knock: boolean) {
  const [iw, ih] = sourceSize(logo);
  const { width, height } = ctx.canvas;
  const band = fit === "band";
  const limitW = width * (band ? 0.62 : 0.42) * Math.max(0.35, scale);
  const limitH = height * (band ? 0.38 : fit === "height" ? 0.86 : 0.62) * Math.max(0.35, scale);
  let placed = Math.min(limitW / iw, limitH / ih);
  if (fit === "cover") placed = Math.max(limitW / iw, limitH / ih);
  if (fit === "height") placed = limitH / ih;
  const dw = iw * placed;
  const dh = ih * placed;
  const image = knock ? knockPaper(logo) : logo;
  ctx.drawImage(image, (width - dw) / 2, height * 0.46 - dh / 2, dw, dh);
}

function drawPhrase(ctx: CanvasRenderingContext2D, phrase: string, font: string, ink: string, hasLogo: boolean) {
  const text = phrase.trim();
  if (!text) return;
  const { width, height } = ctx.canvas;
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const maxW = width * 0.46;
  let size = Math.round(height * (hasLogo ? 0.09 : 0.16));
  const fontOf = (px: number) => `600 ${px}px ${font}`;
  ctx.font = fontOf(size);
  while (size > 18 && ctx.measureText(text).width > maxW) {
    size -= 2;
    ctx.font = fontOf(size);
  }
  ctx.fillText(text, width / 2, hasLogo ? height * 0.78 : height * 0.5, maxW);
}

/**
 * Unrolled print (width around × height) placed so its centre faces the camera.
 * A full-bleed pattern reaches the top and bottom of this canvas; those edges
 * become the elliptical rims of the print band once the mesh is projected.
 */
export function composeHeroTexture(input: HeroTextureInput, tiled: HTMLCanvasElement | null) {
  const { width, height } = tiled ? { width: tiled.width, height: tiled.height } : textureSize(input.printW, input.printH);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if (tiled) ctx.drawImage(tiled, 0, 0);
  if (input.logo) drawLogo(ctx, input.logo, input.fit, input.scale, Boolean(tiled));
  drawPhrase(ctx, input.phrase, input.font, input.ink, Boolean(input.logo));
  if (!tiled && !input.logo && !input.phrase.trim()) return null;
  return canvas;
}
