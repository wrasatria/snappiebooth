/* ar.js - efek wajah real-time (Love, Sparkle) untuk halaman capture.
   Pelacakan wajah: MediaPipe Face Landmarker (jalan sepenuhnya di perangkat, tidak ada foto yang dikirim ke server).
   Kecepatan:
   - Model + runtime diunduh PARALEL (dulu berurutan) dan dipanaskan di cache browser.
   - Mulai diunduh di latar belakang begitu halaman capture dibuka (kecuali Data Saver / koneksi lambat),
     jadi saat user menekan efek biasanya sudah siap.
   - Laju deteksi menyesuaikan kekuatan perangkat (HP lemah otomatis lebih jarang mendeteksi).
   Semua gambar efek digambar vektor di canvas (tanpa aset).
   Gagal-aman: kalau library/model gagal dimuat, efek dimatikan dan kamera tetap normal. */
(function () {
  "use strict";
  const MP_VERSION = "0.10.3";   // versi paket yang dipin; ganti hanya setelah dites
  const MP_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + MP_VERSION;
  /* Mau tanpa CDN? Unduh file ini ke assets/face_landmarker.task lalu ganti nilainya jadi "assets/face_landmarker.task" */
  const MODEL = "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

  const $ = s => document.querySelector(s);
  const row = $("#arRow"), msg = $("#arMsg");
  if (!row) return;
  const NONE = "none", EFFECTS = ["love", "sparkle"];

  /* ---------- pemuatan model ---------- */
  let lm = null, loading = null, errs = 0, lastDet = 0, lastT = -1, detMs = 0, interval = 45;
  const conn = navigator.connection || {};
  const canPreload = !conn.saveData && (!conn.effectiveType || conn.effectiveType === "4g");

  const fetchModel = () => fetch(MODEL).then(r => { if (!r.ok) throw new Error("model " + r.status); return r.arrayBuffer(); }).then(b => new Uint8Array(b));
  async function load() {
    if (lm) return lm;
    if (loading) return loading;
    loading = (async () => {
      const modelP = fetchModel();                                            // unduh model sambil library dimuat (paralel)
      modelP.catch(() => {});                                                  // cegah "unhandled rejection" kalau gagal
      ["/wasm/vision_wasm_internal.js", "/wasm/vision_wasm_internal.wasm"].forEach(f => fetch(MP_BASE + f).catch(() => {}));   // hangatkan cache runtime
      const mod = await import(MP_BASE + "/vision_bundle.mjs");
      const vision = await mod.FilesetResolver.forVisionTasks(MP_BASE + "/wasm");
      const opts = base => ({
        baseOptions: base, runningMode: "VIDEO", numFaces: 3,
        minFaceDetectionConfidence: .5, minFacePresenceConfidence: .5, minTrackingConfidence: .5, outputFaceBlendshapes: false
      });
      let buf = null; try { buf = await modelP; } catch (e) { console.warn("Model gagal diunduh paralel, coba lewat library", e); }
      const tries = [];
      if (buf) { tries.push(() => mod.FaceLandmarker.createFromOptions(vision, opts({ modelAssetBuffer: buf.slice(), delegate: "GPU" })));
                 tries.push(() => mod.FaceLandmarker.createFromOptions(vision, opts({ modelAssetBuffer: buf.slice(), delegate: "CPU" }))); }
      tries.push(() => mod.FaceLandmarker.createFromOptions(vision, opts({ modelAssetPath: MODEL, delegate: "CPU" })));
      let last = null;
      for (const t of tries) { try { lm = await t(); return lm; } catch (e) { last = e; console.warn("Inisialisasi face landmarker gagal, coba cara lain", e); } }
      throw last;
    })();
    try { return await loading; } finally { loading = null; }
  }
  /* unduh di latar belakang saat halaman capture terbuka (hanya jika koneksi memadai) */
  function preload() { if (canPreload && !lm && !loading && !AR.provider) load().catch(() => {}); }
  const idle = fn => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 1200));
  new MutationObserver(() => { if (document.body.dataset.page === "capture") idle(preload); }).observe(document.body, { attributes: true, attributeFilter: ["data-page"] });
  if (document.body.dataset.page === "capture") idle(preload);

  /* ---------- deteksi + penghalusan pose per wajah ---------- */
  const IDX = { top: 10, chin: 152, left: 234, right: 454, eyeL: 33, eyeR: 263 };   // titik tepi wajah + sudut mata (indeks standar FaceMesh)
  let tracks = [];
  const lerp = (a, b, k) => a + (b - a) * k;

  function poseOf(pts, w, h) {
    const P = i => ({ x: pts[i].x * w, y: pts[i].y * h });
    const top = P(IDX.top), chin = P(IDX.chin), l = P(IDX.left), r = P(IDX.right), e1 = P(IDX.eyeL), e2 = P(IDX.eyeR);
    return {
      top,
      fw: Math.hypot(r.x - l.x, r.y - l.y), fh: Math.hypot(chin.x - top.x, chin.y - top.y),
      roll: Math.atan2(e2.y - e1.y, e2.x - e1.x)
    };
  }
  function update(faces, w, h, now) {
    const seen = new Set();
    faces.forEach(pts => {
      if (!pts || pts.length < 455) return;
      const p = poseOf(pts, w, h);
      if (!(p.fw > 20)) return;
      let best = null, bd = Infinity;
      tracks.forEach(t => { if (seen.has(t)) return; const d = Math.hypot(t.top.x - p.top.x, t.top.y - p.top.y); if (d < bd) { bd = d; best = t; } });
      if (best && bd < p.fw * .9) {
        const k = .6;
        best.top = { x: lerp(best.top.x, p.top.x, k), y: lerp(best.top.y, p.top.y, k) };
        best.fw = lerp(best.fw, p.fw, k); best.fh = lerp(best.fh, p.fh, k); best.roll = lerp(best.roll, p.roll, k);
        best.seen = now; seen.add(best);
      } else { const t = Object.assign({ a: 0, seen: now, born: now }, p); tracks.push(t); seen.add(t); }
    });
    tracks.forEach(t => { t.a = seen.has(t) ? Math.min(1, t.a + .25) : Math.max(0, t.a - .12); });   // fade in/out halus
    tracks = tracks.filter(t => t.a > .02 || now - t.seen < 400);
  }

  /* ---------- gambar efek (vektor) ---------- */
  function heart(c, x, y, s, rot, a) {
    c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = a;
    c.beginPath(); c.moveTo(0, s * .9);
    c.bezierCurveTo(-s * 1.6, -s * .1, -s * .9, -s * 1.2, 0, -s * .4);
    c.bezierCurveTo(s * .9, -s * 1.2, s * 1.6, -s * .1, 0, s * .9); c.closePath();
    const g = c.createLinearGradient(0, -s, 0, s); g.addColorStop(0, "#ff9fbb"); g.addColorStop(1, "#e11d55");
    c.fillStyle = g; c.fill();
    c.lineWidth = Math.max(1, s * .08); c.strokeStyle = "rgba(255,255,255,.55)"; c.stroke();
    c.globalAlpha = a * .75; c.fillStyle = "#fff"; c.beginPath(); c.ellipse(-s * .5, -s * .45, s * .22, s * .11, -.6, 0, 7); c.fill();
    c.restore();
  }
  function star(c, x, y, s, a, rot) {
    c.save(); c.translate(x, y); c.rotate(rot); c.globalAlpha = a;
    const g = c.createRadialGradient(0, 0, 0, 0, 0, s * 1.8); g.addColorStop(0, "rgba(255,244,214,.55)"); g.addColorStop(1, "rgba(255,244,214,0)");
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, s * 1.8, 0, 7); c.fill();
    c.fillStyle = "#fffaf0"; c.beginPath(); c.moveTo(0, -s);
    c.quadraticCurveTo(s * .14, -s * .14, s, 0); c.quadraticCurveTo(s * .14, s * .14, 0, s);
    c.quadraticCurveTo(-s * .14, s * .14, -s, 0); c.quadraticCurveTo(-s * .14, -s * .14, 0, -s); c.fill();
    c.restore();
  }
  /* posisi relatif wajah: u = sepanjang lebar wajah, v = ke atas dari dahi (kali tinggi wajah), z = ukuran (kali lebar wajah) */
  const LOVE = [[-.60, .10, .12], [-.38, .24, .17], [-.15, .32, .09], [.06, .36, .14], [.27, .31, .08], [.46, .24, .16], [.66, .10, .11], [-.82, .26, .07], [.84, .30, .10]];
  const SPARK = [[-.78, .40, .13], [-.58, .02, .08], [-.72, -.30, .10], [.76, -.02, .11], [.58, .38, .08], [.84, -.34, .08], [-.28, .46, .07], [.30, .50, .10], [.02, .62, .07]];

  function drawFace(c, t, kind, now) {
    const s = now / 1000, cr = Math.cos(t.roll), sr = Math.sin(t.roll);
    const at = (u, v) => ({ x: t.top.x + cr * u * t.fw + sr * v * t.fh, y: t.top.y + sr * u * t.fw - cr * v * t.fh });   // right=(cr,sr), up=(sr,-cr)
    if (kind === "love") {
      LOVE.forEach(([u, v, z], i) => {
        const bob = Math.sin(s * 2.2 + i * 1.3) * .035, pulse = 1 + Math.sin(s * 3 + i * 1.7) * .07, p = at(u, v + bob);
        heart(c, p.x, p.y, z * t.fw * pulse, t.roll + Math.sin(s * 1.5 + i) * .12, .93 * t.a);
      });
    } else if (kind === "sparkle") {
      SPARK.forEach(([u, v, z], i) => {
        const tw = .5 + .5 * Math.sin(s * 4 + i * 2.3), p = at(u, v);
        star(c, p.x, p.y, z * t.fw * (.55 + .6 * tw), (.35 + .65 * tw) * t.a, t.roll + s * .4);
      });
    }
  }

  /* ---------- API untuk beauty.js ---------- */
  const AR = {
    effect: NONE,
    provider: null,   // hook uji: (video, now) => array of landmark arrays. Di produksi dibiarkan null (pakai MediaPipe).
    draw(c, w, h, video, now) {
      if (this.effect === NONE) return;
      try {
        if (now - lastDet > interval && video.currentTime !== lastT) {   // deteksi berkala, gambar tiap frame
          lastDet = now; lastT = video.currentTime;
          const t0 = performance.now();
          const faces = this.provider ? this.provider(video, now) : (lm ? (lm.detectForVideo(video, t0).faceLandmarks || []) : []);
          detMs = lerp(detMs, performance.now() - t0, .3);
          interval = Math.min(140, Math.max(45, detMs * 2.2));          // perangkat lambat -> deteksi lebih jarang, kamera tetap mulus
          update(faces, w, h, now); errs = 0;
        }
      } catch (e) { if (++errs > 8) { console.warn("Deteksi wajah dimatikan:", e); this.set(NONE); setMsg("Face effects stopped. Try again."); } }
      tracks.forEach(t => t.a > .02 && drawFace(c, t, this.effect, now));
    },
    async set(name) {
      if (name !== NONE && !EFFECTS.includes(name)) return;
      if (name === NONE) { this.effect = NONE; tracks = []; sync(); window.Beauty && Beauty.refresh(); return; }
      setMsg(""); const chip = row.querySelector('[data-ar="' + name + '"]'), label = chip.textContent;
      if (!this.provider && !lm) {
        chip.textContent = "Loading…"; row.classList.add("busy");
        try { await load(); } catch (e) {
          console.warn("Efek wajah gagal dimuat:", e); chip.textContent = label; row.classList.remove("busy");
          setMsg("Couldn't load face effects. Check your connection and try again."); return;
        }
        chip.textContent = label; row.classList.remove("busy");
      }
      this.effect = name; errs = 0; tracks = []; sync(); window.Beauty && Beauty.refresh();
    }
  };
  function sync() { row.querySelectorAll("[data-ar]").forEach(b => { const on = b.dataset.ar === AR.effect; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }); }
  function setMsg(t) { if (msg) msg.textContent = t; }

  row.addEventListener("click", e => { const b = e.target.closest("[data-ar]"); if (b && !row.classList.contains("lock") && !row.classList.contains("busy")) AR.set(b.dataset.ar); });
  sync();
  window.AR = AR;
})();
