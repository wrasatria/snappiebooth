/* beauty.js - pipeline kamera real-time untuk halaman capture:
   video -> [filter kulit halus (WebGL, offscreen)] -> canvas 2D #camfx -> [efek wajah dari ar.js].
   Foto dan klip Live Photo diambil dari #camfx, jadi semua efek ikut tersimpan.
   Aman-gagal: kalau WebGL/canvas tidak ada, tombol disembunyikan dan kamera berjalan seperti biasa.
   Default: semua Off (jalur kamera lama tidak disentuh). */
(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const canvas = $("#camfx"), row = $("#fxRow");
  if (!canvas || !row) return;
  const stage = canvas.closest(".stage"), shootBtn = $("#shoot");
  const glc = document.createElement("canvas");      // canvas WebGL offscreen (hanya untuk shader kulit)
  let ctx = null;

  /* smooth: seberapa kuat kulit dihaluskan | detail: tekstur halus yang dipertahankan (supaya tidak seperti plastik)
     bright: angkat kecerahan | gamma: angkat nada tengah (kulit lebih cerah, "glass skin") | glow: cahaya lembut di area terang
     pink: rona merah muda tipis | redfix: meredam kemerahan/jerawat | rad: radius blur */
  const PRESETS = {
    natural: { smooth: .55, detail: .35, bright: .02, gamma: .06, glow: .04, pink: .008, redfix: .3, rad: 3.0 }
  };

  const VERT = "attribute vec2 aPos;varying vec2 vUv;void main(){vUv=vec2(aPos.x*.5+.5,.5-aPos.y*.5);gl_Position=vec4(aPos,0.,1.);}";
  const HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying vec2 vUv;`;
  /* Tahap A (setengah resolusi): blur yang menjaga tepi (bilateral), 24 titik di 3 cincin, tanpa noise acak -> hasil mulus */
  const FRAG_A = HEAD + `
uniform sampler2D uTex; uniform vec2 uPx; uniform float uRad;
void main(){
  vec3 c=texture2D(uTex,vUv).rgb;
  vec3 acc=c; float ws=1.;
  for(int ring=1;ring<=3;ring++){
    float rr=float(ring)*.55*uRad;
    float sw=ring==1?.9:(ring==2?.6:.35);
    for(int i=0;i<8;i++){
      float a=float(i)*.785398+float(ring)*.3;
      vec3 s=texture2D(uTex,vUv+vec2(cos(a),sin(a))*rr*uPx).rgb;
      vec3 d=s-c; float w=sw*exp(-dot(d,d)/.03);
      acc+=s*w; ws+=w;
    }
  }
  gl_FragColor=vec4(acc/ws,1.);
}`;
  /* Tahap B (resolusi penuh): masker kulit, campur asli/halus, ratakan kemerahan, cerahkan, glow, rona pink */
  const FRAG_B = HEAD + `
uniform sampler2D uTex; uniform sampler2D uBlur;
uniform float uSmooth,uDetail,uBright,uGamma,uGlow,uPink,uRedFix;
float band(float x,float a,float b,float c,float d){return smoothstep(a,b,x)*(1.-smoothstep(c,d,x));}
float skin(vec3 c){
  float cb=.5+dot(c,vec3(-.1687,-.3313,.5));
  float cr=.5+dot(c,vec3(.5,-.4187,-.0813));
  float y=dot(c,vec3(.299,.587,.114));
  return band(cb,.27,.31,.49,.52)*band(cr,.50,.53,.68,.72)*smoothstep(.12,.22,y);
}
void main(){
  vec3 c=texture2D(uTex,vUv).rgb;
  vec3 sm=texture2D(uBlur,vec2(vUv.x,1.-vUv.y)).rgb;   // tekstur FBO terbalik secara vertikal terhadap vUv
  float m=skin(sm);
  vec3 o=mix(c,sm,m*uSmooth);
  o+=(c-sm)*uDetail*m;
  float red=o.r-o.g;
  o.r-=max(0.,red-.10)*uRedFix*m;
  o=mix(o,pow(clamp(o,0.,1.),vec3(1.-uGamma)),m);
  float l=dot(sm,vec3(.299,.587,.114));
  o+=smoothstep(.45,.95,l)*uGlow*m*vec3(1.,.96,.95);
  o+=uBright*m;
  o.r+=uPink*m; o.b+=uPink*.6*m; o.g-=uPink*.15*m;
  gl_FragColor=vec4(clamp(o,0.,1.),1.);
}`;

  let gl, tex, blurTex, fbo, PA, PB, bw = 0, bh = 0, level = "off", video = null, raf = 0, ready = false, pipeOk = false, glOk = false, last = 0, capStream = null;

  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function mkProg(frag, names) {
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, frag));
    gl.bindAttribLocation(p, 0, "aPos"); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = {}; names.forEach(n => loc[n] = gl.getUniformLocation(p, n));
    return { p, loc };
  }
  function mkTex() {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }
  function initGL() {
    try {
      gl = glc.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true }) || glc.getContext("experimental-webgl", { alpha: false, preserveDrawingBuffer: true });
      if (!gl) return false;
      PA = mkProg(FRAG_A, ["uTex", "uPx", "uRad"]);
      PB = mkProg(FRAG_B, ["uTex", "uBlur", "uSmooth", "uDetail", "uBright", "uGamma", "uGlow", "uPink", "uRedFix"]);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); tex = mkTex();
      gl.activeTexture(gl.TEXTURE1); blurTex = mkTex();
      fbo = gl.createFramebuffer();
      gl.useProgram(PA.p); gl.uniform1i(PA.loc.uTex, 0);
      gl.useProgram(PB.p); gl.uniform1i(PB.loc.uTex, 0); gl.uniform1i(PB.loc.uBlur, 1);
      glc.addEventListener("webglcontextlost", e => { e.preventDefault(); glFail("context lost"); });
      return true;
    } catch (e) { console.warn("Filter kulit tidak tersedia:", e); return false; }
  }
  function glFail(e) { console.warn("Filter kulit dimatikan:", e); glOk = false; level = "off"; row.hidden = true; syncUI(); update(); }

  function renderGL(v, w, h) {
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1), p = PRESETS[level];
    if (glc.width !== w || glc.height !== h) { glc.width = w; glc.height = h; }
    if (bw !== hw || bh !== hh) {
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, blurTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, hw, hh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, blurTex, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("framebuffer tidak lengkap");
      bw = hw; bh = hh;
    }
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, blurTex);
    /* tahap A -> blur setengah resolusi ke framebuffer */
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, hw, hh);
    gl.useProgram(PA.p); gl.uniform2f(PA.loc.uPx, 1 / w, 1 / h); gl.uniform1f(PA.loc.uRad, p.rad * h / 480);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    /* tahap B -> gabungkan ke canvas */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h);
    gl.useProgram(PB.p); const L = PB.loc;
    gl.uniform1f(L.uSmooth, p.smooth); gl.uniform1f(L.uDetail, p.detail); gl.uniform1f(L.uBright, p.bright); gl.uniform1f(L.uGamma, p.gamma);
    gl.uniform1f(L.uGlow, p.glow); gl.uniform1f(L.uPink, p.pink); gl.uniform1f(L.uRedFix, p.redfix);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (now - last < 28) return;            // ~30fps cukup, hemat baterai
    last = now;
    const v = video; if (!v || v.readyState < 2 || !v.videoWidth) return;
    try {
      const sc = Math.min(1, 1280 / Math.max(v.videoWidth, v.videoHeight));
      const w = Math.round(v.videoWidth * sc), h = Math.round(v.videoHeight * sc);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      let drew = false;
      if (level !== "off" && glOk) { try { renderGL(v, w, h); ctx.drawImage(glc, 0, 0); drew = true; } catch (e) { glFail(e); } }
      if (!drew) ctx.drawImage(v, 0, 0, w, h);
      if (window.AR && AR.effect !== "none") AR.draw(ctx, w, h, v, now);   // efek wajah digambar di atas frame
      if (!ready) { ready = true; stage.classList.add("fx-on"); }          // tampilkan canvas setelah frame pertama (tanpa kedip hitam)
    } catch (e) { fail(e); }
  }
  const active = () => level !== "off" || !!(window.AR && AR.effect !== "none");
  function start() { if (pipeOk && video && !raf) { ready = false; raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; ready = false; stage.classList.remove("fx-on"); }
  function update() { active() ? start() : stop(); }
  function fail(e) { console.warn("Pipeline filter dimatikan:", e); pipeOk = false; level = "off"; if (window.AR) AR.effect = "none"; stop(); syncUI(); document.querySelectorAll(".fx-row").forEach(r => r.hidden = true); }

  function syncUI() {
    row.querySelectorAll("[data-fx]").forEach(b => { const on = b.dataset.fx === level; b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
  }
  function setLevel(n) {
    if (n !== "off" && !PRESETS[n]) return;
    level = n; syncUI(); update();
  }

  glOk = initGL();
  try { ctx = canvas.getContext("2d"); pipeOk = !!(ctx && canvas.captureStream); } catch (e) { pipeOk = false; }
  if (!pipeOk) { document.querySelectorAll(".fx-row").forEach(r => r.hidden = true); }
  else {
    if (!glOk) row.hidden = true;   // tanpa WebGL: filter kulit disembunyikan, efek wajah (2D) tetap bisa
    row.addEventListener("click", e => { const b = e.target.closest("[data-fx]"); if (b && !row.classList.contains("lock")) setLevel(b.dataset.fx); });
    /* kunci pilihan saat hitung mundur / merekam (tombol shutter nonaktif) */
    const lock = () => document.querySelectorAll(".fx-row").forEach(r => r.classList.toggle("lock", shootBtn.disabled));
    new MutationObserver(lock).observe(shootBtn, { attributes: true, attributeFilter: ["disabled"] }); lock();
    syncUI();
  }

  window.Beauty = {
    attach(v) { video = v; syncUI(); if (active()) start(); },
    detach() { stop(); video = null; },
    refresh: update,
    source() { return pipeOk && ready && active() ? canvas : null; },
    recStream() { if (!this.source()) return null; try { return capStream || (capStream = canvas.captureStream(30)); } catch (e) { return null; } },
    setLevel
  };
})();
