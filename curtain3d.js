/* Capture page: 3D velvet curtains over the camera window (decorative only).
   Cloth-style motion: the hem trails the rod, folds deepen as fabric gathers,
   the inner corner lifts like a tie-back. The loop stops once the curtains are
   open (final pose is a still frame), so nothing keeps running while the camera
   and recorder are in use.
   Falls back to the CSS drapes if WebGL / three.js is unavailable. */
(function () {
  const stage = document.querySelector("#capture .stage");
  const fx = stage && stage.querySelector(".booth-fx");
  if (!fx || !window.THREE) return;
  const T = THREE;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try { renderer = new T.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
  catch (e) { return; }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.NoToneMapping;   // ACES washed the red out toward pink/orange
  const cvs = renderer.domElement; cvs.className = "c3d"; cvs.setAttribute("aria-hidden", "true");
  fx.appendChild(cvs);

  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(35, 4 / 3, 0.1, 30);
  const D = 5, H = 2 * D * Math.tan(T.MathUtils.degToRad(17.5));
  camera.position.set(0, 0, D);

  scene.add(new T.HemisphereLight(0xffb59a, 0x120303, .5));
  const spot = new T.SpotLight(0xffd9b0, 2.2, 16, 1.2, 1, 1.3); spot.position.set(0, 3.4, 4.4); spot.target.position.set(0, -.6, 0);
  scene.add(spot, spot.target);
  const fill = new T.PointLight(0xc4392b, .7, 9, 2); fill.position.set(0, -.8, 2.4); scene.add(fill);

  /* velvet: base colour x per-vertex fold shading + a soft rim sheen */
  /* three r128 reads hex colours as linear, which made the velvet look pale once the
     sRGB output was applied; convert so the on-screen colour is the real brand burgundy. */
  const burgundy = new T.Color(0x6e1a16).convertSRGBToLinear();
  const mat = new T.MeshStandardMaterial({ color: burgundy, vertexColors: true, roughness: .92, metalness: 0, side: T.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace("#include <tonemapping_fragment>",
      "float fr = pow(1.0 - saturate(abs(dot(normalize(vNormal), normalize(vViewPosition)))), 2.2);\n" +
      "gl_FragColor.rgb += vec3(.42, .06, .045) * fr * .5;\n#include <tonemapping_fragment>");
  };

  const SX = 84, SY = 10, CNT = (SX + 1) * (SY + 1);
  const left = new T.Group(), right = new T.Group(); scene.add(left, right);

  function makeCloth() {
    const g = new T.PlaneGeometry(1, 1, SX, SY);
    const U = new Float32Array(CNT), V = new Float32Array(CNT), FA = new Float32Array(CNT), col = new Float32Array(CNT * 3);
    for (let iy = 0, i = 0; iy <= SY; iy++) for (let ix = 0; ix <= SX; ix++, i++) {
      const u = ix / SX, v = iy / SY;
      const ph = u * Math.PI * 2 * 6.5 + Math.sin(u * 9 + v * 1.6) * .9 + v * Math.sin(u * 5.3) * .7;
      const f = Math.sin(ph) * .72 + Math.sin(u * Math.PI * 2 * 15.5 + 2 + v * 1.2) * .2 + Math.sin(u * Math.PI * 2 * 3.1 + 1.1) * .18;
      const amp = .05 + .13 * Math.pow(v, .8);
      U[i] = u; V[i] = v; FA[i] = f * amp;
      const s = .5 + .5 * (f * .5 + .5);               // valleys darker, ridges lighter
      col[i * 3] = s; col[i * 3 + 1] = s; col[i * 3 + 2] = s;
    }
    g.setAttribute("color", new T.BufferAttribute(col, 3));
    const m = new T.Mesh(g, mat);
    m.userData = { U, V, FA }; m.frustumCulled = false; return m;
  }
  const pl = makeCloth(), pr = makeCloth(); left.add(pl); right.add(pr);

  let W = H * 4 / 3, pw = W / 2 * 1.08, Hc = H * 1.25;
  const clamp01 = x => Math.max(0, Math.min(1, x));
  const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

  function cloth(m, dir, k) {
    const { U, V, FA } = m.userData, p = m.geometry.attributes.position;
    for (let i = 0; i < CNT; i++) {
      const u = U[i], v = V[i];
      const kk = clamp01(k * 1.35 - v * .35);               // hem lags behind the rod
      const e = ease(kk);
      const x = dir * u * pw * (1 - .8 * e);
      const z = FA[i] * (1 + 1.8 * e)
        + Math.sin(Math.PI * kk) * .14 * v;                  // billow while moving
      const y = (.5 - v) * Hc + e * u * v * v * .42;         // inner corner lifts (tie-back)
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true; m.geometry.computeVertexNormals();
  }
  function pose(kL, kR) { cloth(pl, 1, kL); cloth(pr, -1, kR); }

  function layout() {
    const w = stage.clientWidth, h = stage.clientHeight; if (!w || !h) return false;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    W = H * w / h; pw = W / 2 * 1.08; Hc = H * 1.25;
    left.position.set(-W / 2 - .02, 0, 0); right.position.set(W / 2 + .02, 0, -.04);
    return true;
  }

  let raf = 0, t0 = 0, last = 0, active = false;
  const DELAY = 240, DUR = 2000;
  function frame(now) {
    if (!active) return;
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;                             // ~30fps is plenty for cloth
    last = now;
    const el = now - t0 - DELAY;
    pose(clamp01(el / DUR), clamp01((el - 120) / DUR));
    renderer.render(scene, camera);
    if (el >= DUR + 120) stop();                             // curtains open: hold the still frame, free the CPU/GPU
  }
  function stop() { active = false; cancelAnimationFrame(raf); }
  function play() {
    stop(); if (!layout()) return; stage.classList.add("has3d");
    if (reduce) { pose(1, 1); renderer.render(scene, camera); return; }
    active = true; t0 = performance.now(); last = 0; frame(t0);
  }

  new MutationObserver(() => { document.body.dataset.page === "capture" ? play() : stop(); })
    .observe(document.body, { attributes: true, attributeFilter: ["data-page"] });
  new ResizeObserver(() => {
    if (document.body.dataset.page !== "capture" || !layout()) return;
    if (reduce || !active) { pose(1, 1); renderer.render(scene, camera); }
  }).observe(stage);
})();
