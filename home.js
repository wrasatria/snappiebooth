/* Homepage-only behavior. Relies on globals from app.js/templates.js:
   S, TEMPLATES, reset(), go(). Adds no capture logic of its own. */
(function () {
  const root = document.documentElement;
  root.classList.add("hm-js");

  /* ---- scroll reveal ---- */
  const rv = [...document.querySelectorAll("#home .rv")];
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { threshold: 0.15, rootMargin: "0px 0px -6% 0px" });
    rv.forEach(el => io.observe(el));
  } else rv.forEach(el => el.classList.add("in"));

  /* ---- camera flash on any start button (does not delay navigation) ---- */
  const flash = document.getElementById("hmFlash");
  document.querySelectorAll("[data-start]").forEach(b => b.addEventListener("click", () => {
    if (!flash) return;
    flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on");
  }));

  /* ---- gallery: draw the real templates with soft placeholder portraits ---- */
  const gal = document.getElementById("hmGallery");
  const tones = [["#e9c9a0", "#c88e86"], ["#c88e86", "#76241e"], ["#d8c5a6", "#e9c9a0"], ["#76241e", "#541711"]];
  const imgs = {};
  const GALLERY_MAX = 4; // jumlah strip di homepage, diambil berdasarkan sort_order terkecil

  function drawTpl(t) {
    const k = Math.min(1, 560 / Math.max(t.w, t.h));
    const c = document.createElement("canvas");
    c.width = Math.round(t.w * k); c.height = Math.round(t.h * k);
    const g = c.getContext("2d");
    g.scale(k, k);
    g.fillStyle = t.bg || "#fff"; g.fillRect(0, 0, t.w, t.h);
    (t.slots || []).forEach((s, i) => {
      const [a, b] = tones[i % 4];
      g.save();
      g.translate(s.x + s.w / 2, s.y + s.h / 2); g.rotate((s.r || 0) * Math.PI / 180);
      g.beginPath(); g.roundRect(-s.w / 2, -s.h / 2, s.w, s.h, s.radius || 0); g.clip();
      const gr = g.createLinearGradient(0, -s.h / 2, 0, s.h / 2); gr.addColorStop(0, a); gr.addColorStop(1, b);
      g.fillStyle = gr; g.fillRect(-s.w / 2, -s.h / 2, s.w, s.h);
      g.fillStyle = "rgba(37,35,33,.22)";
      const m = Math.min(s.w, s.h);
      g.beginPath(); g.arc(0, -m * .08, m * .17, 0, 7); g.fill();
      g.beginPath(); g.ellipse(0, m * .42, m * .3, m * .26, 0, 0, 7); g.fill();
      g.restore();
    });
    const paintFrame = () => { const im = imgs[t.id]; if (im && im.complete && im.naturalWidth) g.drawImage(im, 0, 0, t.w, t.h); };
    if (t.frame) {
      const im = imgs[t.id] || (imgs[t.id] = Object.assign(new Image(), { crossOrigin: "anonymous", src: t.frame }));
      if (im.complete) paintFrame(); else im.addEventListener("load", paintFrame, { once: true });
    }
    if (t.fs) {
      g.fillStyle = t.ink || "#111"; g.textAlign = "center"; g.font = `800 ${t.fs}px Manrope, sans-serif`;
      g.fillText("snappie.", t.w / 2, t.ty);
    }
    return c;
  }

  function renderGallery() {
    if (!gal || typeof TEMPLATES === "undefined" || !TEMPLATES.length) return;
    gal.innerHTML = "";
    TEMPLATES.slice(0, GALLERY_MAX).forEach(t => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("aria-label", `Snap with the ${t.name} strip`);
      b.appendChild(drawTpl(t));
      const n = document.createElement("span"); n.className = "nm"; n.textContent = t.name; b.appendChild(n);
      b.onclick = () => { S.tpl = t; reset(); go("capture"); };
      gal.appendChild(b);
    });
  }

  /* templates arrive async from Supabase: re-render when they do */
  const prev = window.refreshTplOpts;
  window.refreshTplOpts = function () { if (prev) prev.apply(this, arguments); renderGallery(); };
  renderGallery();

  /* if no templates ever load, don't leave an empty section on the page */
  setTimeout(() => {
    if (typeof TEMPLATES !== "undefined" && TEMPLATES.length) return;
    const sec = document.getElementById("hm-strips"); if (sec) sec.hidden = true;
    document.querySelectorAll('a[href="#hm-strips"]').forEach(a => a.hidden = true);
  }, 8000);
})();

/* Download page: size the printout to the template's shape (visual only).
   Tall strips keep their current width; wide / square prints get a larger width
   so they don't look tiny next to the printer. */
(function () {
  const btn = document.getElementById("dlStripBtn"), stage = document.querySelector(".dl-stage");
  if (!btn || !stage) return;
  function size() {
    const m = /([\d.]+)\s*\/\s*([\d.]+)/.exec(btn.style.aspectRatio || ""); if (!m) return;
    const r = +m[1] / +m[2];
    const wTall = Math.max(140, Math.min(200, innerHeight * .21)), hTall = wTall / (600 / 1890);
    const cap = Math.min(460, innerWidth * .8 - 56);
    stage.style.setProperty("--strip-w", Math.round(Math.max(140, Math.min(hTall * r, cap))) + "px");
  }
  new MutationObserver(size).observe(btn, { attributes: true, attributeFilter: ["style"] });
  addEventListener("resize", size);
})();
