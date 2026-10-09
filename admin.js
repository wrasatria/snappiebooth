const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
if (!window.SUPABASE_URL || SUPABASE_URL.includes("GANTI-INI")) {
  document.body.innerHTML = '<main style="padding:40px;font-family:sans-serif"><h2>config.js belum diisi</h2><p>Buka file <code>config.js</code>, isi SUPABASE_URL dan SUPABASE_ANON_KEY dari project Supabase Anda, lalu muat ulang halaman ini.</p></main>';
  throw new Error("config.js belum diisi");
}
const SB = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let session = null, rowsCache = [], editingId = null, frameFile = null, existingFrameURL = "", initialSlots = [];
let SLOTS = [{ x: 40, y: 40, w: 520, h: 390, r: 0, radius: 0 }, { x: 40, y: 454, w: 520, h: 390, r: 0, radius: 0 }, { x: 40, y: 868, w: 520, h: 390, r: 0, radius: 0 }, { x: 40, y: 1282, w: 520, h: 390, r: 0, radius: 0 }];

/* ---------- auth ---------- */
async function boot() { const { data } = await SB.auth.getSession(); session = data.session; render(); }
SB.auth.onAuthStateChange((_e, s) => { session = s; render(); });
function render() {
  $("#login").hidden = !!session; $("#panel").hidden = !session; $("#logout").hidden = !session;
  if (session) loadList();
}
$("#loginForm").onsubmit = async e => {
  e.preventDefault();
  const { error } = await SB.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
  $("#loginErr").textContent = error ? "Email atau password salah." : "";
};
$("#logout").onclick = () => SB.auth.signOut();

/* ---------- daftar template ---------- */
const HOME_COUNT = 4;   // harus sama dengan GALLERY_MAX di home.js: jumlah strip aktif teratas yang tampil di homepage
const esc = v => String(v ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
async function loadList() {
  const { data, error } = await SB.from("templates").select("*").order("sort_order", { ascending: true });
  if (error) { $("#listMsg").textContent = "Gagal memuat: " + error.message; return; }
  rowsCache = data; $("#listMsg").textContent = "";
  $("#list").innerHTML = data.map(t => `
    <div class="row-item" data-id="${esc(t.id)}" data-active="${t.active ? 1 : 0}">
      <span class="lft">
        <button type="button" class="grip" aria-label="Ubah urutan ${esc(t.name)}: seret, atau tekan panah atas/bawah" title="Seret untuk mengubah urutan">&#8942;&#8942;</button>
        <i class="rank"></i>
        <span class="nm">${t.active ? "🟢" : "⚪"} <b>${esc(t.name)}</b><small>${esc(t.id)} · ${t.w}×${t.h}</small><em class="hp" hidden>Tampil di homepage</em></span>
      </span>
      <span class="act"><button data-edit="${esc(t.id)}">Edit</button><button data-del="${esc(t.id)}">Hapus</button></span>
    </div>`).join("") || "<p class='hint'>Belum ada template. Klik \"Template Baru\".</p>";
  $$("[data-edit]").forEach(b => b.onclick = () => openForm(rowsCache.find(t => t.id === b.dataset.edit)));
  $$("[data-del]").forEach(b => b.onclick = () => delTemplate(b.dataset.del));
  refreshRanks(); initReorder();
}
/* nomor urut + penanda "Tampil di homepage" (HOME_COUNT template AKTIF teratas) mengikuti urutan baris saat ini */
function refreshRanks() {
  let shown = 0;
  $$("#list .row-item").forEach((el, i) => {
    el.querySelector(".rank").textContent = i + 1;
    const on = el.dataset.active === "1" && shown < HOME_COUNT; if (on) shown++;
    el.querySelector(".hp").hidden = !on; el.classList.toggle("is-home", on);
  });
}
/* simpan urutan baru: nomor unik 1..n, hanya baris yang berubah yang ditulis */
let saveTimer = null;
function saveOrder() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const ids = $$("#list .row-item").map(el => el.dataset.id);
    const changed = ids.map((id, i) => ({ id, order: i + 1 })).filter(x => (rowsCache.find(r => r.id === x.id) || {}).sort_order !== x.order);
    if (!changed.length) return;
    $("#listMsg").textContent = "Menyimpan urutan…";
    const res = await Promise.all(changed.map(x => SB.from("templates").update({ sort_order: x.order }).eq("id", x.id)));
    const bad = res.find(r => r.error);
    if (bad) { $("#listMsg").textContent = "Gagal menyimpan urutan: " + bad.error.message; return loadList(); }
    changed.forEach(x => { const r = rowsCache.find(r => r.id === x.id); if (r) r.sort_order = x.order; });
    rowsCache.sort((a, b) => a.sort_order - b.sort_order);
    $("#listMsg").textContent = "Urutan tersimpan.";
    setTimeout(() => { if ($("#listMsg").textContent === "Urutan tersimpan.") $("#listMsg").textContent = ""; }, 2200);
  }, 250);
}
/* seret ikon ⋮⋮ (mouse atau sentuh). Panah atas/bawah di ikon yang sedang fokus = keyboard */
function initReorder() {
  const list = $("#list");
  list.querySelectorAll(".grip").forEach(g => {
    g.onkeydown = e => {
      const row = g.closest(".row-item");
      if (e.key === "ArrowUp" && row.previousElementSibling) { e.preventDefault(); list.insertBefore(row, row.previousElementSibling); }
      else if (e.key === "ArrowDown" && row.nextElementSibling) { e.preventDefault(); list.insertBefore(row.nextElementSibling, row); }
      else return;
      g.focus(); refreshRanks(); saveOrder();
    };
    g.onpointerdown = e => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      const row = g.closest(".row-item"), startOrder = $$("#list .row-item").map(x => x.dataset.id).join();
      const grab = e.clientY - row.getBoundingClientRect().top;
      let y = e.clientY, raf = 0;
      row.classList.add("dragging"); list.classList.add("sorting");
      const place = () => {
        const siblings = [...list.children].filter(x => x !== row && x.classList.contains("row-item"));
        const mid = y - grab + row.offsetHeight / 2;                        // titik tengah baris yang sedang diseret
        const next = siblings.find(s => { const r = s.getBoundingClientRect(); return mid < r.top + r.height / 2; });
        if (next) { if (row.nextElementSibling !== next) list.insertBefore(row, next); }
        else if (row.nextElementSibling) list.appendChild(row);
        row.style.transform = "none";                                       // ukur posisi layout baru, lalu geser agar menempel ke kursor
        row.style.transform = `translateY(${y - grab - row.getBoundingClientRect().top}px)`;
        refreshRanks();
      };
      const tick = () => {                                                  // gulir otomatis saat dekat tepi layar
        const edge = 70, h = innerHeight;
        if (y < edge) scrollBy(0, -Math.ceil((edge - y) / 5)); else if (y > h - edge) scrollBy(0, Math.ceil((y - (h - edge)) / 5));
        place(); raf = requestAnimationFrame(tick);
      };
      /* dengarkan di window, bukan di ikon: memindahkan elemen di DOM melepas "pointer capture" milik elemen itu */
      const move = ev => { y = ev.clientY; };
      const end = () => {
        cancelAnimationFrame(raf);
        removeEventListener("pointermove", move); removeEventListener("pointerup", end); removeEventListener("pointercancel", end);
        row.classList.remove("dragging"); row.style.transform = ""; list.classList.remove("sorting"); refreshRanks();
        if ($$("#list .row-item").map(x => x.dataset.id).join() !== startOrder) saveOrder();
      };
      addEventListener("pointermove", move); addEventListener("pointerup", end); addEventListener("pointercancel", end);
      raf = requestAnimationFrame(tick);
    };
  });
}
async function delTemplate(id) {
  if (!confirm("Hapus template ini? Tidak bisa dibatalkan.")) return;
  const { error } = await SB.from("templates").delete().eq("id", id);
  if (error) return alert("Gagal menghapus: " + error.message);
  loadList();
}

/* ---------- form ---------- */
$("#newBtn").onclick = () => openForm(null);
$("#cancelTpl").onclick = () => $("#editor").hidden = true;

function openForm(t) {
  editingId = t ? t.id : null; frameFile = null; existingFrameURL = t?.frame_path || "";
  $("#formTitle").textContent = t ? "Edit: " + t.name : "Template Baru";
  $("#fId").value = t?.id || ""; $("#fId").disabled = !!t;
  $("#fName").value = t?.name || ""; $("#fW").value = t?.w || 600; $("#fH").value = t?.h || 1792;
  $("#fBg").value = t?.bg || "#ffffff"; $("#fInk").value = t?.ink || "#111111";
  $("#fTy").value = t?.ty || 0; $("#fFs").value = t?.fs || 0;
  $("#fSort").value = t ? (t.sort_order || 0) : (Math.max(0, ...rowsCache.map(r => r.sort_order || 0)) + 1);   // template baru masuk paling bawah; geser di daftar untuk memindahkan
  $("#fActive").checked = t ? t.active : true; $("#fFrame").value = "";
  SLOTS = t?.slots ? JSON.parse(JSON.stringify(t.slots)) : [{ x: 40, y: 40, w: 520, h: 390 }, { x: 40, y: 454, w: 520, h: 390 }, { x: 40, y: 868, w: 520, h: 390 }, { x: 40, y: 1282, w: 520, h: 390 }];
  SLOTS.forEach(s => { s.r ??= 0; s.radius ??= 0; });
  initialSlots = JSON.parse(JSON.stringify(SLOTS));
  $("#fLayout").value = "";
  $("#slotBg").src = existingFrameURL || "";
  $("#formMsg").textContent = "";
  buildSlotNums(); updateBoxes(); $("#editor").hidden = false; $("#editor").scrollIntoView({ behavior: "smooth" });
}
$("#fW").oninput = $("#fH").oninput = () => { updateBoxes(); };

/* ---------- tata letak awal & reset ---------- */
function computeLayout(type) {
  if (type === "grid" && +$("#fW").value === 600 && +$("#fH").value === 1792) {
    $("#fW").value = 1200; $("#fH").value = 1000;
  }
  const w = +$("#fW").value || 600, h = +$("#fH").value || 1792;
  if (type === "strip") {
    const pad = Math.round(w * 0.067), gap = Math.round(w * 0.04);
    const sw = w - pad * 2, sh = Math.round((h - pad * 2 - gap * 3) / 4);
    SLOTS = [0, 1, 2, 3].map(i => ({ x: pad, y: pad + i * (sh + gap), w: sw, h: sh, r: 0, radius: 0 }));
  } else if (type === "grid") {
    const gap = Math.round(w * 0.04), pad = gap;
    const sw = Math.round((w - pad * 2 - gap) / 2), sh = Math.round((h - pad * 2 - gap) / 2);
    SLOTS = [
      { x: pad, y: pad, w: sw, h: sh, r: 0, radius: 0 },
      { x: pad + sw + gap, y: pad, w: sw, h: sh, r: 0, radius: 0 },
      { x: pad, y: pad + sh + gap, w: sw, h: sh, r: 0, radius: 0 },
      { x: pad + sw + gap, y: pad + sh + gap, w: sw, h: sh, r: 0, radius: 0 }
    ];
  } else return;
  buildSlotNums(); updateBoxes();
}
$("#fLayout").onchange = e => { if (e.target.value) computeLayout(e.target.value); e.target.value = ""; };
$("#resetSlots").onclick = () => { SLOTS = JSON.parse(JSON.stringify(initialSlots)); buildSlotNums(); updateBoxes(); };

function scaleOf() { return 320 / (+$("#fW").value || 600); }
function areaH() { return (+$("#fH").value || 1792) * scaleOf(); }

function updateBoxes() {
  const k = scaleOf();
  $("#slotArea").style.height = areaH() + "px";
  $$(".slotbox").forEach((box, i) => {
    const s = SLOTS[i];
    box.style.left = s.x * k + "px"; box.style.top = s.y * k + "px";
    box.style.width = s.w * k + "px"; box.style.height = s.h * k + "px";
    box.style.transform = s.r ? `rotate(${s.r}deg)` : "";
    box.style.borderRadius = (s.radius || 0) * k + "px";
  });
}
function buildSlotNums() {
  $("#slotNums").innerHTML = SLOTS.map((s, i) => `
    <div class="slotnum-row">
      <span>#${i + 1} x</span><input data-i="${i}" data-k="x" type="number" value="${s.x}">
      <span>y</span><input data-i="${i}" data-k="y" type="number" value="${s.y}">
      <span>w</span><input data-i="${i}" data-k="w" type="number" value="${s.w}">
      <span>h</span><input data-i="${i}" data-k="h" type="number" value="${s.h}">
    </div>`).join("");
  $$("#slotNums input").forEach(inp => inp.oninput = () => {
    SLOTS[+inp.dataset.i][inp.dataset.k] = +inp.value || 0; updateBoxes();
  });
}
function syncNumsFromSlots() {
  $$("#slotNums input").forEach(inp => inp.value = SLOTS[+inp.dataset.i][inp.dataset.k]);
}

/* ---------- drag & resize kotak slot ---------- */
$$(".slotbox").forEach(box => {
  const i = +box.dataset.i;
  let mode = null, sx = 0, sy = 0, ox = 0, oy = 0, ow = 0, oh = 0;
  box.addEventListener("pointerdown", e => {
    mode = e.target.classList.contains("handle") ? "resize" : "move";
    sx = e.clientX; sy = e.clientY;
    ox = SLOTS[i].x; oy = SLOTS[i].y; ow = SLOTS[i].w; oh = SLOTS[i].h;
    box.setPointerCapture(e.pointerId); e.stopPropagation();
  });
  box.addEventListener("pointermove", e => {
    if (!mode) return;
    const k = 1 / scaleOf(), dx = (e.clientX - sx) * k, dy = (e.clientY - sy) * k;
    if (mode === "move") { SLOTS[i].x = Math.max(0, Math.round(ox + dx)); SLOTS[i].y = Math.max(0, Math.round(oy + dy)); }
    else { SLOTS[i].w = Math.max(20, Math.round(ow + dx)); SLOTS[i].h = Math.max(20, Math.round(oh + dy)); }
    updateBoxes(); syncNumsFromSlots();
  });
  ["pointerup", "pointercancel"].forEach(ev => box.addEventListener(ev, () => mode = null));
});
$("#fFrame").onchange = e => {
  frameFile = e.target.files[0] || null;
  if (frameFile) $("#slotBg").src = URL.createObjectURL(frameFile);
};

/* ---------- simpan ---------- */
$("#saveTpl").onclick = async () => {
  const id = $("#fId").value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const name = $("#fName").value.trim();
  if (!id || !name) return $("#formMsg").textContent = "ID dan Nama wajib diisi.";
  $("#saveTpl").disabled = true; $("#formMsg").textContent = "Menyimpan...";

  let frame_path = existingFrameURL;
  if (frameFile) {
    const path = `${id}-${Date.now()}.png`;
    const { error: upErr } = await SB.storage.from("frames").upload(path, frameFile, { upsert: true, contentType: "image/png" });
    if (upErr) { $("#saveTpl").disabled = false; return $("#formMsg").textContent = "Gagal upload PNG: " + upErr.message; }
    frame_path = SB.storage.from("frames").getPublicUrl(path).data.publicUrl;
  }

  const row = {
    id, name, w: +$("#fW").value, h: +$("#fH").value, bg: $("#fBg").value, ink: $("#fInk").value,
    ty: +$("#fTy").value, fs: +$("#fFs").value, sort_order: +$("#fSort").value, active: $("#fActive").checked,
    frame_path, slots: SLOTS
  };
  const { error } = await SB.from("templates").upsert(row);
  $("#saveTpl").disabled = false;
  if (error) return $("#formMsg").textContent = "Gagal menyimpan: " + error.message;
  $("#formMsg").textContent = "Tersimpan."; $("#editor").hidden = true; loadList();
};

boot();
