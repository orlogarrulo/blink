import { useEffect, useRef, useState } from "react";
import { cmykToHex, hexToRgb, parseChannel, rgbToCmyk, rgbToHex } from "@/lib/color-input";
import { bodyCss, encodeBody, parseBody, type BodyMode } from "@/lib/body-color";
import { STOCK } from "@/lib/catalog";

type Props = {
  open: boolean;
  color: string | null;
  title: string;
  lead: string;
  closeLabel: string;
  onColor: (body: string) => void;
  onClose: () => void;
  /** Labels for the colour mix (pt by default). */
  mix?: { title: string; one: string; grad: string; stripes: string; add: string; remove: string; hint: string };
};

const MIX_PT = {
  title: "Juntar cores",
  one: "Uma cor",
  grad: "Degradê",
  stripes: "Faixas",
  add: "Mais uma cor",
  remove: "Tirar esta cor",
  hint: "Da boca para a base. A borda da boca fica sempre em PP natural.",
};

export function OtherColorDialog({ open, color, title, lead, closeLabel, onColor, onClose, mix = MIX_PT }: Props) {
  const [mode, setMode] = useState<"rgb" | "cmyk">("rgb");
  const [rgb, setRgb] = useState({ r: "228", g: "87", b: "46" });
  const [cmyk, setCmyk] = useState({ c: "0", m: "62", y: "80", k: "11" });
  const [mixMode, setMixMode] = useState<BodyMode>("solid");
  const [colors, setColors] = useState<string[]>(["#E4572E"]);
  const [active, setActive] = useState(0);
  const colorRef = useRef(color);
  colorRef.current = color;

  function loadFields(hex: string) {
    const [r, g, b] = hexToRgb(hex);
    const next = rgbToCmyk(r, g, b);
    setRgb({ r: String(r), g: String(g), b: String(b) });
    setCmyk({ c: String(next.c), m: String(next.m), y: String(next.y), k: String(next.k) });
  }

  useEffect(() => {
    if (!open) return;
    const spec = parseBody(colorRef.current) ?? { mode: "solid" as const, colors: ["#E4572E"] };
    setMixMode(spec.mode);
    setColors(spec.colors);
    setActive(0);
    loadFields(spec.colors[0]);
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

  function emit(nextMode: BodyMode, nextColors: string[]) {
    const body = encodeBody({ mode: nextMode, colors: nextMode === "solid" ? nextColors.slice(0, 1) : nextColors });
    if (body) onColor(body);
  }

  function setActiveColor(hex: string) {
    const next = colors.map((item, i) => (i === active ? hex : item));
    setColors(next);
    emit(mixMode, next);
  }

  function pick(index: number) {
    setActive(index);
    loadFields(colors[index]);
  }

  function chooseMix(next: BodyMode) {
    let list = colors;
    if (next !== "solid" && list.length < 2) list = [list[0], list[0].toLowerCase() === "#f7f4ef" ? "#009739" : "#F7F4EF"];
    setMixMode(next);
    setColors(list);
    if (next === "solid") pick(0);
    emit(next, list);
  }

  function addColor() {
    if (colors.length >= 4) return;
    const used = new Set(colors.map((hex) => hex.toLowerCase()));
    const extra = STOCK.find((swatch) => !used.has(swatch.hex.toLowerCase()))?.hex ?? "#1A120C";
    const next = [...colors, extra];
    setColors(next);
    setActive(next.length - 1);
    loadFields(extra);
    emit(mixMode, next);
  }

  function removeColor() {
    if (colors.length <= 2) return;
    const next = colors.filter((_, i) => i !== active);
    setColors(next);
    const index = Math.max(0, active - 1);
    setActive(index);
    loadFields(next[index]);
    emit(mixMode, next);
  }

  const preview = (() => {
    const r = parseChannel(rgb.r, 255);
    const g = parseChannel(rgb.g, 255);
    const b = parseChannel(rgb.b, 255);
    if (r === null || g === null || b === null) return colors[active] || "#E4572E";
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
    setActiveColor(rgbToHex(r, g, b));
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
    setActiveColor(hex);
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

  const body = encodeBody({ mode: mixMode, colors: mixMode === "solid" ? colors.slice(0, 1) : colors });

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/35 sm:justify-center sm:p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="other-color-title"
        className="max-h-[86vh] w-full overflow-y-auto rounded-t-3xl bg-white p-4 shadow-2xl pb-[max(1rem,env(safe-area-inset-bottom))] sm:mx-auto sm:max-w-md sm:rounded-3xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 id="other-color-title" className="font-display text-xl">{title}</h3>
            <p className="mt-1 text-sm text-muted">{lead}</p>
          </div>
          <span className="h-14 w-10 shrink-0 rounded-b-2xl rounded-t-md border border-line" style={{ background: bodyCss(body) ?? preview }} aria-hidden />
        </div>
        <p className="mt-4 text-xs text-muted">{mix.title}</p>
        <div className="mt-1 grid grid-cols-3 gap-1 rounded-full bg-paper p-1" role="group" aria-label={mix.title}>
          {([["solid", mix.one], ["grad", mix.grad], ["faixas", mix.stripes]] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              data-testid={`color-mix-${id}`}
              aria-pressed={mixMode === id}
              className={`min-h-11 rounded-full text-sm font-medium ${mixMode === id ? "bg-ink text-paper" : "text-ink"}`}
              onClick={() => chooseMix(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {mixMode !== "solid" ? (
          <div className="mt-3">
            <div className="flex flex-wrap items-center gap-2">
              {colors.map((hex, index) => (
                <button
                  key={`${index}-${hex}`}
                  type="button"
                  aria-label={`${index + 1}: ${hex}`}
                  aria-pressed={active === index}
                  className={`h-11 w-11 rounded-full border ${active === index ? "border-ink ring-2 ring-ink" : "border-line"}`}
                  style={{ background: hex }}
                  onClick={() => pick(index)}
                />
              ))}
              {colors.length < 4 ? (
                <button type="button" aria-label={mix.add} className="h-11 w-11 rounded-full border border-dashed border-ink text-lg" onClick={addColor}>+</button>
              ) : null}
              {colors.length > 2 ? (
                <button type="button" className="min-h-11 px-2 text-xs text-muted underline" onClick={removeColor}>{mix.remove}</button>
              ) : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {STOCK.map((swatch) => (
                <button key={`mix-${swatch.hex}`} type="button" aria-label={swatch.name} className="h-8 w-8 rounded-full border border-line" style={{ background: swatch.hex }} onClick={() => { loadFields(swatch.hex); setActiveColor(swatch.hex); }} />
              ))}
            </div>
            <p className="mt-2 text-xs text-muted">{mix.hint}</p>
          </div>
        ) : null}
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
        <p className="mt-3 text-center text-xs text-muted">{mixMode === "solid" ? preview : colors.join(" · ")}</p>
        <button type="button" className="mt-4 min-h-11 w-full rounded-full bg-ink text-sm text-paper" onClick={onClose}>
          {closeLabel}
        </button>
      </div>
    </div>
  );
}
