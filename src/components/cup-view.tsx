import { useEffect, useRef } from "react";
import { renderCupGL } from "@/lib/cup-gl";

type Props = {
  texture: HTMLCanvasElement | null;
  top: number;
  bot: number;
  heightMm: number;
  cover: number;
  /** Print area in mm (from the catalogue); places the print window like the mould. */
  area?: { w: number; h: number } | null;
  body?: string | null;
  liquid?: "none" | "beer" | "soda";
  spin: boolean;
  /** Fixed view angle in radians when not spinning (0 = front). */
  turn?: number;
  className?: string;
  label?: string;
};

/** Device pixel ratio for crisp output, including pinch zoom, capped for speed. */
function pixelRatio() {
  if (typeof window === "undefined") return 1;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const pinch = Math.min(3, Math.max(1, window.visualViewport?.scale ?? 1));
  return dpr * pinch;
}

export function CupView({ texture, top, bot, heightMm, cover, area = null, body = null, liquid = "none", spin, turn = 0, className, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const angle = useRef(turn);
  const drag = useRef<{ x: number; a: number } | null>(null);
  const paused = useRef(false);
  const visible = useRef(true);
  const dirty = useRef(true);
  const live = useRef({ texture, top, bot, heightMm, cover, area, body, liquid, spin });
  live.current = { texture, top, bot, heightMm, cover, area, body, liquid, spin };

  useEffect(() => {
    if (!spin) angle.current = turn;
    dirty.current = true;
  }, [turn, spin]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let last = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dirty.current = true;
    // The very first frame is drawn at a lighter resolution so the cup shows up at once
    // (a big ray-traced frame is costly on phones); the next frame is full resolution.
    let quick = true;

    const paint = () => {
      const spec = live.current;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 2 || height < 2) return;
      let ratio = pixelRatio();
      if (quick) {
        quick = false;
        if (ratio > 1.5) {
          ratio = 1.5;
          dirty.current = true;
        }
      }
      const cap = 4096 / Math.max(width, height);
      ratio = Math.min(ratio, cap);
      const bw = Math.max(2, Math.floor(width * ratio));
      const bh = Math.max(2, Math.floor(height * ratio));
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, bw, bh);
      const ok = renderCupGL(ctx, bw, bh, spec, angle.current);
      if (!ok) {
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        drawCup2d(ctx, width, height, spec, angle.current);
      }
    };

    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (!visible.current || document.hidden) return;
      const moving = live.current.spin && !reduce && !drag.current && !paused.current;
      if (moving) {
        const dt = last ? Math.min(64, now - last) : 16;
        angle.current += 0.00042 * dt;
        dirty.current = true;
      }
      last = now;
      if (dirty.current) {
        dirty.current = false;
        paint();
      }
    };
    frame = requestAnimationFrame(loop);

    const mark = () => {
      dirty.current = true;
    };
    const resize = new ResizeObserver(mark);
    resize.observe(canvas);
    const seen = new IntersectionObserver((entries) => {
      for (const entry of entries) visible.current = entry.isIntersecting;
      if (visible.current) dirty.current = true;
    });
    seen.observe(canvas);
    window.visualViewport?.addEventListener("resize", mark);
    window.addEventListener("resize", mark);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      seen.disconnect();
      window.visualViewport?.removeEventListener("resize", mark);
      window.removeEventListener("resize", mark);
    };
  }, [texture, top, bot, heightMm, cover, area?.w, area?.h, body, liquid, spin]);

  return (
    <canvas
      ref={ref}
      className={className ?? "h-80 w-full touch-none lg:h-[32rem]"}
      aria-label={label ?? "Copo Ecocup. Arrasta para rodar."}
      onMouseEnter={() => {
        paused.current = true;
      }}
      onMouseLeave={() => {
        paused.current = false;
      }}
      onPointerDown={(event) => {
        if (!spin) return;
        drag.current = { x: event.clientX, a: angle.current };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        angle.current = drag.current.a + (event.clientX - drag.current.x) * 0.012;
        dirty.current = true;
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    />
  );
}

type CupDraw = {
  texture: HTMLCanvasElement | null;
  area?: { w: number; h: number } | null;
  top: number;
  bot: number;
  heightMm: number;
  cover: number;
  body?: string | null;
  liquid?: "none" | "beer" | "soda";
};

function drawCup2d(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  spec: CupDraw,
  turn: number,
) {
      const aspect = spec.heightMm / Math.max(1, spec.top);
      const maxH = height * 0.9;
      const maxW = width * 0.58;
      let topR = maxW / 2;
      let bodyH = topR * 2 * aspect;
      if (bodyH + topR * 0.28 > maxH) {
        const scale = maxH / (bodyH + topR * 0.28);
        topR *= scale;
        bodyH *= scale;
      }
      const botR = topR * (spec.bot / Math.max(1, spec.top));
      const cx = width * 0.5;
      const ry = Math.max(3.2, topR * 0.12);
      const topCy = (height - bodyH) * 0.46 + ry;
      const rxAt = (t: number) => topR + (botR - topR) * t;
      const strips = width < 180 ? 64 : width < 420 ? 120 : 168;

      // Print follows the front lip and runs to the base. The rim stroke stays clear.
      const band0 = 0;
      const band1 = 1;

      ctx.fillStyle = "rgba(176, 184, 190, 0.2)";
      ctx.beginPath();
      ctx.ellipse(cx, topCy + bodyH + ry * 0.35, botR * 0.95, Math.max(3, topR * 0.07), 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(cx - topR, topCy);
      ctx.lineTo(cx + topR, topCy);
      ctx.lineTo(cx + botR, topCy + bodyH);
      ctx.lineTo(cx - botR, topCy + bodyH);
      ctx.closePath();
      const frost = ctx.createLinearGradient(cx - topR, 0, cx + topR, 0);
      // Body stays translucent; color only goes on the IML print band below the rim
      frost.addColorStop(0, "#f3f2f0");
      frost.addColorStop(0.18, "#fafaf9");
      frost.addColorStop(0.5, "#f6f5f3");
      frost.addColorStop(0.8, "#efecea");
      frost.addColorStop(1, "#e6e4e1");
      ctx.fillStyle = frost;
      ctx.fill();
      ctx.save();
      ctx.clip();
      const vert = ctx.createLinearGradient(0, topCy, 0, topCy + bodyH);
      vert.addColorStop(0, "rgba(255,255,255,0.45)");
      vert.addColorStop(0.12, "rgba(255,255,255,0)");
      vert.addColorStop(0.82, "rgba(255,255,255,0)");
      vert.addColorStop(1, "rgba(206,214,220,0.28)");
      ctx.fillStyle = vert;
      ctx.fillRect(cx - topR - 2, topCy, topR * 2 + 4, bodyH);
      ctx.restore();

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - topR, topCy);
      ctx.lineTo(cx + topR, topCy);
      ctx.lineTo(cx + botR, topCy + bodyH);
      ctx.lineTo(cx - botR, topCy + bodyH);
      ctx.closePath();
      ctx.clip();
      const sheen = ctx.createLinearGradient(cx - topR, 0, cx + topR, 0);
      sheen.addColorStop(0, "rgba(255,255,255,0)");
      sheen.addColorStop(0.2, "rgba(255,255,255,0.12)");
      sheen.addColorStop(0.35, "rgba(255,255,255,0)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(cx - topR, topCy, topR * 2, bodyH);
      ctx.restore();

      // Colour and print share one silhouette: front lip curve, full width, down to the base.
      const printPath = () => {
        ctx.beginPath();
        ctx.ellipse(cx, topCy, topR + 0.6, ry, 0, Math.PI, 0, false);
        ctx.lineTo(cx + botR + 0.6, topCy + bodyH);
        ctx.lineTo(cx - botR - 0.6, topCy + bodyH);
        ctx.closePath();
      };
      if (spec.body) {
        ctx.save();
        printPath();
        ctx.fillStyle = spec.body;
        ctx.globalAlpha = 0.96;
        ctx.fill();
        ctx.globalAlpha = 1;
        const imlSheen = ctx.createLinearGradient(cx - topR, 0, cx + topR, 0);
        imlSheen.addColorStop(0, "rgba(255,255,255,0)");
        imlSheen.addColorStop(0.22, "rgba(255,255,255,0.16)");
        imlSheen.addColorStop(0.4, "rgba(255,255,255,0)");
        imlSheen.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = imlSheen;
        ctx.fill();
        ctx.restore();
      }

      if (spec.liquid && spec.liquid !== "none") {
        const liqLevel = spec.liquid === "beer" ? 0.82 : 0.88;
        const liqTop = topCy + bodyH * (1 - liqLevel);
        const liqColor = spec.liquid === "beer" ? "rgba(232,168,32,0.85)" : "rgba(20,8,6,0.9)";
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx - topR * 0.95, liqTop);
        ctx.lineTo(cx + topR * 0.95, liqTop);
        ctx.lineTo(cx + botR * 0.98, topCy + bodyH - 2);
        ctx.lineTo(cx - botR * 0.98, topCy + bodyH - 2);
        ctx.closePath();
        ctx.fillStyle = liqColor;
        ctx.fill();
        if (spec.liquid === "beer") {
          ctx.fillStyle = "rgba(255,247,238,0.95)";
          ctx.beginPath();
          ctx.ellipse(cx, liqTop, topR * 0.88, 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (spec.texture) {
        const y0 = topCy;
        const y1 = topCy + bodyH;
        ctx.save();
        printPath();
        ctx.clip();
        for (let i = 0; i < strips; i += 1) {
          const a0 = -Math.PI / 2 + (i / strips) * Math.PI;
          const a1 = -Math.PI / 2 + ((i + 1) / strips) * Math.PI;
          const mid = (a0 + a1) / 2;
          const x0t = cx + Math.sin(a0) * rxAt(band0);
          const x1t = cx + Math.sin(a1) * rxAt(band0);
          const x0b = cx + Math.sin(a0) * rxAt(band1);
          const x1b = cx + Math.sin(a1) * rxAt(band1);
          ctx.save();
          ctx.beginPath();
          ctx.moveTo(x0t, y0);
          ctx.lineTo(x1t, y0);
          ctx.lineTo(x1b, y1);
          ctx.lineTo(x0b, y1);
          ctx.closePath();
          ctx.clip();
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = "high";
          const du = 1 / (2 * strips);
          let u0 = (turn + a0) / (Math.PI * 2) + 0.5;
          u0 = ((u0 % 1) + 1) % 1;
          const sw = Math.max(1, du * spec.texture.width);
          let sx = u0 * spec.texture.width;
          if (sx + sw > spec.texture.width) sx = Math.max(0, spec.texture.width - sw);
          const left = Math.min(x0t, x1t, x0b, x1b);
          const right = Math.max(x0t, x1t, x0b, x1b);
          const side = Math.abs(Math.sin(mid));
          ctx.globalAlpha = 1 - side * side * 0.04;
          ctx.globalCompositeOperation = "source-over";
          ctx.drawImage(spec.texture, sx, 0, sw, spec.texture.height, left - 0.6, y0, Math.max(1.2, right - left + 1.2), y1 - y0);
          ctx.restore();
        }
        ctx.restore();
      }

      // rim / mouth - thin same-material lip
      ctx.beginPath();
      ctx.ellipse(cx, topCy, topR, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#d8d6d3";
      ctx.lineWidth = Math.max(1.2, topR * 0.04);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, topCy, topR * 0.92, ry * 0.7, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = Math.max(0.8, topR * 0.02);
      ctx.stroke();
}

function mixWhite(hex: string) {
  const raw = hex.replace("#", "");
  const r = parseInt(raw.slice(0, 2), 16);
  const g = parseInt(raw.slice(2, 4), 16);
  const b = parseInt(raw.slice(4, 6), 16);
  return (amount: number) => {
    const mix = (c: number) => Math.round(c + (255 - c) * amount);
    return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
  };
}



export function cupStills(
  spec: CupDraw,
  turns: number[],
  width = 1200,
  height = 1600,
): HTMLCanvasElement[] {
  return turns.map((turn) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    const layer = document.createElement("canvas");
    layer.width = width;
    layer.height = height;
    const lctx = layer.getContext("2d");
    if (lctx && renderCupGL(lctx, width, height, spec, turn)) {
      ctx.drawImage(layer, 0, 0);
    } else {
      drawCup2d(ctx, width, height, spec, turn);
    }
    return canvas;
  });
}
