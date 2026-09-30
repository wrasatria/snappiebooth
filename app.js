const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const wait = ms => new Promise(r => setTimeout(r, ms));
const S = { photos: [], clips: [], tpl: TEMPLATES[0], filter: "original", live: true, retake: null, busy: false, stream: null, cd: 3 };
const MT = window.MediaRecorder && ["video/mp4", "video/webm;codecs=vp9", "video/webm"].find(t => MediaRecorder.isTypeSupported(t));
const cv = $("#strip"), cx = cv.getContext("2d", { willReadFrequently: true });
const tmp = document.createElement("canvas"), tx = tmp.getContext("2d", { willReadFrequently: true });
let vids = [], raf = 0, last = 0;
const frames = {};

/* ---------- navigasi ---------- */
function go(p) {
  document.body.dataset.page = p;
  ["home", "capture", "review", "result"].forEach(n => $("#" + n).hidden = n !== p);
  scrollTo(0, 0);
  p === "capture" ? startCam() : stopCam();
  p === "review" && renderReview();
  p === "result" ? startResult() : stopLoop();
}
function reset() { S.photos = []; S.clips = []; S.retake = null; }
$$("[data-start]").forEach(b => b.onclick = () => { reset(); go("capture"); });
$$("[data-go]").forEach(a => a.onclick = e => { e.preventDefault(); go(a.dataset.go); });
$$("[data-retake-all]").forEach(b => b.onclick = () => { reset(); go("capture"); });
$("#resetCap").onclick = () => { if (!S.busy) { reset(); renderThumbs(); } };
$("#cont").onclick = () => go("result");

/* ---------- kamera ---------- */
async function startCam() {
  renderThumbs();
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    $("#cam").srcObject = S.stream; $("#msg").hidden = true; $("#shoot").disabled = false;
  } catch (e) {
    $("#msg").hidden = false; $("#shoot").disabled = true;
    $("#msg").textContent = location.protocol === "http:" && location.hostname !== "localhost"
      ? "Kamera hanya bisa dipakai lewat HTTPS." : "Kamera tidak bisa diakses. Izinkan kamera di pengaturan browser, lalu muat ulang halaman.";
  }
}
function stopCam() { S.stream && S.stream.getTracks().forEach(t => t.stop()); S.stream = null; }
function startRec() {
  if (!MT || !S.stream) return null;
  const ch = [], r = new MediaRecorder(S.stream, { mimeType: MT });
  r.ondataavailable = e => e.data.size && ch.push(e.data); r.ch = ch; r.start(); return r;
}
const stopRec = r => new Promise(res => { if (!r) return res(null); r.onstop = () => res(URL.createObjectURL(new Blob(r.ch, { type: MT }))); r.stop(); });

function snap() {
  const v = $("#cam"), c = document.createElement("canvas"); c.width = 1280; c.height = 960;
  const k = Math.max(1280 / v.videoWidth, 960 / v.videoHeight), dw = v.videoWidth * k, dh = v.videoHeight * k;
  c.getContext("2d").drawImage(v, (1280 - dw) / 2, (960 - dh) / 2, dw, dh);
  const img = new Image(); img.src = c.toDataURL("image/jpeg", .92); return img;
}
$("#shoot").onclick = async () => {
  if (S.busy || !S.stream) return;
  S.busy = true; $("#shoot").disabled = true;
  const i = S.retake ?? S.photos.length; let rec = null;
  for (let c = S.cd; c >= 1; c--) { $("#count").textContent = c; if (c === Math.min(2, S.cd)) rec = startRec(); await wait(1000); }
  $("#count").textContent = "";
  const f = $("#flash"); f.classList.remove("on"); void f.offsetWidth; f.classList.add("on");
  const img = snap(); await wait(500);
  S.clips[i] = await stopRec(rec); S.photos[i] = img; await img.decode().catch(() => {});
  renderThumbs(); S.busy = false; $("#shoot").disabled = false;
  if (S.retake !== null) { S.retake = null; go("review"); }
  else if (S.photos.filter(Boolean).length === 4) { await wait(600); go("review"); }
};
function renderThumbs() {
  $("#thumbs").innerHTML = [0, 1, 2, 3].map(i => `<div class="thumb">${S.photos[i] ? `<img src="${S.photos[i].src}" alt="">` : ""}<span class="tag">#${i + 1}</span></div>`).join("");
}
function renderReview() {
  $("#rvGrid").innerHTML = [0, 1, 2, 3].map(i => {
    const media = S.clips[i]
      ? `<video src="${S.clips[i]}" poster="${S.photos[i].src}" autoplay muted loop playsinline></video>`
      : `<img src="${S.photos[i].src}" alt="">`;
    return `<div class="rv-card"><div class="ph">${media}<span class="tag">#${i + 1}</span></div><button class="btn" data-i="${i}"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg> Retake this photo</button></div>`;
  }).join("");
  $$("#rvGrid video").forEach(v => v.play().catch(() => {}));
  $$("#rvGrid [data-i]").forEach(b => b.onclick = () => { S.retake = +b.dataset.i; go("capture"); });
}

/* ---------- strip: susun, filter, live ---------- */
function grade(w, h, f) {
  if (f === FILTERS.original) return;
  const d = tx.getImageData(0, 0, w, h), p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    let r = p[i] * f.bri + f.warm, g = p[i + 1] * f.bri + f.tint, b = p[i + 2] * f.bri - f.warm;
    const l = .3 * r + .59 * g + .11 * b;
    r = (l + (r - l) * f.sat - 128) * f.con + 128; g = (l + (g - l) * f.sat - 128) * f.con + 128; b = (l + (b - l) * f.sat - 128) * f.con + 128;
    p[i] = r * (1 - f.fade) + f.fade * 40; p[i + 1] = g * (1 - f.fade) + f.fade * 40; p[i + 2] = b * (1 - f.fade) + f.fade * 40;
  }
  tx.putImageData(d, 0, 0);
}
function drawStrip(srcs) {
  const t = S.tpl, f = FILTERS[S.filter];
  if (cv.width !== t.w || cv.height !== t.h) { cv.width = t.w; cv.height = t.h; }
  cx.fillStyle = t.bg; cx.fillRect(0, 0, t.w, t.h);
  t.slots.forEach((s, i) => {
    let src = srcs[i]; if (src && src.tagName === "VIDEO" && src.readyState < 2) src = S.photos[i];
    if (!src) return;
    tmp.width = s.w; tmp.height = s.h;
    const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight, k = Math.max(s.w / sw, s.h / sh), dw = sw * k, dh = sh * k;
    tx.save(); tx.translate(s.w, 0); tx.scale(-1, 1); tx.drawImage(src, (s.w - dw) / 2, (s.h - dh) / 2, dw, dh); tx.restore();
    grade(s.w, s.h, f);
    cx.save(); cx.translate(s.x + s.w / 2, s.y + s.h / 2); cx.rotate((s.r || 0) * Math.PI / 180);
    cx.beginPath(); cx.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, s.radius || 0); cx.clip(); cx.drawImage(tmp, -s.w / 2, -s.h / 2); cx.restore();
  });
  if (t.frame) { const im = frames[t.id] || (frames[t.id] = Object.assign(new Image(), { crossOrigin: "anonymous", src: t.frame })); im.complete && im.naturalWidth && cx.drawImage(im, 0, 0, t.w, t.h); }
  if (t.fs) { cx.fillStyle = t.ink; cx.textAlign = "center"; cx.font = `800 ${t.fs}px Manrope, sans-serif`; cx.fillText("snappie.", t.w / 2, t.ty); }
}
const render = () => drawStrip(S.live && vids.length ? vids : S.photos);
function loop(ts) { raf = requestAnimationFrame(loop); if (ts - last > 66) { last = ts; render(); } }
function stopLoop() { cancelAnimationFrame(raf); raf = 0; vids.forEach(v => v.pause && v.pause()); }
function syncLoop() { cancelAnimationFrame(raf); raf = 0; if (S.live) { vids.forEach(v => v.play && v.play().catch(() => {})); raf = requestAnimationFrame(loop); } else { vids.forEach(v => v.pause && v.pause()); render(); } }
function renderTplOpts() {
  $("#tplOpts").innerHTML = TEMPLATES.map(t => `<button class="opt${t === S.tpl ? " on" : ""}" data-t="${t.id}">${t.name}</button>`).join("");
  $("#tplCount").textContent = TEMPLATES.length;
}
window.refreshTplOpts = () => { if (!$("#result").hidden) renderTplOpts(); };
function startResult() {
  vids = S.clips.map((u, i) => { if (!u) return S.photos[i]; const v = document.createElement("video"); Object.assign(v, { src: u, muted: true, loop: true, playsInline: true }); return v; });
  renderTplOpts();
  $("#fltOpts").innerHTML = Object.entries(FILTERS).map(([k, f]) => `<button class="opt${k === S.filter ? " on" : ""}" data-f="${k}">${f.name}</button>`).join("");
  syncLoop();
}
$("#tplOpts").onclick = e => { const b = e.target.closest("[data-t]"); if (!b) return; S.tpl = TEMPLATES.find(t => t.id === b.dataset.t); $$("#tplOpts .opt").forEach(o => o.classList.toggle("on", o === b)); render(); };
$("#fltOpts").onclick = e => { const b = e.target.closest("[data-f]"); if (!b) return; S.filter = b.dataset.f; $$("#fltOpts .opt").forEach(o => o.classList.toggle("on", o === b)); render(); };
$("#liveBtn").onclick = () => { S.live = !S.live; $("#liveState").textContent = S.live ? "ON" : "OFF"; $("#liveBtn").classList.toggle("off", !S.live); syncLoop(); };

/* ---------- download ---------- */
function dl(url, name) { const a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); }
$("#savePng").onclick = () => { drawStrip(S.photos); cv.toBlob(b => { dl(URL.createObjectURL(b), "snappie-" + Date.now() + ".png"); render(); }, "image/png"); };
$("#saveVid").onclick = async () => {
  if (!MT || !vids.some(v => v.tagName === "VIDEO")) return alert("Video belum tersedia di browser ini.");
  const wasLive = S.live; S.live = true; syncLoop(); vids.forEach(v => { if (v.tagName === "VIDEO") v.currentTime = 0; });
  const r = new MediaRecorder(cv.captureStream(30), { mimeType: MT }), ch = []; r.ondataavailable = e => e.data.size && ch.push(e.data);
  r.start(); await wait(3000);
  await new Promise(res => { r.onstop = res; r.stop(); });
  dl(URL.createObjectURL(new Blob(ch, { type: MT })), "snappie-" + Date.now() + (MT.includes("mp4") ? ".mp4" : ".webm"));
  S.live = wasLive; syncLoop();
};

/* ---------- pengaturan countdown ---------- */
$("#cdSeg").onclick = e => {
  const b = e.target.closest("[data-cd]"); if (!b || S.busy) return;
  S.cd = +b.dataset.cd; $$("#cdSeg button").forEach(x => x.classList.toggle("on", x === b));
};
