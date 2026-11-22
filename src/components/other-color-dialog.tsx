import { useEffect, useRef, useState } from "react";
import { cmykToHex, hexToRgb, parseChannel, rgbToCmyk, rgbToHex } from "@/lib/color-input";

type Props = {
  open: boolean;
  color: string | null;
  title: string;
  lead: string;
  closeLabel: string;
  onColor: (hex: string) => void;
  onClose: () => void;
};

export function OtherColorDialog({ open, color, title, lead, closeLabel, onColor, onClose }: Props) {
  const [mode, setMode] = useState<"rgb" | "cmyk">("rgb");
  const [rgb, setRgb] = useState({ r: "228", g: "87", b: "46" });
  const [cmyk, setCmyk] = useState({ c: "0", m: "62", y: "80", k: "11" });
  const colorRef = useRef(color);
  colorRef.current = color;

  useEffect(() => {
    if (!open) return;
    const [r, g, b] = hexToRgb(colorRef.current || "#E4572E");
    const next = rgbToCmyk(r, g, b);
    setRgb({ r: String(r), g: String(g), b: String(b) });
    setCmyk({ c: String(next.c), m: String(next.m), y: String(next.y), k: String(next.k) });
    setMode("rgb");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const preview = (() => {
    const r = parseChannel(rgb.r, 255);
    const g = parseChannel(rgb.g, 255);
    const b = parseChannel(rgb.b, 255);
    if (r === null || g === null || b === null) return color || "#E4572E";
    return rgbToHex(r, g, b);
  })();

  function commitRgb(next: { r: string; g: string; b: string }) {
    setRgb(next);
    const r = parseChannel(next.r, 255);
    const g = parseChannel(next.g, 255);
    const b = parseChannel(next.b, 255);
    if (r === null || g === null || b === null) return;
    const ink = rgbToCmyk(r, g, b);
    setCmyk({ c: String(ink.c), m: String(ink.m), y: String(ink.y), k: String(ink.k) });
    onColor(rgbToHex(r, g, b));
  }

  function commitCmyk(next: { c: string; m: string; y: string; k: string }) {
    setCmyk(next);
    const c = parseChannel(next.c, 100);
    const m = parseChannel(next.m, 100);
    const y = parseChannel(next.y, 100);
    const k = parseChannel(next.k, 100);
    if (c === null || m === null || y === null || k === null) return;
    const hex = cmykToHex(c, m, y, k);
    const [r, g, b] = hexToRgb(hex);
    setRgb({ r: String(r), g: String(g), b: String(b) });
    onColor(hex);
  }

  const fields = mode === "rgb"
    ? [
        ["r", "R", rgb.r, 255],
        ["g", "G", rgb.g, 255],
        ["b", "B", rgb.b, 255],
      ]
    : [
        ["c", "C", cmyk.c, 100],
        ["m", "M", cmyk.m, 100],
        ["y", "Y", cmyk.y, 100],
        ["k", "K", cmyk.k, 100],
      ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/35 sm:justify-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="other-color-title"
        className="max-h-[78vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-md sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="other-color-title" className="font-display text-xl">{title}</h3>
            <p className="mt-1 text-sm text-muted">{lead}</p>
          </div>
          <span className="h-12 w-12 shrink-0 rounded-full border border-line" style={{ background: preview }} aria-hidden />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-full bg-paper p-1" role="group" aria-label="RGB CMYK">
          {(["rgb", "cmyk"] as const).map((id) => (
            <button
              key={id}
              type="button"
              data-testid={`color-mode-${id}`}
              aria-pressed={mode === id}
              className={`min-h-11 rounded-full text-sm font-medium ${mode === id ? "bg-ink text-paper" : "text-ink"}`}
              onClick={() => setMode(id)}
            >
              {id.toUpperCase()}
            </button>
          ))}
        </div>
        <div className={`mt-4 grid gap-2 ${mode === "rgb" ? "grid-cols-3" : "grid-cols-4"}`}>
          {fields.map(([key, label, value, max]) => (
            <label key={key} className="block text-sm">
              <span className="text-muted">{label}</span>
              <input
                data-testid={`color-${mode}-${key}`}
                className="mt-1 min-h-11 w-full rounded-xl border border-line px-2 text-center text-base"
                inputMode="numeric"
                min={0}
                max={Number(max)}
                value={String(value)}
                onChange={(event) => {
                  const next = event.target.value.replace(/[^\d.,]/g, "");
                  if (mode === "rgb") commitRgb({ ...rgb, [key]: next });
                  else commitCmyk({ ...cmyk, [key]: next });
                }}
              />
            </label>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted">{preview}</p>
        <button type="button" className="mt-4 min-h-11 w-full rounded-full bg-ink text-sm text-paper" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
