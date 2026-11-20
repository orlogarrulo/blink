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
  lean?: "left" | "right";
  photo?: boolean;
  shotsRef?: { current: ((turns: number[]) => HTMLCanvasElement[]) | null };
  onViews?: (shots: HTMLCanvasElement[]) => void;
};

export function CupStage({ texture, top, bot, heightMm, cover, spin, mode = "frost", drink = "none", body = null, className, lean, photo = false, shotsRef, onViews }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ texture, top, bot, heightMm, cover, spin, mode, drink, body, photo, lean });
  live.current = { texture, top, bot, heightMm, cover, spin, mode, drink, body, photo, lean };
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
        color: 0x1a5c3a,
        roughness: 0.16,
        metalness: 0.02,
        transmission: 0.06,
        thickness: wall * 2.4,
        ior: 1.5,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        attenuationColor: new THREE.Color(0x1a5c3a),
        attenuationDistance: height * 0.15,
        sheen: 0.2,
        sheenColor: new THREE.Color(0xffffff),
        sheenRoughness: 0.35,
        envMapIntensity: 1.1,
        transparent: true,
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
          bodyMat.transmission = 0.06;
          bodyMat.thickness = wall * 2.4;
          bodyMat.roughness = 0.16;
          bodyMat.clearcoat = 0.9;
          bodyMat.clearcoatRoughness = 0.1;
          bodyMat.color.set(0x1a5c3a);
          bodyMat.ior = 1.5;
          bodyMat.sheen = 0.2;
          bodyMat.sheenColor.set(0xffffff);
          bodyMat.sheenRoughness = 0.35;
          bodyMat.envMapIntensity = 1.1;
          bodyMat.attenuationColor.set(0x1a5c3a);
          bodyMat.attenuationDistance = height * 0.15;
        }
        if (live.current.body) {
          bodyMat.color.set(live.current.body);
          bodyMat.attenuationColor.set(live.current.body);
          const raw = live.current.body.replace("#", "");
          const light = (parseInt(raw.slice(0, 2), 16) + parseInt(raw.slice(2, 4), 16) + parseInt(raw.slice(4, 6), 16)) / 3;
          if (light < 42) {
            bodyMat.transmission = 0.05;
            bodyMat.thickness = wall * 2.2;
            bodyMat.roughness = 0.4;
            bodyMat.sheen = 0;
            bodyMat.envMapIntensity = 0.12;
            bodyMat.attenuationDistance = height * 0.015;
          } else if (light < 150) {
            bodyMat.transmission = 0.2;
            bodyMat.sheen = 0.12;
            bodyMat.envMapIntensity = 0.3;
            bodyMat.attenuationDistance = height * 0.05;
          }
        }
        bodyMat.needsUpdate = true;
      };
      applyMode(live.current.mode);

      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(topR * 0.99, Math.max(0.45, topR * 0.022), 12, 64),
        new THREE.MeshPhysicalMaterial({
          color: 0x1a5c3a,
          roughness: 0.22,
          metalness: 0,
          clearcoat: 0.4,
          clearcoatRoughness: 0.3,
          transmission: 0.02,
          envMapIntensity: 0.9,
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

      const levelPts = (level: number, inset: number) => {
        const yMax = height * level;
        const pts = [new THREE.Vector2(0.8, wall * 1.8)];
        for (let i = 1; i <= steps; i += 1) {
          const t = i / steps;
          const y = t * height;
          if (y >= yMax) break;
          pts.push(new THREE.Vector2(Math.max(1, outerR(t) - wall - inset), y));
        }
        const topRad = Math.max(1, outerR(Math.min(0.98, yMax / height)) - wall - inset);
        pts.push(new THREE.Vector2(topRad, yMax));
        pts.push(new THREE.Vector2(0.5, yMax));
        return pts;
      };
      const beerGeo = new THREE.LatheGeometry(levelPts(0.84, 2.4), 64);
      const sodaGeo = new THREE.LatheGeometry(levelPts(0.9, 2.4), 64);
      const liquidMat = new THREE.MeshPhysicalMaterial({
        color: 0xdd7c0d,
        roughness: 0.07,
        metalness: 0,
        transmission: 0.62,
        thickness: height * 0.28,
        ior: 1.336,
        attenuationColor: new THREE.Color(0xc46a08),
        attenuationDistance: height * 0.22,
        specularIntensity: 1,
        transparent: true,
      });
      const liquid = new THREE.Mesh(beerGeo, liquidMat);
      liquid.visible = false;
      group.add(liquid);
      const bubbleGeo = new THREE.SphereGeometry(1, 12, 8);
      const bubbleMat = new THREE.MeshPhysicalMaterial({
        color: 0xfff8ec,
        roughness: 0.05,
        transmission: 0.92,
        thickness: 0.6,
        transparent: true,
        opacity: 0.62,
        depthWrite: false,
      });
      const bubbles = new THREE.Group();
      for (let i = 0; i < 42; i += 1) {
        const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
        const level = 0.08 + ((i * 37) % 70) / 100;
        const reach = Math.max(2, outerR(level) - wall - 5);
        const rad = reach * (0.12 + ((i * 17) % 70) / 100);
        const a = (i / 42) * Math.PI * 2 + (i % 5);
        const size = 0.55 + (i % 4) * 0.38;
        bubble.scale.setScalar(size);
        bubble.position.set(Math.cos(a) * rad, height * level, Math.sin(a) * rad);
        bubbles.add(bubble);
      }
      bubbles.visible = false;
      group.add(bubbles);
      const foamTex = document.createElement("canvas");
      foamTex.width = 512;
      foamTex.height = 256;
      const foamPen = foamTex.getContext("2d");
      const foamMap = new THREE.CanvasTexture(foamTex);
      if (foamPen) {
        foamPen.fillStyle = "#f4ead8";
        foamPen.fillRect(0, 0, 512, 256);
        for (let i = 0; i < 220; i += 1) {
          const x = Math.random() * 512;
          const y = Math.random() * 256;
          const radius = 1.5 + Math.random() * 9;
          foamPen.fillStyle = `rgba(255,252,246,${0.35 + Math.random() * 0.55})`;
          foamPen.beginPath();
          foamPen.arc(x, y, radius, 0, Math.PI * 2);
          foamPen.fill();
          foamPen.strokeStyle = "rgba(196, 168, 120, 0.28)";
          foamPen.stroke();
        }
        foamMap.needsUpdate = true;
        foamMap.colorSpace = THREE.SRGBColorSpace;
        foamMap.wrapS = THREE.RepeatWrapping;
        foamMap.wrapT = THREE.RepeatWrapping;
      }
      const foamMat = new THREE.MeshStandardMaterial({
        map: foamMap,
        color: 0xfff6ea,
        roughness: 0.96,
        metalness: 0,
      });
      const foam = new THREE.Group();
      const headR = Math.max(2, outerR(0.9) - wall - 1.2);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(headR * 0.98, headR * 0.94, height * 0.07, 64), foamMat);
      head.position.y = height * 0.895;
      foam.add(head);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(headR * 0.98, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), foamMat);
      cap.scale.y = 0.38;
      cap.position.y = height * 0.93;
      foam.add(cap);
      const lace = new THREE.Mesh(
        new THREE.TorusGeometry(headR * 1.01, Math.max(0.8, headR * 0.04), 12, 48),
        new THREE.MeshStandardMaterial({ color: 0xfffaf3, roughness: 1 }),
      );
      lace.rotation.x = Math.PI / 2;
      lace.position.y = height * 0.86;
      foam.add(lace);
      for (let i = 0; i < 14; i += 1) {
        const bubble = new THREE.Mesh(
          new THREE.SphereGeometry(headR * (0.035 + (i % 4) * 0.012), 12, 10),
          new THREE.MeshStandardMaterial({ color: 0xfffcf7, roughness: 0.7 }),
        );
        const a = (i / 14) * Math.PI * 2;
        bubble.position.set(Math.cos(a) * headR * 0.7, height * (0.92 + (i % 3) * 0.01), Math.sin(a) * headR * 0.7);
        foam.add(bubble);
      }
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
        ctx.clearRect(0, 0, wrap.width, wrap.height);
        const lip = Math.min(0.1, Math.max(0.045, 8 / current.heightMm));
        const span = Math.min(Math.max(0.22, current.cover), 1 - lip - 0.06);
        const probe = document.createElement("canvas");
        probe.width = 160;
        probe.height = Math.max(8, Math.round(160 * (current.texture.height / Math.max(1, current.texture.width))));
        const probeCtx = probe.getContext("2d", { willReadFrequently: true });
        let copies = 1;
        if (probeCtx) {
          probeCtx.drawImage(current.texture, 0, 0, probe.width, probe.height);
          const sample = probeCtx.getImageData(0, 0, probe.width, probe.height).data;
          let ink = 0;
          let minX = probe.width;
          let maxX = 0;
          for (let p = 0; p < sample.length; p += 4) {
            if (sample[p + 3] < 16) continue;
            ink += 1;
            const x = (p / 4) % probe.width;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
          const coverX = ink === 0 ? 1 : (maxX - minX + 1) / probe.width;
          const coverArea = ink / (probe.width * probe.height);
          if (coverX < 0.55 || coverArea < 0.22) copies = 2;
        }
        const slot = wrap.width / copies;
        for (let copy = 0; copy < copies; copy += 1) {
          ctx.drawImage(current.texture, copy * slot, lip * wrap.height, slot, span * wrap.height);
        }
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
        new THREE.ShadowMaterial({ opacity: 0.12 }),
      );
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.3;
      ground.receiveShadow = true;
      scene.add(ground);

      const key = new THREE.DirectionalLight(0xfff3e4, 1.7);
      key.position.set(-topR * 0.4, height * 2.1, topR * 2.2);
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
      scene.add(new THREE.AmbientLight(0xfff6ee, 0.72));
      scene.add(new THREE.HemisphereLight(0xfff8f0, 0xe6d3bc, 0.7));
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
        camera.fov = 26;
        camera.aspect = w / h;
        const stage = 210;
        const vFov = (camera.fov * Math.PI) / 180;
        const dist = (stage * 0.7) / Math.tan(vFov / 2);
        camera.position.set(0, stage * 0.4, dist);
        camera.lookAt(0, stage * 0.34, 0);
        group.position.x = 0;
        camera.updateProjectionMatrix();
      };
      fit();
      const observer = new ResizeObserver(() => fit());
      observer.observe(canvas);

      const studioShot = (turn: number, w: number, h: number, overhead: boolean) => {
        group.rotation.y = turn;
        const savedX = group.position.x;
        group.position.x = 0;
        renderer.setPixelRatio(2);
        renderer.setSize(w, h, false);
        renderer.setClearColor(0x000000, 0);
        const groundMat = ground.material as { opacity: number };
        const savedShadow = groundMat.opacity;
        groundMat.opacity = 0.2;
        const span = Math.max(height * 1.35, topR * 2.8);
        camera.fov = overhead ? 24 : 20;
        camera.aspect = w / h;
        const fov = (camera.fov * Math.PI) / 180;
        const dist = span / (2 * Math.tan(fov / 2)) + topR;
        camera.position.set(0, height * 0.5, overhead ? dist * 0.72 : dist);
        camera.lookAt(0, height * 0.46, overhead ? 0 : 0);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
        const shot = document.createElement("canvas");
        shot.width = w;
        shot.height = h;
        const ctx = shot.getContext("2d");
        if (ctx) {
          const sweep = ctx.createLinearGradient(0, 0, 0, h);
          sweep.addColorStop(0, "#fbfbfa");
          sweep.addColorStop(0.62, "#f4f2ef");
          sweep.addColorStop(1, "#e6e1db");
          ctx.fillStyle = sweep;
          ctx.fillRect(0, 0, w, h);
          ctx.save();
          ctx.filter = "blur(22px)";
          ctx.fillStyle = "rgba(42, 32, 24, 0.28)";
          ctx.beginPath();
          ctx.ellipse(w * 0.5, h * 0.86, w * 0.15, h * 0.016, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          ctx.drawImage(renderer.domElement, 0, 0, shot.width, shot.height);
        }
        groundMat.opacity = savedShadow;
        group.position.x = savedX;
        return shot;
      };

      shoot.current = () => {
        const saved = group.rotation.y;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const angles = [0, Math.PI * 0.28, Math.PI * 0.5, Math.PI, -Math.PI * 0.28, 0.4];
        const shots = angles.map((turn, index) => studioShot(turn, 900, 1200, index === 5));
        group.rotation.y = saved;
        camera.fov = 28;
        renderer.setPixelRatio(ratio);
        renderer.setClearColor(0x000000, 0);
        fit();
        return shots;
      };

      const captureTight = (turns: number[]) => {
        const saved = group.rotation.y;
        const ratio = Math.min(2, window.devicePixelRatio || 1);
        const frames = turns.map((turn) => studioShot(turn, 900, 1200, false));
        group.rotation.y = saved;
        camera.fov = 28;
        renderer.setPixelRatio(ratio);
        renderer.setClearColor(0x000000, 0);
        fit();
        return frames;
      };
      if (shotsHolder.current) shotsHolder.current.current = captureTight;

      const placeDrink = () => {
        const next = live.current.drink;
        const on = next !== "none";
        liquid.visible = on;
        foam.visible = next === "beer";
        bubbles.visible = on;
        bubbleMat.opacity = next === "soda" ? 0.4 : 0.62;
        bubbleMat.color.set(next === "soda" ? 0xfff4ea : 0xfff8ec);
        applyMode(live.current.mode);
        if (on && live.current.mode !== "studio" && !live.current.body) {
          bodyMat.transmission = 0.6;
          bodyMat.roughness = 0.55;
          bodyMat.thickness = wall * 4.2;
          bodyMat.attenuationDistance = height * 0.09;
          bodyMat.needsUpdate = true;
        }
        if (next === "soda") {
          liquid.geometry = sodaGeo;
          liquidMat.color.set(0x3a140c);
          liquidMat.attenuationColor.set(0x120402);
          liquidMat.attenuationDistance = height * 0.16;
          liquidMat.transmission = 0.48;
          liquidMat.thickness = height * 0.34;
          liquidMat.roughness = 0.06;
        } else {
          liquid.geometry = beerGeo;
          liquidMat.color.set(0xdd7c0d);
          liquidMat.attenuationColor.set(0xc46a08);
          liquidMat.attenuationDistance = height * 0.22;
          liquidMat.transmission = 0.62;
          liquidMat.thickness = height * 0.28;
          liquidMat.roughness = 0.07;
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
        if (live.current.spin && !drag.current) angle.current += 0.012;
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
        bubbleGeo.dispose();
        bubbleMat.dispose();
        foamMap.dispose();
        foam.traverse((child: { geometry?: { dispose: () => void }; material?: { dispose: () => void } }) => {
          child.geometry?.dispose();
          if (child.material && child.material !== foamMat) child.material.dispose();
        });
        foamMat.dispose();
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

