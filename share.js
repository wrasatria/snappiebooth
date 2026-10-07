/* share.js - lembar "Share your strip" di halaman download.
   Catatan teknis (penting): browser TIDAK bisa langsung memposting gambar ke Instagram/TikTok/WhatsApp/Facebook.
   Jadi lembar ini memakai cara yang benar-benar bisa jalan:
   - "Share image": menu bagikan bawaan HP (gambar ikut terlampir; user memilih WhatsApp/Instagram/Facebook/TikTok dsb.)
   - WhatsApp & Facebook: membagikan TAUTAN ke Snappie lewat tautan resmi masing-masing.
   - Instagram & TikTok: strip disimpan dulu, lalu user memilihnya dari galeri di aplikasinya.
   - Copy link. */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const sheet = $("#shareSheet"); if (!sheet) return;
  const SITE = location.origin + "/", TEXT = "Made this at Snappie Booth ✨";
  let filePromise = null, lastFocus = null;

  const toast = m => (typeof dlToast === "function" ? dlToast(m) : null);
  function makeFile() {   // memakai canvas hasil akhir yang sama dengan tombol Download
    return new Promise((res, rej) => {
      try { drawStrip(S.photos); cv.toBlob(b => { render(); b ? res(new File([b], "snappie-strip.png", { type: "image/png" })) : rej(new Error("blob")); }, "image/png"); } catch (e) { rej(e); }
    });
  }
  const focusables = () => [...sheet.querySelectorAll("button:not([hidden]),a[href]")].filter(e => !e.closest("[hidden]"));

  function open() {
    lastFocus = document.activeElement; sheet.hidden = false; document.body.classList.add("sh-open");
    $("#shNext").hidden = true; $("#shNativeBox").hidden = true;
    filePromise = makeFile();                    // siapkan file sebelum diklik (share harus dipanggil langsung dari klik)
    filePromise.then(f => { if (navigator.canShare && navigator.canShare({ files: [f] })) $("#shNativeBox").hidden = false; }).catch(() => {});
    requestAnimationFrame(() => $("#shClose").focus());
  }
  function close() { sheet.hidden = true; document.body.classList.remove("sh-open"); if (lastFocus && lastFocus.focus) lastFocus.focus(); }
  const openUrl = u => window.open(u, "_blank", "noopener,noreferrer");

  function saveThen(name, link) {
    $("#savePng").click();                       // pakai alur download yang sudah ada
    $("#shNext").hidden = false;
    $("#shNextTxt").textContent = "Strip saved. Open " + name + " and pick it from your gallery.";
    const a = $("#shNextBtn"); a.textContent = "Open " + name; a.href = link;
    toast("Strip saved to your device");
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(SITE); toast("Link copied"); }
    catch (e) { window.prompt("Copy this link:", SITE); }
  }

  $("#shNative").onclick = async () => {
    try { const f = await filePromise; await navigator.share({ files: [f], title: "My snappie strip", text: TEXT + " " + SITE }); close(); }
    catch (e) { if (e.name !== "AbortError") toast("Couldn't open the share menu. Try saving the image instead."); }
  };
  sheet.addEventListener("click", e => {
    if (e.target === sheet) return close();
    const b = e.target.closest("[data-share]"); if (!b) return;
    switch (b.dataset.share) {
      case "whatsapp": openUrl("https://wa.me/?text=" + encodeURIComponent(TEXT + " " + SITE)); break;
      case "facebook": openUrl("https://www.facebook.com/sharer/sharer.php?u=" + encodeURIComponent(SITE)); break;
      case "instagram": saveThen("Instagram", "https://www.instagram.com/"); break;
      case "tiktok": saveThen("TikTok", "https://www.tiktok.com/"); break;
      case "copy": copyLink(); break;
    }
  });
  $("#shClose").onclick = close;
  document.addEventListener("keydown", e => {
    if (sheet.hidden) return;
    if (e.key === "Escape") return close();
    if (e.key === "Tab") { const f = focusables(); if (!f.length) return; const i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); } }
  });
  /* ---- kartu dukungan (QR): sembunyikan kalau gambar QR tidak ada, tap QR untuk memperbesar ---- */
  const tip = $("#dlTip"), qr = $("#dlTipQr"), zoom = $("#tipZoom");
  if (tip && qr) {
    const hideTip = () => { tip.hidden = true; };
    qr.addEventListener("error", hideTip);
    if (qr.complete && qr.naturalWidth === 0) hideTip();
    const closeZoom = () => { zoom.hidden = true; };
    $("#dlTipQrBtn").onclick = () => { zoom.hidden = false; };
    zoom.onclick = closeZoom; $("#tipZoomClose").onclick = closeZoom; $("#tipZoomImg").onclick = e => e.stopPropagation();
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !zoom.hidden) closeZoom(); });
  }
  window.Share = { open, close };
})();
