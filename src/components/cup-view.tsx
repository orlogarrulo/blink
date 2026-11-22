import { useEffect, useRef } from "react";
import { paintCupCanvas } from "@/lib/cup-draw";

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
  quality?: "draft" | "full";
};

export function CupView({ texture, top, bot, heightMm, cover, body = null, liquid = "none", spin, className, quality = "draft" }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const angle = useRef(0);
  const drag = useRef<{ x: number; a: number } | null>(null);
  const paused = useRef(false);
  const live = useRef({ texture, top, bot, heightMm, cover, body, liquid, spin, quality });
  live.current = { texture, top, bot, heightMm, cover, body, liquid, spin, quality };
  const paintRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const paint = () => {
      const spec = live.current;
      paintCupCanvas(
        canvas,
        {
          texture: spec.texture,
          top: spec.top,
          bot: spec.bot,
          heightMm: spec.heightMm,
          cover: spec.cover,
          body: spec.body,
          liquid: spec.liquid,
          quality: spec.quality,
        },
        angle.current,
      );
    };
    paintRef.current = paint;
    const observer = new ResizeObserver(() => paint());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let alive = true;
    const tick = () => {
      if (!alive) return;
      const spec = live.current;
      if (spec.spin && !reduce && !drag.current && !paused.current) angle.current += 0.01;
      paintRef.current();
      if (spec.spin && !reduce) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
    };
  }, [texture, top, bot, heightMm, cover, body, liquid, spin, quality]);

  return (
    <canvas
      ref={ref}
      className={className ?? "h-80 w-full touch-none lg:h-[32rem]"}
      aria-label="Copo. Arrasta para rodar."
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
        paintRef.current();
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    />
  );
}

