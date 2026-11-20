import { useEffect, useRef } from "react";

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
  spin: boolean;
  body?: string | null;
  mode?: "frost" | "clear" | "studio";
  className?: string;
  shotsRef?: { current: ((turns: number[]) => HTMLCanvasElement[]) | null };
  onViews?: (shots: HTMLCanvasElement[]) => void;
};

const BOTTLE_H = 230;
const CAN_H = 115;

export function Lineup({ texture, top, bot, heightMm, cover, otherTop, otherBot, otherHeight, otherCover, otherTexture, otherBody = null, spin, body = null, mode = "frost", className, shotsRef, onViews }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ texture, top, bot, heightMm, cover, otherTop, otherBot, otherHeight, otherCover, otherTexture, otherBody, spin, body, mode });
  live.current = { texture, top, bot, heightMm, cover, otherTop, otherBot, otherHeight, otherCover, otherTexture, otherBody, spin, body, mode };
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

      const bottlePts = [
        [28, 0],
        [33, 12],
        [34, 40],
        [33, 120],
        [30, 155],
        [16, 178],
        [12.5, 205],
        [12.2, 218],
        [15.2, 224],
        [14.2, 230],
      ].map(([x, y]) => new THREE.Vector2(x, y));
      const bottle = new THREE.Mesh(
        new THREE.LatheGeometry(bottlePts, 64),
        new THREE.MeshPhysicalMaterial({
          color: 0x8d4e16,
          roughness: 0.06,
          transmission: 0.92,
          thickness: 6,
          ior: 1.5,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          attenuationColor: new THREE.Color(0x6a3010),
          attenuationDistance: 40,
          envMapIntensity: 1.1,
        }),
      );
      bottle.castShadow = true;
      root.add(bottle);
      const can = new THREE.Group();
      const canBody = new THREE.Mesh(
        new THREE.CylinderGeometry(33, 33, CAN_H - 8, 64),
        new THREE.MeshStandardMaterial({ color: 0xd7dbe0, metalness: 0.86, roughness: 0.28 }),
      );
      canBody.position.y = CAN_H / 2;
      canBody.castShadow = true;
      can.add(canBody);
      const canTop = new THREE.Mesh(
        new THREE.CylinderGeometry(31, 33, 8, 48),
        new THREE.MeshStandardMaterial({ color: 0xc5c9ce, metalness: 0.9, roughness: 0.22 }),
      );
      canTop.position.y = CAN_H - 4;
      can.add(canTop);
      root.add(can);

      const metrics = () => {
        const leftR = live.current.top / 2;
        const rightR = live.current.otherTop / 2;
        const gap = 22;
        const bottleX = leftR + gap + 34;
        const canX = bottleX + 34 + gap + 33;
        const sodaX = canX + 33 + gap + rightR;
        return { bottleX, canX, sodaX, span: sodaX + rightR };
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
      const paintWrap = (source: HTMLCanvasElement | null, spanCover: number) => {
        const wrap = document.createElement("canvas");
        wrap.width = 2048;
        wrap.height = 1024;
        const ctx = wrap.getContext("2d");
        if (!ctx || !source) return null;
        ctx.clearRect(0, 0, wrap.width, wrap.height);
        const lip = 0.08;
        const span = Math.min(Math.max(0.35, spanCover), 0.86);
        ctx.drawImage(source, 0, lip * wrap.height, wrap.width, span * wrap.height);
        const next = new THREE.CanvasTexture(wrap);
        next.colorSpace = THREE.SRGBColorSpace;
        next.anisotropy = renderer.capabilities.getMaxAnisotropy();
        next.needsUpdate = true;
        return next;
      };
      const paint = () => {
        beerMap?.dispose();
        sodaMap?.dispose();
        const current = live.current;
        beerMap = paintWrap(current.texture, current.cover);
        sodaMap = paintWrap(current.otherTexture ?? current.texture, current.otherCover);
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
        camera.fov = onlyCup ? 18 : 22;
        const height = live.current.heightMm;
        const targetY = onlyCup ? height * 0.48 : BOTTLE_H * 0.42;
        const span = onlyCup ? Math.max(height * 1.25, live.current.top * 1.4) : Math.max(BOTTLE_H * 1.15, metrics().span * 0.55);
        const fov = (camera.fov * Math.PI) / 180;
        const dist = span / (2 * Math.tan(fov / 2));
        const wide = onlyCup ? dist : Math.max(dist, metrics().span / (2 * Math.tan(fov / 2)) / Math.max(0.35, camera.aspect));
        camera.position.set(0, targetY + span * 0.02, wide);
        camera.lookAt(0, targetY, 0);
        camera.updateProjectionMatrix();
      };
      fit(false);
      const observer = new ResizeObserver(() => fit(false));
      observer.observe(canvas);

      const shootCup = (turns: number[]) => {
        const saved = cupSpin.rotation.y;
        const hidden = [bottle, can, cupSpinRight];
        hidden.forEach((item) => {
          item.visible = false;
        });
        cupSpin.position.x = 0;
        renderer.setPixelRatio(2);
        renderer.setClearColor(0xffffff, 1);
        const frames = turns.map((turn) => {
          cupSpin.rotation.y = turn;
          renderer.setSize(900, 1200, false);
          fit(true);
          renderer.render(scene, camera);
          const shot = document.createElement("canvas");
          shot.width = 900;
          shot.height = 1200;
          shot.getContext("2d")?.drawImage(renderer.domElement, 0, 0);
          return shot;
        });
        hidden.forEach((item) => {
          item.visible = true;
        });
        cupSpin.rotation.y = saved;
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
        const texKey = `${spec.texture ? 1 : 0}:${spec.otherTexture ? 1 : 0}:${spec.cover}:${spec.otherCover}`;
        if (beer.group.userData.tex !== spec.texture || soda.group.userData.tex !== spec.otherTexture || beer.group.userData.key !== texKey) {
          beer.group.userData.tex = spec.texture;
          soda.group.userData.tex = spec.otherTexture;
          beer.group.userData.key = texKey;
          paint();
        }
        place();
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
        onViewsRef.current(shotsHolder.current.current([0, Math.PI * 0.28, Math.PI * 0.5, Math.PI, -Math.PI * 0.28, 0]));
      }}
    />
  );
}
