import { useEffect, useRef } from "react";

type RenderMode = "frost" | "clear" | "studio";
type Drink = "none" | "beer" | "soda";

type Props = {
  texture: HTMLCanvasElement | null;
  top: number;
  bot: number;
  heightMm: number;
  cover: number;
  spin: boolean;
  mode?: RenderMode;
  drink?: Drink;
  body?: string | null;
  className?: string;
  shotsRef?: { current: ((turns: number[]) => HTMLCanvasElement[]) | null };
  onViews?: (shots: HTMLCanvasElement[]) => void;
};

export function CupStage({ texture, top, bot, heightMm, cover, spin, mode = "frost", drink = "none", body = null, className, shotsRef, onViews }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ texture, top, bot, heightMm, cover, spin, mode, drink, body });
  live.current = { texture, top, bot, heightMm, cover, spin, mode, drink, body };
  const onViewsRef = useRef(onViews);
  onViewsRef.current = onViews;
  const shotsHolder = useRef(shotsRef);
  shotsHolder.current = shotsRef;
  const shoot = useRef<(() => HTMLCanvasElement[]) | null>(null);
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
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 4000);
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = env;

      const spec = live.current;
      const topR = spec.top / 2;
      const botR = spec.bot / 2;
      const height = spec.heightMm;
      const wall = Math.max(0.85, Math.min(topR, botR) * 0.055);
      const steps = 48;
      const outerR = (t: number) => {
        let r = botR + (topR - botR) * t;
        if (t < 0.05) r *= 0.9 + 0.1 * (t / 0.05);
        if (t > 0.95) r += Math.sin(((t - 0.95) / 0.05) * Math.PI) * topR * 0.045;
        return Math.max(0.4, r);
      };
      const outer: InstanceType<typeof THREE.Vector2>[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        outer.push(new THREE.Vector2(outerR(t), t * height));
      }
      const shell: InstanceType<typeof THREE.Vector2>[] = [];
      for (let i = 0; i <= steps; i += 1) shell.push(outer[i].clone());
      shell.push(new THREE.Vector2(outerR(1) - wall * 0.35, height - wall * 0.55));
      for (let i = steps; i >= 1; i -= 1) {
        const t = i / steps;
        const inset = t > 0.93 ? wall * 0.4 : wall;
        const y = Math.max(wall * 1.7, t * height - wall * 0.15);
        shell.push(new THREE.Vector2(Math.max(wall, outerR(Math.min(t, 0.99)) - inset), y));
      }
      shell.push(new THREE.Vector2(botR * 0.22, wall * 1.7));
      shell.push(new THREE.Vector2(botR * 0.22, 0.35));
      const geo = new THREE.LatheGeometry(outer, 128);
      const shellGeo = new THREE.LatheGeometry(shell, 96);
      shellGeo.computeVertexNormals();
      const bodyMat = new THREE.MeshPhysicalMaterial({
        color: 0xf3f6f7,
        roughness: 0.38,
        metalness: 0,
        transmission: 0.62,
        thickness: wall * 2.2,
        ior: 1.49,
        clearcoat: 0.35,
        clearcoatRoughness: 0.28,
        attenuationColor: new THREE.Color(0xf4f7f8),
        attenuationDistance: height * 0.22,
        sheen: 0.35,
        sheenColor: new THREE.Color(0xffffff),
        sheenRoughness: 0.6,
        envMapIntensity: 0.9,
      });
      const body = new THREE.Mesh(shellGeo, bodyMat);
      body.castShadow = true;
      const group = new THREE.Group();
      group.add(body);
      const applyMode = (next: RenderMode) => {
        if (next === "studio") {
          bodyMat.transmission = 0;
          bodyMat.thickness = 0;
          bodyMat.roughness = 0.78;
          bodyMat.clearcoat = 0.04;
          bodyMat.color.set(0xf7f4ee);
          bodyMat.ior = 1.4;
          bodyMat.sheen = 0.12;
          bodyMat.envMapIntensity = 0.4;
        } else if (next === "clear") {
          bodyMat.transmission = 0.92;
          bodyMat.thickness = wall * 1.3;
          bodyMat.roughness = 0.08;
          bodyMat.clearcoat = 0.85;
          bodyMat.clearcoatRoughness = 0.12;
          bodyMat.color.set(0xffffff);
          bodyMat.ior = 1.5;
          bodyMat.sheen = 0;
          bodyMat.envMapIntensity = 1.15;
          bodyMat.attenuationDistance = height * 0.4;
        } else {
          bodyMat.transmission = 0.62;
          bodyMat.thickness = wall * 2.2;
          bodyMat.roughness = 0.38;
          bodyMat.clearcoat = 0.35;
          bodyMat.clearcoatRoughness = 0.28;
          bodyMat.color.set(0xf3f6f7);
          bodyMat.ior = 1.49;
          bodyMat.sheen = 0.35;
          bodyMat.envMapIntensity = 0.9;
          bodyMat.attenuationDistance = height * 0.22;
        }
        if (live.current.body) {
          bodyMat.color.set(live.current.body);
          bodyMat.attenuationColor.set(live.current.body);
        }
        bodyMat.needsUpdate = true;
      };
      applyMode(live.current.mode);

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(topR * 0.985, Math.max(1.15, topR * 0.058), 24, 120),
        new THREE.MeshPhysicalMaterial({
          color: 0xffffff,
          roughness: 0.16,
          clearcoat: 0.85,
          clearcoatRoughness: 0.12,
          envMapIntensity: 1.15,
        }),
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = height * 0.998;
      group.add(rim);

      const mouth = new THREE.Mesh(
        new THREE.CircleGeometry(topR * 0.9, 72),
        new THREE.MeshStandardMaterial({ color: 0xd5dee4, roughness: 0.88 }),
      );
      mouth.rotation.x = -Math.PI / 2;
      mouth.position.y = height - 2.4;
      group.add(mouth);

      const foot = new THREE.Mesh(
        new THREE.TorusGeometry(botR * 0.95, Math.max(0.7, botR * 0.05), 14, 80),
        new THREE.MeshStandardMaterial({ color: 0xe7ecef, roughness: 0.42 }),
      );
      foot.rotation.x = Math.PI / 2;
      foot.position.y = Math.max(0.5, botR * 0.035);
      group.add(foot);

      const decalMat = new THREE.MeshStandardMaterial({
        transparent: true,
        roughness: 0.46,
        metalness: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const decal = new THREE.Mesh(geo, decalMat);
      decal.scale.setScalar(1.006);
      group.add(decal);
      scene.add(group);

      const levelPts = (level: number) => {
        const yMax = height * level;
        const pts = [new THREE.Vector2(0.8, wall * 1.8)];
        for (let i = 1; i <= steps; i += 1) {
          const t = i / steps;
          const y = t * height;
          if (y >= yMax) break;
          pts.push(new THREE.Vector2(Math.max(1, outerR(t) - wall - 0.7), y));
        }
        const topRad = Math.max(1, outerR(Math.min(0.98, yMax / height)) - wall - 0.7);
        pts.push(new THREE.Vector2(topRad, yMax));
        pts.push(new THREE.Vector2(0.5, yMax));
        return pts;
      };
      const beerGeo = new THREE.LatheGeometry(levelPts(0.78), 64);
      const sodaGeo = new THREE.LatheGeometry(levelPts(0.9), 64);
      const liquidMat = new THREE.MeshPhysicalMaterial({
        color: 0xd08920,
        roughness: 0.14,
        metalness: 0,
        transmission: 0.58,
        thickness: 16,
        ior: 1.34,
      });
      const liquid = new THREE.Mesh(beerGeo, liquidMat);
      liquid.visible = false;
      group.add(liquid);
      const foamR = Math.max(2, outerR(0.78) - wall - 1.1);
      const foam = new THREE.Mesh(
        new THREE.CylinderGeometry(foamR, Math.max(2, foamR - 1.5), 5, 48),
        new THREE.MeshStandardMaterial({ color: 0xf4efe4, roughness: 0.94 }),
      );
      foam.position.y = height * 0.78 + 1.6;
      foam.visible = false;
      group.add(foam);

      let map: InstanceType<typeof THREE.CanvasTexture> | null = null;
      const paintWrap = () => {
        map?.dispose();
        map = null;
        decalMat.map = null;
        const current = live.current;
        if (!current.texture) {
          decal.visible = false;
          decalMat.needsUpdate = true;
          return;
        }
        decal.visible = true;
        const wrap = document.createElement("canvas");
        wrap.width = 4096;
        wrap.height = 2048;
        const ctx = wrap.getContext("2d");
        if (!ctx) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        const lip = Math.min(0.1, Math.max(0.045, 8 / current.heightMm));
        const span = Math.min(Math.max(0.18, current.cover), 1 - lip - 0.065);
        ctx.drawImage(current.texture, 0, lip * wrap.height, wrap.width, span * wrap.height);
        map = new THREE.CanvasTexture(wrap);
        map.colorSpace = THREE.SRGBColorSpace;
        map.anisotropy = renderer.capabilities.getMaxAnisotropy();
        map.wrapS = THREE.RepeatWrapping;
        map.offset.x = 0.5;
        map.needsUpdate = true;
        decalMat.map = map;
        decalMat.needsUpdate = true;
      };
      paintWrap();

      const ground = new THREE.Mesh(
        new THREE.CircleGeometry(Math.max(topR, botR) * 1.8, 48),
        new THREE.ShadowMaterial({ opacity: 0.2 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.3;
      ground.receiveShadow = true;
      scene.add(ground);

      const key = new THREE.DirectionalLight(0xffffff, 2.5);
      key.position.set(-topR * 1.4, height * 1.7, topR * 2.6);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      const span = Math.max(height * 1.3, 280);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = height * 5;
      key.shadow.camera.left = -span;
      key.shadow.camera.right = span;
      key.shadow.camera.top = span;
      key.shadow.camera.bottom = -span;
      scene.add(key);
      scene.add(new THREE.AmbientLight(0xf7f8fa, 0.55));
      scene.add(new THREE.HemisphereLight(0xffffff, 0xe4d5c4, 0.45));
      const rimLight = new THREE.DirectionalLight(0xffffff, 1.15);
      rimLight.position.set(-topR * 0.2, height * 0.9, -topR * 3);
      scene.add(rimLight);
      const fill = new THREE.DirectionalLight(0xd7e3ee, 0.5);
      fill.position.set(topR * 2.2, height * 0.25, -topR);
      scene.add(fill);

      const fit = () => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w < 2 || h < 2) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const vFov = (28 * Math.PI) / 180;
        const dist = (height * 0.58) / Math.tan(vFov / 2);
        camera.position.set(topR * 0.55, height * 0.5, dist);
        camera.lookAt(0, height * 0.46, 0);
        camera.updateProjectionMatrix();
      };
      fit();
      const observer = new ResizeObserver(() => fit());
      observer.observe(canvas);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      shoot.current = () => {
        const saved = group.rotation.y;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        renderer.setPixelRatio(1);
        const angles = [0, Math.PI * 0.28, Math.PI * 0.5, Math.PI, -Math.PI * 0.28, Math.PI * 0.12];
        const shots = angles.map((turn, index) => {
          group.rotation.y = turn;
          renderer.setSize(720, 900, false);
          camera.aspect = 720 / 900;
          fit();
          if (index === 5 && live.current.drink === "none") {
            const tall = live.current.heightMm;
            const radius = live.current.top / 2;
            const dist = (tall * 0.58) / Math.tan((14 * Math.PI) / 180);
            camera.position.set(radius * 0.15, tall * 1.35, dist * 0.72);
            camera.lookAt(0, tall * 0.38, 0);
            camera.updateProjectionMatrix();
          }
          renderer.render(scene, camera);
          const shot = document.createElement("canvas");
          shot.width = 720;
          shot.height = 900;
          shot.getContext("2d")?.drawImage(renderer.domElement, 0, 0);
          return shot;
        });
        group.rotation.y = saved;
        renderer.setPixelRatio(ratio);
        fit();
        return shots;
      };

      const captureTight = (turns: number[]) => {
        const saved = group.rotation.y;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        renderer.setPixelRatio(1);
        const frames = turns.map((turn) => {
          group.rotation.y = turn;
          renderer.setSize(640, 820, false);
          camera.aspect = 640 / 820;
          const vFov = (28 * Math.PI) / 180;
          const dist = (height * 0.62) / Math.tan(vFov / 2);
          camera.position.set(topR * 0.28, height * 0.48, dist);
          camera.lookAt(0, height * 0.46, 0);
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
          const shot = document.createElement("canvas");
          shot.width = 640;
          shot.height = 820;
          shot.getContext("2d")?.drawImage(renderer.domElement, 0, 0);
          return shot;
        });
        group.rotation.y = saved;
        renderer.setPixelRatio(ratio);
        fit();
        return frames;
      };
      if (shotsHolder.current) shotsHolder.current.current = captureTight;

      const placeDrink = () => {
        const next = live.current.drink;
        const on = next !== "none";
        liquid.visible = on;
        foam.visible = next === "beer";
        applyMode(live.current.mode);
        if (on && live.current.mode !== "studio") {
          bodyMat.transmission = 0.82;
          bodyMat.roughness = 0.18;
          bodyMat.thickness = wall * 1.6;
          bodyMat.needsUpdate = true;
        }
        if (next === "soda") {
          liquid.geometry = sodaGeo;
          liquidMat.color.set(0x3a120e);
          liquidMat.transmission = 0.38;
          liquidMat.roughness = 0.05;
        } else {
          liquid.geometry = beerGeo;
          liquidMat.color.set(0xd08920);
          liquidMat.transmission = 0.58;
          liquidMat.roughness = 0.14;
        }
        liquidMat.needsUpdate = true;
        fit();
      };

      const loop = () => {
        if (body.userData.mode !== live.current.mode || body.userData.body !== (live.current.body || "")) {
          applyMode(live.current.mode);
          body.userData.mode = live.current.mode;
          body.userData.body = live.current.body || "";
        }
        if (body.userData.drink !== live.current.drink) {
          body.userData.drink = live.current.drink;
          placeDrink();
        }
        if (live.current.spin && !reduce && !drag.current) angle.current += 0.008;
        group.rotation.y = angle.current;
        renderer.render(scene, camera);
        frame = requestAnimationFrame(loop);
      };
      frame = requestAnimationFrame(loop);

      dispose = () => {
        cancelAnimationFrame(frame);
        observer.disconnect();
        geo.dispose();
        shellGeo.dispose();
        bodyMat.dispose();
        beerGeo.dispose();
        sodaGeo.dispose();
        liquidMat.dispose();
        foam.geometry.dispose();
        (foam.material as { dispose: () => void }).dispose();
        (rim.material as { dispose: () => void }).dispose();
        rim.geometry.dispose();
        (mouth.material as { dispose: () => void }).dispose();
        mouth.geometry.dispose();
        (foot.material as { dispose: () => void }).dispose();
        foot.geometry.dispose();
        ground.geometry.dispose();
        (ground.material as { dispose: () => void }).dispose();
        decalMat.dispose();
        map?.dispose();
        env.dispose();
        pmrem.dispose();
        renderer.dispose();
      };
    })();

    return () => {
      stop = true;
      shoot.current = null;
      if (shotsHolder.current) shotsHolder.current.current = null;
      dispose();
    };
  }, [texture, top, bot, heightMm, cover]);

  return (
    <canvas
      ref={ref}
      className={`${className ?? "h-[28rem] w-full"} touch-none cursor-pointer`}
      aria-label="Copo Ecocup em volume. Arrasta para rodar. Clica para abrir o PDF dos ângulos."
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
        if (!start || !shoot.current || !onViewsRef.current) return;
        const moved = Math.hypot(event.clientX - start.x, event.clientY - start.y);
        if (moved > 8) return;
        onViewsRef.current(shoot.current());
      }}
    />
  );
}
