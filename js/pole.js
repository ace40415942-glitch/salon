// العمود الدوّار ثلاثي الأبعاد (Three.js). غطاء كروم، زجاج، وخطوط أحمر/أبيض/أزرق بتلف.
import * as THREE from 'three';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (t) => Math.min(1, Math.max(0, t));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// نقشة الخطوط الحلزونية مرسومة بكسل بكسل، مع تظليل خفيف لكل شريط كأنه شريط بارز.
function stripeTextures() {
  const W = 512, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const b = document.createElement('canvas'); b.width = W; b.height = H;
  const ctx = c.getContext('2d'), bctx = b.getContext('2d');
  const img = ctx.createImageData(W, H), bump = bctx.createImageData(W, H);
  const bands = [
    [178, 30, 32],   // أحمر
    [242, 238, 230], // أبيض عاجي
    [26, 58, 140],   // أزرق
    [242, 238, 230],
  ];
  const turns = 3; // عدد اللفّات على طول العمود
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = (((x / W) + (y / H) * turns) % 1 + 1) % 1;
      const i = Math.floor(t * 4);
      const local = t * 4 - i;
      const relief = Math.sin(local * Math.PI);           // 0 عند الحواف، 1 بالنص
      const shade = 0.72 + 0.28 * Math.pow(relief, 0.6);
      const col = bands[i];
      const k = (y * W + x) * 4;
      img.data[k] = col[0] * shade; img.data[k + 1] = col[1] * shade; img.data[k + 2] = col[2] * shade; img.data[k + 3] = 255;
      const v = 255 * Math.pow(relief, 0.8);
      bump.data[k] = bump.data[k + 1] = bump.data[k + 2] = v; bump.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0); bctx.putImageData(bump, 0, 0);
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  const bumpMap = new THREE.CanvasTexture(b);
  for (const t of [map, bumpMap]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return { map, bumpMap };
}

const v2 = (x, y) => new THREE.Vector2(x, y);

export function createPole(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch {
    return null;
  }
  if (!renderer.getContext()) return null;

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  const key = new THREE.DirectionalLight(0xfff1dc, 2.2); key.position.set(-3, 4, 5); scene.add(key);
  const rim = new THREE.DirectionalLight(0xc8a25c, 1.6); rim.position.set(4, 1, -3); scene.add(rim);

  const chrome = new THREE.MeshStandardMaterial({ color: 0xdedbd6, metalness: 1, roughness: 0.14, envMapIntensity: 1.25 });
  const darkChrome = new THREE.MeshStandardMaterial({ color: 0x8a8580, metalness: 1, roughness: 0.25 });

  const root = new THREE.Group();   // التحريك العام (مكان، ميلان، سكرول)
  const pole = new THREE.Group();   // العمود نفسه
  root.add(pole); scene.add(root);

  const H = 3.0, R = 0.6;

  // الأسطوانة المخططة (هي اللي بتلف)
  const { map, bumpMap } = stripeTextures();
  const stripeMat = new THREE.MeshPhysicalMaterial({
    map, bumpMap, bumpScale: 2.2, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.9,
  });
  const stripes = new THREE.Mesh(new THREE.CylinderGeometry(R, R, H, 128, 1, true), stripeMat);
  pole.add(stripes);

  // الزجاج
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(R + 0.12, R + 0.12, H, 96, 1, true),
    new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.16,
      clearcoat: 1, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false,
    }),
  );
  pole.add(glass);

  // أعمدة الكروم الرفيعة حوالين الزجاج
  const rodGeo = new THREE.CylinderGeometry(0.022, 0.022, H, 12);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const rod = new THREE.Mesh(rodGeo, chrome);
    rod.position.set(Math.cos(a) * (R + 0.16), 0, Math.sin(a) * (R + 0.16));
    pole.add(rod);
  }

  // الغطاء العلوي: حلقات مكدّسة ثم قبّة ثم زر
  const top = new THREE.Mesh(new THREE.LatheGeometry([
    v2(R + 0.1, 0), v2(R + 0.22, 0.02), v2(R + 0.24, 0.07), v2(R + 0.22, 0.12), v2(R + 0.14, 0.14),
    v2(R + 0.2, 0.17), v2(R + 0.21, 0.22), v2(R + 0.18, 0.26), v2(R + 0.06, 0.29), v2(R + 0.1, 0.32),
    v2(R + 0.1, 0.37), v2(R - 0.02, 0.42), v2(0.44, 0.52), v2(0.3, 0.64), v2(0.16, 0.71),
    v2(0.09, 0.74), v2(0.09, 0.8), v2(0.13, 0.83), v2(0.13, 0.88), v2(0.06, 0.92), v2(0.001, 0.93),
  ], 96), chrome);
  top.position.y = H / 2;
  pole.add(top);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.11, 48, 32), chrome);
  knob.position.y = H / 2 + 1.02;
  pole.add(knob);

  // القاعدة
  const base = new THREE.Mesh(new THREE.LatheGeometry([
    v2(0.001, -0.7), v2(R + 0.02, -0.7), v2(R + 0.1, -0.66), v2(R + 0.1, -0.6), v2(R - 0.02, -0.55),
    v2(R - 0.1, -0.46), v2(R + 0.04, -0.38), v2(R + 0.14, -0.3), v2(R + 0.15, -0.24), v2(R + 0.22, -0.18),
    v2(R + 0.24, -0.1), v2(R + 0.22, -0.03), v2(R + 0.1, 0),
  ], 96), chrome);
  base.position.y = -H / 2;
  pole.add(base);

  // حلقة داكنة رفيعة فوق وتحت الزجاج لعمق إضافي
  for (const y of [H / 2 - 0.01, -H / 2 + 0.01]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.12, 0.018, 12, 96), darkChrome);
    ring.rotation.x = Math.PI / 2; ring.position.y = y; pole.add(ring);
  }

  pole.position.y = -0.1;

  // -------- الحالة
  const state = {
    intro: 0,      // 0 = لقطة قريبة على الخطوط، 1 = العمود كامل
    dock: 0,       // 0 = بالنص، 1 = على جنب (بعد «ادخل»)
    scroll: 0,     // كم نزلنا عن الهيرو
    spin: 1,
    px: 0, py: 0, // حركة الماوس
  };
  let tpx = 0, tpy = 0;
  let running = true, raf = 0, last = performance.now();
  let w = 1, h = 1;

  function resize() {
    w = canvas.clientWidth || window.innerWidth;
    h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    state.px += (tpx - state.px) * 0.05;
    state.py += (tpy - state.py) * 0.05;

    stripes.rotation.y -= dt * 0.9 * state.spin;

    const e = ease(clamp01(state.intro));
    const aspect = w / h;
    // المسافة الكاملة بتتأقلم مع الشاشات الضيقة (الموبايل) حتى يبان العمود كامل
    const far = aspect < 0.7 ? 12.2 : 10.2;
    camera.position.set(state.px * 0.25, lerp(0.55, 0.25, e), lerp(2.0, far, e));
    camera.lookAt(0, lerp(0.45, 0.15, e), 0);

    const d = ease(clamp01(state.dock));
    const halfW = Math.tan((camera.fov * Math.PI) / 360) * far * aspect;
    const side = aspect > 1.05 ? -halfW * 0.5 : 0;
    root.position.x = lerp(0, side, d);
    root.position.y = state.scroll * 3.2;
    const sc = lerp(1, aspect > 1.05 ? 0.92 : 0.8, d);
    root.scale.setScalar(sc);
    root.rotation.z = lerp(-0.22, 0, e) + state.px * 0.03;
    root.rotation.x = lerp(0.12, 0, e) + state.py * 0.05;
    pole.rotation.y = (1 - e) * 0.9 + state.px * 0.35 + state.scroll * 1.6;

    renderer.render(scene, camera);
    if (running) raf = requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', (ev) => {
    tpx = (ev.clientX / window.innerWidth) * 2 - 1;
    tpy = (ev.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });
  raf = requestAnimationFrame(frame);

  return {
    state,
    pause() { if (running) { running = false; cancelAnimationFrame(raf); } },
    resume() { if (!running) { running = true; last = performance.now(); raf = requestAnimationFrame(frame); } },
    renderOnce() { last = performance.now(); frame(last); },
    get running() { return running; },
  };
}
