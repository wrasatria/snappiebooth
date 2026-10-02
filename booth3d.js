/* Hero 3D photobooth. Decorative only; falls back to the SVG illustration
   if WebGL / three.js is unavailable. Needs three.js r128 loaded first. */
(function () {
  const wrap = document.querySelector(".hm-booth-wrap");
  if (!wrap) return;
  if (!window.THREE) { wrap.classList.add("no3d"); return; }   // three.js gagal dimuat: tampilkan ilustrasi SVG
  const T = THREE;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try {
    renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
  } catch (e) { wrap.classList.add("no3d"); return; }   // WebGL tidak tersedia: tampilkan ilustrasi SVG
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  const cvs = renderer.domElement;
  cvs.className = "hm-booth3d"; cvs.setAttribute("aria-hidden", "true");
  wrap.appendChild(cvs);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(33, 0.766, 0.1, 50);
  camera.position.set(0.9, 1.9, 7.4); camera.lookAt(0, 1.55, 0);

  /* ---------- procedural textures ---------- */
  function woodTex(base, dark) {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    const g = c.getContext("2d"); g.fillStyle = base; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 160; i++) {
      g.strokeStyle = (i % 3 ? dark : "#ffffff") + (i % 3 ? "22" : "0d");
      g.lineWidth = 0.6 + Math.random() * 2.4;
      const x = Math.random() * 256, w = (Math.random() - .5) * 10;
      g.beginPath(); g.moveTo(x, 0);
      g.bezierCurveTo(x + w, 80, x - w, 170, x + w * .5, 256); g.stroke();
    }
    const t = new T.CanvasTexture(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.encoding = T.sRGBEncoding;
    t.anisotropy = 4; return t;
  }
  function signTex() {
    const c = document.createElement("canvas"); c.width = 512; c.height = 160;
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    const draw = () => {
      const g = c.getContext("2d");
      g.fillStyle = "#f5ebd7"; g.fillRect(0, 0, 512, 160);
      g.strokeStyle = "#541711"; g.lineWidth = 3; g.strokeRect(10, 10, 492, 140);
      if (wm.complete && wm.naturalWidth) { const h = 70, w = h * wm.naturalWidth / wm.naturalHeight; g.drawImage(wm, (512 - w) / 2, (160 - h) / 2, w, h); }
      t.needsUpdate = true;
    };
    const wm = new Image(); wm.onload = draw; wm.src = "assets/logo-wordmark-burgundy.svg";
    draw();
    return t;
  }

  /* ---------- helpers ---------- */
  const booth = new T.Group(); scene.add(booth);
  const mats = {
    wood: new T.MeshStandardMaterial({ map: woodTex("#6b3a22", "#2a1208"), roughness: .6, metalness: .03 }),
    woodLight: new T.MeshStandardMaterial({ map: woodTex("#9a6238", "#3a1a0a"), roughness: .5, metalness: .05 }),
    inner: new T.MeshStandardMaterial({ color: 0xe2c49a, roughness: .85 }),
    floor: new T.MeshStandardMaterial({ color: 0x3b1a12, roughness: .7 }),
    gold: new T.MeshStandardMaterial({ color: 0xd9b36a, metalness: .85, roughness: .32 }),
    chrome: new T.MeshStandardMaterial({ color: 0xcfcfcf, metalness: .9, roughness: .25 }),
    seat: new T.MeshStandardMaterial({ color: 0x76241e, roughness: .55 }),
    pot: new T.MeshStandardMaterial({ color: 0xa8553a, roughness: .8 }),
    leaf: new T.MeshStandardMaterial({ color: 0x3f6a3c, roughness: .7 })
  };
  function box(w, h, d, m, x, y, z) {
    const o = new T.Mesh(new T.BoxGeometry(w, h, d), m); o.position.set(x, y, z); booth.add(o); return o;
  }
  function cyl(rt, rb, h, m, x, y, z, seg) {
    const o = new T.Mesh(new T.CylinderGeometry(rt, rb, h, seg || 32), m); o.position.set(x, y, z); booth.add(o); return o;
  }

  /* ---------- structure ---------- */
  box(1.78, .12, 1.7, mats.floor, 0, .06, 0);                       // plinth
  box(1.62, .02, 1.5, mats.floor, 0, .13, 0);                       // inner floor
  box(1.62, 2.3, .08, mats.inner, 0, 1.27, -.72);                   // back wall
  box(.08, 2.3, 1.5, mats.wood, -.77, 1.27, 0);                     // side walls
  box(.08, 2.3, 1.5, mats.wood, .77, 1.27, 0);
  box(1.8, .1, 1.72, mats.wood, 0, 2.47, 0);                        // roof
  box(.15, 2.3, .15, mats.woodLight, -.74, 1.27, .72);              // pillars
  box(.15, 2.3, .15, mats.woodLight, .74, 1.27, .72);
  box(1.64, .15, .15, mats.woodLight, 0, 2.36, .72);                // lintel
  box(1.8, .06, .2, mats.woodLight, 0, .15, .78);                   // kick board

  // sign
  const st = signTex();
  const signMats = [0, 1, 2, 3, 4, 5].map(i => i === 4 ? new T.MeshStandardMaterial({ map: st, emissive: 0xffe2b0, emissiveMap: st, emissiveIntensity: .45, roughness: .6 }) : mats.woodLight);
  const sign = new T.Mesh(new T.BoxGeometry(1.2, .38, .14), signMats); sign.position.set(0, 2.78, .66); booth.add(sign);
  const bulbs = [];
  for (let i = 0; i < 8; i++) {
    const b = new T.Mesh(new T.SphereGeometry(.035, 12, 12), new T.MeshBasicMaterial({ color: 0xffd48a }));
    b.position.set(-.6 + i * (1.2 / 7), 3.0, .68); b.userData.skip = true; booth.add(b); bulbs.push(b);
  }

  // curtain rod + pleated curtains
  const rod = cyl(.022, .022, 1.62, mats.gold, 0, 2.2, .66, 16); rod.rotation.z = Math.PI / 2;
  function curtain(w, h, dir) {
    const g = new T.PlaneGeometry(w, h, 56, 1); g.translate(dir * w / 2, 0, 0);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = Math.abs(p.getX(i)) / w;
      p.setZ(i, Math.sin(u * Math.PI * 2 * 5.5) * .05 + Math.sin(u * 17) * .008);
    }
    g.computeVertexNormals();
    return new T.Mesh(g, new T.MeshStandardMaterial({ color: 0x6e1f19, roughness: .92, side: T.DoubleSide }));
  }
  const cl = new T.Group(), cr = new T.Group();
  cl.position.set(-.71, 1.2, .66); cl.add(curtain(.74, 2.0, 1));
  cr.position.set(.71, 1.2, .66); cr.add(curtain(.74, 2.0, -1));
  booth.add(cl, cr);

  // interior props
  cyl(.17, .19, .04, mats.chrome, 0, .17, -.12);
  cyl(.04, .04, .46, mats.chrome, 0, .4, -.12, 16);
  cyl(.25, .25, .09, mats.seat, 0, .66, -.12);
  cyl(.1, .08, .2, mats.pot, -.52, .25, -.46, 24);
  for (let i = 0; i < 7; i++) {
    const l = new T.Mesh(new T.SphereGeometry(.1, 14, 14), mats.leaf);
    const a = i / 7 * Math.PI * 2;
    l.scale.set(.35, 1.5, .12); l.position.set(-.52 + Math.cos(a) * .07, .5, -.46 + Math.sin(a) * .07);
    l.rotation.set(Math.sin(a) * .7, 0, -Math.cos(a) * .7); booth.add(l);
  }
  // photo strip slot on right pillar side + hanging strip
  box(.2, .02, .06, new T.MeshStandardMaterial({ color: 0x0d0504 }), .74, 1.0, .82);

  /* ---------- ground shadow + lights ---------- */
  const ground = new T.Mesh(new T.PlaneGeometry(10, 10), new T.ShadowMaterial({ opacity: .38 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

  scene.add(new T.HemisphereLight(0xffd9b8, 0x2a0d09, .55));
  const key = new T.DirectionalLight(0xfff0dc, 1.15); key.position.set(-3, 5, 4.5); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 5; key.shadow.camera.left = -5; key.shadow.camera.right = 5;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -3; key.shadow.camera.near = 1; key.shadow.camera.far = 14;
  key.shadow.bias = -.0004; scene.add(key);
  const rim = new T.DirectionalLight(0xff9a78, .6); rim.position.set(4, 3, -3); scene.add(rim);
  const warm = new T.PointLight(0xffb067, 1.7, 5, 2); warm.position.set(0, 1.95, .05); booth.add(warm);

  booth.traverse(o => { if (o.isMesh && !o.userData.skip) { o.castShadow = true; o.receiveShadow = true; } });
  cl.traverse(o => { if (o.isMesh) o.castShadow = true; });

  /* ---------- sizing, pointer, loop ---------- */
  function resize() {
    const w = wrap.clientWidth, h = wrap.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    if (reduce) renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(wrap); resize();

  let px = 0, py = 0, tx = 0, ty = 0, flash = 0, t0 = performance.now(), visible = true, raf = 0;
  if (matchMedia("(hover:hover)").matches) addEventListener("pointermove", e => {
    tx = (e.clientX / innerWidth - .5); ty = (e.clientY / innerHeight - .5);
  }, { passive: true });
  document.addEventListener("click", e => { if (e.target.closest("[data-start]")) flash = 1; });

  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  function setOpen(k) { const s = 1 - .7 * k; cl.scale.x = s; cr.scale.x = s; }

  function frame(now) {
    const t = (now - t0) / 1000;
    setOpen(ease(Math.min(1, Math.max(0, (t - .35) / 1.6))));
    px += (tx - px) * .06; py += (ty - py) * .06;
    booth.rotation.y = -.3 + px * .7 + Math.sin(t * .6) * .05;
    booth.rotation.x = py * .06;
    flash *= .9;
    warm.intensity = 1.7 + Math.sin(t * 1.3) * .08 + flash * 9;
    bulbs.forEach((b, i) => b.material.color.setHex(((Math.floor(t * 2.2) + i) % 2) ? 0xffd48a : 0x8a6a40));
    cl.children[0].rotation.y = Math.sin(t * .9) * .015; cr.children[0].rotation.y = Math.sin(t * .9 + 1.7) * .015;
    renderer.render(scene, camera);
    raf = visible && document.visibilityState === "visible" ? requestAnimationFrame(frame) : 0;
  }
  function start() { if (!raf && !reduce) raf = requestAnimationFrame(frame); }

  if (reduce) { setOpen(1); booth.rotation.y = -.3; renderer.render(scene, camera); }
  else {
    new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible) start(); }).observe(wrap);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") start(); });
    start();
  }
  wrap.classList.add("is3d");
})();
