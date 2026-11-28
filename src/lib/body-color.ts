/**
 * Cup body colour. A single colour stays a plain "#RRGGBB" (unchanged format);
 * a mix of 2–4 colours is "g:#A,#B[,#C,#D]" (degradê, from the rim band down to the foot)
 * or "f:#A,#B[,…]" (faixas: equal horizontal bands, first one under the rim band).
 * The drinking lip (rim band) always stays natural PP; only the body below it takes colour.
 */
export type BodyMode = "solid" | "grad" | "faixas";
export type BodySpec = { mode: BodyMode; colors: string[] };

const HEX = /^#[0-9A-Fa-f]{6}$/;

export function parseBody(body: string | null | undefined): BodySpec | null {
  if (!body) return null;
  if (HEX.test(body)) return { mode: "solid", colors: [body] };
  const match = /^([gf]):(.+)$/.exec(body);
  if (!match) return null;
  const colors = match[2].split(",").map((hex) => hex.trim()).filter((hex) => HEX.test(hex)).slice(0, 4);
  if (colors.length === 0) return null;
  if (colors.length === 1) return { mode: "solid", colors };
  return { mode: match[1] === "g" ? "grad" : "faixas", colors };
}

export function encodeBody(spec: BodySpec): string | null {
  const colors = spec.colors.filter((hex) => HEX.test(hex)).slice(0, 4);
  if (colors.length === 0) return null;
  if (colors.length === 1 || spec.mode === "solid") return colors[0];
  return `${spec.mode === "grad" ? "g" : "f"}:${colors.join(",")}`;
}

export function isBody(body: unknown): body is string {
  return typeof body === "string" && parseBody(body) !== null;
}

/** Main colour (first), for places that only take one colour. */
export function bodyMain(body: string | null | undefined): string | null {
  return parseBody(body)?.colors[0] ?? null;
}

/** CSS background for a swatch or a preview: top of the element = rim side. */
export function bodyCss(body: string | null | undefined): string | undefined {
  const spec = parseBody(body);
  if (!spec) return undefined;
  if (spec.mode === "solid") return spec.colors[0];
  if (spec.mode === "grad") return `linear-gradient(180deg, ${spec.colors.join(", ")})`;
  const n = spec.colors.length;
  const stops = spec.colors.map((hex, i) => `${hex} ${((i / n) * 100).toFixed(2)}% ${(((i + 1) / n) * 100).toFixed(2)}%`);
  return `linear-gradient(180deg, ${stops.join(", ")})`;
}

/** Canvas fill for a rectangle whose top edge is the rim side of the print band. */
export function bodyFill(ctx: CanvasRenderingContext2D, body: string | null | undefined, y: number, h: number): string | CanvasGradient | null {
  const spec = parseBody(body);
  if (!spec) return null;
  if (spec.mode === "solid") return spec.colors[0];
  const grad = ctx.createLinearGradient(0, y, 0, y + Math.max(1, h));
  const n = spec.colors.length;
  if (spec.mode === "grad") {
    spec.colors.forEach((hex, i) => grad.addColorStop(i / (n - 1), hex));
  } else {
    spec.colors.forEach((hex, i) => {
      grad.addColorStop(i / n, hex);
      grad.addColorStop(Math.min(1, (i + 1) / n - 0.0001), hex);
    });
  }
  return grad;
}

/** Text for the ficha: "Degradê · #A → #B" or "Faixas · #A / #B". */
export function bodyLabel(body: string | null | undefined): string {
  const spec = parseBody(body);
  if (!spec) return "";
  const list = spec.colors.map((hex) => hex.toUpperCase());
  if (spec.mode === "solid") return list[0];
  return spec.mode === "grad" ? `Degradê da boca à base  ·  ${list.join(" → ")}` : `Faixas da boca à base  ·  ${list.join(" / ")}`;
}

/** Colours, rim side first, as RGB 0–1 (padded to 4) with the count and mode, for the WebGL cup. */
export function bodyUniforms(body: string | null | undefined): { n: number; mode: number; rgb: Float32Array } {
  const spec = parseBody(body);
  const rgb = new Float32Array(12);
  if (!spec) return { n: 0, mode: 0, rgb };
  spec.colors.forEach((hex, i) => {
    const v = parseInt(hex.slice(1), 16);
    rgb[i * 3] = ((v >> 16) & 255) / 255;
    rgb[i * 3 + 1] = ((v >> 8) & 255) / 255;
    rgb[i * 3 + 2] = (v & 255) / 255;
  });
  return { n: spec.colors.length, mode: spec.mode === "faixas" ? 1 : 0, rgb };
}
