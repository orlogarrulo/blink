/** Displacement of the two logo copies inside the print window. */
export type ArtPlace = {
  /** Extra rotation of the pair, radians. The copies stay 180° apart. */
  yaw: number;
  /** Vertical shift along the wall, millimetres (positive = toward the rim). */
  lift: number;
  /** Size of each copy relative to the largest whole fit (1 = as large as it can be without cropping). */
  scale: number;
};

export const ART_PLACE0: ArtPlace = { yaw: 0, lift: 0, scale: 1 };

export function clampArtPlace(place: Partial<ArtPlace> | null | undefined, bandH = 100, copyH = 40): ArtPlace {
  const scale = Math.min(1, Math.max(0.45, Number.isFinite(place?.scale) ? (place?.scale as number) : 1));
  const h = copyH * scale;
  const maxLift = Math.max(0, (bandH - h) / 2 - 0.4);
  const lift = Math.max(-maxLift, Math.min(maxLift, Number.isFinite(place?.lift) ? (place?.lift as number) : 0));
  let yaw = Number.isFinite(place?.yaw) ? (place?.yaw as number) : 0;
  const tau = Math.PI * 2;
  yaw = ((yaw % tau) + tau) % tau;
  if (yaw > Math.PI) yaw -= tau;
  return { yaw, lift, scale };
}
