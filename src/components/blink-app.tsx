import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CupView, cupStills } from "@/components/cup-view";
import { Lineup } from "@/components/lineup";
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
import { angleSheet, canvasPdf, cmyk, composeLogos, composePattern, dominantColors, downloadBlob, openPdf, paintLabel, sheetCanvas, tintCanvas, viewsSheet } from "@/lib/print";
import { BOX_CUPS, airFreight, chargedQty, SHEET_KZ_PER_EUR, cupWeightScale } from "@/lib/freight";
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
  phrase: string;
  font: FontId;
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

const FONTS = [
  { id: "outfit", label: "Outfit", css: "Outfit, sans-serif" },
  { id: "fraunces", label: "Fraunces", css: "Fraunces, serif" },
  { id: "bebas", label: "Bebas", css: '"Bebas Neue", sans-serif' },
  { id: "caveat", label: "Caveat", css: "Caveat, cursive" },
] as const;
type FontId = (typeof FONTS)[number]["id"];

function fontCss(id: string) {
  return FONTS.find((item) => item.id === id)?.css ?? FONTS[0].css;
}

function moneyKz(value: number) {
  return `${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(Math.round(value))} Kz`;
}

function SheetMoney({ kz }: { kz: number }) {
  const euro = new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(kz / SHEET_KZ_PER_EUR);
  return (
    <span className="block leading-tight">
      <span className="block">{euro}</span>
      <span className="block text-xs text-muted">{moneyKz(kz)}</span>
    </span>
  );
}

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
  phrase: "",
  font: "outfit",
};

function loadDraft(): Draft {
  try {
    const raw = localStorage.getItem("blink-draft");
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Draft>;
    const sample = SAMPLES.some((item) => item.id === parsed.sample) ? (parsed.sample as SampleId) : null;
    const dial = typeof parsed.dial === "string" && DIALS.includes(parsed.dial) ? parsed.dial : EMPTY.dial;
    const font = FONTS.some((item) => item.id === parsed.font) ? (parsed.font as FontId) : EMPTY.font;
    const phrase = typeof parsed.phrase === "string" ? parsed.phrase.slice(0, 60) : "";
    return { ...EMPTY, ...parsed, sample, dial, font, phrase };
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
  const [logos, setLogos] = useState<{ image: HTMLImageElement; name: string }[]>([]);
  const [patterns, setPatterns] = useState<{ image: HTMLImageElement; name: string }[]>([]);
  const [rightLogos, setRightLogos] = useState<{ image: HTMLImageElement; name: string }[]>([]);
  const [rightPatterns, setRightPatterns] = useState<{ image: HTMLImageElement; name: string }[]>([]);
  const art = useMemo(() => (logos.length > 0 ? composeLogos(logos.map((item) => item.image)) : null), [logos]);
  const pattern = useMemo(() => (patterns.length > 0 ? composePattern(patterns.map((item) => item.image)) : null), [patterns]);
  const rightArt = useMemo(() => (rightLogos.length > 0 ? composeLogos(rightLogos.map((item) => item.image)) : null), [rightLogos]);
  const rightPattern = useMemo(() => (rightPatterns.length > 0 ? composePattern(rightPatterns.map((item) => item.image)) : null), [rightPatterns]);
  const [error, setError] = useState("");
  const [compareId, setCompareId] = useState("ECO12");
  const [compareQty, setCompareQty] = useState(400);
  const [right, setRight] = useState<{ phrase: string; font: FontId; sample: SampleId | null; tint: string | null; cupTint: string | null }>({
    phrase: "",
    font: "outfit",
    sample: null,
    tint: null,
    cupTint: null,
  });
  const [spin, setSpin] = useState(true);
  const [renderMode, setRenderMode] = useState<"frost" | "clear" | "studio">("frost");
  const [vectorLabel, setVectorLabel] = useState<HTMLCanvasElement | null>(null);
  const [tracing, setTracing] = useState(false);
  const [tint, setTint] = useState<string | null>(null);
  const [cupTint, setCupTint] = useState<string | null>(null);
  const [quote, setQuote] = useState<{ cupId: string; qty: number; unitKz: number; freightKz: number; lotKz: number } | null>(null);
  const [market, setMarket] = useState<Market>("KZ");
  const [lang, setLang] = useState<Lang>("pt");
  const shotsRef = useRef<((turns: number[], side?: "beer" | "soda") => HTMLCanvasElement[]) | null>(null);
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
  const other = cupById(compareId);
  const allowed = processesFor(cup);
  const process = allowed.includes(draft.process) ? draft.process : allowed[0];
  const area = areaFor(cup, process);
  const otherArea = areaFor(other, processesFor(other).includes(process) ? process : processesFor(other)[0]);
  const minimum = Math.min(...cup.prices.map((row) => row.qty));
  const billed = chargedQty(draft.qty, minimum, cup.prices.map((row) => row.qty));
  const priced = priceFor(cup, billed);
  const delivery = deliveryDate(billed, process);
  const deliveryLabel = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(delivery);
  const late = draft.eventDate ? delivery > new Date(`${draft.eventDate}T23:59:00`) : false;
  const unitPrice = pricePair(priced.tier.kz, market);
  const air = freightMode(billed) === "aéreo" ? airFreight(billed, cupWeightScale(cup)) : null;
  const freightKz = air?.kz ?? 0;
  const finalUnit = pricePair(priced.tier.kz + freightKz / Math.max(1, billed), market);
  const finalLot = pricePair(priced.tier.kz * billed + freightKz, market);
  const airMoney = air
    ? `${new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR" }).format(air.eur)} · ${new Intl.NumberFormat("pt-PT", { maximumFractionDigits: 0 }).format(Math.round(air.kz))} Kz`
    : "";

  useEffect(() => {
    if (ready && process !== draft.process) setDraft((current) => ({ ...current, process }));
  }, [ready, process, draft.process]);

  const baseLabels = useMemo(() => {
    const phrase = draft.phrase.trim();
    if (!area || (!art && !pattern && !phrase) || typeof document === "undefined") return null;
    const family = fontCss(draft.font);
    const ppm = Math.min(12, Math.max(8, Math.round(1800 / area.w)));
    const probe = paintLabel({
      area,
      ppm,
      image: art,
      pattern,
      scale: 1,
      shift: 0,
      title: phrase,
      font: family,
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
      pattern,
        scale: sample.scale,
        shift: 0,
        title: phrase,
        font: family,
        ink: palette[0],
        process,
        suggest: sample.flat,
        palette,
        inkCount: 2,
        fit: sample.fit,
        place: sample.id,
      });
    }
    return map;
  }, [area, art, pattern, process, draft.phrase, draft.font]);

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

  async function onFiles(list: FileList | null, role: "logo" | "pattern", side: "beer" | "soda") {
    if (!list || list.length === 0) return;
    setError("");
    try {
      const files = Array.from(list).slice(0, 3);
      const images = await Promise.all(files.map(async (file) => ({ image: await readArt(file), name: file.name })));
      if (side === "beer") {
        if (role === "logo") setLogos((current) => [...current, ...images].slice(0, 3));
        else setPatterns((current) => [...current, ...images].slice(0, 3));
        setTint(null);
        patch({ sample: null });
      } else {
        if (role === "logo") setRightLogos((current) => [...current, ...images].slice(0, 3));
        else setRightPatterns((current) => [...current, ...images].slice(0, 3));
        setRight((current) => ({ ...current, tint: null, sample: null }));
      }
    } catch {
      setError(t.fileError);
    }
  }

  const vectorShown = useMemo(
    () => (vectorLabel && tint ? tintCanvas(vectorLabel, tint, process) : vectorLabel),
    [vectorLabel, tint, process],
  );
  const otherAllowed = processesFor(other);
  const otherProcess = otherAllowed.includes(process) ? process : otherAllowed[0];
  const rightBase = useMemo(() => {
    const phrase = right.phrase.trim();
    const image = rightArt;
    const motif = rightPattern;
    if (!otherArea || (!image && !motif && !phrase) || typeof document === "undefined") return null;
    const family = fontCss(right.font);
    const ppm = Math.min(12, Math.max(8, Math.round(1800 / otherArea.w)));
    const probe = paintLabel({
      area: otherArea,
      ppm,
      image,
      pattern: motif,
      scale: 1,
      shift: 0,
      title: phrase,
      font: family,
      ink: "#1A120C",
      process: otherProcess,
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
        area: otherArea,
        ppm,
        image,
        pattern: motif,
        scale: sample.scale,
        shift: 0,
        title: phrase,
        font: family,
        ink: palette[0],
        process: otherProcess,
        suggest: sample.flat,
        palette,
        inkCount: 2,
        fit: sample.fit,
        place: sample.id,
      });
    }
    return map;
  }, [otherArea, rightArt, rightPattern, right.phrase, right.font, otherProcess]);
  const rightLabels = useMemo(() => {
    if (!rightBase) return null;
    if (!right.tint) return rightBase;
    const map = {} as Record<SampleId, HTMLCanvasElement>;
    for (const sample of SAMPLES) {
      if (sample.id === "vetor" || !rightBase[sample.id]) continue;
      map[sample.id] = tintCanvas(rightBase[sample.id], right.tint, otherProcess);
    }
    return map;
  }, [rightBase, right.tint, otherProcess]);
  const chosenId = draft.sample;
  const chosen = chosenId === "vetor" ? vectorShown : chosenId && labels ? labels[chosenId] : null;
  const shown = chosen ?? labels?.medida ?? null;
  const rightOwn = Boolean(rightArt || rightPattern || right.phrase.trim() || right.sample || right.tint);
  const rightId = right.sample ?? (rightOwn ? "medida" : chosenId);
  const rightShown = rightId && rightId !== "vetor" && rightLabels ? rightLabels[rightId] : null;
  const otherTexture = rightOwn ? rightShown : chosen;
  const colors = chosen ? dominantColors(chosen, 3) : [];

  async function exportCard(side: "beer" | "soda") {
    const item = side === "beer" ? cup : other;
    const itemArea = side === "beer" ? area : otherArea;
    const image = side === "beer" ? art : rightArt;
    const motif = side === "beer" ? pattern : rightPattern;
    const phrase = (side === "beer" ? draft.phrase : right.phrase).trim();
    const family = fontCss(side === "beer" ? draft.font : right.font);
    const sampleId = (side === "beer" ? chosenId : right.sample) ?? "medida";
    const ink = side === "beer" ? tint : right.tint;
    const body = side === "beer" ? cupTint : right.cupTint;
    const itemProcess = side === "beer" ? process : otherProcess;
    const texture = side === "beer" ? shown : rightShown;
    const numbers = liveQuote(item, side === "beer" ? draft.qty : compareQty);
    const unitMoney = pricePair(numbers.finalUnit, market);
    const lotMoney = pricePair(numbers.lot, market);
    if (!itemArea || (!image && !motif && !phrase) || !texture) return null;
    await document.fonts.ready;
    const sample = sampleById(sampleId === "vetor" ? "medida" : sampleId);
    const probe = paintLabel({
      area: itemArea,
      ppm: 300 / 25.4,
      image,
      pattern: motif,
      scale: 1,
      shift: 0,
      title: phrase,
      font: family,
      ink: "#1A120C",
      process: itemProcess,
      suggest: false,
      palette: [],
      inkCount: 2,
      fit: "contain",
    });
    const palette = dominantColors(probe, 4);
    let printLabel = paintLabel({
      area: itemArea,
      ppm: 300 / 25.4,
      image,
      pattern: motif,
      scale: sample.scale,
      shift: 0,
      title: phrase,
      font: family,
      ink: palette[0] || "#1A120C",
      process: itemProcess,
      suggest: sample.flat,
      palette: palette.length > 0 ? palette : ["#1A120C"],
      inkCount: 2,
      fit: sample.fit,
      place: sample.id === "vetor" ? "medida" : sample.id,
    });
    if (ink) printLabel = tintCanvas(printLabel, ink, itemProcess);
    const sheetColors = (ink ? [ink] : palette.length > 0 ? palette : ["#1A120C"]).slice(0, 3).map((hex) => ({ hex }));
    const when = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(deliveryDate(numbers.charge, itemProcess));
    const sheet = sheetCanvas({
      event: draft.event,
      promoter: draft.promoter,
      email: draft.email,
      phone: draft.phone ? `${draft.dial} ${draft.phone}` : "",
      cup: item,
      process: itemProcess,
      qty: numbers.charge,
      colors: sheetColors,
      label: printLabel,
      delivery: when,
      eventDate: draft.eventDate,
      priceLine: `${unitMoney.primary} (${unitMoney.secondary}) / un  ·  ${lotMoney.primary} (${lotMoney.secondary})`,
      freightNote: `aéreo  ·  ${numbers.charge} ${item.name}`,
    });
    const turns = [0, Math.PI * 0.28, Math.PI * 0.5];
    const flat = cupStills(
      {
        texture,
        top: item.top,
        bot: item.bot,
        heightMm: item.height,
        cover: motif ? 0.9 : itemArea.h / item.height,
        body,
      },
      turns,
    );
    const solid = shotsRef.current?.(turns, side) ?? [];
    const views = angleSheet([
      { name: "2D", labels: t.angles.slice(0, 3), shots: flat },
      { name: "3D", labels: t.angles.slice(0, 3), shots: solid },
    ]);
    return [sheet, views];
  }

  async function saveCard(side: "beer" | "soda") {
    const pages = await exportCard(side);
    if (!pages) return;
    const item = side === "beer" ? cup : other;
    const slug = `${(draft.event || "blink").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "blink"}-${item.id.toLowerCase()}`;
    downloadBlob(canvasPdf(pages), `${slug}-ficha.pdf`);
  }

  async function saveBoth() {
    const left = await exportCard("beer");
    const right = await exportCard("soda");
    const pages = [...(left ?? []), ...(right ?? [])];
    if (pages.length === 0) return;
    const slug = (draft.event || "blink").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "blink";
    downloadBlob(canvasPdf(pages), `${slug}-os-dois.pdf`);
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl overflow-x-hidden px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex w-full flex-wrap items-end justify-between gap-3">
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
        <p className="w-full max-w-xl text-sm leading-relaxed text-muted">{t.intro}</p>
      </header>

      <section className="mt-6">
        <h2 className="font-display text-2xl">{t.plainTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.plainLead}</p>
        <ul className="rise-list mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {CUPS.map((item) => {
            const on = item.id === cup.id;
            const window = areaFor(item, processesFor(item).includes(process) ? process : processesFor(item)[0]);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => chooseCup(item.id)}
                  className={`w-full rounded-3xl border bg-card px-2 pb-3 pt-2 text-left ${on ? "cup-on border-ink" : "border-line"}`}
                >
                  <CupView
                    texture={on && chosen ? chosen : null}
                    body={on ? cupTint : null}
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

      <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.82fr)]">
        <div className="space-y-6">
        <div className="space-y-4">
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

          {(art || pattern || draft.phrase.trim()) && labels ? (
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
                          body={cupTint}
                          top={cup.top}
                          bot={cup.bot}
                          heightMm={cup.height}
                          cover={area ? (pattern ? 0.9 : area.h / cup.height) : 0.6}
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
          {area ? (
            <section className="overflow-hidden rounded-3xl border border-line bg-card">
            <div>
              <div className="relative h-72 bg-white sm:h-96">
                <Lineup
                  texture={shown}
                  top={cup.top}
                  bot={cup.bot}
                  heightMm={cup.height}
                  cover={pattern ? 0.9 : area.h / cup.height}
                  otherTop={other.top}
                  otherBot={other.bot}
                  otherHeight={other.height}
                  otherCover={rightPattern ? 0.9 : otherArea ? otherArea.h / other.height : 0.6}
                  otherTexture={otherTexture}
                  otherBody={right.cupTint}
                  patternArt={pattern}
                  otherPattern={rightPattern}
                  spin={spin}
                  body={cupTint}
                  mode={renderMode}
                  shotsRef={shotsRef}
                  className="absolute inset-0 h-full w-full cursor-pointer"
                  onViews={(shots) => {
                    const title = draft.event ? `${cup.name} · ${draft.event}` : cup.name;
                    openPdf(canvasPdf(viewsSheet(title, t.angles, shots)));
                  }}
                />
              </div>
              <div className="grid grid-cols-2 items-start gap-2 bg-white px-2 py-3">
                <div className="min-w-0 rounded-2xl border border-line p-2">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    {t.cup1}
                    <select className="min-h-11 w-full rounded-xl border border-line bg-white px-2 text-sm text-ink" value={cup.id} onChange={(event) => chooseCup(event.target.value)}>
                      {CUPS.map((item) => (
                        <option key={item.id} value={item.id}>{item.name} · {item.height} mm</option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line px-1 text-center text-xs">{t.logo}<input className="sr-only" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { void onFiles(event.target.files, "logo", "beer"); event.target.value = ""; }} /></label>
                    <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line px-1 text-center text-xs">{t.pattern}<input className="sr-only" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { void onFiles(event.target.files, "pattern", "beer"); event.target.value = ""; }} /></label>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {logos.map((item, index) => (
                      <li key={`bl-${item.name}-${index}`} className="flex items-center justify-between gap-1 text-xs"><span className="min-w-0 truncate">{item.name}</span><button type="button" className="min-h-11 shrink-0 px-2" onClick={() => setLogos((current) => current.filter((_, i) => i !== index))}>{t.remove}</button></li>
                    ))}
                    {patterns.map((item, index) => (
                      <li key={`bp-${item.name}-${index}`} className="flex items-center justify-between gap-1 text-xs"><span className="min-w-0 truncate">{item.name}</span><button type="button" className="min-h-11 shrink-0 px-2" onClick={() => setPatterns((current) => current.filter((_, i) => i !== index))}>{t.remove}</button></li>
                    ))}
                  </ul>
                  <button type="button" className="mt-2 min-h-11 w-full rounded-full bg-ink text-sm text-paper" onClick={() => void saveCard("beer")}>{t.download}</button>
                  <input
                    className={`${control} mt-2`}
                    maxLength={60}
                    value={draft.phrase}
                    placeholder={t.phraseHint}
                    onChange={(event) => patch({ phrase: event.target.value })}
                  />
                  <div className="mt-2 flex flex-wrap gap-1">
                    {FONTS.map((item) => (
                      <button key={item.id} type="button" aria-pressed={draft.font === item.id} onClick={() => patch({ font: item.id })} className={`min-h-11 rounded-full px-3 text-sm ${draft.font === item.id ? "bg-ink text-paper" : "bg-card"}`} style={{ fontFamily: item.css }}>{item.label}</button>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {SAMPLES.filter((item) => item.id !== "vetor").map((item) => (
                      <button key={item.id} type="button" aria-pressed={draft.sample === item.id} onClick={() => patch({ sample: item.id })} className={`min-h-11 rounded-full px-2 text-xs ${draft.sample === item.id ? "bg-ink text-paper" : "bg-card"}`}>{t.sample[item.id].name}</button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">{t.inkLogo}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button type="button" className={`min-h-11 rounded-full border px-3 text-xs ${tint === null ? "border-ink" : "border-line"}`} onClick={() => setTint(null)}>{t.original}</button>
                    {STOCK.map((swatch) => (
                      <button key={`l-${swatch.hex}`} type="button" aria-label={swatch.hex} className={`h-9 w-9 rounded-full border ${tint === swatch.hex ? "border-ink ring-2 ring-ink" : "border-line"}`} style={{ background: swatch.hex }} onClick={() => setTint(swatch.hex)} />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">{t.inkCup}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button type="button" className={`min-h-11 rounded-full border px-3 text-xs ${cupTint === null ? "border-ink" : "border-line"}`} onClick={() => setCupTint(null)}>{t.original}</button>
                    {STOCK.map((swatch) => (
                      <button key={`c-${swatch.hex}`} type="button" aria-label={swatch.hex} className={`h-9 w-9 rounded-full border ${cupTint === swatch.hex ? "border-ink ring-2 ring-ink" : "border-line"}`} style={{ background: swatch.hex }} onClick={() => setCupTint(swatch.hex)} />
                    ))}
                  </div>
                  <label className="mt-2 block text-xs text-muted">
                    {t.qty}
                    <input className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink" type="number" min={1} inputMode="numeric" value={draft.qty || ""} onChange={(event) => patch({ qty: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} />
                  </label>
                  <p className="mt-2 text-sm">{liveQuote(cup, draft.qty).charge.toLocaleString(locale)} · {liveQuote(cup, draft.qty).boxes} {t.boxes}</p>
                  <p className="text-sm"><SheetMoney kz={liveQuote(cup, draft.qty).finalUnit} /> {t.perUnit}</p>
                  <p className="font-medium"><SheetMoney kz={liveQuote(cup, draft.qty).lot} /> {t.inLot}</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-line p-2">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    {t.cup2}
                    <select className="min-h-11 w-full rounded-xl border border-line bg-white px-2 text-sm text-ink" value={other.id} onChange={(event) => setCompareId(event.target.value)}>
                      {CUPS.map((item) => (
                        <option key={item.id} value={item.id}>{item.name} · {item.height} mm</option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line px-1 text-center text-xs">{t.logo}<input className="sr-only" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { void onFiles(event.target.files, "logo", "soda"); event.target.value = ""; }} /></label>
                    <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line px-1 text-center text-xs">{t.pattern}<input className="sr-only" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { void onFiles(event.target.files, "pattern", "soda"); event.target.value = ""; }} /></label>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {rightLogos.map((item, index) => (
                      <li key={`rl-${item.name}-${index}`} className="flex items-center justify-between gap-1 text-xs"><span className="min-w-0 truncate">{item.name}</span><button type="button" className="min-h-11 shrink-0 px-2" onClick={() => setRightLogos((current) => current.filter((_, i) => i !== index))}>{t.remove}</button></li>
                    ))}
                    {rightPatterns.map((item, index) => (
                      <li key={`rp-${item.name}-${index}`} className="flex items-center justify-between gap-1 text-xs"><span className="min-w-0 truncate">{item.name}</span><button type="button" className="min-h-11 shrink-0 px-2" onClick={() => setRightPatterns((current) => current.filter((_, i) => i !== index))}>{t.remove}</button></li>
                    ))}
                  </ul>
                  <button type="button" className="mt-2 min-h-11 w-full rounded-full bg-ink text-sm text-paper" onClick={() => void saveCard("soda")}>{t.download}</button>
                  <input
                    className={`${control} mt-2`}
                    maxLength={60}
                    value={right.phrase}
                    placeholder={t.phraseHint}
                    onChange={(event) => setRight((current) => ({ ...current, phrase: event.target.value }))}
                  />
                  <div className="mt-2 flex flex-wrap gap-1">
                    {FONTS.map((item) => (
                      <button key={item.id} type="button" aria-pressed={right.font === item.id} onClick={() => setRight((current) => ({ ...current, font: item.id }))} className={`min-h-11 rounded-full px-3 text-sm ${right.font === item.id ? "bg-ink text-paper" : "bg-card"}`} style={{ fontFamily: item.css }}>{item.label}</button>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {SAMPLES.filter((item) => item.id !== "vetor").map((item) => (
                      <button key={item.id} type="button" aria-pressed={right.sample === item.id} onClick={() => setRight((current) => ({ ...current, sample: item.id }))} className={`min-h-11 rounded-full px-2 text-xs ${right.sample === item.id ? "bg-ink text-paper" : "bg-card"}`}>{t.sample[item.id].name}</button>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">{t.inkLogo}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button type="button" className={`min-h-11 rounded-full border px-3 text-xs ${right.tint === null ? "border-ink" : "border-line"}`} onClick={() => setRight((current) => ({ ...current, tint: null }))}>{t.original}</button>
                    {STOCK.map((swatch) => (
                      <button key={`rl-${swatch.hex}`} type="button" aria-label={swatch.hex} className={`h-9 w-9 rounded-full border ${right.tint === swatch.hex ? "border-ink ring-2 ring-ink" : "border-line"}`} style={{ background: swatch.hex }} onClick={() => setRight((current) => ({ ...current, tint: swatch.hex }))} />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">{t.inkCup}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button type="button" className={`min-h-11 rounded-full border px-3 text-xs ${right.cupTint === null ? "border-ink" : "border-line"}`} onClick={() => setRight((current) => ({ ...current, cupTint: null }))}>{t.original}</button>
                    {STOCK.map((swatch) => (
                      <button key={`rc-${swatch.hex}`} type="button" aria-label={swatch.hex} className={`h-9 w-9 rounded-full border ${right.cupTint === swatch.hex ? "border-ink ring-2 ring-ink" : "border-line"}`} style={{ background: swatch.hex }} onClick={() => setRight((current) => ({ ...current, cupTint: swatch.hex }))} />
                    ))}
                  </div>
                  <label className="mt-2 block text-xs text-muted">
                    {t.qty}
                    <input className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink" type="number" min={1} inputMode="numeric" value={compareQty || ""} onChange={(event) => setCompareQty(Math.max(0, Math.floor(Number(event.target.value) || 0)))} />
                  </label>
                  <p className="mt-2 text-sm">{liveQuote(other, compareQty).charge.toLocaleString(locale)} · {liveQuote(other, compareQty).boxes} {t.boxes}</p>
                  <p className="text-sm"><SheetMoney kz={liveQuote(other, compareQty).finalUnit} /> {t.perUnit}</p>
                  <p className="font-medium"><SheetMoney kz={liveQuote(other, compareQty).lot} /> {t.inLot}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white px-3 pb-3">
                <p className="text-sm">
                  {(liveQuote(cup, draft.qty).charge + liveQuote(other, compareQty).charge).toLocaleString(locale)} {t.cups}
                  <span className="mt-1 block font-medium"><SheetMoney kz={liveQuote(cup, draft.qty).lot + liveQuote(other, compareQty).lot} /> {t.inLot}</span>
                </p>
                <button type="button" className="min-h-11 rounded-full bg-ink px-4 text-sm text-paper" onClick={() => void saveBoth()}>{t.bothPdf}</button>
              </div>
              <p className="bg-white px-3 py-2 text-center text-sm">
                {cup.name} {cup.height} mm · {t.bottle} 230 mm · {t.can} 115 mm · {other.name} {other.height} mm
                <span className="mt-0.5 block text-xs text-muted">{t.scaleHint}</span>
              </p>
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
              <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-3">
                <p className="text-sm text-muted">
                  {cup.name} · {chosenId ? t.sample[chosenId as SampleId].name : ""} · {t.process[process]}
                </p>
                <button type="button" className="min-h-11 px-3 text-sm" onClick={() => setSpin((value) => !value)}>
                  {spin ? t.stop : t.spin}
                </button>
              </div>
              {chosen ? <WindowPlate area={area} process={process} canvas={chosen} caption={t} /> : null}
            </div>
            </section>
          ) : null}
        </div>
        <div className="panel-in space-y-6 lg:sticky lg:top-4">
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
            <div className="grid min-w-0 grid-cols-2 gap-3">
              <Field label={t.qty}>
                <input className={control} type="number" min={1} value={draft.qty} onChange={(event) => patch({ qty: Number(event.target.value) || 0 })} />
              </Field>
              <Field label={t.eventDate}>
                <input className={`${control} min-w-0`} type="date" value={draft.eventDate} onChange={(event) => patch({ eventDate: event.target.value })} />
              </Field>
            </div>
            <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line text-sm">
              <div className="flex items-baseline justify-between gap-4 bg-paper px-3 py-3">
                <dt className="text-muted">{t.final}</dt>
                <dd className="min-w-0 text-right break-words">
                  <span key={finalUnit.primary} className="final-figure font-display text-2xl leading-none">{finalUnit.primary}</span>
                  <span className="mt-1 block text-muted">{finalLot.primary} {t.inLot}</span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                <dt className="text-muted">{t.price}</dt>
                <dd className="min-w-0 text-right break-words">
                  {unitPrice.primary}
                  <span className="mt-0.5 block text-muted">{unitPrice.secondary}</span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                <dt className="text-muted">{t.estimated}</dt>
                <dd>{deliveryLabel}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                <dt className="text-muted">{t.production}</dt>
                <dd>
                  {productionDays(process)} {t.working}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                <dt className="text-muted">{t.freight}</dt>
                <dd>
                  {freightMode(billed) === "marítimo" ? t.sea : t.air} · {freightDays(billed)} {t.days}
                </dd>
              </div>
              {air ? (
                <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                  <dt className="text-muted">{t.fees}</dt>
                  <dd className="min-w-0 text-right break-words">{airMoney}</dd>
                </div>
              ) : null}
            </dl>
            {late ? <p className="border-l-4 border-pitanga pl-3 text-sm">{t.late}</p> : null}
            {priced.below ? <p className="text-sm text-muted">{t.belowMin}</p> : null}
          </div>
        </aside>
          {chosen && area ? (
            <div className="space-y-4 rounded-3xl border border-line bg-card p-4">
              <h2 className="font-display text-3xl leading-tight">{draft.event || t.unnamed}</h2>
              <p className="text-sm text-muted">
                {draft.promoter || t.promoter}
                {draft.email ? ` · ${draft.email}` : ""}
                {draft.phone ? ` · ${draft.dial} ${draft.phone}` : ""}
                {` · ${cup.name} · ${t.process[process]} · ${billed.toLocaleString(locale)} ${t.cups}`}
              </p>
              <p className="text-sm">
                {finalUnit.primary} {t.perUnit} · {finalLot.primary} {t.inLot}
                <span className="text-muted"> · {t.final}</span>
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
              <button type="button" onClick={() => void saveBoth()} className="min-h-11 w-full rounded-full bg-ink text-sm font-medium text-paper">
                {t.download}{chosenId === "vetor" ? ` ${t.andSvg}` : ""}
              </button>
              <p className="text-xs leading-relaxed text-muted">{t.estimate} {KZ_PER_EUR} Kz.</p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function BlinkLogo({ slogan }: { slogan: string }) {
  return (
    <div className="flex items-center gap-3">
      <svg viewBox="0 0 48 48" className="h-12 w-12" aria-hidden>
        <rect width="48" height="48" rx="12" fill="var(--color-ink)" />
        <rect x="13" y="12" width="22" height="3.2" rx="1.4" fill="var(--color-paper)" />
        <path d="M14.5 16.2h19l-1.4 6.2H16z" fill="var(--color-urucum)" className="blink-band" />
        <path d="M16.2 23.2h15.6l-1.5 8.2H17.8z" fill="var(--color-ipe)" className="blink-band" />
        <path d="M18 32.2h12l-1.3 5.2h-9.4z" fill="var(--color-pitanga)" className="blink-band" />
      </svg>
      <div>
        <p className="font-display text-4xl leading-none tracking-tight">BLINK</p>
        <p className="mt-1 text-sm text-muted">{slogan}</p>
      </div>
    </div>
  );
}

const control = "min-h-11 w-full rounded-2xl border border-line bg-paper px-3";

function liveQuote(item: ReturnType<typeof cupById>, qty: number) {
  const tiers = item.prices.map((row) => row.qty);
  const charge = chargedQty(qty, Math.min(...tiers), tiers);
  const price = priceFor(item, charge);
  const door = airFreight(charge, cupWeightScale(item))?.kz ?? 0;
  return {
    charge,
    unit: price.tier.kz,
    door,
    finalUnit: price.tier.kz + door / Math.max(1, charge),
    lot: price.tier.kz * charge + door,
    boxes: Math.max(1, Math.ceil(charge / BOX_CUPS)),
  };
}

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
