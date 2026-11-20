import { useEffect, useRef } from "react";
import { wrapPrint } from "@/lib/print";

type Props = {
  texture: HTMLCanvasElement | null;
  top: number;
  bot: number;
  heightMm: number;
  cover: number;
  otherTop: number;
  otherBot: number;
  otherHeight: number;
  otherCover: number;
  otherTexture: HTMLCanvasElement | null;
  otherBody?: string | null;
  patternArt?: HTMLCanvasElement | null;
  otherPattern?: HTMLCanvasElement | null;
  spin: boolean;
  body?: string | null;
  mode?: "frost" | "clear" | "studio";
  className?: string;
  shotsRef?: { current: ((turns: number[], side?: "beer" | "soda") => HTMLCanvasElement[]) | null };
  onViews?: (shots: HTMLCanvasElement[]) => void;
};

export function Lineup({ texture, top, bot, heightMm, cover, otherTop, otherBot, otherHeight, otherCover, otherTexture, otherBody = null, patternArt = null, otherPattern = null, spin, body = null, mode = "frost", className, shotsRef, onViews }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ texture, top, bot, heightMm, cover, otherTop, otherBot, otherHeight, otherCover, otherTexture, otherBody, patternArt, otherPattern, spin, body, mode });
  live.current = { texture, top, bot, heightMm, cover, otherTop, otherBot, otherHeight, otherCover, otherTexture, otherBody, patternArt, otherPattern, spin, body, mode };
  const onViewsRef = useRef(onViews);
  onViewsRef.current = onViews;
  const shotsHolder = useRef(shotsRef);
  shotsHolder.current = shotsRef;
  const angle = useRef(0);
  const drag = useRef<{ x: number; y: number; a: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let stop = false;
    let frame = 0;
    let dispose = () => {};

    void (async () => {
      const THREE = await import("three");
      const { RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js");
      if (stop) return;
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setClearColor(0xffffff, 1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xffffff);
      const camera = new THREE.PerspectiveCamera(22, 1, 1, 8000);
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

      const root = new THREE.Group();
      scene.add(root);
      const cupSpin = new THREE.Group();
      const cupSpinRight = new THREE.Group();
      root.add(cupSpin, cupSpinRight);

      const makeCup = (drink: "beer" | "soda", dims: { top: number; bot: number; height: number }) => {
        const spec = live.current;
        const topR = dims.top / 2;
        const botR = dims.bot / 2;
        const height = dims.height;
        const wall = Math.max(0.85, Math.min(topR, botR) * 0.055);
        const outerR = (t: number) => {
          let r = botR + (topR - botR) * t;
          if (t < 0.05) r *= 0.9 + 0.1 * (t / 0.05);
          if (t > 0.95) r += Math.sin(((t - 0.95) / 0.05) * Math.PI) * topR * 0.04;
          return Math.max(0.4, r);
        };
        const outer: InstanceType<typeof THREE.Vector2>[] = [];
        for (let i = 0; i <= 40; i += 1) outer.push(new THREE.Vector2(outerR(i / 40), (i / 40) * height));
        const geo = new THREE.LatheGeometry(outer, 96);
        const mat = new THREE.MeshPhysicalMaterial({
          color: spec.body || 0xf4f1ec,
          roughness: 0.16,
          metalness: 0,
          transmission: spec.body ? 0.08 : 0.22,
          thickness: wall * 3,
          ior: 1.49,
          clearcoat: 1,
          clearcoatRoughness: 0.14,
          envMapIntensity: 1,
          sheen: 0.2,
          sheenColor: new THREE.Color(0xffffff),
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        const group = new THREE.Group();
        group.add(mesh);
        const rim = new THREE.Mesh(
          new THREE.TorusGeometry(topR * 0.99, Math.max(0.9, topR * 0.045), 16, 80),
          new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.08, clearcoat: 1, metalness: 0.05 }),
        );
        rim.rotation.x = Math.PI / 2;
        rim.position.y = height * 0.995;
        group.add(rim);
        const foot = new THREE.Mesh(
          new THREE.TorusGeometry(botR * 0.92, Math.max(0.55, botR * 0.04), 12, 64),
          new THREE.MeshStandardMaterial({ color: 0xf7f7f6, roughness: 0.28, metalness: 0.15 }),
        );
        foot.rotation.x = Math.PI / 2;
        foot.position.y = 0.6;
        group.add(foot);
        const decalMat = new THREE.MeshStandardMaterial({
          transparent: true,
          roughness: 0.32,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          depthWrite: false,
        });
        const decal = new THREE.Mesh(geo, decalMat);
        decal.scale.setScalar(1.004);
        group.add(decal);
        const level = drink === "beer" ? 0.86 : 0.9;
        const pts = [new THREE.Vector2(0.6, 2)];
        for (let i = 1; i <= 24; i += 1) {
          const t = i / 24;
          if (t > level) break;
          pts.push(new THREE.Vector2(Math.max(1, outerR(t) - wall - 1.6), t * height));
        }
        pts.push(new THREE.Vector2(0.4, height * level));
        const liquid = new THREE.Mesh(
          new THREE.LatheGeometry(pts, 48),
          new THREE.MeshPhysicalMaterial({
            color: drink === "beer" ? 0xdd7c0d : 0x2a0c08,
            roughness: 0.06,
            transmission: drink === "beer" ? 0.55 : 0.35,
            thickness: height * 0.2,
            ior: 1.34,
            attenuationColor: new THREE.Color(drink === "beer" ? 0xc46a08 : 0x120402),
            attenuationDistance: height * 0.18,
            transparent: true,
          }),
        );
        group.add(liquid);
        if (drink === "beer") {
          const headR = Math.max(2, outerR(0.9) - wall - 1);
          const foam = new THREE.Mesh(
            new THREE.SphereGeometry(headR, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
            new THREE.MeshStandardMaterial({ color: 0xfff7ee, roughness: 0.9 }),
          );
          foam.scale.y = 0.28;
          foam.position.y = height * 0.9;
          group.add(foam);
        }
        return { group, decalMat, topR, botR, height };
      };

      const beer = makeCup("beer", { top: live.current.top, bot: live.current.bot, height: live.current.heightMm });
      const soda = makeCup("soda", { top: live.current.otherTop, bot: live.current.otherBot, height: live.current.otherHeight });
      cupSpin.add(beer.group);
      cupSpinRight.add(soda.group);

      const bottle = new THREE.Group();
      const glass = new THREE.Mesh(
        new THREE.LatheGeometry(
          [[27, 0], [32, 6], [33.5, 16], [33.5, 148], [30, 162], [20, 176], [14, 192], [12.6, 214], [13.2, 222], [15.4, 226], [15.2, 230]].map(([x, y]) => new THREE.Vector2(x, y)),
          80,
        ),
        new THREE.MeshPhysicalMaterial({
          color: 0xc47a32,
          roughness: 0.04,
          transmission: 0.86,
          thickness: 4,
          ior: 1.5,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          attenuationColor: new THREE.Color(0x8a3e10),
          attenuationDistance: 28,
          envMapIntensity: 1.2,
        }),
      );
      glass.castShadow = true;
      bottle.add(glass);
      bottle.add(new THREE.Mesh(
        new THREE.LatheGeometry([[1, 8], [30, 14], [30.2, 150], [18, 164], [12, 172], [1, 172]].map(([x, y]) => new THREE.Vector2(x, y)), 48),
        new THREE.MeshPhysicalMaterial({
          color: 0xdd7c0d,
          roughness: 0.08,
          transmission: 0.45,
          thickness: 24,
          ior: 1.34,
          attenuationColor: new THREE.Color(0xb85a08),
          attenuationDistance: 18,
          transparent: true,
        }),
      ));
      const paper = new THREE.Mesh(
        new THREE.CylinderGeometry(33.7, 33.7, 62, 64, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.55, side: THREE.DoubleSide }),
      );
      paper.position.y = 78;
      bottle.add(paper);
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(33.85, 33.85, 10, 64, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x1f6b3a, roughness: 0.4, side: THREE.DoubleSide }),
      );
      band.position.y = 108;
      bottle.add(band);
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(15.6, 15.2, 8, 40),
        new THREE.MeshStandardMaterial({ color: 0xd6d3cc, metalness: 0.82, roughness: 0.28 }),
      );
      cap.position.y = 226;
      bottle.add(cap);
      root.add(bottle);
      const can = new THREE.Group();
      const canShell = new THREE.Mesh(
        new THREE.LatheGeometry([[26, 0], [32.4, 5], [33, 12], [33, 100], [31.2, 107], [24, 113], [22, 115]].map(([x, y]) => new THREE.Vector2(x, y)), 72),
        new THREE.MeshStandardMaterial({ color: 0xd5d8dc, metalness: 0.92, roughness: 0.22 }),
      );
      canShell.castShadow = true;
      can.add(canShell);
      const canLabel = new THREE.Mesh(
        new THREE.CylinderGeometry(33.15, 33.15, 72, 64, 1, true),
        new THREE.MeshStandardMaterial({ color: 0xc8102e, metalness: 0.35, roughness: 0.32, side: THREE.DoubleSide }),
      );
      canLabel.position.y = 58;
      can.add(canLabel);
      const lid = new THREE.Mesh(
        new THREE.CylinderGeometry(24, 26, 3.2, 48),
        new THREE.MeshStandardMaterial({ color: 0xe7eaee, metalness: 0.95, roughness: 0.16 }),
      );
      lid.position.y = 113.2;
      can.add(lid);
      const tab = new THREE.Mesh(
        new THREE.BoxGeometry(8, 0.6, 16),
        new THREE.MeshStandardMaterial({ color: 0xd0d4d8, metalness: 0.9, roughness: 0.2 }),
      );
      tab.position.set(2, 115.2, 0);
      can.add(tab);
      root.add(can);

      const metrics = () => {
        const leftR = live.current.top / 2;
        const rightR = live.current.otherTop / 2;
        const gap = 22;
        const bottleX = leftR + gap + 34;
        const canX = bottleX + 34 + gap + 33;
        const sodaX = canX + 33 + gap + rightR;
        return { bottleX, canX, sodaX, span: sodaX + rightR + leftR };
      };
      const place = () => {
        const row = metrics();
        const mid = row.sodaX / 2;
        cupSpin.position.x = -mid;
        bottle.position.x = row.bottleX - mid;
        can.position.x = row.canX - mid;
        cupSpinRight.position.x = row.sodaX - mid;
      };

      let beerMap: InstanceType<typeof THREE.CanvasTexture> | null = null;
      let sodaMap: InstanceType<typeof THREE.CanvasTexture> | null = null;
      const paintWrap = (source: HTMLCanvasElement | null, spanCover: number, motif: HTMLCanvasElement | null) => {
        const wrap = wrapPrint(source, motif, spanCover);
        if (!wrap) return null;
        const next = new THREE.CanvasTexture(wrap);
        next.colorSpace = THREE.SRGBColorSpace;
        next.anisotropy = renderer.capabilities.getMaxAnisotropy();
        next.wrapS = THREE.ClampToEdgeWrapping;
        next.needsUpdate = true;
        return next;
      };
      const paint = () => {
        beerMap?.dispose();
        sodaMap?.dispose();
        const current = live.current;
        beerMap = paintWrap(current.texture, current.cover, current.patternArt);
        sodaMap = paintWrap(current.otherTexture ?? current.texture, current.otherCover, current.otherPattern ?? current.patternArt);
        beer.decalMat.map = beerMap;
        soda.decalMat.map = sodaMap;
        beer.decalMat.needsUpdate = true;
        soda.decalMat.needsUpdate = true;
      };
      paint();

      const ground = new THREE.Mesh(new THREE.CircleGeometry(520, 48), new THREE.ShadowMaterial({ opacity: 0.16 }));
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(-180, 420, 260);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 10;
      key.shadow.camera.far = 1200;
      key.shadow.camera.left = -400;
      key.shadow.camera.right = 400;
      key.shadow.camera.top = 400;
      key.shadow.camera.bottom = -80;
      scene.add(key);
      scene.add(new THREE.AmbientLight(0xffffff, 0.55));
      scene.add(new THREE.DirectionalLight(0xffffff, 0.8)).position.set(40, 180, -260);

      const fit = (onlyCup: boolean) => {
        const w = onlyCup ? 900 : canvas.clientWidth;
        const h = onlyCup ? 1200 : canvas.clientHeight;
        if (!onlyCup && (w < 2 || h < 2)) return;
        if (!onlyCup) renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.fov = onlyCup ? 18 : 28;
        camera.updateProjectionMatrix();
        const box = new THREE.Box3().setFromObject(onlyCup ? cupSpin : root);
        if (box.isEmpty()) return;
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const vFov = (camera.fov * Math.PI) / 180;
        const distH = (size.y * 0.72) / Math.tan(vFov / 2);
        const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
        const distW = (size.x * 0.62) / Math.tan(hFov / 2);
        const dist = Math.max(distH, distW);
        camera.position.set(center.x, center.y, dist);
        camera.lookAt(center.x, center.y, 0);
        camera.updateProjectionMatrix();
      };
      fit(false);
      const observer = new ResizeObserver(() => fit(false));
      observer.observe(canvas);

      const shootCup = (turns: number[], side: "beer" | "soda" = "beer") => {
        const target = side === "soda" ? cupSpinRight : cupSpin;
        const spare = side === "soda" ? cupSpin : cupSpinRight;
        const saved = target.rotation.y;
        const hidden = [bottle, can, spare];
        hidden.forEach((item) => {
          item.visible = false;
        });
        const snap = { heightMm: live.current.heightMm, top: live.current.top, bot: live.current.bot };
        if (side === "soda") {
          live.current.heightMm = live.current.otherHeight;
          live.current.top = live.current.otherTop;
          live.current.bot = live.current.otherBot;
        }
        target.position.x = 0;
        const frames = turns.slice(0, 3).map((turn) => {
          target.rotation.y = turn;
          const w = 900;
          const h = 1200;
          const height = side === "soda" ? live.current.otherHeight : live.current.heightMm;
          const topR = (side === "soda" ? live.current.otherTop : live.current.top) / 2;
          renderer.setPixelRatio(2);
          renderer.setSize(w, h, false);
          renderer.setClearColor(0xf6f3ee, 1);
          camera.aspect = w / h;
          camera.fov = 30;
          const lookY = height * 0.46;
          const vFov = (camera.fov * Math.PI) / 180;
          const tan = Math.tan(vFov / 2);
          const dist = Math.max((height * 0.72) / tan, (topR * 1.7) / (tan * camera.aspect));
          camera.position.set(0, lookY, dist);
          camera.lookAt(0, lookY, 0);
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          const shot = document.createElement("canvas");
          shot.width = w;
          shot.height = h;
          shot.getContext("2d")?.drawImage(renderer.domElement, 0, 0);
          return shot;
        });
        hidden.forEach((item) => {
          item.visible = true;
        });
        live.current.heightMm = snap.heightMm;
        live.current.top = snap.top;
        live.current.bot = snap.bot;
        target.rotation.y = saved;
        place();
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        fit(false);
        return frames;
      };
      if (shotsHolder.current) shotsHolder.current.current = shootCup;

      const loop = () => {
        const spec = live.current;
        const tint = spec.body || "";
        if (beer.group.userData.mode !== spec.mode) {
          beer.group.userData.mode = spec.mode;
          const apply = (group: typeof beer.group) => {
            const mat = (group.children[0] as { material: { transmission: number; roughness: number; clearcoat: number } }).material;
            mat.transmission = spec.mode === "clear" ? 0.72 : spec.mode === "studio" ? 0.04 : 0.18;
            mat.roughness = spec.mode === "studio" ? 0.42 : 0.16;
            mat.clearcoat = spec.mode === "studio" ? 0.35 : 1;
          };
          apply(beer.group);
          apply(soda.group);
        }
        if (beer.group.userData.tint !== tint) {
          beer.group.userData.tint = tint;
          const mat = (beer.group.children[0] as { material: { color: { set: (v: string | number) => void } } }).material;
          mat.color.set(tint || 0xf4f1ec);
        }
        const otherTint = spec.otherBody || "";
        if (soda.group.userData.tint !== otherTint) {
          soda.group.userData.tint = otherTint;
          const mat2 = (soda.group.children[0] as { material: { color: { set: (v: string | number) => void } } }).material;
          mat2.color.set(otherTint || 0xf4f1ec);
        }
        const texKey = `${spec.texture ? 1 : 0}:${spec.otherTexture ? 1 : 0}:${spec.patternArt ? 1 : 0}:${spec.otherPattern ? 1 : 0}:${spec.cover}:${spec.otherCover}`;
        if (beer.group.userData.tex !== spec.texture || soda.group.userData.tex !== spec.otherTexture || beer.group.userData.pat !== spec.patternArt || soda.group.userData.pat !== spec.otherPattern || beer.group.userData.key !== texKey) {
          beer.group.userData.tex = spec.texture;
          soda.group.userData.tex = spec.otherTexture;
          beer.group.userData.pat = spec.patternArt;
          soda.group.userData.pat = spec.otherPattern;
          beer.group.userData.key = texKey;
          paint();
        }
        place();
        fit(false);
        if (spec.spin && !drag.current) angle.current += 0.012;
        cupSpin.rotation.y = angle.current;
        cupSpinRight.rotation.y = angle.current;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);

      dispose = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        beerMap?.dispose();
        sodaMap?.dispose();
        renderer.dispose();
        pmrem.dispose();
      };
    })();

    return () => {
      stop = true;
      if (shotsHolder.current) shotsHolder.current.current = null;
      dispose();
    };
  }, [top, bot, heightMm, cover, otherTop, otherBot, otherHeight, otherCover]);

  return (
    <canvas
      ref={ref}
      className={className ?? "h-[32rem] w-full"}
      aria-label="Copo, garrafa e lata na mesma escala"
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, y: event.clientY, a: angle.current };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        angle.current = drag.current.a + (event.clientX - drag.current.x) * 0.01;
      }}
      onPointerUp={(event) => {
        const start = drag.current;
        drag.current = null;
        if (!start || !shotsHolder.current?.current || !onViewsRef.current) return;
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) return;
        onViewsRef.current(shotsHolder.current.current([0, Math.PI * 0.28, Math.PI * 0.5]));
      }}
    />
  );
}
