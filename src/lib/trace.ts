import ImageTracer from "imagetracerjs";
import type { Process } from "@/lib/catalog";
import { hexToRgb } from "@/lib/print";

export type VectorMode = "off" | "ink" | "auto";

export type TraceResult = {
  svg: string;
  paths: number;
  colors: number;
};

const TRACE_OPTIONS = {
  ltres: 1,
  qtres: 1,
  pathomit: 8,
  rightangleenhance: true,
  strokewidth: 0,
  linefilter: true,
  scale: 1,
  roundcoords: 1,
  viewbox: true,
  desc: false,
  layering: 0,
};

function snapToInks(image: ImageData, inks: { r: number; g: number; b: number }[]) {
  const data = image.data;
  const count = data.length / 4;
  const assign = new Int16Array(count);
  const totals = new Array<number>(inks.length).fill(0);
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    let best = 0;
    let bestDist = Infinity;
    for (let k = 0; k < inks.length; k += 1) {
      const ink = inks[k];
      const dist = (ink.r - r) ** 2 + (ink.g - g) ** 2 + (ink.b - b) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = k;
      }
    }
    const toPaper = (255 - r) ** 2 + (255 - g) ** 2 + (255 - b) ** 2;
    if (inks.length === 0 || toPaper * 0.72 < bestDist) assign[p] = -1;
    else {
      assign[p] = best;
      totals[best] += 1;
    }
  }
  const inkPixels = totals.reduce((sum, value) => sum + value, 0);
  const keep = totals.map((value) => inkPixels > 0 && value / inkPixels >= 0.04);
  if (inkPixels > 0 && !keep.some(Boolean)) {
    let winner = 0;
    totals.forEach((value, index) => {
      if (value > totals[winner]) winner = index;
    });
    keep[winner] = true;
  }
  for (let p = 0; p < count; p += 1) {
    const i = p * 4;
    let slot = assign[p];
    if (slot >= 0 && !keep[slot]) {
      let next = 0;
      let nextDist = Infinity;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      keep.forEach((on, index) => {
        if (!on) return;
        const ink = inks[index];
        const dist = (ink.r - r) ** 2 + (ink.g - g) ** 2 + (ink.b - b) ** 2;
        if (dist < nextDist) {
          nextDist = dist;
          next = index;
        }
      });
      slot = next;
    }
    const ink = slot >= 0 ? inks[slot] : null;
    data[i] = ink ? ink.r : 255;
    data[i + 1] = ink ? ink.g : 255;
    data[i + 2] = ink ? ink.b : 255;
    data[i + 3] = 255;
  }
}

function isPaper(color: { r: number; g: number; b: number }) {
  return color.r > 242 && color.g > 242 && color.b > 242;
}

function toPalette(hexes: string[]) {
  return hexes.map((hex) => {
    const [r, g, b] = hexToRgb(hex);
    return { r, g, b, a: 255 };
  });
}

function countPaths(layers: { isholepath?: boolean; segments?: unknown[] }[][]) {
  let paths = 0;
  for (const layer of layers) {
    for (const path of layer) {
      if (!path.isholepath && path.segments && path.segments.length > 0) paths += 1;
    }
  }
  return paths;
}

/** Quantize, split color layers, then fit quadratic curves. Traced on a coarse grid so the SVG stays a suggestion, not a 300 dpi knot of nodes. */
export function traceCanvas(
  source: HTMLCanvasElement,
  options: { mode: Exclude<VectorMode, "off">; process: Process; inks: string[]; inkCount: 1 | 2 },
): TraceResult | null {
  const maxEdge = 360;
  const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(8, Math.round(source.width * scale));
  canvas.height = Math.max(8, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const locked = options.mode === "ink";
  const inks = options.process === "serigrafia" ? options.inks.slice(0, options.inkCount) : options.inks.slice(0, 3);
  const palette = toPalette([...inks, "#FFFFFF"]);
  if (locked) snapToInks(image, palette.slice(0, -1));
  const traced = ImageTracer.imagedataToTracedata(image, {
    ...TRACE_OPTIONS,
    colorsampling: locked ? 0 : 2,
    numberofcolors: locked ? palette.length : options.process === "serigrafia" ? 3 : 5,
    mincolorratio: 0.015,
    colorquantcycles: locked ? 1 : 3,
    pal: locked ? palette : undefined,
    blurradius: locked ? 0 : 1,
    blurdelta: 32,
  });
  if (options.process === "serigrafia") {
    traced.palette.forEach((color, index) => {
      if (isPaper(color)) traced.layers[index] = [];
    });
  }
  const paths = countPaths(traced.layers);
  const colors = traced.palette.filter((color, index) => !isPaper(color) && traced.layers[index]?.length).length;
  let svg = ImageTracer.getsvgstring(traced, TRACE_OPTIONS);
  svg = svg.replace(/ desc="Created with imagetracer\.js version [^"]*"/, "");
  return { svg, paths, colors };
}

export function rasterizeSvg(svg: string, width: number, height: number): Promise<HTMLCanvasElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, width);
      canvas.height = Math.max(1, height);
      const ctx = canvas.getContext("2d");
      URL.revokeObjectURL(url);
      if (!ctx) {
        reject(new Error("Sem tela"));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("O SVG do traço não abriu."));
    };
    image.src = url;
  });
}
