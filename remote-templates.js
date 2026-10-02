/* Mengambil template yang dibuat lewat admin.html dan menambahkannya
   ke daftar TEMPLATES yang sudah ada di templates.js.
   Tidak perlu diedit; jalan otomatis saat halaman dibuka. */
(async function () {
  if (!window.SUPABASE_URL || SUPABASE_URL.includes("GANTI-INI")) return; // config.js belum diisi
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/templates?select=*&active=eq.true&order=sort_order.asc`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } }
    );
    if (!res.ok) { console.warn("Gagal mengambil template (status " + res.status + "):", await res.text()); return; }
    const rows = await res.json();
    rows.forEach(r => {
      if (TEMPLATES.some(t => t.id === r.id)) return; // sudah ada, jangan dobel
      TEMPLATES.push({ id: r.id, name: r.name, w: r.w, h: r.h, bg: r.bg, ink: r.ink, ty: r.ty, fs: r.fs, frame: r.frame_path || undefined, slots: r.slots });
    });
    /* S.tpl di app.js diisi saat script dimuat, ketika TEMPLATES masih kosong.
       Begitu template tiba dari Supabase, isi template default-nya di sini. */
    if (typeof S !== "undefined" && !S.tpl && TEMPLATES.length) S.tpl = TEMPLATES[0];
    const c = document.getElementById("tplCount");
    if (c) c.textContent = TEMPLATES.length;
    if (typeof window.refreshTplOpts === "function") window.refreshTplOpts();
  } catch (e) { console.warn("Gagal memuat template dari server:", e); }
})();
