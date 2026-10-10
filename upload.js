/* upload.js - opsi mengunggah foto dari galeri/file di halaman capture (sebagai pengganti atau tambahan kamera).
   Foto masuk ke S.photos persis seperti hasil kamera (1280x960, JPEG), jadi review, pilihan template, filter,
   dan download tidak berubah. Catatan teknis: aplikasi menyimpan foto kamera "mentah" (tidak dicerminkan) lalu
   menampilkannya dicerminkan; karena itu foto unggahan DIBALIK sekali saat disimpan agar tampil dengan arah aslinya.
   Foto unggahan tidak punya klip Live Photo (S.clips[i] = null) dan tidak kena efek kamera real-time. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const input = $("#upFile"), btn = $("#upBtn"), frame = $(".stage-frame");
  if (!input || !btn) return;
  const W = 1280, H = 960, toast = m => (typeof dlToast === "function" ? dlToast(m) : null);

  async function toPhoto(file) {
    const url = URL.createObjectURL(file);
    try {
      const im = new Image(); im.src = url; await im.decode();   // browser menerapkan orientasi EXIF otomatis
      const sw = im.naturalWidth, sh = im.naturalHeight; if (!sw || !sh) throw new Error("gambar kosong");
      const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d");
      const k = Math.max(W / sw, H / sh), dw = sw * k, dh = sh * k;
      const dx = (W - dw) / 2, dy = dh > H ? -(dh - H) * .3 : (H - dh) / 2;   // foto tinggi (portrait): potong lebih banyak dari bawah supaya wajah tidak terpotong
      x.translate(W, 0); x.scale(-1, 1);                                       // dibalik sekali: lihat catatan di atas
      x.drawImage(im, dx, dy, dw, dh);
      const out = new Image(); out.src = c.toDataURL("image/jpeg", .92); await out.decode(); return out;
    } finally { URL.revokeObjectURL(url); }
  }

  async function addFiles(list) {
    const files = [...list].filter(f => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(f.name));
    if (!files.length) return toast("Please choose image files.");
    if (S.busy) return;
    S.busy = true; document.body.classList.add("is-busy");
    try {
      if (S.retake !== null) {                                   // mengganti satu foto dari halaman review
        const i = S.retake, img = await toPhoto(files[0]);
        S.photos[i] = img; S.clips[i] = null; S.retake = null; renderThumbs(); go("review"); return;
      }
      const room = 4 - S.photos.length;
      if (room <= 0) return toast("Your strip is full. Use the retake button to start over.");
      const use = files.slice(0, room); let failed = 0;
      for (const f of use) {
        try { const img = await toPhoto(f), i = S.photos.length; S.photos[i] = img; S.clips[i] = null; renderThumbs(); } catch (e) { failed++; console.warn("Gagal membaca gambar", e); }
      }
      if (failed) toast(failed === use.length ? "Couldn't read that image. Try a JPG or PNG." : "Some images couldn't be read.");
      else if (files.length > room) toast("Used the first " + room + " photo" + (room > 1 ? "s" : "") + ".");
      if (S.photos.length === 4) { await wait(500); go("review"); }
    } finally { S.busy = false; document.body.classList.remove("is-busy"); }
  }

  btn.onclick = () => { if (!S.busy) input.click(); };
  input.onchange = () => { const files = [...input.files]; input.value = ""; addFiles(files); };

  /* seret & lepas file ke area kamera (desktop) */
  const hasFiles = e => e.dataTransfer && [...e.dataTransfer.types].includes("Files");
  ["dragenter", "dragover"].forEach(ev => frame.addEventListener(ev, e => { if (hasFiles(e)) { e.preventDefault(); frame.classList.add("drop"); } }));
  frame.addEventListener("dragleave", e => { if (!frame.contains(e.relatedTarget)) frame.classList.remove("drop"); });
  frame.addEventListener("drop", e => { frame.classList.remove("drop"); if (hasFiles(e)) { e.preventDefault(); addFiles(e.dataTransfer.files); } });
})();
