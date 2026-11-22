export type CupDraw = {
  texture: CanvasImageSource | null;
  top: number;
  bot: number;
  heightMm: number;
  /** Print window height ÷ cup height. */
  cover: number;
  body?: string | null;
  liquid?: "none" | "beer" | "soda";
  quality?: "draft" | "full";
};

type Layout = {
  topR: number;
  botR: number;
  bodyH: number;
  cx: number;
  topCy: number;
  ellipse: number;
};

const ELLIPSE = 0.22;

function shade(hex: string, amount: number) {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(full.slice(0, 6), 16);
  if (!Number.isFinite(n)) return hex;
  const mix = (c: number) => {
    const next = amount >= 1 ? c + (255 - c) * (amount - 1) : c * amount;
    return Math.max(0, Math.min(255, Math.round(next)));
  };
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `rgb(${r},${g},${b})`;
}

function layoutOf(width: number, height: number, spec: CupDraw, zoom: number): Layout {
  const aspect = spec.heightMm / Math.max(1, spec.top);
  const maxH = height * 0.9 * zoom;
  const maxW = width * 0.78 * zoom;
  let topR = maxW / 2;
  let bodyH = topR * 2 * aspect;
  const rim = topR * ELLIPSE;
  if (bodyH + rim * 2.2 > maxH) {
    const scale = maxH / (bodyH + rim * 2.2);
    topR *= scale;
    bodyH *= scale;
  }
  const botR = topR * (spec.bot / Math.max(1, spec.top));
  const cx = width * 0.5;
  const topCy = Math.max(rim + 4, (height - bodyH) * 0.46) + rim * 0.15;
  return { topR, botR, bodyH, cx, topCy, ellipse: ELLIPSE };
}

function project(L: Layout, theta: number, t: number) {
  const r = L.topR + (L.botR - L.topR) * t;
  const yCenter = L.topCy + t * L.bodyH;
  const ry = Math.max(2, r * L.ellipse);
  return { x: L.cx + Math.sin(theta) * r, y: yCenter + Math.cos(theta) * ry, r, ry };
}

function bandOf(spec: CupDraw) {
  const cover = Math.min(0.9, Math.max(0.4, spec.cover || 0.7));
  const rimGap = Math.min(0.12, Math.max(0.055, (1 - cover) * 0.34));
  const t0 = rimGap;
  const t1 = Math.min(0.94, rimGap + cover);
  return { t0, t1 };
}

function traceFront(ctx: CanvasRenderingContext2D, L: Layout, tTop: number, tBot: number) {
  const steps = 28;
  ctx.beginPath();
  for (let i = 0; i <= steps; i += 1) {
    const theta = -Math.PI / 2 + (i / steps) * Math.PI;
    const p = project(L, theta, tTop);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  for (let i = steps; i >= 0; i -= 1) {
    const theta = -Math.PI / 2 + (i / steps) * Math.PI;
    const p = project(L, theta, tBot);
    ctx.lineTo(p.x, p.y);
  }
  ctx.closePath();
}

function sourceSize(source: CanvasImageSource): [number, number] {
  if (source instanceof HTMLImageElement) return [source.naturalWidth || source.width, source.naturalHeight || source.height];
  if (source instanceof HTMLCanvasElement) return [source.width, source.height];
  if ("width" in source && "height" in source) return [Number(source.width) || 1, Number(source.height) || 1];
  return [1, 1];
}

function wrap01(u: number) {
  return ((u % 1) + 1) % 1;
}

/**
 * Project the unrolled print onto the front of the cone.
 * Each column keeps a constant angle, so the art compresses toward the sides,
 * and the top/bottom of the print sit on ellipses parallel to the rim and base.
 */
function paintWrap(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  texture: CanvasImageSource,
  turn: number,
  t0: number,
  t1: number,
  ratio: number,
  originX: number,
  originY: number,
  quality: "draft" | "full",
) {
  const [tw, th] = sourceSize(texture);
  if (tw < 2 || th < 2) return;
  const strips = quality === "draft" ? Math.max(28, Math.min(64, Math.round(L.topR))) : Math.max(48, Math.min(180, Math.round(L.topR * 1.25)));
  const span = Math.PI;
  for (let i = 0; i < strips; i += 1) {
    const thetaL = -Math.PI / 2 + (i / strips) * span;
    const thetaR = -Math.PI / 2 + ((i + 1) / strips) * span;
    const p00 = project(L, thetaL, t0);
    const p10 = project(L, thetaR, t0);
    const p01 = project(L, thetaL, t1);
    const p11 = project(L, thetaR, t1);
    const du = (thetaR - thetaL) / (Math.PI * 2);
    const u0 = wrap01(0.5 + (turn + thetaL) / (Math.PI * 2));
    const chunks = u0 + du <= 1 ? [[u0, du, 0, 1]] : [[u0, 1 - u0, 0, (1 - u0) / du], [0, u0 + du - 1, (1 - u0) / du, 1]];
    for (const [su, sdu, f0, f1] of chunks) {
      const sx = su * tw;
      const sw = Math.max(1, sdu * tw);
      const a = {
        x: p00.x + (p10.x - p00.x) * f0,
        y: p00.y + (p10.y - p00.y) * f0,
      };
      const b = {
        x: p00.x + (p10.x - p00.x) * f1,
        y: p00.y + (p10.y - p00.y) * f1,
      };
      const c = {
        x: p01.x + (p11.x - p01.x) * f0,
        y: p01.y + (p11.y - p01.y) * f0,
      };
      const d = {
        x: p01.x + (p11.x - p01.x) * f1,
        y: p01.y + (p11.y - p01.y) * f1,
      };
      ctx.save();
      ctx.setTransform(ratio, 0, 0, ratio, ratio * originX, ratio * originY);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.lineTo(d.x, d.y);
      ctx.lineTo(c.x, c.y);
      ctx.closePath();
      ctx.clip();
      const ux = (b.x - a.x) / sw;
      const uy = (b.y - a.y) / sw;
      const vx = (c.x - a.x) / th;
      const vy = (c.y - a.y) / th;
      ctx.setTransform(ratio * ux, ratio * uy, ratio * vx, ratio * vy, ratio * (originX + a.x), ratio * (originY + a.y));
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(texture, sx, 0, sw, th, 0, 0, sw, th);
      ctx.restore();
    }
  }
}

export function drawCup(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spec: CupDraw,
  turn: number,
  options?: { ratio?: number; zoom?: number; originX?: number; originY?: number },
) {
  const ratio = options?.ratio ?? 1;
  const zoom = options?.zoom ?? 1;
  const originX = options?.originX ?? 0;
  const originY = options?.originY ?? 0;
  const L = layoutOf(width, height, spec, zoom);
  const { t0, t1 } = bandOf(spec);
  const base = () => ctx.setTransform(ratio, 0, 0, ratio, ratio * originX, ratio * originY);

  base();
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  const foot = project(L, 0, 1);
  ctx.beginPath();
  ctx.ellipse(L.cx, foot.y + L.botR * 0.05, L.botR * 0.92, Math.max(3, L.botR * 0.1), 0, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(80, 70, 60, 0.13)";
  ctx.fill();

  base();
  traceFront(ctx, L, 0, 1);
  const body = spec.body;
  const frost = ctx.createLinearGradient(L.cx - L.topR, 0, L.cx + L.topR, 0);
  if (body) {
    frost.addColorStop(0, shade(body, 0.72));
    frost.addColorStop(0.28, shade(body, 1.08));
    frost.addColorStop(0.5, body);
    frost.addColorStop(1, shade(body, 0.62));
  } else {
    frost.addColorStop(0, "#dddcd8");
    frost.addColorStop(0.18, "#f7f7f5");
    frost.addColorStop(0.42, "#fbfbfa");
    frost.addColorStop(0.7, "#eceae6");
    frost.addColorStop(1, "#d4d2ce");
  }
  ctx.fillStyle = frost;
  ctx.fill();

  const vert = ctx.createLinearGradient(0, L.topCy, 0, L.topCy + L.bodyH);
  vert.addColorStop(0, "rgba(255,255,255,0.45)");
  vert.addColorStop(0.2, "rgba(255,255,255,0)");
  vert.addColorStop(1, "rgba(190,186,180,0.28)");
  ctx.fillStyle = vert;
  ctx.fill();

  if (!body && spec.texture) {
    paintWrap(ctx, L, spec.texture, turn, t0, t1, ratio, originX, originY, spec.quality ?? "draft");
    ctx.save();
    base();
    traceFront(ctx, L, 0, 1);
    ctx.clip();
    ctx.globalCompositeOperation = "soft-light";
    ctx.globalAlpha = 0.38;
    ctx.fillStyle = frost;
    ctx.fill();
    ctx.restore();
  }

  if (spec.liquid && spec.liquid !== "none") {
    base();
    const level = spec.liquid === "beer" ? 0.22 : 0.16;
    ctx.save();
    traceFront(ctx, L, level, 0.98);
    ctx.clip();
    ctx.fillStyle = spec.liquid === "beer" ? "rgba(212, 148, 32, 0.88)" : "rgba(42, 16, 12, 0.9)";
    ctx.fillRect(L.cx - L.topR, L.topCy, L.topR * 2, L.bodyH);
    if (spec.liquid === "beer") {
      const lip = project(L, 0, level);
      ctx.fillStyle = "rgba(255,247,238,0.95)";
      ctx.beginPath();
      ctx.ellipse(L.cx, lip.y, lip.r * 0.9, Math.max(3, lip.ry), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  base();
  const mouthRy = Math.max(3, L.topR * L.ellipse);
  ctx.beginPath();
  ctx.ellipse(L.cx, L.topCy, L.topR * 0.9, mouthRy * 0.82, 0, 0, Math.PI * 2);
  ctx.fillStyle = body ? shade(body, 0.9) : "rgba(255,255,255,0.72)";
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(L.cx, L.topCy, L.topR, mouthRy, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = Math.max(1.4, L.topR * 0.035);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(L.cx, L.topCy, L.topR * 0.9, mouthRy * 0.72, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(120,116,110,0.35)";
  ctx.lineWidth = Math.max(0.8, L.topR * 0.012);
  ctx.stroke();

  const baseP = project(L, 0, 1);
  ctx.beginPath();
  ctx.ellipse(L.cx, baseP.y, baseP.r, Math.max(2.5, baseP.ry), 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = Math.max(1, L.botR * 0.03);
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(L.cx - L.topR * 0.32, L.topCy + L.bodyH * 0.28, L.topR * 0.08, L.bodyH * 0.22, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.fill();
}

export function pixelRatioFor(cssW: number, cssH: number) {
  let ratio = Math.min(window.devicePixelRatio || 1, 3);
  const maxEdge = 4096;
  if (cssW * ratio > maxEdge) ratio = maxEdge / Math.max(1, cssW);
  if (cssH * ratio > maxEdge) ratio = Math.min(ratio, maxEdge / Math.max(1, cssH));
  return Math.max(1, ratio);
}

export function paintCupCanvas(canvas: HTMLCanvasElement, spec: CupDraw, turn: number, zoom = 1) {
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW < 2 || cssH < 2) return;
  const ratio = pixelRatioFor(cssW, cssH);
  const bw = Math.max(1, Math.floor(cssW * ratio));
  const bh = Math.max(1, Math.floor(cssH * ratio));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  drawCup(ctx, cssW, cssH, spec, turn, { ratio, zoom });
}

const TRIO = [0.78, 0, -0.78];

export function paintTrioCanvas(canvas: HTMLCanvasElement, spec: CupDraw, zoom = 1) {
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  if (cssW < 2 || cssH < 2) return;
  const ratio = pixelRatioFor(cssW, cssH);
  const bw = Math.max(1, Math.floor(cssW * ratio));
  const bh = Math.max(1, Math.floor(cssH * ratio));
  if (canvas.width !== bw || canvas.height !== bh) {
    canvas.width = bw;
    canvas.height = bh;
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const slot = cssW / 3;
  TRIO.forEach((turn, index) => {
    ctx.save();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.beginPath();
    ctx.rect(slot * index, 0, slot, cssH);
    ctx.clip();
    drawCup(ctx, slot, cssH, { ...spec, quality: "full" }, turn, { ratio, zoom, originX: slot * index });
    ctx.restore();
  });
}

export function cupStills(spec: CupDraw, turns: number[], width = 900, height = 1200): HTMLCanvasElement[] {
  return turns.map((turn) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    drawCup(ctx, width, height, { ...spec, quality: "full" }, turn, { ratio: 1, zoom: 1 });
    return canvas;
  });
}
