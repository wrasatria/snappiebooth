/* capture-ui.js - panel "Effects" di halaman capture: dibuka/ditutup lewat tombol, dan tombolnya
   menampilkan titik kecil kalau ada efek yang sedang aktif (supaya panel yang tertutup tetap informatif). */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const toggle = $("#fxToggle"), tray = $("#fxTray");
  if (!toggle || !tray) return;
  const dot = toggle.querySelector(".dot"), rows = [...tray.querySelectorAll(".fx-row")];
  const open = on => { tray.hidden = !on; toggle.setAttribute("aria-expanded", on); toggle.classList.toggle("on", on); };
  const sync = () => {
    if (rows.every(r => r.hidden)) { toggle.hidden = true; open(false); return; }      // tanpa WebGL/efek: sembunyikan tombolnya
    toggle.hidden = false;
    const active = !!tray.querySelector(".fx-chip.on:not([data-fx=off]):not([data-ar=none])");
    dot.hidden = !active; toggle.setAttribute("aria-label", active ? "Effects (on)" : "Effects");
  };
  toggle.onclick = () => open(tray.hidden);
  new MutationObserver(sync).observe(tray, { subtree: true, attributes: true, attributeFilter: ["class", "hidden"] });
  sync();
})();
