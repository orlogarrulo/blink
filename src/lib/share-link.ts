import type { Process } from "@/lib/catalog";
import { ART_PLACE0, clampArtPlace, type ArtPlace } from "@/lib/art-place";

/** Compact design params that can travel in a URL. No personal data, no uploaded art. */
export type ShareDesign = {
  cupId: string;
  process: Process;
  cover360: boolean;
  body: string | null;
  liquid: "none" | "beer" | "soda";
  place: ArtPlace;
};

function b64url(bytes: Uint8Array) {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 1) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function unb64url(text: string) {
  const pad = text.length % 4 === 0 ? "" : "=".repeat(4 - (text.length % 4));
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeShare(design: ShareDesign): string {
  const raw = JSON.stringify({
    c: design.cupId,
    p: design.process === "serigrafia" ? "s" : design.process === "digital" ? "d" : "i",
    f: design.cover360 ? 1 : 0,
    b: design.body || "",
    l: design.liquid === "beer" ? "b" : design.liquid === "soda" ? "r" : "n",
    y: Math.round((design.place.yaw || 0) * 1000) / 1000,
    v: Math.round((design.place.lift || 0) * 10) / 10,
    z: Math.round((design.place.scale || 1) * 100) / 100,
  });
  return b64url(new TextEncoder().encode(raw));
}

export function decodeShare(code: string): ShareDesign | null {
  try {
    const raw = JSON.parse(new TextDecoder().decode(unb64url(code))) as Record<string, unknown>;
    const process: Process = raw.p === "s" ? "serigrafia" : raw.p === "d" ? "digital" : "iml";
    const liquid = raw.l === "b" ? "beer" : raw.l === "r" ? "soda" : "none";
    const body = typeof raw.b === "string" && /^#[0-9A-Fa-f]{6}$/.test(raw.b) ? raw.b : null;
    return {
      cupId: typeof raw.c === "string" && raw.c.length < 16 ? raw.c : "ECO50",
      process,
      cover360: raw.f === 1,
      body,
      liquid,
      place: clampArtPlace({ yaw: Number(raw.y) || 0, lift: Number(raw.v) || 0, scale: Number(raw.z) || 1 }),
    };
  } catch {
    return null;
  }
}

export function shareUrl(design: ShareDesign, origin = typeof window !== "undefined" ? window.location.origin : ""): string {
  const path = `${origin.replace(/\/$/, "")}/ver?d=${encodeShare(design)}`;
  return path;
}

export const EMPTY_SHARE: ShareDesign = {
  cupId: "ECO50",
  process: "iml",
  cover360: false,
  body: null,
  liquid: "none",
  place: ART_PLACE0,
};
