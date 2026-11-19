import { useEffect, useRef } from "react";

type Props = {
  texture: HTMLCanvasElement | null;
  top: number;
  bot: number;
  heightMm: number;
  cover: number;
  spin: boolean;
  className?: string;
};

export function CupStage({ texture, top, bot, heightMm, cover, spin, className }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ texture, top, bot, heightMm, cover, spin });
  live.current = { texture, top, bot, heightMm, cover, spin };
  const angle = useRef(0);
  const drag = useRef<{ x: number; a: number } | null>(null);

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
      const pts: InstanceType<typeof THREE.Vector2>[] = [];
      const steps = 48;
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        let r = botR + (topR - botR) * t;
        if (t < 0.05) r *= 0.9 + 0.1 * (t / 0.05);
        if (t > 0.95) r += Math.sin(((t - 0.95) / 0.05) * Math.PI) * topR * 0.045;
        pts.push(new THREE.Vector2(Math.max(0.4, r), t * height));
      }
      const geo = new THREE.LatheGeometry(pts, 128);
      const body = new THREE.Mesh(
        geo,
        new THREE.MeshPhysicalMaterial({
          color: 0xf4f6f7,
          roughness: 0.32,
          metalness: 0,
          clearcoat: 0.62,
          clearcoatRoughness: 0.24,
          envMapIntensity: 1,
        }),
      );
      body.castShadow = true;
      const group = new THREE.Group();
      group.add(body);

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
        new THREE.CircleGeometry(Math.max(topR, botR) * 1.7, 48),
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
      const span = height * 1.3;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = height * 5;
      key.shadow.camera.left = -span;
      key.shadow.camera.right = span;
      key.shadow.camera.top = span;
      key.shadow.camera.bottom = -span;
      scene.add(key);
      scene.add(new THREE.AmbientLight(0xf7f8fa, 0.72));
      const fill = new THREE.DirectionalLight(0xd7e3ee, 0.5);
      fill.position.set(topR * 2.2, height * 0.25, -topR);
      scene.add(fill);

      const fit = () => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w < 2 || h < 2) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const dist = (height * 0.58) / Math.tan((14 * Math.PI) / 180);
        camera.position.set(topR * 0.55, height * 0.5, dist);
        camera.lookAt(0, height * 0.46, 0);
        camera.updateProjectionMatrix();
      };
      fit();
      const observer = new ResizeObserver(() => fit());
      observer.observe(canvas);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      const loop = () => {
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
        body.material.dispose();
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
      dispose();
    };
  }, [texture, top, bot, heightMm, cover]);

  return (
    <canvas
      ref={ref}
      className={className ?? "h-[28rem] w-full touch-none"}
      aria-label="Copo Ecocup em volume. Arrasta para rodar."
      onPointerDown={(event) => {
        drag.current = { x: event.clientX, a: angle.current };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        angle.current = drag.current.a + (event.clientX - drag.current.x) * 0.01;
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
    />
  );
}
