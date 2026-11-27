import { useMemo } from "react";
import { CupView } from "@/components/cup-view";
import { areaFor, cupById, fullArea, PROCESS_LABEL, processesFor } from "@/lib/catalog";
import { decodeShare } from "@/lib/share-link";

function Mark() {
  return (
    <svg viewBox="0 0 871.47 244.94" className="h-11 w-auto text-ink" role="img" aria-label="BLINK">
      <g transform="translate(58.320 180.792)" fill="currentColor">
        <path d="M 68.444 -109.896 A 53.654 53.654 0 1 1 38.865 -109.896 L 44.485 -90.297 A 33.266 33.266 0 1 0 62.824 -90.297 Z" />
        <g transform="translate(130.594 0)">
          <path d="M14.04 0.0V-116.64H73.44Q94.86 -116.64 106.28999999999999 -108.63Q117.72 -100.61999999999999 117.72 -85.5Q117.72 -75.78 113.31 -70.11Q108.89999999999999 -64.44 100.8 -61.65Q92.7 -58.86 81.72 -58.14L82.44 -59.22Q90.36 -59.04 97.47 -57.87Q104.58 -56.699999999999996 110.07 -53.81999999999999Q115.56 -50.94 118.71000000000001 -45.81Q121.86 -40.68 121.86 -32.58Q121.86 -21.779999999999998 116.46000000000001 -14.759999999999998Q111.06 -7.739999999999999 101.52 -4.05Q91.97999999999999 -0.36 79.56 0.0ZM34.56 -17.46H76.5Q88.2 -17.46 94.68 -21.509999999999998Q101.16 -25.56 101.16 -34.199999999999996Q101.16 -41.04 97.19999999999999 -44.19Q93.24 -47.339999999999996 87.03 -48.239999999999995Q80.82 -49.14 73.8 -49.14H34.56ZM34.56 -66.24H72.17999999999999Q83.88 -66.24 90.27 -70.28999999999999Q96.66 -74.34 96.66 -83.16Q96.66 -91.8 90.27 -95.49Q83.88 -99.17999999999999 73.61999999999999 -99.17999999999999H34.56Z M174.78 -116.64V-17.64H247.5V0.0H154.26V-116.64Z M284.4 -116.64H304.92V0.0H284.4Z M455.04 -21.24 448.92 -18.9V-116.64H469.26V0.0H448.92L361.44 -94.86L367.74 -97.2V0.0H347.22V-116.64H367.74Z M549.9 -56.699999999999996 549.72 -66.6 624.24 0.0H595.26L528.48 -61.199999999999996L587.7 -116.64H616.32ZM508.14000000000004 -116.64H528.6600000000001V0.0H508.14000000000004Z" />
        </g>
      </g>
    </svg>
  );
}

/**
 * Read-only three views of a design, opened from the ficha QR.
 * Uploaded artwork is not in the address: only the model, colour, process and logo position.
 */
export function ShareViews({ code }: { code: string }) {
  const design = useMemo(() => decodeShare(code), [code]);
  if (!design) {
    return (
      <main className="mx-auto min-h-dvh max-w-3xl px-4 py-10">
        <Mark />
        <p className="mt-8 text-sm text-muted">Este endereço não corresponde a um copo da Blink.</p>
        <p className="mt-16 text-center text-sm text-muted">© BLINK 2026</p>
      </main>
    );
  }
  const cup = cupById(design.cupId);
  const allowed = processesFor(cup);
  const process = allowed.includes(design.process) ? design.process : allowed[0];
  const area = design.cover360 && process === "iml" ? fullArea(cup) : areaFor(cup, process);
  const processName = area?.full ? "Quadricromia IML · cobertura total 360°" : PROCESS_LABEL[process];
  const views = [
    { turn: 0, label: "Frente", flip: false },
    { turn: Math.PI * 0.28, label: "Três quartos", flip: false },
    { turn: Math.PI, label: "Lado / invertido", flip: true },
  ];
  return (
    <main className="mx-auto min-h-dvh max-w-5xl px-4 py-8">
      <Mark />
      <p className="mt-4 text-sm text-muted">
        {cup.name} · {processName}
        {design.body ? " · cor do copo" : ""}
      </p>
      <p className="mt-1 text-xs text-muted">A arte carregada no estúdio fica na ficha PDF; este endereço não a inclui.</p>
      <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {views.map((view) => (
          <li key={view.label} className="overflow-hidden rounded-3xl border border-line bg-paper">
            <div className={view.flip ? "origin-center rotate-180" : undefined}>
              <CupView
                texture={null}
                area={area}
                top={cup.top}
                bot={cup.bot}
                heightMm={cup.height}
                cover={area ? area.h / cup.height : 0.6}
                body={design.body}
                liquid={view.flip ? "none" : design.liquid}
                shadow={!view.flip}
                studio
                spin={false}
                turn={view.turn}
                className="h-72 w-full"
                label={`${cup.name}, ${view.label}`}
              />
            </div>
            <p className="px-3 py-2 text-center text-sm">{view.label}</p>
          </li>
        ))}
      </ul>
      <p className="mt-16 text-center text-sm text-muted">© BLINK 2026</p>
    </main>
  );
}
