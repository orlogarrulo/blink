/**
 * Shared WebGL2 cup renderer.
 *
 * One hidden WebGL canvas ray-traces the cone analytically for every cup on the
 * page and the result is copied into each visible 2D canvas, so a page with
 * thirty cups still uses a single GL context. The print is mapped by the real
 * mould geometry: the window starts a few millimetres under the rim, its edges
 * run along the cone generators and the art keeps its millimetre scale at mid
 * height, so it widens toward the mouth like an IML label does.
 */
import { printMetaOf, printWindow, type PrintMeta } from "@/lib/print-meta";

export type CupScene = {
  texture: HTMLCanvasElement | null;
  top: number;
  bot: number;
  heightMm: number;
  cover: number;
  body?: string | null;
  liquid?: "none" | "beer" | "soda";
  /** Seconds, drives the rising bubbles (fixed for stills). */
  time?: number;
  area?: { w: number; h: number; rim?: number; full?: boolean } | null;
};

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform vec2 uO;
uniform float uS;
uniform vec3 uCam;
uniform vec3 uRight;
uniform vec3 uUp;
uniform vec3 uFwd;
uniform float uRt;
uniform float uRb;
uniform float uH;
uniform float uTurn;
uniform sampler2D uTex;
uniform int uHasTex;
uniform float uBand0;
uniform float uBandH;
uniform float uSpan;
uniform float uStart;
uniform int uFull;
uniform vec4 uBody;
#ifndef LIQ
#define LIQ 0
#endif
uniform float uLevel;
uniform float uFoamTop;
uniform float uTime;

const float PI = 3.14159265;

vec4 over(vec4 top, vec4 bot) { return top + bot * (1.0 - top.a); }

float rAt(float y) { return uRb + (uRt - uRb) * y / uH; }

#ifdef DRINK
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x), mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Fine bubbles rising in columns; a = (arc mm around the cup, height mm). fw = mm per pixel.
float risingBubbles(vec2 a, float t, float density, float rad, float fw) {
  float cw = 2.4;
  float col = floor(a.x / cw);
  float h = hash12(vec2(col, 7.0));
  if (h > density) return 0.0;
  float speed = 7.0 + 9.0 * hash12(vec2(col, 3.0));
  float x0 = (col + 0.25 + 0.5 * hash12(vec2(col, 5.0))) * cw;
  float yy = a.y - t * speed - 60.0 * h;
  float cs = 3.0 + 5.0 * hash12(vec2(col, 9.0));
  float cell = floor(yy / cs);
  float pres = step(0.4, hash12(vec2(col, cell)));
  float cy = (cell + 0.5) * cs;
  vec2 d = vec2(a.x - x0 - 0.25 * sin(cell * 1.7 + t * 2.5), yy - cy);
  float r = max(rad * (0.7 + 0.6 * hash12(vec2(cell, col))), fw * 0.9);
  return pres * (1.0 - smoothstep(r * 0.45, r, length(d))) * (rad / r);
}

// Round dots on a jittered grid (condensation, bubbles stuck to the wall, fizz).
float dots(vec2 a, float cell, float chance, float rMin, float rMax, float fw, out float hl) {
  vec2 id = floor(a / cell);
  hl = 0.0;
  if (hash12(id + 17.0) > chance) return 0.0;
  float r = max(mix(rMin, rMax, hash12(id + 9.4)), fw * 0.8);
  float room = max(0.0, cell * 0.5 - r);
  vec2 c = (id + 0.5) * cell + (vec2(hash12(id), hash12(id + 3.1)) - 0.5) * 2.0 * room;
  vec2 d = a - c;
  float k = (1.0 - smoothstep(r * 0.8, r, length(d))) * min(1.0, rMin / max(fw, 1e-3) * 1.6);
  hl = k * (1.0 - smoothstep(0.0, r * 0.45, length(d - vec2(-0.3 * r, 0.35 * r))));
  return k;
}

// Light that crosses the drink: Beer-Lambert absorption along the path, darker at the edges and the foot.
vec3 drinkColor(float L, float xs, float r, float y, float lev, vec2 a, float fw) {
  bool beer = LIQ == 1;
  float detail = 1.0 - smoothstep(0.35, 0.9, fw);
  vec3 c;
  if (beer) {
    float ax = abs(xs);
    float Le = L + 0.7 * r * ax * ax * sqrt(ax) + 0.42 * max(0.0, lev - y);
    c = vec3(1.0, 0.985, 0.95) * exp(-vec3(0.0020, 0.0070, 0.022) * Le);
    c *= mix(0.74, 1.0, smoothstep(3.0, 16.0, y));
    c += vec3(0.07, 0.045, 0.0) * smoothstep(lev - 16.0, lev, y);
    c += vec3(0.10, 0.07, 0.02) * exp(-pow((xs + 0.5) / 0.13, 2.0));
    float b = risingBubbles(a, uTime, 0.28, 0.28, fw) * detail;
    c += b * vec3(0.26, 0.22, 0.14);
    c = mix(c, vec3(0.93, 0.79, 0.45), 0.35 * smoothstep(lev - 3.0, lev, y));
  } else {
    float Le = L * 0.6 + 0.25 * max(0.0, lev - y);
    c = mix(vec3(0.46, 0.15, 0.065), vec3(0.075, 0.03, 0.018), smoothstep(4.0, 30.0, Le));
    c += vec3(0.20, 0.06, 0.025) * pow(abs(xs), 3.0);
    c += vec3(0.12, 0.04, 0.02) * exp(-pow((xs + 0.5) / 0.12, 2.0));
    c *= mix(0.8, 1.0, smoothstep(3.0, 14.0, y));
    float hl;
    float s = dots(a + vec2(5.0, 1.0), 3.4, 0.25, 0.2, 0.42, fw, hl) * detail;
    c = mix(c, c * 1.8 + vec3(0.05, 0.03, 0.02), s * 0.6) + hl * 0.28 * detail;
    float b = risingBubbles(a + vec2(1.3, 0.0), uTime * 1.3, 0.22, 0.3, fw) * detail;
    c += b * vec3(0.28, 0.17, 0.12);
  }
  return c;
}

// Beer foam (or the thin fizz on a soda) seen against the wall.
vec3 foamColor(vec2 a, float y, float lev, float ndv, float fw) {
  float detail = 1.0 - smoothstep(0.35, 0.9, fw);
  float n = vnoise(a * vec2(0.7, 0.9)) * 0.6 + vnoise(a * 2.6 + 4.0) * 0.4;
  if (LIQ == 2) {
    vec3 f = mix(vec3(0.42, 0.26, 0.18), vec3(0.74, 0.62, 0.52), smoothstep(lev, lev + 1.6, y));
    return f * (0.9 + 0.2 * mix(0.5, n, detail));
  }
  vec3 f = vec3(0.975, 0.955, 0.895) * (0.95 + 0.05 * mix(0.5, n, detail));
  f -= detail * 0.035 * smoothstep(0.7, 0.9, n);
  f = mix(vec3(0.90, 0.78, 0.52), f, smoothstep(lev - 0.5, lev + 3.5, y));
  return f * (0.95 + 0.05 * ndv);
}

// The drink's top seen from above (through the mouth).
vec3 surfaceColor(vec2 sp, float rr, float fw) {
  float detail = 1.0 - smoothstep(0.35, 0.9, fw);
  if (LIQ == 1) {
    float n = vnoise(sp * 1.1) * 0.55 + vnoise(sp * 2.7 + 2.0) * 0.45;
    vec3 f = vec3(0.98, 0.958, 0.895) * (0.93 + 0.07 * mix(0.5, n, detail));
    f -= detail * 0.06 * smoothstep(0.68, 0.88, n);
    return f * (0.9 + 0.1 * (1.0 - rr * rr));
  }
  vec3 c = vec3(0.11, 0.045, 0.028) + vec3(0.22) * smoothstep(0.2, 1.0, rr) * 0.35;
  float hl;
  float ring = smoothstep(0.84, 0.97, rr);
  float fz = dots(sp, 1.6, 0.5, 0.25, 0.6, fw, hl) * detail;
  c = mix(c, vec3(0.58, 0.44, 0.33), max(ring * (0.75 + 0.25 * sin(sp.x * 3.1 + sin(sp.y * 2.3))), fz * 0.6));
  return c + hl * 0.25 * detail;
}

#endif

// Inside of the far wall, seen through the mouth or through the frosted front.
vec4 interior(vec3 P, vec3 D) {
  float y = clamp(P.y, 0.0, uH);
  float c = 0.885 + 0.05 * (y / uH);
  float side = abs(P.x) / max(1.0, rAt(y));
  c -= 0.05 * side * side;
  vec3 col = vec3(c, c + 0.004, c + 0.01);
#ifdef DRINK
  if (P.y < uFoamTop && P.y > 5.0) col = P.y < uLevel ? (LIQ == 1 ? vec3(0.80, 0.50, 0.12) : vec3(0.10, 0.04, 0.025)) : (LIQ == 1 ? vec3(0.95, 0.92, 0.85) : vec3(0.5, 0.38, 0.3));
#endif
  return vec4(col, 1.0);
}

void main() {
  vec2 pix = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  vec2 q = vec2((pix.x - uO.x) / uS, -(pix.y - uO.y) / uS);
  vec3 D = normalize(uFwd + q.x * uRight + q.y * uUp);
  vec3 O = uCam;
  float k = (uRt - uRb) / uH;
  float b0 = uRb + k * O.y;
  float a = D.x * D.x + D.z * D.z - k * k * D.y * D.y;
  float b = 2.0 * (O.x * D.x + O.z * D.z - k * D.y * b0);
  float c = O.x * O.x + O.z * O.z - b0 * b0;
  float disc = b * b - 4.0 * a * c;
  float sq = sqrt(max(disc, 0.0));
  float t1 = (-b - sq) / (2.0 * a);
  float t2 = (-b + sq) / (2.0 * a);
  vec3 P1 = O + t1 * D;
  vec3 P2 = O + t2 * D;

  vec4 color = vec4(0.0);

  // Soft contact shadow on the table.
  float tg = -O.y / D.y;
  if (tg > 0.0) {
    vec3 G = O + tg * D;
    float rr = length(vec2(G.x * 0.92, G.z - uRb * 0.12));
    float sh = 0.13 * (1.0 - smoothstep(uRb * 0.70, uRb * 1.32, rr));
    vec3 shc = LIQ == 1 && uBody.a == 0.0 ? vec3(0.50, 0.43, 0.30) : vec3(0.42, 0.44, 0.46);
    color = vec4(shc * sh, sh);
  }

  // Mouth: top plane of the rim.
  float tt = (uH - O.y) / D.y;
  vec3 PT = O + tt * D;
  float rT = length(PT.xz);
  float fwT = max(fwidth(rT), 1e-4);
  float lip = 1.2;
  float inMouth = 1.0 - smoothstep(uRt - lip - fwT, uRt - lip, rT);
  float onRing = smoothstep(uRt - lip - fwT, uRt - lip, rT) * (1.0 - smoothstep(uRt - fwT, uRt, rT));

  // Cone silhouette coverage, anti-aliased in screen space.
  float fwD = max(fwidth(disc), 1e-6);
  float side = clamp(disc / fwD + 0.5, 0.0, 1.0);
  float fwY = max(fwidth(P1.y), 1e-4);
  float aboveBase = clamp(P1.y / fwY + 0.5, 0.0, 1.0);
  float belowRim = clamp((uH - P1.y) / fwY + 0.5, 0.0, 1.0);
  float front = side * aboveBase * belowRim;

  // What lies behind the front wall (or under the open mouth).
  vec4 back = vec4(0.0);
  if (disc > 0.0 && P2.y <= uH) {
    if (P2.y >= 0.0) back = interior(P2, D);
    else back = vec4(vec3(0.86, 0.865, 0.875), 1.0);
  }
#ifdef DRINK
  {
    float sTop = LIQ == 1 ? uFoamTop : uLevel;
    float tl = (sTop - O.y) / D.y;
    vec3 PL = O + tl * D;
    float enter = P1.y <= uH ? t1 : tt;
    float rS = rAt(sTop);
    if (tl > enter && tl < t2 && length(PL.xz) < rS) {
      float fwS = max(fwidth(PL.x), 1e-3);
      vec2 sp = PL.xz;
      float ang = atan(sp.x, sp.y) + uTurn;
      float rr = length(sp) / rS;
      back = vec4(surfaceColor(vec2(cos(ang), sin(ang)) * rr * rS, rr, fwS), 1.0);
    }
  }
#endif

  // Looking down into the mouth.
  if (P1.y > uH && inMouth > 0.0 && disc > 0.0) {
    color = mix(color, back, inMouth);
  }

  if (front > 0.0) {
    float y = clamp(P1.y, 0.0, uH);
    float r = max(0.5, rAt(y));
    vec3 N = normalize(vec3(P1.x, -r * k, P1.z));
    vec3 V = -D;
    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float edge = 1.0 - ndv;
    float xs = clamp(dot(P1.xz, vec2(1.0, 0.0)) / r, -1.0, 1.0);

    // Frosted polypropylene: bright centre, soft grey falloff, thin bright edge.
    float fc = 0.925 - 0.13 * smoothstep(0.22, 0.9, edge) + 0.06 * smoothstep(0.9, 0.995, edge);
    fc += 0.028 * exp(-pow((xs + 0.46) / 0.11, 2.0)) + 0.014 * exp(-pow((xs - 0.62) / 0.07, 2.0));
    fc -= 0.018 * (1.0 - y / uH);
    vec3 frostC = vec3(fc, fc + 0.003, fc + 0.008);
    // Rim lip (about 4 mm): whiter, more translucent, with a soft shadow line under it.
    float lipBand = smoothstep(uH - 7.0, uH - 1.5, y);
    frostC = mix(frostC, vec3(0.95, 0.953, 0.957) + 0.015 * pow(ndv, 2.0), lipBand * 0.25);
    frostC -= 0.015 * exp(-pow((y - (uH - 4.5)) / 0.45, 2.0));
    frostC -= 0.09 * exp(-pow((y - (uH - 0.3)) / 0.3, 2.0));
    // Thick clear foot with the slightly teal edge of polypropylene.
    float foot = 1.0 - smoothstep(4.2, 5.6, y);
    frostC = mix(frostC, vec3(0.80, 0.865, 0.87), foot * 0.6);
    frostC += 0.07 * exp(-pow((y - 4.9) / 0.35, 2.0));
    frostC = mix(frostC, vec3(0.62, 0.74, 0.75), 0.55 * exp(-pow((y - 0.7) / 0.55, 2.0)));
    float frostA = mix(0.80, 0.93, smoothstep(0.2, 0.9, edge));
    float wet = 0.0;
#ifdef DRINK
    // The drink behind the frosted wall: absorbed light, foam, bubbles, all softened by the frosting.
    float thetaL = atan(P1.x, P1.z) + uTurn; // same angle as the print below
    vec2 aL = vec2(thetaL * (uRt + uRb) * 0.5, P1.y);
    float fwL = max(fwY, 1e-3);
    if (disc > 0.0) {
      float lev = uLevel + (LIQ == 1 ? 0.55 * sin(aL.x * 0.23 + 1.3) + 0.35 * sin(aL.x * 0.61 + 0.4) : 0.0);
      float topF = uFoamTop + (LIQ == 1 ? 0.7 + 0.5 * sin(aL.x * 0.31 + 2.0) + 0.3 * sin(aL.x * 0.83) + 0.6 * abs(xs * xs * xs) : 0.3 + 0.3 * sin(aL.x * 0.5));
      float soft = max(fwL, 0.35);
      if (P1.y < topF + soft) {
        float L = max(0.0, (P2.y >= 0.0 ? t2 : (-O.y / D.y)) - t1);
        float edgeK = smoothstep(0.3, 0.95, edge);
        float toFoam = smoothstep(lev - 0.7, lev + 0.7, P1.y);
        vec3 dc = toFoam < 1.0 ? drinkColor(L, xs, r, P1.y, lev, aL, fwL) : vec3(0.0);
        if (toFoam > 0.0) dc = mix(dc, foamColor(aL, P1.y, lev, ndv, fwL), toFoam);
        float aLiq = mix(LIQ == 1 ? 0.15 : 0.1, 0.45, edgeK);
        float aFoam = mix(0.16, 0.40, edgeK);
        float inside = 1.0 - smoothstep(topF - soft, topF + soft, P1.y);
        // The drink sits on the inner floor, above the thick clear foot.
        inside *= smoothstep(4.6, 6.0, P1.y);
        back = mix(back, vec4(dc, 1.0), inside);
        frostA = mix(frostA, mix(aLiq, aFoam, toFoam), inside);
        if (LIQ == 2) frostC = mix(frostC, frostC * vec3(1.0, 0.93, 0.88), inside * (1.0 - toFoam));
        wet = inside;
      }
    }
#endif
    vec4 wall = over(vec4(frostC * frostA, frostA), back);

    // A coloured cup: the colour covers the whole wall, from just under the lip to the foot.
    if (uBody.a > 0.0) {
      float bodyMask = smoothstep(4.6, 5.6, y) * (1.0 - smoothstep(uH - 3.0, uH - 2.2, y));
      float litB = 0.875 + 0.10 * pow(ndv, 0.6) - 0.07 * smoothstep(0.5, 0.95, edge);
      vec3 bodyRgb = uBody.rgb * litB + 0.055 * exp(-pow((xs + 0.46) / 0.12, 2.0));
      if (wet > 0.0) bodyRgb *= LIQ == 1 ? 0.96 : 0.91;
      wall = over(vec4(bodyRgb, 1.0) * bodyMask, wall);
    }

#ifdef DRINK
    // Cold drink: fine condensation on the outside, under the print.
    if (wet > 0.0) {
      float hl;
      float dm = dots(aL * vec2(1.0, 1.15), 2.3, 0.55, 0.22, 0.75, fwL, hl);
      dm *= 1.0 - smoothstep(0.6, 0.95, edge);
      wall.rgb = mix(wall.rgb, wall.rgb * 0.9, dm * 0.45) + hl * 0.16 * wall.a;
    }
#endif

    // Print window on the outer surface.
    float slant = sqrt(uH * uH + (uRt - uRb) * (uRt - uRb)) / uH;
    float s = (uH - P1.y) * slant;
    float v = (s - uBand0) / uBandH;
    float thetaRaw = atan(P1.x, P1.z);
    float theta = thetaRaw + uTurn;
    float d = mod(theta - uStart, 2.0 * PI);
    float u = d / uSpan;
    float fu = max(fwidth(thetaRaw) / uSpan, 1e-5);
    float fv = max(fwidth(v), 1e-5);
    float winV = smoothstep(0.0, fv, v) * (1.0 - smoothstep(1.0 - fv, 1.0, v));
    float winU = uFull == 1 ? 1.0 : smoothstep(0.0, fu, u) * (1.0 - smoothstep(1.0 - fu, 1.0, u));
    float win = winU * winV;
    if (win > 0.0) {
      vec4 ink = vec4(0.0);
      if (uBody.a > 0.0) ink = vec4(uBody.rgb, 1.0);
      if (uHasTex == 1) {
        vec2 uv = vec2(uFull == 1 ? fract(u) : u, clamp(v, 0.0, 1.0));
        vec2 g = vec2(thetaRaw / uSpan, v);
        vec4 tex = textureGrad(uTex, uv, dFdx(g), dFdy(g));
        ink = over(tex, ink);
      }
      float lit = 0.875 + 0.10 * pow(ndv, 0.6) - 0.07 * smoothstep(0.5, 0.95, edge);
      vec3 rgb = ink.rgb * lit + ink.a * (0.055 * exp(-pow((xs + 0.46) / 0.12, 2.0)));
      ink = vec4(rgb, ink.a) * win;
      wall = over(ink, wall);
    }
    color = mix(color, wall, front);
  }

  // Rim ring drawn last so it covers the front/mouth seam.
  if (onRing > 0.0 && D.y < 0.0) {
    float ang = atan(PT.x, PT.z);
    float rc = 0.78 + 0.05 * cos(ang);
    color = mix(color, vec4(vec3(rc, rc + 0.003, rc + 0.007), 1.0), onRing);
  }

  outColor = color;
}
`;

type Prog = { prog: WebGLProgram; loc: Record<string, WebGLUniformLocation | null> };

type GL = {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  /** Empty cup; the drink variant is compiled on first use so cups without a drink pay nothing for it. */
  plain: Prog;
  /** Beer (1) and soda (2) variants: the drink is a compile-time constant so each program carries only its own code. */
  drinks: Record<number, Prog | null>;
  aniso: number;
  anisoExt: EXT_texture_filter_anisotropic | null;
};

let shared: GL | null | undefined;
const textures = new WeakMap<HTMLCanvasElement, WebGLTexture>();
const recent: HTMLCanvasElement[] = [];
const MAX_TEXTURES = 28;

const UNIFORMS = ["uRes", "uO", "uS", "uCam", "uRight", "uUp", "uFwd", "uRt", "uRb", "uH", "uTurn", "uTex", "uHasTex", "uBand0", "uBandH", "uSpan", "uStart", "uFull", "uBody", "uLevel", "uFoamTop", "uTime"];

function buildProgram(gl: WebGL2RenderingContext, liquid: number): Prog {
  const compile = (type: number, src: string) => {
    const sh = gl.createShader(type);
    if (!sh) throw new Error("shader");
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || "compile");
    return sh;
  };
  const prog = gl.createProgram();
  if (!prog) throw new Error("program");
  const frag = liquid ? FRAG.replace("precision highp float;", `precision highp float;\n#define DRINK 1\n#define LIQ ${liquid}`) : FRAG;
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, frag));
  gl.bindAttribLocation(prog, 0, "aPos");
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) || "link");
  const loc: Prog["loc"] = {};
  for (const name of UNIFORMS) loc[name] = gl.getUniformLocation(prog, name);
  return { prog, loc };
}

function drinkProgram(g: GL, liquid: number): Prog | null {
  if (!(liquid in g.drinks)) {
    try {
      g.drinks[liquid] = buildProgram(g.gl, liquid);
    } catch (error) {
      console.warn("[blink] efeito de bebida indisponível", error);
      g.drinks[liquid] = null;
    }
  }
  return g.drinks[liquid];
}

function init(): GL | null {
  if (shared !== undefined) return shared;
  shared = null;
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 2;
    canvas.height = 2;
    const gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    const plain = buildProgram(gl, 0);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const anisoExt = gl.getExtension("EXT_texture_filter_anisotropic");
    const aniso = anisoExt ? Math.min(8, gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number) : 0;
    canvas.addEventListener("webglcontextlost", () => {
      shared = null;
    });
    shared = { gl, canvas, plain, drinks: {}, aniso, anisoExt };
  } catch (error) {
    console.warn("[blink] WebGL indisponível, a usar desenho 2D", error);
    shared = null;
  }
  return shared;
}

function textureFor(g: GL, source: HTMLCanvasElement): WebGLTexture | null {
  const { gl } = g;
  let tex = textures.get(source);
  const at = recent.indexOf(source);
  if (at >= 0) recent.splice(at, 1);
  recent.push(source);
  if (tex) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    return tex;
  }
  while (recent.length > MAX_TEXTURES) {
    const old = recent.shift();
    if (!old) break;
    const t = textures.get(old);
    if (t) gl.deleteTexture(t);
    textures.delete(old);
  }
  tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (g.anisoExt && g.aniso > 1) gl.texParameterf(gl.TEXTURE_2D, g.anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, g.aniso);
  textures.set(source, tex);
  return tex;
}

/** Forget a texture (call when a print canvas is thrown away). */
export function releaseTexture(source: HTMLCanvasElement | null) {
  if (!source || !shared) return;
  const t = textures.get(source);
  if (t) shared.gl.deleteTexture(t);
  textures.delete(source);
  const at = recent.indexOf(source);
  if (at >= 0) recent.splice(at, 1);
}

type Vec3 = [number, number, number];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function hexRgb(hex: string): [number, number, number] | null {
  const raw = hex.replace("#", "").trim();
  const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw.slice(0, 6);
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n) || full.length !== 6) return null;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Drink level and foam top in mm: always a clear lip under the rim, beer gets a 6–14 mm head. */
export function drinkLevels(H: number, liquid: "none" | "beer" | "soda") {
  if (liquid === "beer") {
    const foamTop = H - Math.max(7, H * 0.075);
    const foam = Math.min(14, Math.max(6, H * 0.085));
    return { level: foamTop - foam, foamTop };
  }
  const level = H - Math.max(8, H * 0.085);
  return { level, foamTop: level + 2.4 };
}

/** Print window in mould millimetres for a cup, with the same rules the art composer uses. */
export function bandFor(scene: Pick<CupScene, "top" | "bot" | "heightMm" | "cover" | "area">, meta: PrintMeta | null) {
  if (meta) return { band0: meta.band0, bandH: meta.bandH };
  const H = scene.heightMm;
  if (scene.area) {
    const win = printWindow({ top: scene.top, bot: scene.bot, height: H }, scene.area);
    return { band0: win.band0, bandH: win.bandH };
  }
  const wantH = Math.max(0.3, Math.min(0.92, scene.cover || 0.7)) * H;
  const gap = Math.min(H * 0.067, Math.max(1.5, (H - wantH) * 0.55));
  const bandH = Math.min(wantH, H - gap - 2);
  return { band0: gap, bandH };
}

/**
 * Draw one cup into `ctx` (device pixels w × h). Returns false when WebGL2 is
 * not available so the caller can fall back to the 2D painter.
 */
export function renderCupGL(ctx: CanvasRenderingContext2D, w: number, h: number, scene: CupScene, turn: number): boolean {
  const g = init();
  if (!g) return false;
  const { gl, canvas } = g;
  const liquid = scene.liquid === "beer" ? 1 : scene.liquid === "soda" ? 2 : 0;
  const program = (liquid ? drinkProgram(g, liquid) : null) ?? g.plain;
  const loc = program.loc;
  if (gl.isContextLost()) return false;
  const W = Math.max(2, Math.min(4096, Math.round(w)));
  const Hh = Math.max(2, Math.min(4096, Math.round(h)));
  if (canvas.width < W || canvas.height < Hh) {
    canvas.width = Math.max(canvas.width, W);
    canvas.height = Math.max(canvas.height, Hh);
  }
  const H = scene.heightMm;
  const Rt = scene.top / 2;
  const Rb = scene.bot / 2;

  // Camera: slightly above the rim, far enough to keep the mockup's gentle perspective.
  const dist = H * 18;
  const cam: Vec3 = [0, H + 0.024 * dist, dist];
  const target: Vec3 = [0, H * 0.5, 0];
  const fwd = norm(sub(target, cam));
  const right: Vec3 = [1, 0, 0];
  const up: Vec3 = [0, -fwd[2], fwd[1]];
  const proj = (p: Vec3) => {
    const d = sub(p, cam);
    const z = dot(d, fwd);
    return [dot(d, right) / z, dot(d, up) / z];
  };
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2;
    for (const [r, y] of [[Rt + 0.5, H], [Rb, 0]] as const) {
      const [x, yy] = proj([Math.sin(a) * r, y, Math.cos(a) * r]);
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, yy);
      maxY = Math.max(maxY, yy);
    }
  }
  const s = Math.min((W * 0.62) / (maxX - minX), (Hh * 0.88) / (maxY - minY));
  const ox = W / 2 - s * (minX + maxX) / 2;
  const oy = Hh * 0.47 + s * (minY + maxY) / 2;

  const meta = scene.texture ? printMetaOf(scene.texture) : null;
  const { band0, bandH } = bandFor(scene, meta);
  const yMid = H - (band0 + bandH / 2);
  const rMid = Rb + (Rt - Rb) * (yMid / H);
  let span = Math.PI * 2;
  let start = -Math.PI;
  let full = 1;
  if (meta) {
    span = meta.span;
    start = meta.start;
    full = meta.full ? 1 : 0;
  } else if (scene.texture) {
    const artW = (scene.texture.width / Math.max(1, scene.texture.height)) * bandH;
    span = Math.min(Math.PI * 2, artW / Math.max(1, rMid));
    full = span >= Math.PI * 2 - 1e-3 ? 1 : 0;
    start = full ? -Math.PI : -span / 2;
  } else if (scene.area) {
    span = Math.min(Math.PI * 2, scene.area.w / Math.max(1, rMid));
    full = scene.area.full || span >= Math.PI * 1.94 ? 1 : 0;
    if (full) span = Math.PI * 2;
    start = full ? -Math.PI : -span / 2;
  }

  gl.viewport(0, 0, W, Hh);
  gl.disable(gl.BLEND);
  gl.useProgram(program.prog);
  gl.uniform2f(loc.uRes, W, Hh);
  gl.uniform2f(loc.uO, ox, oy);
  gl.uniform1f(loc.uS, s);
  gl.uniform3f(loc.uCam, cam[0], cam[1], cam[2]);
  gl.uniform3f(loc.uRight, right[0], right[1], right[2]);
  gl.uniform3f(loc.uUp, up[0], up[1], up[2]);
  gl.uniform3f(loc.uFwd, fwd[0], fwd[1], fwd[2]);
  gl.uniform1f(loc.uRt, Rt);
  gl.uniform1f(loc.uRb, Rb);
  gl.uniform1f(loc.uH, H);
  gl.uniform1f(loc.uTurn, turn);
  gl.uniform1f(loc.uBand0, band0);
  gl.uniform1f(loc.uBandH, bandH);
  gl.uniform1f(loc.uSpan, span);
  gl.uniform1f(loc.uStart, start);
  gl.uniform1i(loc.uFull, full);
  const body = scene.body ? hexRgb(scene.body) : null;
  gl.uniform4f(loc.uBody, body ? body[0] : 0, body ? body[1] : 0, body ? body[2] : 0, body ? 1 : 0);
  const fill = drinkLevels(H, scene.liquid ?? "none");
  gl.uniform1f(loc.uLevel, fill.level);
  gl.uniform1f(loc.uFoamTop, fill.foamTop);
  gl.uniform1f(loc.uTime, scene.time ?? 4.2);
  gl.activeTexture(gl.TEXTURE0);
  let hasTex = 0;
  if (scene.texture && scene.texture.width > 1 && scene.texture.height > 1) {
    hasTex = textureFor(g, scene.texture) ? 1 : 0;
  }
  gl.uniform1i(loc.uTex, 0);
  gl.uniform1i(loc.uHasTex, hasTex);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  ctx.drawImage(canvas, 0, canvas.height - Hh, W, Hh, 0, 0, W, Hh);
  return true;
}
