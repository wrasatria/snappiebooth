/* ===== MENAMBAH STRIP BARU =====
   Salin satu blok di TEMPLATES, ubah nilainya. Kode lain tidak perlu disentuh.
   id     : nama unik tanpa spasi
   name   : teks tombol
   w,h    : ukuran kanvas (px)
   bg,ink : warna latar dan warna tulisan "snappie."
   ty,fs  : posisi y dan ukuran tulisan (fs:0 = sembunyikan)
   frame  : (opsional) PNG transparan seukuran w x h, mis. "frames/love.png".
            Bentuk hati/bulat dibuat lewat lubang transparan di PNG ini.
   slots  : 4 tempat foto {x,y,w,h}, opsional r (rotasi derajat) dan radius (sudut bulat)
*/
const col = (x, y0, w, h, gap) => [0, 1, 2, 3].map(i => ({ x, y: y0 + i * (h + gap), w, h }));

const TEMPLATES = [
  /* Template sekarang dikelola dari admin.html, bukan di sini lagi.
     Array ini sengaja dikosongkan supaya tidak dobel dengan yang di database.
     Kalau suatu saat admin/database tidak tersedia, boleh isi lagi di sini sebagai cadangan. */
];

/* Filter: bri=terang, con=kontras, sat=saturasi, warm=hangat(+)/dingin(-), tint=hijau(+)/magenta(-), fade=pudar hitam.
   Ini pendekatan buatan sendiri yang terinspirasi gaya film, bukan preset resmi. */
const FILTERS = {
  original: { name: "Original", bri: 1, con: 1, sat: 1, warm: 0, tint: 0, fade: 0 },
  bw:       { name: "Black & White", bri: 1, con: 1.15, sat: 0, warm: 0, tint: 0, fade: 0 },
  bright:   { name: "Bright", bri: 1.12, con: 1.05, sat: 1.1, warm: 2, tint: 0, fade: 0 },
  fuji1:    { name: "Fuji Look 1", bri: 1.02, con: 1.1, sat: 1.05, warm: -6, tint: 8, fade: 0.03 },
  fuji2:    { name: "Fuji Look 2", bri: 1.04, con: 1.04, sat: 0.9, warm: 4, tint: 4, fade: 0.08 },
  kodak:    { name: "Kodak", bri: 1.03, con: 1.1, sat: 1.18, warm: 14, tint: -2, fade: 0.04 }
};
