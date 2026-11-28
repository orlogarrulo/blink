import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CupView, cupStills } from "@/components/cup-view";
import { OtherColorDialog } from "@/components/other-color-dialog";
import { Lineup } from "@/components/lineup";
import {
  CUPS,
  PROCESS_LABEL,
  areaFor,
  fullArea,
  cupById,
  deliveryDate,
  freightDays,
  freightMode,
  priceFor,
  processesFor,
  productionDays,
  STOCK,
  type Area,
  type Cup,
  type Process,
} from "@/lib/catalog";
import { LANGS, detectLang, localeFor, text, type Lang } from "@/lib/copy";
import { printMetaOf } from "@/lib/print-meta";
import { ART_PLACE0, type ArtPlace } from "@/lib/art-place";
import { canvasPdf, carryLabelMeta, cmyk, composeLogos, composePattern, dominantColors, downloadBlob, openPdf, paintLabel, sheetCanvas, techSheet, tintCanvas, viewsSheet, wrapPrint, heroSheet, type PhrasePos } from "@/lib/print";
import { qrCanvas } from "@/lib/qr-mark";
import { shareUrl } from "@/lib/share-link";
import { BOX_CUPS, airFreight, chargedQty, cupWeightScale } from "@/lib/freight";
import { dialForMarket, formatKz, getKzPerEur, loadCurrency, money, saveCurrency, type Market } from "@/lib/money";
import { loadCatalog, useCatalogVersion } from "@/lib/catalog-store";
import { bodyCss, parseBody } from "@/lib/body-color";
import { deleteProject, listProjects, saveProject, type SavedProject } from "@/lib/projects";
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
  /** Print all round and down to the base, leaving only the rim. */
  cover360?: boolean;
  sample: SampleId | null;
  phrase: string;
  font: FontId;
  /** Phrase colour; null = the logo's main colour. */
  textInk?: string | null;
  /** Phrase lane next to the logo: above, below or both. */
  textPos?: PhrasePos;
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

/** A price in the currency chosen in the header only (Kz or €). */
function SheetMoney({ kz, market, inline = false }: { kz: number; market: Market; inline?: boolean }) {
  return <span className={inline ? "inline" : "block leading-tight"}>{money(kz, market)}</span>;
}

const TEXT_POS: PhrasePos[] = ["top", "bottom", "both"];

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
  textInk: null,
  textPos: "bottom",
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
    const textInk = typeof parsed.textInk === "string" && /^#[0-9A-Fa-f]{6}$/.test(parsed.textInk) ? parsed.textInk : null;
    const textPos = TEXT_POS.includes(parsed.textPos as PhrasePos) ? (parsed.textPos as PhrasePos) : "bottom";
    return { ...EMPTY, ...parsed, sample, dial, font, phrase, textInk, textPos };
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
  const [right, setRight] = useState<{ phrase: string; font: FontId; sample: SampleId | null; tint: string | null; cupTint: string | null; process: Process | null; cover360: boolean; textInk: string | null; textPos: PhrasePos }>({
    phrase: "",
    font: "outfit",
    textInk: null,
    textPos: "bottom",
    sample: null,
    tint: null,
    cupTint: null,
    process: null,
    cover360: false,
  });
  const [spin, setSpin] = useState(true);
  const [zoomedCup, setZoomedCup] = useState<string | null>(null);
  const [renderMode, setRenderMode] = useState<"frost" | "clear" | "studio">("frost");
  const [vectorLabel, setVectorLabel] = useState<HTMLCanvasElement | null>(null);
  const [tracing, setTracing] = useState(false);
  const [tint, setTint] = useState<string | null>(null);
  const [cupTint, setCupTint] = useState<string | null>(null);
  const [colorDialog, setColorDialog] = useState<"cup1" | "cup2" | null>(null);
  const [liquid, setLiquid] = useState<"none" | "beer" | "soda">("none");
  const [place, setPlace] = useState<ArtPlace>(ART_PLACE0);
  const [rightPlace, setRightPlace] = useState<ArtPlace>(ART_PLACE0);
  const [soloCard, setSoloCard] = useState<"beer" | "soda" | null>(null);
  const [gridTarget, setGridTarget] = useState<"cup1" | "cup2">("cup1");
  const [pantoneModal, setPantoneModal] = useState<{ hex: string; type: "logo" | "cup" } | null>(null);
  const clickGate = useRef<{ key: string; timer: number } | null>(null);
  function armClick(key: string, single: () => void, double: () => void) {
    if (clickGate.current?.key === key) {
      window.clearTimeout(clickGate.current.timer);
      clickGate.current = null;
      double();
      return;
    }
    if (clickGate.current) window.clearTimeout(clickGate.current.timer);
    const timer = window.setTimeout(() => {
      clickGate.current = null;
      single();
    }, 280);
    clickGate.current = { key, timer };
  }
  const [customColors, setCustomColors] = useState<Record<string, { rgb: string; cmyk: string }>>({});
  const [rightLiquid, setRightLiquid] = useState<"none" | "beer" | "soda">("none");
  const [quote, setQuote] = useState<{ cupId: string; qty: number; unitKz: number; freightKz: number; lotKz: number } | null>(null);
  const [market, setMarketState] = useState<Market>("KZ");
  const [projects, setProjects] = useState<SavedProject[]>([]);
  const [projectNote, setProjectNote] = useState("");
  const catalogVersion = useCatalogVersion();
  function setMarket(next: Market) {
    setMarketState(next);
    saveCurrency(next);
  }
  const [lang, setLang] = useState<Lang>("pt");
  const shotsRef = useRef<((turns: number[], side?: "beer" | "soda") => HTMLCanvasElement[]) | null>(null);
  const t = text(lang);
  const locale = localeFor(lang);

  useEffect(() => {
    loadCatalog();
    const saved = loadDraft();
    const next = loadCurrency();
    setMarketState(next);
    setProjects(listProjects());
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
  const cover360 = Boolean(draft.cover360) && process === "iml";
  const area = cover360 ? fullArea(cup) : areaFor(cup, process);
  const otherPick = right.process && processesFor(other).includes(right.process) ? right.process : processesFor(other)[0];
  const otherCover360 = right.cover360 && otherPick === "iml";
  const otherArea = otherCover360 ? fullArea(other) : areaFor(other, otherPick);
  const leftQuote = liveQuote(cup, draft.qty);
  const rightQuote = liveQuote(other, compareQty);
  const orderQty = leftQuote.charge + rightQuote.charge;
  const orderLot = leftQuote.lot + rightQuote.lot;
  const orderDoor = leftQuote.door + rightQuote.door;
  const finalLot = money(orderLot, market);
  const delivery = deliveryDate(Math.max(leftQuote.charge, rightQuote.charge, 1), process);
  const deliveryLabel = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(delivery);
  const late = draft.eventDate ? delivery > new Date(`${draft.eventDate}T23:59:00`) : false;
  const airMoney = orderDoor ? money(orderDoor, market) : "";
  void catalogVersion;

  useEffect(() => {
    if (ready && process !== draft.process) setDraft((current) => ({ ...current, process }));
  }, [ready, process, draft.process]);

  const baseLabels = useMemo(() => {
    const phrase = draft.phrase.trim();
    if (!area || (!art && !pattern && !phrase) || typeof document === "undefined") return null;
    const lane = { ink: draft.textInk ?? null, pos: draft.textPos ?? "bottom" };
    return cachedLabels([art, pattern], `${area.w}x${area.h}/${area.rim ?? ""}/${process}/${draft.font}/${phrase}/${lane.ink ?? ""}/${lane.pos}`, () => {
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
      phraseLane: lane,
    });
    const found = dominantColors(probe, 4);
    const palette = found.length > 0 ? found : ["#1A120C"];
    const map = {} as Record<SampleId, HTMLCanvasElement>;
    for (const sample of SAMPLES) {
      if (sample.id === "vetor") continue;
      map[sample.id] = paintLabel({
        phraseLane: lane,
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
    });
  }, [area, art, pattern, process, draft.phrase, draft.font, draft.textInk, draft.textPos]);

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
          carryLabelMeta(baseLabels.medida, canvas);
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

  /** Everything needed to reopen the design (no uploaded files). */
  function snapshot(): Record<string, unknown> {
    return { v: 1, draft, right, compareId, compareQty, tint, cupTint, liquid, rightLiquid, place, rightPlace };
  }

  function storeProject() {
    setProjects(saveProject(draft.event || t.unnamed, snapshot()));
    setProjectNote(t.projectSaved);
  }

  function openProject(item: SavedProject) {
    const state = item.state as Partial<ReturnType<typeof snapshot>> & Record<string, unknown>;
    if (state.draft && typeof state.draft === "object") {
      const restored = { ...EMPTY, ...(state.draft as Partial<Draft>) };
      setDraft(restored);
    }
    if (state.right && typeof state.right === "object") setRight((current) => ({ ...current, ...(state.right as Partial<typeof current>) }));
    if (typeof state.compareId === "string") setCompareId(state.compareId);
    if (typeof state.compareQty === "number") setCompareQty(state.compareQty);
    setTint(typeof state.tint === "string" ? state.tint : null);
    setCupTint(typeof state.cupTint === "string" ? state.cupTint : null);
    if (state.liquid === "none" || state.liquid === "beer" || state.liquid === "soda") setLiquid(state.liquid);
    if (state.rightLiquid === "none" || state.rightLiquid === "beer" || state.rightLiquid === "soda") setRightLiquid(state.rightLiquid);
    if (state.place && typeof state.place === "object") setPlace({ ...ART_PLACE0, ...(state.place as Partial<ArtPlace>) });
    if (state.rightPlace && typeof state.rightPlace === "object") setRightPlace({ ...ART_PLACE0, ...(state.rightPlace as Partial<ArtPlace>) });
    setProjectNote("");
  }

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
  const otherProcess = right.process && otherAllowed.includes(right.process) ? right.process : otherAllowed[0];
  const rightBase = useMemo(() => {
    const phrase = right.phrase.trim();
    const image = rightArt;
    const motif = rightPattern;
    if (!otherArea || (!image && !motif && !phrase) || typeof document === "undefined") return null;
    const lane = { ink: right.textInk, pos: right.textPos };
    return cachedLabels([image, motif], `${otherArea.w}x${otherArea.h}/${otherArea.rim ?? ""}/${otherProcess}/${right.font}/${phrase}/${lane.ink ?? ""}/${lane.pos}`, () => {
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
      phraseLane: lane,
    });
    const found = dominantColors(probe, 4);
    const palette = found.length > 0 ? found : ["#1A120C"];
    const map = {} as Record<SampleId, HTMLCanvasElement>;
    for (const sample of SAMPLES) {
      if (sample.id === "vetor") continue;
      map[sample.id] = paintLabel({
        phraseLane: lane,
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
    });
  }, [otherArea, rightArt, rightPattern, right.phrase, right.font, otherProcess, right.textInk, right.textPos]);
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
  const rightOwn = Boolean(rightArt || rightPattern || right.phrase.trim());
  const rightId = right.sample ?? "medida";
  const rightShown = rightId !== "vetor" && rightLabels ? rightLabels[rightId] : null;
  const otherTexture = rightOwn ? rightShown : (rightLabels && right.sample ? rightLabels[right.sample] ?? null : null);
  const colors = chosen ? dominantColors(chosen, 3) : [];

  async function generateMockups(opts: { logo: HTMLCanvasElement | null; bodyColor: string | null; liquid: "none" | "beer" | "soda"; top: number; bot: number; height: number }): Promise<HTMLCanvasElement[]> {
    const angles = [0, 0.28, 0.5];
    return angles.map((angle) => {
      const c = document.createElement("canvas");
      c.width = 600;
      c.height = 900;
      const ctx = c.getContext("2d");
      if (!ctx) return c;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, 600, 900);
      // Cup proportions from selected size
      const scale = Math.min(420 / opts.height, 280 / opts.top);
      const cupH = opts.height * scale;
      const topR = opts.top * scale * 0.5;
      const botR = opts.bot * scale * 0.5;
      const cx = 300;
      const topY = (900 - cupH) / 2;
      const botY = topY + cupH;
      // Body color or transparent
      const bodyFill = opts.bodyColor || "rgba(255,255,255,0.15)";
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - topR, topY);
      ctx.lineTo(cx + topR, topY);
      ctx.lineTo(cx + botR, botY);
      ctx.lineTo(cx - botR, botY);
      ctx.closePath();
      ctx.fillStyle = bodyFill;
      ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
      // Liquid if beer/soda
      if (opts.liquid !== "none") {
        const liqTop = topY + cupH * (opts.liquid === "beer" ? 0.18 : 0.12);
        const liqColor = opts.liquid === "beer" ? "rgba(232,168,32,0.75)" : "rgba(20,8,6,0.85)";
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx - topR * 0.92, liqTop);
        ctx.lineTo(cx + topR * 0.92, liqTop);
        ctx.lineTo(cx + botR * 0.95, botY - 4);
        ctx.lineTo(cx - botR * 0.95, botY - 4);
        ctx.closePath();
        ctx.fillStyle = liqColor;
        ctx.fill();
        ctx.restore();
        if (opts.liquid === "beer") {
          ctx.fillStyle = "rgba(255,247,238,0.9)";
          ctx.beginPath();
          ctx.ellipse(cx, liqTop, topR * 0.85, 8, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Logo
      if (opts.logo) {
        const logoW = topR * 1.4;
        const logoH = logoW * (opts.logo.height / Math.max(1, opts.logo.width));
        const logoX = cx - logoW / 2 + Math.sin(angle) * topR * 0.15;
        const logoY = topY + cupH * 0.32;
        ctx.save();
        ctx.globalAlpha = 0.95;
        ctx.drawImage(opts.logo, logoX, logoY, logoW, logoH);
        ctx.restore();
      }
      // Rim highlight
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(cx, topY, topR, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      return c;
    });
  }

  const wrapArt = (
    source: HTMLCanvasElement | null,
    motif: HTMLCanvasElement | null,
    item: { top: number; bot: number; height: number },
    itemArea: typeof area,
    itemPlace: ArtPlace,
    span = 0.6,
    ppm?: number,
  ) => (itemArea ? wrapPrint(source, motif, span, { cup: item, area: itemArea, ppm, place: itemPlace }) : wrapPrint(source, motif, span));

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
    const lane = side === "beer" ? { ink: draft.textInk ?? null, pos: draft.textPos ?? "bottom" } : { ink: right.textInk, pos: right.textPos };
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
      phraseLane: lane,
    });
    const palette = dominantColors(probe, 4);
    let printLabel = paintLabel({
      phraseLane: lane,
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
    // The flat label in the PDF is the print exactly as it sits on the cup (same copies, same sizes).
    const itemPlace = side === "beer" ? place : rightPlace;
    const unrolled = wrapPrint(printLabel, motif, 0.9, { cup: item, area: itemArea, place: itemPlace }) ?? printLabel;
    const unrolledMeta = printMetaOf(unrolled);
    const sheetArea = unrolledMeta
      ? { ...itemArea, w: Math.round(unrolledMeta.widthMm * 10) / 10, h: Math.round(unrolledMeta.bandH * 10) / 10 }
      : itemArea;
    const sheetColors = (ink ? [ink] : palette.length > 0 ? palette : ["#1A120C"]).slice(0, 3).map((hex) => ({ hex }));
    const when = new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(deliveryDate(numbers.charge, itemProcess));
    const sheet = sheetCanvas({
      event: draft.event,
      promoter: draft.promoter,
      email: draft.email,
      phone: draft.phone ? `${draft.dial} ${draft.phone}` : "",
      cup: item,
      process: itemProcess,
      area: sheetArea,
      qty: numbers.charge,
      colors: sheetColors,
      label: unrolled,
      bodyColor: body,
      delivery: when,
      eventDate: draft.eventDate,
      priceLine: `${money(numbers.finalUnit, market)} / un  ·  ${money(numbers.lot, market)}`,
      freightNote: `aéreo  ·  ${numbers.charge} ${item.name}`,
    });
    const tech = techSheet({
      cup: item,
      area: sheetArea,
      process: itemArea.full ? "Quadricromia IML · cobertura total 360°" : itemProcess === "iml" ? "Quadricromia IML" : itemProcess === "serigrafia" ? "Serigrafia" : "Digital",
      label: unrolled,
      bodyColor: body,
    });
    const stillSpec = {
      texture: unrolled,
      area: itemArea,
      top: item.top,
      bot: item.bot,
      heightMm: item.height,
      cover: motif ? 0.9 : itemArea.h / item.height,
      body,
      liquid: side === "beer" ? liquid : rightLiquid,
    };
    // The upside-down view cannot hold a drink and has no table shadow above it, so it is drawn empty and unshadowed.
    const solid = [...cupStills(stillSpec, [0, Math.PI * 0.28]), ...cupStills({ ...stillSpec, liquid: "none", shadow: false }, [Math.PI])];
    const viewLabels = ["Frente", "Três quartos", "Lado / invertido"];
    // The third view is upside down (mouth facing down, as if on a table); viewsSheet keeps it aligned.
    const views = viewsSheet(item.name, viewLabels, solid, [false, false, true]);
    const heroStill = cupStills({ ...stillSpec, studio: true, look: "hero", shadow: true }, [0], 1400, 1800)[0];
    const share = shareUrl({
      cupId: item.id,
      process: itemProcess,
      cover360: Boolean(side === "beer" ? cover360 : otherCover360),
      body: body ?? null,
      liquid: (side === "beer" ? liquid : rightLiquid) ?? "none",
      place: itemPlace,
    });
    const qr = await qrCanvas(share, 512);
    const hero = heroSheet({
      cupName: item.name,
      process: itemArea.full ? "Quadricromia IML · cobertura total 360°" : itemProcess === "iml" ? "Quadricromia IML" : itemProcess === "serigrafia" ? "Serigrafia" : "Digital",
      still: heroStill,
      shareUrl: share,
      qr,
    });
    return [sheet, tech, views, hero];
  }

  async function saveCard(side: "beer" | "soda") {
    const pages = await exportCard(side);
    if (!pages) return;
    const item = side === "beer" ? cup : other;
    const slug = `${(draft.event || "blink").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "blink"}-${item.id.toLowerCase()}`;
    downloadBlob(canvasPdf(pages), `${slug}-ficha.pdf`);
  }

  async function saveAttached() {
    const pages = [
      ...(leftQuote.charge > 0 ? (await exportCard("beer")) ?? [] : []),
      ...(rightQuote.charge > 0 ? (await exportCard("soda")) ?? [] : []),
    ];
    if (pages.length === 0) return;
    const slug = (draft.event || "blink").toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "blink";
    downloadBlob(canvasPdf(pages), `${slug}-ficha.pdf`);
  }

  return (
    <main className="mx-auto min-h-dvh w-full max-w-6xl overflow-x-hidden px-4 pb-[max(4rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6">
      <header className="flex w-full flex-wrap items-end justify-center gap-3 text-center sm:justify-between sm:text-left">
        <BlinkLogo slogan={t.slogan} />
        <div className="flex flex-wrap items-center justify-center gap-2 sm:ml-auto sm:justify-end">
        <div className="flex items-center gap-1 rounded-full bg-card p-0.5" role="group" aria-label={t.currency}>
          {(["KZ", "EUR"] as const).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={market === id}
              onClick={() => setMarket(id)}
              className={`min-h-11 min-w-11 rounded-full px-3 text-sm ${market === id ? "bg-ink text-paper" : "text-ink"}`}
            >
              {id === "KZ" ? "Kz" : "€"}
            </button>
          ))}
        </div>
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
        </div>
      </header>

      <section className="mt-6 text-center sm:text-left">
        <h2 className="font-display text-2xl">{t.plainTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.plainLead}</p>
        <div className="mt-3 flex justify-center gap-2 sm:justify-start">
          <button type="button" onClick={() => setGridTarget("cup1")} className={`min-h-11 rounded-full px-4 text-sm ${gridTarget === "cup1" ? "bg-ink text-paper" : "bg-card border border-line"}`}>Selecionar Copo 1</button>
          <button type="button" onClick={() => setGridTarget("cup2")} className={`min-h-11 rounded-full px-4 text-sm ${gridTarget === "cup2" ? "bg-urucum text-paper" : "bg-card border border-line"}`}>Selecionar Copo 2</button>
        </div>
        <ul className="rise-list mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {CUPS.map((item) => {
            const isCup1 = item.id === cup.id;
            const isCup2 = item.id === compareId;
            const on = gridTarget === "cup1" ? isCup1 : isCup2;
            const window = areaFor(item, processesFor(item).includes(process) ? process : processesFor(item)[0]);
            const shownArea = isCup1 ? area : isCup2 ? otherArea : window;
            const rawTexture = isCup1 && chosen ? chosen : isCup2 && rightShown ? rightShown : null;
            const showTexture = rawTexture && shownArea ? wrapPrint(rawTexture, isCup1 ? pattern : rightPattern, 0.9, { cup: item, area: shownArea, ppm: 4, place: isCup1 ? place : rightPlace }) : rawTexture;
            const showBody = isCup1 ? cupTint : isCup2 ? right.cupTint : null;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => armClick(`grid-${item.id}`, () => {
                    if (gridTarget === "cup1") chooseCup(item.id);
                    else setCompareId(item.id);
                  }, () => setZoomedCup(item.id))}
                  className={`w-full rounded-3xl border bg-card px-2 pb-3 pt-2 text-left ${isCup1 ? "cup-on border-ink ring-2 ring-ink" : isCup2 ? "border-urucum ring-2 ring-urucum" : "border-line"}`}
                  title="Duplo clique para ampliar o material"
                >
                  <CupView
                    texture={showTexture}
                    body={showBody}
                    top={item.top}
                    bot={item.bot}
                    heightMm={item.height}
                    cover={window ? window.h / item.height : 0.6}
                    area={shownArea}
                    spin={false}
                    className="pointer-events-none h-36 w-full"
                  />
                  <span className="mt-1 block text-sm font-medium">{item.name}</span>
                  <span className="text-xs text-muted">
                    {item.cl} cl
                    {item.measured ? ` · ${item.height} mm` : ""}
                    {isCup1 ? " · Copo 1" : isCup2 ? " · Copo 2" : ""}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(22rem,0.82fr)]">
        <div className="min-w-0 space-y-6">
        <div className="space-y-4">
          {error ? <p className="border-l-4 border-pitanga pl-3 text-sm">{error}</p> : null}
          {(art || pattern || draft.phrase.trim()) && labels ? (
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-2xl">{t.samplesTitle}</h2>
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
                  {SAMPLES.map((sample) => {
                    const texture = sample.id === "vetor" ? vectorShown : labels[sample.id];
                    const on = draft.sample === sample.id;
                    return (
                      <li key={`a-${sample.id}`}>
                        <button
                          type="button"
                          onClick={() => patch({ sample: sample.id })}
                          className={`w-full rounded-3xl border bg-card px-1 pb-3 pt-1 text-left ${on ? "border-ink" : "border-line"}`}
                        >
                          <CupView
                            texture={(area && texture ? wrapPrint(texture, pattern, 0.9, { cup, area, ppm: 4, place }) : texture) ?? null}
                            body={cupTint}
                            top={cup.top}
                            bot={cup.bot}
                            heightMm={cup.height}
                            cover={area ? (pattern ? 0.9 : area.h / cup.height) : 0.6}
                            area={area}
                            liquid={liquid}
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
              <div>
                <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
                  {SAMPLES.map((sample) => {
                    const texture = sample.id === "vetor" ? null : rightLabels?.[sample.id] ?? null;
                    const on = (right.sample ?? "medida") === sample.id;
                    return (
                      <li key={`b-${sample.id}`}>
                        <button
                          type="button"
                          onClick={() => setRight((current) => ({ ...current, sample: sample.id }))}
                          className={`w-full rounded-3xl border bg-card px-1 pb-3 pt-1 text-left ${on ? "border-ink" : "border-line"}`}
                        >
                          <CupView
                            texture={otherArea && texture ? wrapPrint(texture, rightPattern, 0.9, { cup: other, area: otherArea, ppm: 4, place: rightPlace }) : texture}
                            body={right.cupTint}
                            top={other.top}
                            bot={other.bot}
                            heightMm={other.height}
                            cover={otherArea ? (rightPattern ? 0.9 : otherArea.h / other.height) : 0.6}
                            area={otherArea}
                            liquid={rightLiquid}
                            spin={false}
                            className="h-32 w-full"
                          />
                          <span className="mt-1 block px-1 text-sm font-medium">{t.sample[sample.id].name}</span>
                          <span className="block px-1 text-xs text-muted">{t.sample[sample.id].note}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted">{t.waiting}</p>
          )}
        </div>
          {area ? (
            <section className="overflow-hidden rounded-3xl border border-line bg-card">
            <div>
              <div className="grid grid-cols-2 items-stretch gap-2 bg-paper px-2 pb-3">
                <div className="relative h-64 overflow-hidden rounded-2xl border border-line bg-paper" onDoubleClick={() => setSoloCard("beer")}>
                  <CupView
                    key={`cup1-${chosenId}-${cupTint}-${liquid}`}
                    texture={(area ? wrapPrint(shown, pattern, pattern ? 0.9 : 0.6, { cup, area, place }) : wrapPrint(shown, pattern, pattern ? 0.9 : 0.6)) ?? shown}
                    area={area}
                    top={cup.top}
                    bot={cup.bot}
                    heightMm={cup.height}
                    cover={pattern ? 0.9 : area.h / cup.height}
                    body={cupTint}
                    liquid={liquid}
                    spin={Boolean(art || pattern) && spin}
                    studio
                    place={place}
                    onPlace={setPlace}
                    className="absolute inset-0 h-full w-full"
                  />
                  <span className="absolute bottom-2 left-2 rounded bg-white/80 px-2 py-0.5 text-xs text-ink">{t.cup1}</span>
                </div>
                <div className="relative h-64 overflow-hidden rounded-2xl border border-line bg-paper" onDoubleClick={() => setSoloCard("soda")}>
                  <CupView
                    key={`cup2-${right.sample}-${right.cupTint}-${rightLiquid}`}
                    texture={(otherArea ? wrapPrint(otherTexture, rightPattern, rightPattern ? 0.9 : 0.6, { cup: other, area: otherArea, place: rightPlace }) : wrapPrint(otherTexture, rightPattern, rightPattern ? 0.9 : 0.6)) ?? otherTexture}
                    area={otherArea}
                    top={other.top}
                    bot={other.bot}
                    heightMm={other.height}
                    cover={rightPattern ? 0.9 : otherArea ? otherArea.h / other.height : 0.6}
                    body={right.cupTint}
                    liquid={rightLiquid}
                    spin={Boolean(rightArt || rightPattern) && spin}
                    studio
                    place={rightPlace}
                    onPlace={setRightPlace}
                    className="absolute inset-0 h-full w-full"
                  />
                  <span className="absolute bottom-2 left-2 rounded bg-white/80 px-2 py-0.5 text-xs text-ink">{t.cup2}</span>
                </div>
              </div>
              <div className="grid grid-cols-1 items-start gap-2 bg-white px-2 py-3 sm:grid-cols-2">
                <div className="min-w-0 rounded-2xl border border-line p-2">
                  <label className="flex flex-col gap-1 text-xs text-muted">
                    {t.cup1}
                    <select className="min-h-11 w-full rounded-xl border border-line bg-white px-2 text-sm text-ink" value={cup.id} onChange={(event) => chooseCup(event.target.value)}>
                      {CUPS.map((item) => (
                        <option key={item.id} value={item.id}>{item.name} · {item.height} mm</option>
                      ))}
                    </select>
                  </label>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {processesFor(cup).map((item) => (
                      <button key={item} type="button" onClick={() => patch({ process: item, cover360: false })} className={`min-h-11 rounded-full px-3 text-xs ${process === item && !cover360 ? "bg-ink text-paper" : "bg-card"}`}>{t.process[item]}</button>
                    ))}
                    {processesFor(cup).includes("iml") ? (
                      <button type="button" onClick={() => patch({ process: "iml", cover360: true })} className={`min-h-11 rounded-full px-3 text-xs ${cover360 ? "bg-ink text-paper" : "bg-card"}`}>{t.cover360}</button>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line px-1 text-center text-xs">{t.logo}<input className="sr-only" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { void onFiles(event.target.files, "logo", "beer"); event.target.value = ""; }} /></label>
                    <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line px-1 text-center text-xs">{t.pattern}<input className="sr-only" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { void onFiles(event.target.files, "pattern", "beer"); event.target.value = ""; }} /></label>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <button type="button" className={`min-h-11 rounded-xl border px-1 text-xs ${liquid === "beer" ? "border-ink bg-amber-50" : "border-line"}`} onClick={() => setLiquid(liquid === "beer" ? "none" : "beer")}>Cerveja</button>
                    <button type="button" className={`min-h-11 rounded-xl border px-1 text-xs ${liquid === "soda" ? "border-ink bg-red-50" : "border-line"}`} onClick={() => setLiquid(liquid === "soda" ? "none" : "soda")}>Refrigerante</button>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {logos.map((item, index) => (
                      <li key={`bl-${item.name}-${index}`} className="flex items-center justify-between gap-1 text-xs"><span className="min-w-0 truncate">{item.name}</span><button type="button" className="min-h-11 shrink-0 px-2" onClick={() => setLogos((current) => current.filter((_, i) => i !== index))}>{t.remove}</button></li>
                    ))}
                    {patterns.map((item, index) => (
                      <li key={`bp-${item.name}-${index}`} className="flex items-center justify-between gap-1 text-xs"><span className="min-w-0 truncate">{item.name}</span><button type="button" className="min-h-11 shrink-0 px-2" onClick={() => setPatterns((current) => current.filter((_, i) => i !== index))}>{t.remove}</button></li>
                    ))}
                  </ul>
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
                  {draft.phrase.trim() ? (
                    <TextControls
                      t={t}
                      ink={draft.textInk ?? null}
                      pos={draft.textPos ?? "bottom"}
                      withLogo={logos.length > 0}
                      onInk={(hex) => patch({ textInk: hex })}
                      onPos={(pos) => patch({ textPos: pos })}
                    />
                  ) : null}
                  <p className="mt-2 text-xs text-muted">{t.inkLogo}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button type="button" className={`min-h-11 rounded-full border px-3 text-xs ${tint === null ? "border-ink" : "border-line"}`} onClick={() => setTint(null)}>{t.original}</button>
                    {STOCK.map((swatch) => (
                      <button key={`l-${swatch.hex}`} type="button" aria-label={swatch.hex} className={`h-9 w-9 rounded-full border ${tint === swatch.hex ? "border-ink ring-2 ring-ink" : "border-line"}`} style={{ background: swatch.hex }} onClick={() => armClick(`logo1-${swatch.hex}`, () => setTint(swatch.hex), () => setPantoneModal({ hex: swatch.hex, type: "logo" }))} />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">{t.inkCup}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button type="button" className={`min-h-11 rounded-full border px-3 text-xs ${cupTint === null ? "border-ink" : "border-line"}`} onClick={() => setCupTint(null)}>{t.original}</button>
                    {STOCK.map((swatch) => (
                      <button key={`c-${swatch.hex}`} type="button" aria-label={swatch.hex} className={`h-9 w-9 rounded-full border ${cupTint === swatch.hex ? "border-ink ring-2 ring-ink" : "border-line"}`} style={{ background: swatch.hex }} onClick={() => armClick(`cup1-${swatch.hex}`, () => setCupTint(swatch.hex), () => setPantoneModal({ hex: swatch.hex, type: "cup" }))} />
                    ))}
                    <button type="button" className="flex min-h-9 items-center gap-1 rounded-full border border-dashed border-ink px-2 text-xs" onClick={() => setColorDialog("cup1")}>
                      <span className="h-6 w-6 rounded-full border border-dashed border-muted bg-white" style={customSwatch(cupTint)} />
                      {t.otherColor}
                    </button>
                  </div>
                  <label className="mt-2 block text-xs text-muted">
                    {t.qty}
                    <input className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink" type="number" min={0} inputMode="numeric" value={draft.qty} onChange={(event) => patch({ qty: Math.max(0, Math.floor(Number(event.target.value) || 0)) })} />
                  </label>
                  {leftQuote.charge === 0 ? <p className="mt-2 text-sm text-muted">{t.leftOut}</p> : (
                    <>
                      <p className="mt-2 text-sm">{leftQuote.charge.toLocaleString(locale)} · {leftQuote.boxes} {t.boxes}</p>
                      <p className="text-sm"><SheetMoney inline market={market} kz={leftQuote.finalUnit} /> {t.perUnit}</p>
                      <p className="font-medium"><SheetMoney inline market={market} kz={leftQuote.lot} /> {t.inLot}</p>
                      <button type="button" className="mt-2 min-h-11 w-full rounded-full bg-ink text-sm text-paper" onClick={() => void saveCard("beer")}>{t.addPdf}</button>
                    </>
                  )}
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
                  <div className="mt-2 flex flex-wrap gap-1">
                    {processesFor(other).map((item) => (
                      <button key={item} type="button" onClick={() => setRight((current) => ({ ...current, process: item, cover360: false }))} className={`min-h-11 rounded-full px-3 text-xs ${otherProcess === item && !otherCover360 ? "bg-ink text-paper" : "bg-card"}`}>{t.process[item]}</button>
                    ))}
                    {processesFor(other).includes("iml") ? (
                      <button type="button" onClick={() => setRight((current) => ({ ...current, process: "iml", cover360: true }))} className={`min-h-11 rounded-full px-3 text-xs ${otherCover360 ? "bg-ink text-paper" : "bg-card"}`}>{t.cover360}</button>
                    ) : null}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line px-1 text-center text-xs">{t.logo}<input className="sr-only" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { void onFiles(event.target.files, "logo", "soda"); event.target.value = ""; }} /></label>
                    <label className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line px-1 text-center text-xs">{t.pattern}<input className="sr-only" type="file" multiple accept="application/pdf,image/png,image/jpeg,image/webp,image/svg+xml" onChange={(event) => { void onFiles(event.target.files, "pattern", "soda"); event.target.value = ""; }} /></label>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1">
                    <button type="button" className={`min-h-11 rounded-xl border px-1 text-xs ${rightLiquid === "beer" ? "border-ink bg-amber-50" : "border-line"}`} onClick={() => setRightLiquid(rightLiquid === "beer" ? "none" : "beer")}>Cerveja</button>
                    <button type="button" className={`min-h-11 rounded-xl border px-1 text-xs ${rightLiquid === "soda" ? "border-ink bg-red-50" : "border-line"}`} onClick={() => setRightLiquid(rightLiquid === "soda" ? "none" : "soda")}>Refrigerante</button>
                  </div>
                  <ul className="mt-1 space-y-1">
                    {rightLogos.map((item, index) => (
                      <li key={`rl-${item.name}-${index}`} className="flex items-center justify-between gap-1 text-xs"><span className="min-w-0 truncate">{item.name}</span><button type="button" className="min-h-11 shrink-0 px-2" onClick={() => setRightLogos((current) => current.filter((_, i) => i !== index))}>{t.remove}</button></li>
                    ))}
                    {rightPatterns.map((item, index) => (
                      <li key={`rp-${item.name}-${index}`} className="flex items-center justify-between gap-1 text-xs"><span className="min-w-0 truncate">{item.name}</span><button type="button" className="min-h-11 shrink-0 px-2" onClick={() => setRightPatterns((current) => current.filter((_, i) => i !== index))}>{t.remove}</button></li>
                    ))}
                  </ul>
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
                  {right.phrase.trim() ? (
                    <TextControls
                      t={t}
                      ink={right.textInk}
                      pos={right.textPos}
                      withLogo={rightLogos.length > 0}
                      onInk={(hex) => setRight((current) => ({ ...current, textInk: hex }))}
                      onPos={(pos) => setRight((current) => ({ ...current, textPos: pos }))}
                    />
                  ) : null}
                  <p className="mt-2 text-xs text-muted">{t.inkLogo}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button type="button" className={`min-h-11 rounded-full border px-3 text-xs ${right.tint === null ? "border-ink" : "border-line"}`} onClick={() => setRight((current) => ({ ...current, tint: null }))}>{t.original}</button>
                    {STOCK.map((swatch) => (
                      <button key={`rl-${swatch.hex}`} type="button" aria-label={swatch.hex} className={`h-9 w-9 rounded-full border ${right.tint === swatch.hex ? "border-ink ring-2 ring-ink" : "border-line"}`} style={{ background: swatch.hex }} onClick={() => armClick(`logo2-${swatch.hex}`, () => setRight((current) => ({ ...current, tint: swatch.hex })), () => setPantoneModal({ hex: swatch.hex, type: "logo" }))} />
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-muted">{t.inkCup}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <button type="button" className={`min-h-11 rounded-full border px-3 text-xs ${right.cupTint === null ? "border-ink" : "border-line"}`} onClick={() => setRight((current) => ({ ...current, cupTint: null }))}>{t.original}</button>
                    {STOCK.map((swatch) => (
                      <button key={`rc-${swatch.hex}`} type="button" aria-label={swatch.hex} className={`h-9 w-9 rounded-full border ${right.cupTint === swatch.hex ? "border-ink ring-2 ring-ink" : "border-line"}`} style={{ background: swatch.hex }} onClick={() => armClick(`cup2-${swatch.hex}`, () => setRight((current) => ({ ...current, cupTint: swatch.hex })), () => setPantoneModal({ hex: swatch.hex, type: "cup" }))} />
                    ))}
                    <button type="button" className="flex min-h-9 items-center gap-1 rounded-full border border-dashed border-ink px-2 text-xs" onClick={() => setColorDialog("cup2")}>
                      <span className="h-6 w-6 rounded-full border border-dashed border-muted bg-white" style={customSwatch(right.cupTint)} />
                      {t.otherColor}
                    </button>
                  </div>
                  <label className="mt-2 block text-xs text-muted">
                    {t.qty}
                    <input className="mt-1 min-h-11 w-full rounded-xl border border-line bg-white px-3 text-sm text-ink" type="number" min={0} inputMode="numeric" value={compareQty} onChange={(event) => setCompareQty(Math.max(0, Math.floor(Number(event.target.value) || 0)))} />
                  </label>
                  {rightQuote.charge === 0 ? <p className="mt-2 text-sm text-muted">{t.leftOut}</p> : (
                    <>
                      <p className="mt-2 text-sm">{rightQuote.charge.toLocaleString(locale)} · {rightQuote.boxes} {t.boxes}</p>
                      <p className="text-sm"><SheetMoney inline market={market} kz={rightQuote.finalUnit} /> {t.perUnit}</p>
                      <p className="font-medium"><SheetMoney inline market={market} kz={rightQuote.lot} /> {t.inLot}</p>
                      <button type="button" className="mt-2 min-h-11 w-full rounded-full bg-ink text-sm text-paper" onClick={() => void saveCard("soda")}>{t.addPdf}</button>
                    </>
                  )}
                </div>
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
                {(art || pattern || rightArt || rightPattern) ? (
                  <button type="button" className="min-h-11 px-3 text-sm" onClick={() => setSpin((value) => !value)}>
                    {spin ? t.stop : t.spin}
                  </button>
                ) : null}
              </div>
              {chosen ? <WindowPlate {...unrolledPlate(chosen, pattern, cup, area, place)} process={process} caption={t} cupColor={cupTint} /> : null}
              {rightShown && otherArea ? <WindowPlate {...unrolledPlate(rightShown, rightPattern, other, otherArea, rightPlace)} process={otherProcess} caption={t} cupColor={right.cupTint} /> : null}
            </div>
            </section>
          ) : null}
        </div>
        <div className="panel-in min-w-0 space-y-6 lg:sticky lg:top-4">
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
            <Field label={t.eventDate}>
              <input className={`${control} min-w-0`} type="date" value={draft.eventDate} onChange={(event) => patch({ eventDate: event.target.value })} />
            </Field>
            <details className="rounded-2xl border border-line bg-paper px-3 py-2 text-sm">
              <summary className="min-h-11 cursor-pointer py-2.5 font-medium">{t.projectsTitle}{projects.length > 0 ? ` · ${projects.length}` : ""}</summary>
              <p className="text-xs text-muted">{t.projectsLead}</p>
              <button type="button" className="mt-2 min-h-11 w-full rounded-full bg-ink text-sm text-paper" onClick={storeProject}>{t.saveProject}</button>
              {projectNote ? <p className="mt-1 text-xs text-muted" role="status">{projectNote}</p> : null}
              {projects.length === 0 ? <p className="mt-2 text-xs text-muted">{t.noProjects}</p> : (
                <ul className="mt-2 divide-y divide-line">
                  {projects.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 py-1">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate">{item.name}</span>
                        <span className="block text-xs text-muted">{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.savedAt))}</span>
                      </span>
                      <button type="button" className="min-h-11 shrink-0 px-2 text-sm underline underline-offset-4" onClick={() => openProject(item)}>{t.openProject}</button>
                      <button type="button" className="min-h-11 shrink-0 px-2 text-sm text-muted" onClick={() => setProjects(deleteProject(item.id))}>{t.remove}</button>
                    </li>
                  ))}
                </ul>
              )}
            </details>
            <dl className="divide-y divide-line overflow-hidden rounded-2xl border border-line text-sm">
              <div className="flex items-baseline justify-between gap-4 bg-paper px-3 py-3">
                <dt className="text-muted">{t.final}</dt>
                <dd className="min-w-0 text-right break-words">
                  <span key={finalLot} className="final-figure font-display text-2xl leading-none">{orderQty > 0 ? finalLot : "—"}</span>
                  <span className="mt-1 block text-muted">{orderQty > 0 ? `${orderQty.toLocaleString(locale)} ${t.cups}` : t.leftOut}</span>
                </dd>
              </div>
              {([
                [t.cup1, cup.name, leftQuote],
                [t.cup2, other.name, rightQuote],
              ] as const).filter((row) => row[2].charge > 0).map(([label, name, quote]) => (
                <div key={label} className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                  <dt className="text-muted">{label} · {name}</dt>
                  <dd className="min-w-0 text-right break-words">
                    {quote.charge.toLocaleString(locale)} {t.cups}
                    <span className="mt-0.5 block"><SheetMoney market={market} kz={quote.lot} /></span>
                  </dd>
                </div>
              ))}
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
                  {freightMode(orderQty) === "marítimo" ? t.sea : t.air} · {freightDays(Math.max(orderQty, 1))} {t.days}
                </dd>
              </div>
              {orderDoor > 0 ? (
                <div className="flex items-baseline justify-between gap-4 px-3 py-2.5">
                  <dt className="text-muted">{t.fees}</dt>
                  <dd className="min-w-0 text-right break-words">{airMoney}</dd>
                </div>
              ) : null}
            </dl>
            {late ? <p className="border-l-4 border-pitanga pl-3 text-sm">{t.late}</p> : null}
            {(leftQuote.charge > 0 && priceFor(cup, leftQuote.charge).below) || (rightQuote.charge > 0 && priceFor(other, rightQuote.charge).below) ? <p className="text-sm text-muted">{t.belowMin}</p> : null}
          </div>
        </aside>
          {chosen && area ? (
            <div className="space-y-4 rounded-3xl border border-line bg-card p-4">
              <h2 className="font-display text-3xl leading-tight">{draft.event || t.unnamed}</h2>
              <p className="text-sm text-muted">
                {draft.promoter || t.promoter}
                {draft.email ? ` · ${draft.email}` : ""}
                {draft.phone ? ` · ${draft.dial} ${draft.phone}` : ""}
                {leftQuote.charge > 0 ? ` · ${cup.name} · ${leftQuote.charge.toLocaleString(locale)} ${t.cups}` : ""}
                {rightQuote.charge > 0 ? ` · ${other.name} · ${rightQuote.charge.toLocaleString(locale)} ${t.cups}` : ""}
              </p>
              <p className="text-sm">
                {orderQty > 0 ? finalLot : "—"} {t.inLot}
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
              <button type="button" onClick={() => void saveAttached()} className="min-h-11 w-full rounded-full bg-ink text-sm font-medium text-paper">
                {t.download}{chosenId === "vetor" ? ` ${t.andSvg}` : ""}
              </button>
              <p className="text-xs leading-relaxed text-muted">{t.estimate} 1 € = {formatKz(getKzPerEur())}.</p>
            </div>
          ) : null}
        </div>
      </div>
    
      {zoomedCup && (() => {
        const item = CUPS.find(c => c.id === zoomedCup);
        if (!item) return null;
        const win = item.id === cup.id ? area : item.id === compareId ? otherArea : areaFor(item, processesFor(item).includes(process) ? process : processesFor(item)[0]);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setZoomedCup(null)}>
            <div className="relative max-h-[90vh] w-full max-w-2xl rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <button type="button" className="absolute right-4 top-4 text-sm text-muted" onClick={() => setZoomedCup(null)}>Fechar</button>
              <h3 className="font-display text-xl">{item.name} · {item.height} mm</h3>
              <p className="mt-1 text-sm text-muted">
                {item.measured ? `${item.height} × boca ${item.top} × base ${item.bot} mm` : item.height + " mm"}
                {win ? ` · janela ${win.w} × ${win.h} mm` : ""}
              </p>
              <p className="text-xs text-muted">Material em detalhe. Clica fora ou em Fechar para voltar.</p>
              <div className="mt-4 h-[60vh] rounded-2xl bg-white">
                <CupView
                  texture={win && item.id === cup.id ? wrapPrint(shown, pattern, pattern ? 0.9 : 0.6, { cup: item, area: win, place }) ?? shown : win && item.id === compareId ? wrapPrint(otherTexture, rightPattern, rightPattern ? 0.9 : 0.6, { cup: item, area: win, place: rightPlace }) ?? otherTexture : null}
                  area={win}
                  body={item.id === cup.id ? cupTint : item.id === compareId ? right.cupTint : null}
                  top={item.top}
                  bot={item.bot}
                  heightMm={item.height}
                  cover={win ? win.h / item.height : 0.6}
                  liquid={item.id === cup.id ? liquid : item.id === compareId ? rightLiquid : "none"}
                  spin={true}
                  className="h-full w-full"
                />
              </div>
            </div>
          </div>
        );
      })()}
      {pantoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setPantoneModal(null)}>
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg">Código Pantone</h3>
            <p className="mt-1 text-sm text-muted">Cor: {pantoneModal.hex}</p>
            <div className="mt-4 space-y-3">
              <label className="block text-sm">
                RGB
                <input type="text" placeholder="255, 0, 0" className="mt-1 w-full rounded-xl border border-line px-3 py-2" id="pantone-rgb" defaultValue={customColors[pantoneModal.hex]?.rgb || ""} />
              </label>
              <label className="block text-sm">
                CMYK
                <input type="text" placeholder="0, 100, 100, 0" className="mt-1 w-full rounded-xl border border-line px-3 py-2" id="pantone-cmyk" defaultValue={customColors[pantoneModal.hex]?.cmyk || ""} />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" className="min-h-11 flex-1 rounded-xl bg-ink text-paper" onClick={() => {
                const rgb = (document.getElementById("pantone-rgb") as HTMLInputElement)?.value || "";
                const cmyk = (document.getElementById("pantone-cmyk") as HTMLInputElement)?.value || "";
                setCustomColors((prev) => ({ ...prev, [pantoneModal.hex]: { rgb, cmyk } }));
                setPantoneModal(null);
              }}>Guardar</button>
              <button type="button" className="min-h-11 rounded-xl border border-line px-4" onClick={() => {
                setCustomColors((prev) => { const next = { ...prev }; delete next[pantoneModal.hex]; return next; });
                setPantoneModal(null);
              }}>Apagar</button>
              <button type="button" className="min-h-11 rounded-xl border border-line px-4" onClick={() => setPantoneModal(null)}>Fechar</button>
            </div>
          </div>
        </div>
      )}
      <OtherColorDialog
        open={colorDialog !== null}
        color={colorDialog === "cup2" ? right.cupTint : cupTint}
        title={t.otherColor}
        lead={t.otherColorLead}
        closeLabel={t.close}
        mix={t.mix}
        onColor={(hex) => {
          if (colorDialog === "cup2") setRight((current) => ({ ...current, cupTint: hex }));
          else setCupTint(hex);
        }}
        onClose={() => setColorDialog(null)}
      />
      {soloCard && (() => {
        const isBeer = soloCard === "beer";
        const item = isBeer ? cup : other;
        const itemTexture = isBeer ? shown : otherTexture;
        const itemTint = isBeer ? cupTint : right.cupTint;
        const itemLiquid = isBeer ? liquid : rightLiquid;
        const itemPattern = isBeer ? pattern : rightPattern;
        const itemArea = isBeer ? area : otherArea;
        const itemPrint = (itemArea ? wrapPrint(itemTexture, itemPattern, itemPattern ? 0.9 : 0.6, { cup: item, area: itemArea, place: item.id === cup.id ? place : rightPlace }) : wrapPrint(itemTexture, itemPattern, itemPattern ? 0.9 : 0.6)) ?? itemTexture;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setSoloCard(null)}>
            <div className="relative max-h-[90vh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display text-lg">{item.name} · {item.height} mm</h3>
              <p className="text-sm text-muted">
                {item.measured ? `${item.height} × boca ${item.top} × base ${item.bot} mm` : ""}
              </p>
              <p className="text-xs text-muted">Toca para pausar, solta para continuar</p>
              <div className="relative mt-3 h-80 rounded-2xl bg-paper">
                <CupView
                  texture={itemPrint}
                  area={itemArea}
                  top={item.top}
                  bot={item.bot}
                  heightMm={item.height}
                  cover={itemPattern ? 0.9 : 0.6}
                  body={itemTint}
                  liquid={itemLiquid}
                  spin={true}
                  studio
                  place={isBeer ? place : rightPlace}
                  onPlace={isBeer ? setPlace : setRightPlace}
                  className="absolute inset-0 h-full w-full"
                />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1 rounded-2xl bg-white">
                {([[-Math.PI / 2, t.angleLeft], [0, t.angleFront], [Math.PI / 2, t.angleRight]] as const).map(([view, name]) => (
                  <figure key={name} className="m-0">
                    <CupView
                      texture={itemPrint}
                      area={itemArea}
                      top={item.top}
                      bot={item.bot}
                      heightMm={item.height}
                      cover={itemPattern ? 0.9 : 0.6}
                      body={itemTint}
                      liquid={itemLiquid}
                      spin={false}
                      turn={view}
                      label={`${item.name}, ${name}`}
                      className="pointer-events-none h-44 w-full"
                    />
                    <figcaption className="whitespace-nowrap pb-1 text-center text-[15px] font-semibold text-ink">{name}</figcaption>
                  </figure>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <button type="button" className="min-h-11 flex-1 rounded-xl bg-ink text-paper" onClick={() => setSoloCard(null)}>Confirmar</button>
                <button type="button" className="min-h-11 rounded-xl border border-line px-4" onClick={() => setSoloCard(null)}>Fechar</button>
              </div>
            </div>
          </div>
        );
      })()}
      <footer className="mt-16 text-center text-sm text-muted">
        © BLINK 2026 · <a href="/gestao" className="underline-offset-4 hover:underline">{t.gestao}</a>
      </footer>
    </main>
  );
}

function BlinkLogo({ slogan }: { slogan: string }) {
  return (
    <div>
      <svg
        viewBox="0 0 871.47 244.94"
        className="mx-auto h-11 w-auto text-ink sm:mx-0 sm:h-12"
        role="img"
        aria-label="BLINK"
      >
        <g transform="translate(58.320 180.792)" fill="currentColor">
          <path d="M 68.444 -109.896 A 53.654 53.654 0 1 1 38.865 -109.896 L 44.485 -90.297 A 33.266 33.266 0 1 0 62.824 -90.297 Z" />
          <g transform="translate(130.594 0)">
            <path d="M14.04 0.0V-116.64H73.44Q94.86 -116.64 106.28999999999999 -108.63Q117.72 -100.61999999999999 117.72 -85.5Q117.72 -75.78 113.31 -70.11Q108.89999999999999 -64.44 100.8 -61.65Q92.7 -58.86 81.72 -58.14L82.44 -59.22Q90.36 -59.04 97.47 -57.87Q104.58 -56.699999999999996 110.07 -53.81999999999999Q115.56 -50.94 118.71000000000001 -45.81Q121.86 -40.68 121.86 -32.58Q121.86 -21.779999999999998 116.46000000000001 -14.759999999999998Q111.06 -7.739999999999999 101.52 -4.05Q91.97999999999999 -0.36 79.56 0.0ZM34.56 -17.46H76.5Q88.2 -17.46 94.68 -21.509999999999998Q101.16 -25.56 101.16 -34.199999999999996Q101.16 -41.04 97.19999999999999 -44.19Q93.24 -47.339999999999996 87.03 -48.239999999999995Q80.82 -49.14 73.8 -49.14H34.56ZM34.56 -66.24H72.17999999999999Q83.88 -66.24 90.27 -70.28999999999999Q96.66 -74.34 96.66 -83.16Q96.66 -91.8 90.27 -95.49Q83.88 -99.17999999999999 73.61999999999999 -99.17999999999999H34.56Z M174.78 -116.64V-17.64H247.5V0.0H154.26V-116.64Z M284.4 -116.64H304.92V0.0H284.4Z M455.04 -21.24 448.92 -18.9V-116.64H469.26V0.0H448.92L361.44 -94.86L367.74 -97.2V0.0H347.22V-116.64H367.74Z M549.9 -56.699999999999996 549.72 -66.6 624.24 0.0H595.26L528.48 -61.199999999999996L587.7 -116.64H616.32ZM508.14000000000004 -116.64H528.6600000000001V0.0H508.14000000000004Z" />
          </g>
        </g>
      </svg>
      <p className="mt-1 text-sm text-muted">{slogan}</p>
    </div>
  );
}

const control = "min-h-11 w-full rounded-2xl border border-line bg-paper px-3";

function liveQuote(item: ReturnType<typeof cupById>, qty: number) {
  const tiers = item.prices.map((row) => row.qty);
  const charge = chargedQty(qty, Math.min(...tiers), tiers);
  if (charge <= 0) return { charge: 0, unit: 0, door: 0, finalUnit: 0, lot: 0, boxes: 0 };
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

/**
 * Sample labels are costly to paint (seven full-size canvases); switching process or cup and
 * back reuses them instead of painting them again.
 */
const labelCache = new Map<string, Record<SampleId, HTMLCanvasElement>>();
const objectIds = new WeakMap<object, number>();
let nextObjectId = 1;
function cachedLabels(parts: (object | null)[], key: string, build: () => Record<SampleId, HTMLCanvasElement>): Record<SampleId, HTMLCanvasElement> {
  const ids = parts.map((part) => {
    if (!part) return 0;
    let id = objectIds.get(part);
    if (!id) {
      id = nextObjectId++;
      objectIds.set(part, id);
    }
    return id;
  });
  const full = `${ids.join(",")}|${key}`;
  const hit = labelCache.get(full);
  if (hit) {
    labelCache.delete(full);
    labelCache.set(full, hit);
    return hit;
  }
  const made = build();
  labelCache.set(full, made);
  if (labelCache.size > 8) {
    const oldest = labelCache.keys().next().value;
    if (oldest !== undefined) labelCache.delete(oldest);
  }
  return made;
}

/** The print window as it is printed (same copies and sizes as on the 3D cup), with its real size in mm. */
function unrolledPlate(label: HTMLCanvasElement, motif: HTMLCanvasElement | null, cup: Cup, area: Area, place: ArtPlace = ART_PLACE0): { canvas: HTMLCanvasElement; area: Area } {
  const canvas = wrapPrint(label, motif, 0.9, { cup, area, ppm: 6, place });
  const meta = printMetaOf(canvas);
  if (!canvas || !meta) return { canvas: label, area };
  return { canvas, area: { ...area, w: Math.round(meta.widthMm * 10) / 10, h: Math.round(meta.bandH * 10) / 10 } };
}

function WindowPlate({ area, process, canvas, caption, cupColor = null }: { area: Area; process: Process; canvas: HTMLCanvasElement; caption: ReturnType<typeof text>; cupColor?: string | null }) {
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
        {(() => {
          const spec = parseBody(cupColor);
          if (!spec || spec.mode === "solid") return <rect x={pad} y={pad} width={inner} height={innerH} fill={spec?.colors[0] || "var(--color-paper)"} />;
          const id = `plate-${spec.mode}-${spec.colors.join("").replace(/#/g, "")}`;
          const n = spec.colors.length;
          return (
            <>
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  {spec.mode === "grad"
                    ? spec.colors.map((hex, i) => <stop key={i} offset={i / (n - 1)} stopColor={hex} />)
                    : spec.colors.flatMap((hex, i) => [<stop key={`a${i}`} offset={i / n} stopColor={hex} />, <stop key={`b${i}`} offset={(i + 1) / n} stopColor={hex} />])}
                </linearGradient>
              </defs>
              <rect x={pad} y={pad} width={inner} height={innerH} fill={`url(#${id})`} />
            </>
          );
        })()}
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

function customSwatch(body: string | null): { background: string; borderStyle: "solid" } | undefined {
  if (!body || STOCK.some((swatch) => swatch.hex.toLowerCase() === body.toLowerCase())) return undefined;
  const background = bodyCss(body);
  return background ? { background, borderStyle: "solid" } : undefined;
}

/** Phrase colour (same swatches as the logo and cup) and its lane: above, below or both. */
function TextControls({ t, ink, pos, withLogo, onInk, onPos }: { t: ReturnType<typeof text>; ink: string | null; pos: PhrasePos; withLogo: boolean; onInk: (hex: string | null) => void; onPos: (pos: PhrasePos) => void }) {
  return (
    <>
      {withLogo ? (
        <>
          <p className="mt-2 text-xs text-muted">{t.textPos}</p>
          <div className="mt-1 grid grid-cols-3 gap-1" role="group" aria-label={t.textPos}>
            {([["top", t.textTop], ["bottom", t.textBottom], ["both", t.textBoth]] as const).map(([id, label]) => (
              <button key={id} type="button" aria-pressed={pos === id} onClick={() => onPos(id)} className={`min-h-11 rounded-full px-1 text-xs ${pos === id ? "bg-ink text-paper" : "bg-card"}`}>{label}</button>
            ))}
          </div>
        </>
      ) : null}
      <p className="mt-2 text-xs text-muted">{t.textColor}</p>
      <div className="mt-1 flex flex-wrap gap-1">
        <button type="button" className={`min-h-11 rounded-full border px-3 text-xs ${ink === null ? "border-ink" : "border-line"}`} onClick={() => onInk(null)}>{t.original}</button>
        {STOCK.map((swatch) => (
          <button key={`t-${swatch.hex}`} type="button" aria-label={`${t.textColor} ${swatch.name}`} className={`h-9 w-9 rounded-full border ${ink === swatch.hex ? "border-ink ring-2 ring-ink" : "border-line"}`} style={{ background: swatch.hex }} onClick={() => onInk(swatch.hex)} />
        ))}
      </div>
    </>
  );
}
