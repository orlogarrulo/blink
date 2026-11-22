import { useEffect, useRef, useState } from "react";
import { paintTrioCanvas, type CupDraw } from "@/lib/cup-draw";

type Mode = "frost" | "clear" | "studio";

export type StudioShot = {
  top: number;
  bot: number;
  heightMm: number;
  printMm: number;
  texture: HTMLCanvasElement | null;
  body?: string | null;
  liquid?: "none" | "beer" | "soda";
  mode?: Mode;
};

type Props = {
  top: number;
  bot: number;
  heightMm: number;
  printMm: number;
  texture: HTMLCanvasElement | null;
  body?: string | null;
  liquid?: "none" | "beer" | "soda";
  mode?: Mode;
  spin?: boolean;
  zoom?: number;
  className?: string;
  onZoom?: (direction: 1 | -1) => void;
  /** Filled with a function that renders Esquerda / Frente / Direita at print resolution. */
  captureRef?: { current: ((shot: StudioShot) => HTMLCanvasElement[]) | null };
};

const OFFSETS = [0.82, 0, -0.82];

type World = {
  sync: () => void;
  dispose: () => void;
  capture: (shot: StudioShot) => HTMLCanvasElement[];
};

export function CupStudio({
  top,
  bot,
  heightMm,
  printMm,
  texture,
  body = null,
  liquid = "none",
  mode = "frost",
  spin = false,
  zoom = 1,
  className,
  onZoom,
  captureRef,
}: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ top, bot, heightMm, printMm, texture, body, liquid, mode, spin, zoom });
  live.current = { top, bot, heightMm, printMm, texture, body, liquid, mode, spin, zoom };
  const world = useRef<World | null>(null);
  const [engine, setEngine] = useState<"pending" | "3d" | "2d">("pending");
  const [ready, setReady] = useState(0);
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinch = useRef<number | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let dead = false;
    let frame = 0;
    let looping = false;

    void (async () => {
      const THREE = await import("three");
      if (dead) return;
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
        powerPreference: "high-performance",
        failIfMajorPerformanceCaveat: false,
      });
      const gl = renderer.getContext();
      if (!gl) {
        renderer.dispose();
        if (!dead) setEngine("2d");
        return;
      }
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.setClearColor(0xffffff, 1);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      const camera = new THREE.PerspectiveCamera(26, 1, 0.5, 8000);
      let envMap: { dispose: () => void } | null = null;
      try {
        const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
        const pmrem = new THREE.PMREMGenerator(renderer);
        envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        scene.environment = envMap;
        pmrem.dispose();
      } catch {
        scene.environment = null;
      }

      const root = new THREE.Group();
      scene.add(root);
      const groups: InstanceType<typeof THREE.Group>[] = OFFSETS.map(() => {
        const group = new THREE.Group();
        root.add(group);
        return group;
      });
      let spinAngle = 0;

      const presets: Record<Mode, { transmission: number; roughness: number; clearcoat: number; clearcoatRoughness: number }> = {
        frost: { transmission: 0.45, roughness: 0.38, clearcoat: 0.85, clearcoatRoughness: 0.18 },
        clear: { transmission: 0.86, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05 },
        studio: { transmission: 0.1, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.45 },
      };

      let bodyGeo: { dispose: () => void } | null = null;
      let printGeo: { dispose: () => void } | null = null;
      let footGeo: { dispose: () => void } | null = null;
      let lipGeo: { dispose: () => void } | null = null;
      let mouthGeo: { dispose: () => void } | null = null;
      const bodyMat = new THREE.MeshPhysicalMaterial({
        color: 0xf7f6f4,
        roughness: 0.38,
        metalness: 0,
        transmission: 0.45,
        thickness: 3.6,
        ior: 1.49,
        clearcoat: 0.85,
        clearcoatRoughness: 0.18,
        envMapIntensity: 0.8,
        attenuationDistance: 14,
        attenuationColor: new THREE.Color(0xf4f4f2),
        sheen: 0.45,
        sheenRoughness: 0.42,
        sheenColor: new THREE.Color(0xffffff),
        side: THREE.DoubleSide,
      });
      const printMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.58,
        metalness: 0,
        transparent: true,
        alphaTest: 0.02,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
        envMapIntensity: 0.35,
      });
      const lipMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.16,
        metalness: 0,
        transmission: 0.55,
        thickness: 1.2,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.1,
      });
      const footMat = new THREE.MeshStandardMaterial({ color: 0xf7f6f4, roughness: 0.32, metalness: 0.04 });
      let printMap: { dispose: () => void } | null = null;
      let mapSource: HTMLCanvasElement | null = null;
      let liquidMesh: InstanceType<typeof THREE.Mesh> | null = null;
      let foamMesh: InstanceType<typeof THREE.Mesh> | null = null;
      let liquidGeo: { dispose: () => void } | null = null;
      let foamGeo: { dispose: () => void } | null = null;
      const shadows: InstanceType<typeof THREE.Mesh>[] = [];

      const key = new THREE.DirectionalLight(0xffffff, 2.6);
      key.position.set(-120, 220, 160);
      scene.add(key);
      const fill = new THREE.DirectionalLight(0xfff6ee, 0.85);
      fill.position.set(140, 80, 120);
      scene.add(fill);
      const rimLight = new THREE.DirectionalLight(0xffffff, 1.15);
      rimLight.position.set(-20, 30, -180);
      scene.add(rimLight);
      scene.add(new THREE.HemisphereLight(0xffffff, 0xe7e0d6, 0.7));
      let metrics = { step: 1, topR: 1, height: 1 };

      const outerRadius = (y: number, topR: number, botR: number, height: number) => {
        const t = Math.min(1, Math.max(0, y / height));
        let r = botR + (topR - botR) * t;
        if (t < 0.035) r *= 0.93 + 0.07 * (t / 0.035);
        if (t > 0.97) r += ((t - 0.97) / 0.03) * topR * 0.012;
        return r;
      };

      const rebuild = () => {
        const spec = live.current;
        const topR = spec.top / 2;
        const botR = spec.bot / 2;
        const height = spec.heightMm;
        const wall = Math.max(0.85, Math.min(topR, botR) * 0.05);
        const pts: InstanceType<typeof THREE.Vector2>[] = [new THREE.Vector2(0.15, 0), new THREE.Vector2(botR * 0.42, 0)];
        const steps = 36;
        for (let i = 0; i <= steps; i += 1) {
          const y = (i / steps) * height;
          pts.push(new THREE.Vector2(outerRadius(y, topR, botR, height), y));
        }
        pts.push(new THREE.Vector2(topR + wall * 0.2, height + wall * 0.08));
        pts.push(new THREE.Vector2(topR - wall * 0.2, height - wall * 0.2));
        for (let i = steps; i >= 2; i -= 1) {
          const y = (i / steps) * (height - wall * 1.5);
          pts.push(new THREE.Vector2(Math.max(wall * 0.8, outerRadius(y, topR, botR, height) - wall), y));
        }
        pts.push(new THREE.Vector2(0.15, wall));

        bodyGeo?.dispose();
        printGeo?.dispose();
        footGeo?.dispose();
        lipGeo?.dispose();
        mouthGeo?.dispose();
        groups.forEach((group) => {
          while (group.children.length) group.remove(group.children[0]);
        });
        shadows.forEach((shadow) => {
          scene.remove(shadow);
          shadow.geometry.dispose();
          shadow.material.dispose();
        });
        shadows.length = 0;
        liquidGeo?.dispose();
        foamGeo?.dispose();

        bodyGeo = new THREE.LatheGeometry(pts, 160, Math.PI, Math.PI * 2);
        const rimGap = Math.min(12, Math.max(7, (height - spec.printMm) * 0.22));
        const band = Math.min(Math.max(12, spec.printMm), height - rimGap - 8);
        const y1 = height - rimGap;
        const y0 = y1 - band;
        const printPts: InstanceType<typeof THREE.Vector2>[] = [];
        for (let i = 0; i <= 18; i += 1) {
          const y = y0 + ((y1 - y0) * i) / 18;
          printPts.push(new THREE.Vector2(outerRadius(y, topR, botR, height) + 0.28, y));
        }
        printGeo = new THREE.LatheGeometry(printPts, 180, Math.PI, Math.PI * 2);
        footGeo = new THREE.TorusGeometry(botR * 0.9, Math.max(0.55, botR * 0.045), 12, 80);
        lipGeo = new THREE.TorusGeometry(topR * 0.985, Math.max(0.45, topR * 0.028), 16, 96);
        mouthGeo = new THREE.RingGeometry(topR * 0.62, topR * 0.94, 80);

        const step = topR * 2 + Math.max(8, topR * 0.38);
        metrics = { step, topR, height };
        groups.forEach((group, index) => {
          const shell = new THREE.Mesh(bodyGeo, bodyMat);
          const print = new THREE.Mesh(printGeo, printMat);
          const foot = new THREE.Mesh(footGeo, footMat);
          foot.rotation.x = Math.PI / 2;
          foot.position.y = 1.1;
          const lip = new THREE.Mesh(lipGeo, lipMat);
          lip.rotation.x = Math.PI / 2;
          lip.position.y = height - 0.05;
          const mouth = new THREE.Mesh(mouthGeo, lipMat);
          mouth.rotation.x = -Math.PI / 2;
          mouth.position.y = height - 0.35;
          group.add(shell, print, foot, lip, mouth);
          group.position.x = (index - 1) * step;
          group.rotation.y = OFFSETS[index];

          const shadow = new THREE.Mesh(
            new THREE.CircleGeometry(topR * 0.92, 40),
            new THREE.MeshBasicMaterial({ color: 0x6b645c, transparent: true, opacity: 0.16, depthWrite: false }),
          );
          shadow.rotation.x = -Math.PI / 2;
          shadow.position.set(group.position.x, 0.15, 0);
          shadow.scale.set(1, 1, 0.42);
          scene.add(shadow);
          shadows.push(shadow);
        });

        const level = 0.78;
        const liq: InstanceType<typeof THREE.Vector2>[] = [new THREE.Vector2(0.4, height * 0.08)];
        for (let i = 1; i <= 16; i += 1) {
          const t = i / 16;
          if (t > level) break;
          const y = t * height;
          liq.push(new THREE.Vector2(Math.max(0.8, outerRadius(y, topR, botR, height) - wall - 0.4), y));
        }
        liquidGeo = new THREE.LatheGeometry(liq, 48);
        liquidMesh = new THREE.Mesh(
          liquidGeo,
          new THREE.MeshPhysicalMaterial({ color: 0xe8a820, roughness: 0.18, transmission: 0.2, thickness: 8, transparent: true, opacity: 0.95 }),
        );
        foamGeo = new THREE.SphereGeometry(Math.max(2, outerRadius(height * 0.8, topR, botR, height) - wall), 28, 16, 0, Math.PI * 2, 0, Math.PI / 2);
        foamMesh = new THREE.Mesh(
          foamGeo,
          new THREE.MeshStandardMaterial({ color: 0xfff7ee, roughness: 0.85 }),
        );
        foamMesh.scale.y = 0.22;
        foamMesh.position.y = height * level;
        groups[1].add(liquidMesh, foamMesh);
      };

      const frameCamera = (width: number, heightPx: number, zoomValue: number, solo: boolean) => {
        camera.fov = solo ? 27 : 30;
        camera.aspect = width / Math.max(1, heightPx);
        const radiusX = solo ? metrics.topR * 1.2 : metrics.step + metrics.topR;
        const radiusY = metrics.height * 0.56;
        const fov = (camera.fov * Math.PI) / 180;
        const distY = radiusY / Math.tan(fov / 2);
        const distX = radiusX / (Math.tan(fov / 2) * Math.max(0.25, camera.aspect));
        const dist = (Math.max(distX, distY) * (solo ? 1.16 : 1.06)) / Math.max(0.65, zoomValue);
        camera.position.set(0, metrics.height * 0.74, dist);
        camera.lookAt(0, metrics.height * 0.44, 0);
        camera.updateProjectionMatrix();
      };
      const fit = () => {
        const cssW = canvas.clientWidth;
        const cssH = canvas.clientHeight;
        if (cssW < 2 || cssH < 2) return;
        const ratio = Math.min(window.devicePixelRatio || 1, 3);
        renderer.setPixelRatio(ratio);
        renderer.setSize(cssW, cssH, false);
        frameCamera(cssW, cssH, live.current.zoom, false);
      };

      const applyTexture = (source: HTMLCanvasElement | null) => {
        if (mapSource === source) return;
        mapSource = source;
        printMap?.dispose();
        printMap = null;
        if (!source) {
          printMat.map = null;
          printMat.needsUpdate = true;
          groups.forEach((group) => {
            const print = group.children[1];
            if (print) print.visible = false;
          });
          return;
        }
        const map = new THREE.CanvasTexture(source);
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = renderer.capabilities.getMaxAnisotropy();
        map.wrapS = THREE.ClampToEdgeWrapping;
        map.wrapT = THREE.ClampToEdgeWrapping;
        map.needsUpdate = true;
        printMap = map;
        printMat.map = map;
        printMat.needsUpdate = true;
        groups.forEach((group) => {
          const print = group.children[1];
          if (print) print.visible = true;
        });
      };

      const render = () => {
        groups.forEach((group, index) => {
          group.rotation.y = OFFSETS[index] + spinAngle;
        });
        renderer.render(scene, camera);
      };

      const sync = () => {
        const spec = live.current;
        const preset = presets[spec.mode];
        bodyMat.color.set(spec.body || "#f4f3f1");
        bodyMat.roughness = preset.roughness;
        bodyMat.clearcoat = preset.clearcoat;
        bodyMat.clearcoatRoughness = preset.clearcoatRoughness;
        bodyMat.transmission = spec.body ? preset.transmission * 0.38 : preset.transmission;
        bodyMat.attenuationColor.set(spec.body || "#f7f6f4");
        footMat.color.set(spec.body || "#f7f6f4");
        applyTexture(spec.body ? null : spec.texture);
        if (liquidMesh && foamMesh) {
          const show = spec.liquid === "beer" || spec.liquid === "soda";
          liquidMesh.visible = show;
          foamMesh.visible = spec.liquid === "beer";
          const mat = liquidMesh.material as { color: { set: (hex: number) => void } };
          mat.color.set(spec.liquid === "soda" ? 0x2a100c : 0xe0a020);
        }
        fit();
        if (spec.spin && !looping) {
          looping = true;
          const loop = () => {
            if (!looping) return;
            spinAngle += 0.008;
            render();
            frame = requestAnimationFrame(loop);
          };
          frame = requestAnimationFrame(loop);
        } else if (!spec.spin && looping) {
          looping = false;
          cancelAnimationFrame(frame);
          spinAngle = 0;
          render();
        } else if (!looping) {
          render();
        }
      };

      const capture = (shot: StudioShot) => {
        const snapshot = { ...live.current };
        const prevSpin = spinAngle;
        looping = false;
        cancelAnimationFrame(frame);
        Object.assign(live.current, shot, { spin: false, zoom: 1, liquid: shot.liquid ?? "none", body: shot.body ?? null, mode: shot.mode ?? snapshot.mode });
        const dimsChanged = snapshot.top !== shot.top || snapshot.bot !== shot.bot || snapshot.heightMm !== shot.heightMm || snapshot.printMm !== shot.printMm;
        let shots: HTMLCanvasElement[] = [];
        try {
          if (dimsChanged) rebuild();
          mapSource = null;
          sync();
          spinAngle = 0;
          const grab = (w: number, h: number, solo: boolean) => {
            renderer.setPixelRatio(1);
            renderer.setSize(w, h, false);
            frameCamera(w, h, 1, solo);
            renderer.render(scene, camera);
            const shotCanvas = document.createElement("canvas");
            shotCanvas.width = w;
            shotCanvas.height = h;
            shotCanvas.getContext("2d")?.drawImage(canvas, 0, 0);
            return shotCanvas;
          };
          shots = OFFSETS.map((offset) => {
            groups.forEach((group, index) => {
              group.visible = index === 1;
              if (index === 1) {
                group.position.x = 0;
                group.rotation.y = offset;
              }
            });
            shadows.forEach((shadow, index) => {
              shadow.visible = index === 1;
              if (index === 1) shadow.position.x = 0;
            });
            return grab(1200, 1600, true);
          });
        } finally {
          Object.assign(live.current, snapshot);
          spinAngle = prevSpin;
          if (dimsChanged) rebuild();
          mapSource = null;
          sync();
        }
        return shots;
      };

      rebuild();
      sync();
      const observer = new ResizeObserver(() => {
        fit();
        renderer.render(scene, camera);
      });
      observer.observe(canvas);
      world.current = { sync, capture, dispose: () => {} };
      if (captureRef) captureRef.current = (shot) => world.current?.capture(shot) ?? [];
      if (!dead) setEngine("3d");
      if (!dead) setReady((n) => n + 1);

      const lost = () => {
        if (!dead) setEngine("2d");
      };
      canvas.addEventListener("webglcontextlost", lost);

      world.current.dispose = () => {
        looping = false;
        cancelAnimationFrame(frame);
        observer.disconnect();
        canvas.removeEventListener("webglcontextlost", lost);
        bodyGeo?.dispose();
        printGeo?.dispose();
        footGeo?.dispose();
        lipGeo?.dispose();
        mouthGeo?.dispose();
        liquidGeo?.dispose();
        foamGeo?.dispose();
        bodyMat.dispose();
        printMat.dispose();
        footMat.dispose();
        lipMat.dispose();
        printMap?.dispose();
        envMap?.dispose();
        renderer.dispose();
      };
    })().catch(() => {
      if (!dead) setEngine("2d");
    });

    return () => {
      dead = true;
      if (captureRef) captureRef.current = null;
      world.current?.dispose();
      world.current = null;
    };
  }, [top, bot, heightMm, printMm, captureRef]);

  useEffect(() => {
    if (engine !== "3d") return;
    world.current?.sync();
  }, [engine, ready, texture, body, liquid, mode, zoom, spin]);

  useEffect(() => {
    if (engine !== "2d") return;
    const canvas = ref.current;
    if (!canvas) return;
    const spec: CupDraw = {
      texture: body ? null : texture,
      top,
      bot,
      heightMm,
      cover: Math.min(0.9, Math.max(0.4, printMm / Math.max(1, heightMm))),
      body,
      liquid,
      quality: "full",
    };
    const paint = () => paintTrioCanvas(canvas, spec, zoom);
    paint();
    const observer = new ResizeObserver(() => paint());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [engine, texture, body, liquid, top, bot, heightMm, printMm, zoom]);

  useEffect(() => {
    const node = ref.current;
    if (!node || !onZoom) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      onZoom(event.deltaY < 0 ? 1 : -1);
    };
    node.addEventListener("wheel", wheel, { passive: false });
    return () => node.removeEventListener("wheel", wheel);
  }, [onZoom]);

  return (
    <canvas
      ref={ref}
      data-testid="cup-studio"
      data-engine={engine}
      className={`block h-full w-full touch-none ${className ?? ""}`}
      aria-label="Três ângulos do copo. A impressão segue a elipse da boca."
      onPointerDown={(event) => {
        pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const prev = pointers.current.get(event.pointerId);
        if (prev) pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.current.size < 2 || !onZoom) {
          pinch.current = null;
          return;
        }
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.current !== null && Math.abs(dist - pinch.current) > 8) onZoom(dist > pinch.current ? 1 : -1);
        pinch.current = dist;
      }}
      onPointerUp={(event) => {
        pointers.current.delete(event.pointerId);
        if (pointers.current.size < 2) pinch.current = null;
      }}
    />
  );
}
