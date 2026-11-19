import { useEffect, useRef } from "react";

type Props = {
  texture: HTMLCanvasElement | null;
  top: number;
  bot: number;
  heightMm: number;
  cover: number;
  spin: boolean;
  className?: string;
};

export function CupView({ texture, top, bot, heightMm, cover, spin, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const angle = useRef(0);
  const drag = useRef<{ x: number; a: number } | null>(null);
  const live = useRef({ texture, top, bot, heightMm, cover, spin });
  live.current = { texture, top, bot, heightMm, cover, spin };

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

      const lipPx = Math.max(ry + Math.max(2, topR * 0.045), bodyH * Math.min(0.09, 8 / spec.heightMm));
      const footMin = bodyH * 0.065;
      const spanPx = Math.min(Math.max(bodyH * 0.18, bodyH * spec.cover), bodyH - lipPx - footMin);
      const band0 = lipPx / bodyH;
      const band1 = (lipPx + spanPx) / bodyH;

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
      frost.addColorStop(0, "#eef2f4");
      frost.addColorStop(0.16, "#ffffff");
      frost.addColorStop(0.48, "#fbfcfd");
      frost.addColorStop(0.78, "#f4f7f8");
      frost.addColorStop(1, "#e3e9ed");
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
          let u0 = (angle.current + a0) / (Math.PI * 2) + 0.5;
          u0 = ((u0 % 1) + 1) % 1;
          const sw = Math.max(1, du * spec.texture.width);
          let sx = u0 * spec.texture.width;
          if (sx + sw > spec.texture.width) sx = Math.max(0, spec.texture.width - sw);
          const left = Math.min(x0t, x1t, x0b, x1b);
          const right = Math.max(x0t, x1t, x0b, x1b);
          const side = Math.abs(Math.sin(mid));
          ctx.globalAlpha = 1 - side * side * 0.12;
          ctx.drawImage(spec.texture, sx, 0, sw, spec.texture.height, left - 0.6, y0, Math.max(1.2, right - left + 1.2), y1 - y0);
          ctx.restore();
        }
        ctx.restore();
      }

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
      sheen.addColorStop(0.14, "rgba(255,255,255,0.55)");
      sheen.addColorStop(0.34, "rgba(255,255,255,0)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(cx - topR, topCy, topR * 2, bodyH);
      ctx.restore();

      ctx.beginPath();
      ctx.ellipse(cx, topCy + 0.4, topR * 0.9, ry * 0.72, 0, 0, Math.PI * 2);
      const hole = ctx.createLinearGradient(cx, topCy - ry, cx, topCy + ry);
      hole.addColorStop(0, "#f7f9fa");
      hole.addColorStop(1, "#dfe6ea");
      ctx.fillStyle = hole;
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(cx, topCy, topR * 0.955, ry * 0.9, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "#fcfdfe";
      ctx.lineWidth = Math.max(2.2, topR * 0.055);
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(cx, topCy, topR, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(168, 176, 184, 0.6)";
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(cx, topCy + 0.3, topR * 0.9, ry * 0.68, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(186, 194, 200, 0.9)";
      ctx.lineWidth = 1;
      ctx.stroke();

      const footRy = Math.max(2.2, botR * 0.11);
      ctx.beginPath();
      ctx.ellipse(cx, topCy + bodyH, botR, footRy, 0, 0, Math.PI);
      ctx.strokeStyle = "rgba(176, 184, 190, 0.75)";
      ctx.lineWidth = Math.max(1.3, topR * 0.016);
      ctx.stroke();

      if (spec.spin && !reduce && !drag.current) angle.current += 0.007;
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
