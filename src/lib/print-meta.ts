/** Mould geometry attached to a composed print canvas (see wrapPrint). */
export type PrintMeta = {
  /** Distance from the rim to the top of the print, along the wall, in mm. */
  band0: number;
  /** Print height in mm. */
  bandH: number;
  /** Angle around the cup covered by the canvas width, radians. */
  span: number;
  /** Angle of the canvas left edge, radians; 0 faces the viewer. */
  start: number;
  /** True when the print wraps all the way round with no seam gap. */
  full: boolean;
  /** Print width in mm at mid height. */
  widthMm: number;
};

const metas = new WeakMap<HTMLCanvasElement, PrintMeta>();

export function setPrintMeta(canvas: HTMLCanvasElement, meta: PrintMeta) {
  metas.set(canvas, meta);
}

export function printMetaOf(canvas: HTMLCanvasElement | null): PrintMeta | null {
  return canvas ? metas.get(canvas) ?? null : null;
}

export type CupShape = { top: number; bot: number; height: number };

/** Minimum unprinted band under the mouth: the lip, and the IML full-cover edge. */
export const RIM_BAND_MIN_MM = 4;

/**
 * Distance from the mouth to the start of print and body colour, in mm along the wall.
 * Uses the catalogue / Re-uz top margin when it is larger than the lip, and never less
 * than {@link RIM_BAND_MIN_MM} (even when a published IML height equals the cup height).
 */
export function topMarginMm(cup: CupShape, area?: { h: number; rim?: number } | null): number {
  const H = cup.height;
  if (area?.rim != null) return Math.max(RIM_BAND_MIN_MM, area.rim);
  if (!area) return Math.max(RIM_BAND_MIN_MM, Math.min(H * 0.067, H * 0.067));
  const leftover = Math.max(0, H - area.h);
  const fromMould = Math.min(H * 0.067, Math.max(1.5, leftover * 0.55));
  return Math.max(RIM_BAND_MIN_MM, fromMould);
}

/**
 * Print window for a cup and a print area (both in mm). The ECO50 mould puts
 * the screen-print area 10 mm under the rim; other cups keep the same ratio.
 * The mouth itself is never in the window: at least {@link RIM_BAND_MIN_MM} stays clear.
 */
export function printWindow(cup: CupShape, area: { w: number; h: number; rim?: number; full?: boolean }, wrapAround = false) {
  const H = cup.height;
  const gap = topMarginMm(cup, area);
  const bandH = Math.min(area.h, H - gap - (area.rim !== undefined ? 0 : 2));
  const yMid = gap + bandH / 2;
  const rMid = cup.top / 2 - ((cup.top - cup.bot) / 2) * (yMid / H);
  const around = Math.PI * 2 * rMid;
  // A pattern always wraps the full circumference so its edges meet; so does a full-cover area.
  const full = wrapAround || area.full === true || area.w >= around * 0.97;
  const widthMm = full ? around : area.w;
  const span = full ? Math.PI * 2 : area.w / rMid;
  return { band0: gap, bandH, rMid, around, full, widthMm, span };
}
