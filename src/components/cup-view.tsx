import { useEffect, useRef } from "react";

type Props = {
  texture: HTMLCanvasElement | null;
  top: number;
  bot: number;
  heightMm: number;
  cover: number;
  body?: string | null;
  liquid?: "none" | "beer" | "soda";
  spin: boolean;
  className?: string;
};

export function CupView({ texture, top, bot, heightMm, cover, body = null, liquid = "none", spin, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const angle = useRef(0);
  const drag = useRef<{ x: number; a: number } | null>(null);
  const paused = useRef(false);
  const live = useRef({ texture, top, bot, heightMm, cover, body, liquid, spin });
  live.current = { texture, top, bot, heightMm, cover, body, liquid, spin };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const paint = () => {
      const spec = live.current;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 2 || height < 2) return;
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const bw = Math.floor(width * ratio);
      const bh = Math.floor(height * ratio);
      if (canvas.width !== bw || canvas.height !== bh) {
        canvas.width = bw;
        canvas.height = bh;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      drawCup(ctx, width, height, spec, angle.current);

      if (spec.spin && !reduce && !drag.current && !paused.current) angle.current += 0.007;
    };

    const draw = () => paint();
    if (!spin) {
      draw();
      const observer = new ResizeObserver(() => draw());
      observer.observe(canvas);
      return () => observer.disconnect();
    }
    const loop = () => {
      draw();
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [texture, top, bot, heightMm, cover, spin]);

  return (
    <canvas
      ref={ref}
      className={className ?? "h-80 w-full touch-none lg:h-[32rem]"}
      aria-label="Copo Ecocup. Arrasta para rodar."
      onMouseEnter={() => { paused.current = true; }}
      onMouseLeave={() => { paused.current = false; }}
      onPointerDown={(event) => {
        if (!spin) return;
        drag.current = { x: event.clientX, a: angle.current };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        angle.current = drag.current.a + (event.clientX - drag.current.x) * 0.012;
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    />
  );
}


type CupDraw = {
  texture: HTMLCanvasElement | null;
  top: number;
  bot: number;
  heightMm: number;
  cover: number;
  body?: string | null;
  liquid?: "none" | "beer" | "soda";
};

function drawCup(
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

      const lipPx = Math.max(ry + Math.max(2, topR * 0.03), bodyH * 0.03);
      const footMin = bodyH * 0.065;
      // Pattern/logo fills from just below the rim to near the bottom
      const band0 = lipPx / bodyH;
      const band1 = 1 - (footMin / bodyH);

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

      // IML print layer: opaque color band over the translucent cup, logo sits on top
      if (spec.body) {
        const imlTop = topCy + band0 * bodyH;
        const imlBot = topCy + band1 * bodyH;
        const imlRx0 = rxAt(band0);
        const imlRx1 = rxAt(band1);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx - imlRx0 * 0.98, imlTop);
        ctx.lineTo(cx + imlRx0 * 0.98, imlTop);
        ctx.lineTo(cx + imlRx1 * 0.98, imlBot);
        ctx.lineTo(cx - imlRx1 * 0.98, imlBot);
        ctx.closePath();
        ctx.fillStyle = spec.body;
        ctx.globalAlpha = 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
        // slight sheen on the IML layer
        const imlSheen = ctx.createLinearGradient(cx - imlRx0, 0, cx + imlRx0, 0);
        imlSheen.addColorStop(0, "rgba(255,255,255,0)");
        imlSheen.addColorStop(0.25, "rgba(255,255,255,0.18)");
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
        const y0 = topCy + band0 * bodyH;
        const y1 = topCy + band1 * bodyH;
        const rx0 = rxAt(band0);
        const rx1 = rxAt(band1);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx - rx0, y0);
        ctx.lineTo(cx + rx0, y0);
        ctx.lineTo(cx + rx1, y1);
        ctx.lineTo(cx - rx1, y1);
        ctx.closePath();
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
  width = 900,
  height = 1200,
): HTMLCanvasElement[] {
  return turns.map((turn) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return canvas;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    drawCup(ctx, width, height, spec, turn);
    return canvas;
  });
}
