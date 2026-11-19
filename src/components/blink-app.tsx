import { useEffect, useMemo, useState, type ReactNode } from "react";
import { CupView } from "@/components/cup-view";
import { CupStage } from "@/components/cup-stage";
import {
  CUPS,
  PROCESS_LABEL,
  areaFor,
  cupById,
  deliveryDate,
  freightDays,
  freightMode,
  priceFor,
  processesFor,
  productionDays,
  STOCK,
  type Area,
  type Process,
} from "@/lib/catalog";
import { LANGS, detectLang, localeFor, text, type Lang } from "@/lib/copy";
import { canvasPdf, cmyk, dominantColors, downloadBlob, openPdf, paintLabel, sheetCanvas, tintCanvas, viewsSheet } from "@/lib/print";
import { dialForMarket, detectMarket, KZ_PER_EUR, pricePair, type Market } from "@/lib/money";
import { DIALS } from "@/lib/phone";
import { rasterizeSvg, traceCanvas } from "@/lib/trace";

type SampleId = "medida" | "cheio" | "margem" | "faixa" | "alto" | "chapado" | "vetor";
type Fit = "contain" | "cover" | "band" | "height";

type Draft = {
  event: string;
  promoter: string;
  email: string;
  dial: string;
  phone: string;
  eventDate: string;
  qty: number;
  cupId: string;
  process: Process;
  sample: SampleId | null;
};

const SAMPLES: { id: SampleId; name: string; note: string; fit: Fit; scale: number; flat: boolean }[] = [
  { id: "medida", name: "À medida", note: "Cabe na janela, ao centro", fit: "contain", scale: 1, flat: false },
  { id: "cheio", name: "Copo cheio", note: "Enche a janela, ao centro", fit: "cover", scale: 1, flat: false },
  { id: "margem", name: "Com margem", note: "Mais pequeno, ao centro", fit: "contain", scale: 0.72, flat: false },
  { id: "faixa", name: "Faixa", note: "Faixa horizontal, ao centro", fit: "band", scale: 1, flat: false },
  { id: "alto", name: "Na altura", note: "Usa a altura da janela", fit: "height", scale: 1, flat: false },
  { id: "chapado", name: "Chapado", note: "Cores do próprio ficheiro", fit: "contain", scale: 1, flat: true },
  { id: "vetor", name: "Vetor", note: "Curvas traçadas da arte", fit: "contain", scale: 1, flat: false },
];

const EMPTY: Draft = {
  event: "",
  promoter: "",
  email: "",
  dial: "+244",
  phone: "",
  eventDate: "",
  qty: 2000,
  cupId: "ECO40",
  process: "iml",
  sample: null,
};

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem("blink-draft");
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    const sample = SAMPLES.some((item) => item.id === parsed.sample) ? (parsed.sample as SampleId) : null;
    const dial = typeof parsed.dial === "string" && DIALS.includes(parsed.dial) ? parsed.dial : EMPTY.dial;
    return { ...EMPTY, ...parsed, sample, dial };
  } catch {
    return EMPTY;
  }
}

async function readArt(file: File): Promise<HTMLImageElement> {
  if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    const pdfjs = await import("pdfjs-dist");
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
    const data = new Uint8Array(await file.arrayBuffer());
    const doc = await pdfjs.getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 4 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Sem tela");
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    return loadImage(canvas.toDataURL("image/png"));
  }
  return loadImage(URL.createObjectURL(file));
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível ler o ficheiro."));
    image.src = src;
  });
}

function sampleById(id: SampleId) {
  return SAMPLES.find((item) => item.id === id) ?? SAMPLES[0];
}

export function BlinkApp() {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [ready, setReady] = useState(false);
  const [art, setArt] = useState<HTMLImageElement | null>(null);
  const [artName, setArtName] = useState("");
  const [error, setError] = useState("");
  const [spin, setSpin] = useState(true);
  const [renderMode, setRenderMode] = useState<"frost" | "clear" | "studio">("frost");
  const [drink, setDrink] = useState<"none" | "beer" | "soda">("none");
  const [vectorLabel, setVectorLabel] = useState<HTMLCanvasElement | null>(null);
  const [tracing, setTracing] = useState(false);
  const [tint, setTint] = useState<string | null>(null);
  const [market, setMarket] = useState<Market>("KZ");
  const [lang, setLang] = useState<Lang>("pt");
  const t = text(lang);
  const locale = localeFor(lang);

  useEffect(() => {
    const saved = loadDraft();
    const next = detectMarket();
    setMarket(next);
    setLang(detectLang());
    if (!saved.phone && saved.dial === "+244") saved.dial = dialForMarket(next);
    setDraft(saved);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem("blink-draft", JSON.stringify(draft));
  }, [draft, ready]);

  useEffect(() => {
    localStorage.setItem("blink-lang", lang);
    document.documentElement.lang = lang;
    document.title = t.title;
  }, [lang, t.title]);

  const cup = cupById(draft.cupId);
  const allowed = processesFor(cup);
  const process = allowed.includes(draft.process) ? draft.process : allowed[0];
  const area = areaFor(cup, process);
  const priced = priceFor(cup, draft.qty);
  const delivery = deliveryDate(draft.qty, process);
  const deliveryLabel = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(delivery);
  const late = draft.eventDate ? delivery > new Date(`${draft.eventDate}T23:59:00`) : false;
  const unitPrice = pricePair(priced.tier.kz, market);
  const lotPrice = pricePair(priced.tier.kz * draft.qty, market);

  useEffect(() => {
    if (ready && process !== draft.process) setDraft((current) => ({ ...current, process }));
  }, [ready, process, draft.process]);

  const baseLabels = useMemo(() => {
    if (!area || !art || typeof document === "undefined") return null;
    const ppm = Math.min(12, Math.max(8, Math.round(1800 / area.w)));
    const probe = paintLabel({
      area,
      ppm,
      image: art,
      scale: 1,
      shift: 0,
      title: "",
      ink: "#1A120C",
      process,
      suggest: false,
      palette: [],
      inkCount: 2,
      fit: "contain",
    });
    const found = dominantColors(probe, 4);
    const palette = found.length > 0 ? found : ["#1A120C"];
    const map = {} as Record<SampleId, HTMLCanvasElement>;
    for (const sample of SAMPLES) {
      if (sample.id === "vetor") continue;
      map[sample.id] = paintLabel({
        area,
        ppm,
        image: art,
        scale: sample.scale,
        shift: 0,
        title: "",
        ink: palette[0],
        process,
        suggest: sample.flat,
        palette,
        inkCount: 2,
        fit: sample.fit,
      });
    }
    return map;
  }, [area, art, process]);

  const fileColors = useMemo(() => (baseLabels ? dominantColors(baseLabels.medida, 4) : []), [baseLabels]);

  const labels = useMemo(() => {
    if (!baseLabels) return null;
    if (!tint) return baseLabels;
    const map = {} as Record<SampleId, HTMLCanvasElement>;
    for (const sample of SAMPLES) {
      if (sample.id === "vetor" || !baseLabels[sample.id]) continue;
      map[sample.id] = tintCanvas(baseLabels[sample.id], tint, process);
    }
    return map;
  }, [baseLabels, tint, process]);

  useEffect(() => {
    if (!baseLabels?.medida) {
      setVectorLabel(null);
      setTracing(false);
      return;
    }
    let cancel = false;
    setTracing(true);
    const timer = window.setTimeout(() => {
      try {
        const traced = traceCanvas(baseLabels.medida, { mode: "auto", process, inks: dominantColors(baseLabels.medida, 3), inkCount: 1 });
        if (!traced || traced.paths === 0) {
          if (!cancel) {
            setVectorLabel(null);
            setTracing(false);
          }
          return;
        }
        void rasterizeSvg(traced.svg, baseLabels.medida.width, baseLabels.medida.height).then((canvas) => {
          if (cancel) return;
          setVectorLabel(canvas);
          setTracing(false);
        });
      } catch {
        if (!cancel) setTracing(false);
      }
    }, 80);
    return () => {
      cancel = true;
      window.clearTimeout(timer);
    };
  }, [baseLabels, process]);

  function patch(partial: Partial<Draft>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function chooseCup(id: string) {
    const next = cupById(id);
    const nextAllowed = processesFor(next);
    patch({ cupId: id, process: nextAllowed.includes(draft.process) ? draft.process : nextAllowed[0] });
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError("");
    try {
      const image = await readArt(file);
      setArt(image);
      setArtName(file.name);
      setTint(null);
      patch({ sample: null });
    } catch {
      setError(t.fileError);
    }
  }

  const vectorShown = useMemo(
    () => (vectorLabel && tint ? tintCanvas(vectorLabel, tint, process) : vectorLabel),
    [vectorLabel, tint, process],
  );
  const chosenId = draft.sample;
  const chosen = chosenId === "vetor" ? vectorShown : chosenId && labels ? labels[chosenId] : null;
  const colors = chosen ? dominantColors(chosen, 3) : [];

  async function exportSheet() {
    if (!area || !art || !chosenId) return;
    await document.fonts.ready;
    const sample = sampleById(chosenId);
    const probe = paintLabel({
      area,
      ppm: 300 / 25.4,
      image: art,
      scale: 1,
      shift: 0,
      title: "",
      ink: "#1A120C",
      process,
      suggest: false,
      palette: [],
      inkCount: 2,
      fit: "contain",
    });
    const palette = dominantColors(probe, 4);
    let printLabel = paintLabel({
      area,
      ppm: 300 / 25.4,
      image: art,
      scale: sample.scale,
      shift: 0,
      title: "",
      ink: palette[0] || "#1A120C",
      process,
      suggest: sample.flat,
      palette: palette.length > 0 ? palette : ["#1A120C"],
      inkCount: 2,
      fit: sample.fit,
    });
    if (tint) printLabel = tintCanvas(printLabel, tint, process);
    const slug = (draft.event || "blink").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "blink";
    if (sample.id === "vetor") {
      const traced = traceCanvas(printLabel, { mode: "auto", process, inks: palette, inkCount: 1 });
      if (traced && traced.paths > 0) {
        printLabel = await rasterizeSvg(traced.svg, printLabel.width, printLabel.height);
        downloadBlob(new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${traced.svg}`], { type: "image/svg+xml" }), `${slug}-vetor.svg`);
      }
    }
    const sheetColors = (tint ? [tint] : palette.length > 0 ? palette : colors).slice(0, 3).map((hex) => ({ hex }));
    const sheet = sheetCanvas({
      event: draft.event,
      promoter: draft.promoter,
      email: draft.email,
      phone: draft.phone ? `${draft.dial} ${draft.phone}` : "",
      cup,
      process,
      qty: draft.qty,
      colors: sheetColors.length > 0 ? sheetColors : [{ hex: "#1A120C" }],
      label: printLabel,
      delivery: deliveryLabel,
      eventDate: draft.eventDate,
      priceLine: `${unitPrice.primary} (${unitPrice.secondary}) / un  ·  ${lotPrice.primary} (${lotPrice.secondary})`,
    });
    downloadBlob(canvasPdf(sheet), `${slug}-ficha.pdf`);
    printLabel.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${slug}-etiqueta.png`);
    }, "image/png");
  }

  return (
    <main className="mx-auto min-h-dvh max-w-6xl px-4 pb-16 pt-5 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <BlinkLogo slogan={t.slogan} />
        <div className="flex items-center gap-1" role="group" aria-label={t.language}>
          {LANGS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={lang === item.id}
              onClick={() => setLang(item.id)}
              className={`min-h-11 min-w-11 rounded-full px-3 text-sm ${lang === item.id ? "bg-ink text-paper" : "bg-card text-ink"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="max-w-sm text-sm leading-relaxed text-muted">{t.intro}</p>
      </header>

      <section className="mt-6">
        <h2 className="font-display text-2xl">{t.plainTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.plainLead}</p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {CUPS.map((item) => {
            const on = item.id === cup.id;
            const window = areaFor(item, processesFor(item).includes(process) ? process : processesFor(item)[0]);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => chooseCup(item.id)}
                  className={`w-full rounded-3xl border bg-card px-2 pb-3 pt-2 text-left ${on ? "border-ink" : "border-line"}`}
                >
                  <CupView
                    texture={on && chosen ? chosen : null}
                    top={item.top}
                    bot={item.bot}
                    heightMm={item.height}
                    cover={window ? window.h / item.height : 0.6}
                    spin={false}
                    className="h-36 w-full"
                  />
                  <span className="mt-1 block text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted">
                    {item.cl} cl
                    {item.measured ? ` · ${item.height} mm` : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="mt-8 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-line bg-card px-4 text-center">
            <span className="font-medium">{t.upload}</span>
            <span className="mt-1 text-sm text-muted">{artName || t.uploadHint}</span>
            <input
              className="sr-only"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(event) => void onFile(event.target.files?.[0])}
            />
          </label>
          {error ? <p className="border-l-4 border-pitanga pl-3 text-sm">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            {processesFor(cup).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => patch({ process: item })}
                className={`min-h-11 rounded-full px-4 text-sm ${process === item ? "bg-ink text-paper" : "bg-card"}`}
              >
                {t.process[item]}
              </button>
            ))}
          </div>
          {area ? (
            <p className="text-sm text-muted">
              {cup.name}
              {cup.measured ? ` · ${cup.height} × ${t.mouth} ${cup.top} × ${t.base} ${cup.bot} mm` : ` · ${t.unmeasured}`}
              {` · ${t.window} ${area.w} × ${area.h} mm`}
            </p>
          ) : null}

          {art && baseLabels ? (
            <div>
              <h2 className="font-display text-2xl">{t.colorsTitle}</h2>
              <p className="mt-1 text-sm text-muted">{t.colorsLead}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setTint(null)}
                  className={`min-h-11 rounded-full border px-4 text-sm ${tint === null ? "border-ink" : "border-line bg-card"}`}
                >
                  {t.original}
                </button>
                {fileColors.map((hex) => (
                  <button
                    key={`file-${hex}`}
                    type="button"
                    aria-label={`${t.fileColor} ${hex}`}
                    onClick={() => setTint(hex)}
                    className={`h-11 w-11 rounded-full border ${tint === hex ? "border-ink ring-2 ring-ink" : "border-line"}`}
                    style={{ background: hex }}
                  />
                ))}
                {STOCK.map((swatch) => (
                  <button
                    key={swatch.name}
                    type="button"
                    aria-label={swatch.name}
                    onClick={() => setTint(swatch.hex)}
                    className={`h-11 w-11 rounded-full border ${tint === swatch.hex ? "border-ink ring-2 ring-ink" : "border-line"}`}
                    style={{ background: swatch.hex }}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {art && labels ? (
            <div>
              <h2 className="font-display text-2xl">{t.samplesTitle}</h2>
              <p className="mt-1 text-sm text-muted">{t.samplesLead}</p>
              <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
                {SAMPLES.map((sample) => {
                  const texture = sample.id === "vetor" ? vectorShown : labels[sample.id];
                  const on = draft.sample === sample.id;
                  return (
                    <li key={sample.id}>
                      <button
                        type="button"
                        onClick={() => patch({ sample: sample.id })}
                        className={`w-full rounded-3xl border bg-card px-1 pb-3 pt-1 text-left ${on ? "border-ink" : "border-line"}`}
                      >
                        <CupView
                          texture={texture ?? null}
                          top={cup.top}
                          bot={cup.bot}
                          heightMm={cup.height}
                          cover={area ? area.h / cup.height : 0.6}
                          spin={false}
                          className="h-32 w-full"
                        />
                        <span className="mt-1 block px-1 text-sm font-medium">{t.sample[sample.id].name}</span>
                        <span className="block px-1 text-xs text-muted">{sample.id === "vetor" && tracing ? t.tracing : t.sample[sample.id].note}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="text-sm text-muted">{t.waiting}</p>
          )}
        </div>

        <aside className="rounded-3xl border border-line bg-card p-4">
          <h2 className="font-display text-2xl">{t.sheet}</h2>
          <div className="mt-3 space-y-3">
            <Field label={t.event}>
              <input className={control} value={draft.event} onChange={(event) => patch({ event: event.target.value })} placeholder={t.projectName} />
            </Field>
            <Field label={t.promoter}>
              <input className={control} value={draft.promoter} onChange={(event) => patch({ promoter: event.target.value })} />
            </Field>
            <Field label="Email">
              <input className={control} type="email" autoComplete="email" inputMode="email" value={draft.email} onChange={(event) => patch({ email: event.target.value })} placeholder="cliente@estudio.ao" />
            </Field>
            <Field label={t.phone}>
              <span className="flex min-h-11 overflow-hidden rounded-2xl border border-line bg-paper">
                <select
                  aria-label={t.dial}
                  className="w-[5.5rem] shrink-0 border-r border-line bg-paper px-2 text-sm"
                  value={draft.dial}
                  onChange={(event) => patch({ dial: event.target.value })}
                >
                  {DIALS.map((dial) => (
                    <option key={dial} value={dial}>
                      {dial}
                    </option>
                  ))}
                </select>
                <input
                  className="min-h-11 min-w-0 flex-1 bg-transparent px-3"
                  inputMode="tel"
                  autoComplete="tel-national"
                  placeholder="9xx xxx xxx"
                  value={draft.phone}
                  onChange={(event) => patch({ phone: event.target.value.replace(/[^\d\s]/g, "") })}
                />
              </span>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.qty}>
                <input className={control} type="number" min={1} value={draft.qty} onChange={(event) => patch({ qty: Number(event.target.value) || 0 })} />
              </Field>
              <Field label={t.eventDate}>
                <input className={control} type="date" value={draft.eventDate} onChange={(event) => patch({ eventDate: event.target.value })} />
              </Field>
            </div>
            <p className="text-sm text-muted">
              {unitPrice.primary} {t.perTier} · {unitPrice.secondary}. {t.estimated} {deliveryLabel}. {t.freight} {freightMode(draft.qty) === "marítimo" ? t.sea : t.air}, {freightDays(draft.qty)} {t.after} {productionDays(process)} {t.working}.
            </p>
            {late ? <p className="border-l-4 border-pitanga pl-3 text-sm">{t.late}</p> : null}
            {priced.below ? <p className="text-sm text-muted">{t.belowMin}</p> : null}
          </div>
        </aside>
      </section>

      {chosen && area ? (
        <section className="mt-8 overflow-hidden rounded-3xl border border-line bg-card">
          <div className="grid items-start lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div>
              <div className="bg-paper">
                <CupStage
                  texture={chosen}
                  top={cup.top}
                  bot={cup.bot}
                  heightMm={cup.height}
                  cover={area.h / cup.height}
                  spin={spin}
                  mode={renderMode}
                  drink={drink}
                  className="h-[28rem] w-full cursor-pointer"
                  onViews={(shots) => {
                    const title = draft.event ? `${cup.name} · ${draft.event}` : cup.name;
                    openPdf(canvasPdf(viewsSheet(title, t.angles, shots)));
                  }}
                />
              </div>
              <p className="border-t border-line px-4 py-2 text-xs text-muted">{t.viewHint}</p>
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
                {(["frost", "clear", "studio"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={renderMode === id}
                    onClick={() => setRenderMode(id)}
                    className={`min-h-11 rounded-full px-4 text-sm ${renderMode === id ? "bg-ink text-paper" : "bg-card"}`}
                  >
                    {t.render[id]}
                  </button>
                ))}
              </div>
              <p className="px-4 pb-3 text-xs text-muted">{t.renderNote[renderMode]}</p>
              <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
                {(["none", "beer", "soda"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={drink === id}
                    onClick={() => setDrink(id)}
                    className={`min-h-11 rounded-full px-4 text-sm ${drink === id ? "bg-ink text-paper" : "bg-card"}`}
                  >
                    {t.drink[id]}
                  </button>
                ))}
              </div>
              <p className="px-4 pb-3 text-xs text-muted">{t.drinkNote}</p>
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                <p className="text-sm text-muted">
                  {cup.name} · {t.sample[chosenId as SampleId].name} · {t.process[process]}
                </p>
                <button type="button" className="min-h-11 px-3 text-sm" onClick={() => setSpin((value) => !value)}>
                  {spin ? t.stop : t.spin}
                </button>
              </div>
              <WindowPlate area={area} process={process} canvas={chosen} caption={t} />
            </div>
            <div className="space-y-4 border-t border-line p-4 lg:border-l lg:border-t-0">
              <h2 className="font-display text-3xl leading-tight">{draft.event || t.unnamed}</h2>
              <p className="text-sm text-muted">
                {draft.promoter || t.promoter}
                {draft.email ? ` · ${draft.email}` : ""}
                {draft.phone ? ` · ${draft.dial} ${draft.phone}` : ""}
                {` · ${cup.name} · ${t.process[process]} · ${draft.qty.toLocaleString(locale)} ${t.cups}`}
              </p>
              <p className="text-sm">
                {unitPrice.primary} {t.perUnit} · {lotPrice.primary} {t.inLot}
                <span className="text-muted"> · {unitPrice.secondary} {t.perUnit}</span>
              </p>
              <ul className="flex flex-wrap gap-3">
                {colors.map((hex) => (
                  <li key={hex} className="text-xs text-muted">
                    <span className="mb-1 block h-8 w-8 rounded-full border border-line" style={{ background: hex }} />
                    {hex.toUpperCase()}
                    <span className="block">{cmyk(hex)}</span>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => void exportSheet()} className="min-h-11 w-full rounded-full bg-ink text-sm font-medium text-paper">
                {t.download}{chosenId === "vetor" ? ` ${t.andSvg}` : ""}
              </button>
              <p className="text-xs leading-relaxed text-muted">{t.estimate} {KZ_PER_EUR} Kz.</p>
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}

function BlinkLogo({ slogan }: { slogan: string }) {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
        <rect width="48" height="48" rx="12" fill="var(--color-ink)" />
        <rect x="13" y="12" width="22" height="3.2" rx="1.4" fill="var(--color-paper)" />
        <path d="M14.5 16.2h19l-1.4 6.2H16z" fill="var(--color-urucum)" />
        <path d="M16.2 23.2h15.6l-1.5 8.2H17.8z" fill="var(--color-ipe)" />
        <path d="M18 32.2h12l-1.3 5.2h-9.4z" fill="var(--color-pitanga)" />
      </svg>
      <div>
        <p className="font-display text-4xl leading-none tracking-tight">BLINK</p>
        <p className="mt-1 text-sm text-muted">{slogan}</p>
      </div>
    </div>
  );
}

const control = "min-h-11 w-full rounded-2xl border border-line bg-paper px-3";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-muted">{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

function WindowPlate({ area, process, canvas, caption }: { area: Area; process: Process; canvas: HTMLCanvasElement; caption: ReturnType<typeof text> }) {
  const safety = process === "iml" ? 3 : 2;
  const [src, setSrc] = useState("");
  useEffect(() => {
    setSrc(canvas.toDataURL("image/png"));
  }, [canvas]);
  const pad = 36;
  const inner = 640;
  const innerH = inner * (area.h / area.w);
  const width = inner + pad * 2;
  const height = innerH + pad * 2;
  const insetX = (safety / area.w) * inner;
  const insetY = (safety / area.h) * innerH;
  return (
    <figure className="border-t border-line px-4 py-4">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={caption.plate}>
        <rect x={pad} y={pad} width={inner} height={innerH} fill="var(--color-paper)" />
        {src ? <image href={src} x={pad} y={pad} width={inner} height={innerH} preserveAspectRatio="xMidYMid meet" /> : null}
        <rect x={pad} y={pad} width={inner} height={innerH} fill="none" stroke="var(--color-ink)" strokeWidth="1.5" />
        <rect x={pad + insetX} y={pad + insetY} width={inner - insetX * 2} height={innerH - insetY * 2} fill="none" stroke="var(--color-ipe)" strokeDasharray="7 5" strokeWidth="1.5" />
        <text x={pad + inner / 2} y={height - 8} textAnchor="middle" fill="var(--color-ink)" fontSize="14" fontFamily="Outfit, sans-serif">
          {area.w} mm
        </text>
        <text x="16" y={pad + innerH / 2} fill="var(--color-ink)" fontSize="14" fontFamily="Outfit, sans-serif" transform={`rotate(-90 16 ${pad + innerH / 2})`} textAnchor="middle">
          {area.h} mm
        </text>
      </svg>
      <figcaption className="mt-2 text-xs leading-relaxed text-muted">
        {caption.cut} {safety} {caption.safety}
        {process === "iml" ? ` ${caption.imlNote}` : ""}
      </figcaption>
    </figure>
  );
}
