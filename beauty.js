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

  /* smooth: kekuatan penghalusan | bright: angkat kecerahan kulit | glow: cahaya lembut
     warm: hangat | rad: radius blur (relatif terhadap tinggi video) */
  const PRESETS = {
    natural: { smooth: .55, bright: .03, glow: .08, warm: .012, rad: 2.6 },
    soft:    { smooth: .78, bright: .055, glow: .14, warm: .02, rad: 3.4 },
    glow:    { smooth: .86, bright: .08, glow: .26, warm: .03, rad: 3.8 }
  };

  const VERT = "attribute vec2 aPos;varying vec2 vUv;void main(){vUv=vec2(aPos.x*.5+.5,.5-aPos.y*.5);gl_Position=vec4(aPos,0.,1.);}";
  const FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex; uniform vec2 uSize;
uniform float uSmooth,uBright,uGlow,uWarm,uRad;
varying vec2 vUv;
float band(float x,float a,float b,float c,float d){return smoothstep(a,b,x)*(1.-smoothstep(c,d,x));}
float skin(vec3 c){
  float cb=.5+dot(c,vec3(-.1687,-.3313,.5));
  float cr=.5+dot(c,vec3(.5,-.4187,-.0813));
  float y=dot(c,vec3(.299,.587,.114));
  return band(cb,.27,.31,.49,.52)*band(cr,.50,.53,.68,.72)*smoothstep(.12,.22,y);
}
void main(){
  vec3 c=texture2D(uTex,vUv).rgb;
  float m=skin(c);
  vec2 px=1./uSize;
  float r=uRad*uSize.y/480.;
  float j=fract(sin(dot(vUv*uSize,vec2(12.9898,78.233)))*43758.5453)*6.2832;
  vec3 acc=c; float ws=1.;
  for(int i=0;i<12;i++){
    float fi=float(i);
    float rr=sqrt((fi+.5)/12.), a=fi*2.39996+j;
    vec3 s=texture2D(uTex,vUv+vec2(cos(a),sin(a))*rr*r*px).rgb;
    vec3 d=s-c; float w=exp(-dot(d,d)/.02);
    acc+=s*w; ws+=w;
  }
  vec3 sm=acc/ws;
  vec3 bl=vec3(0.);
  for(int i=0;i<8;i++){ float a=float(i)*.7854; bl+=texture2D(uTex,vUv+vec2(cos(a),sin(a))*r*3.2*px).rgb; }
  bl/=8.;
  vec3 o=mix(c,sm,m*uSmooth);
  o=1.-(1.-o)*(1.-bl*uGlow*(.1+.9*m));
  o+=uBright*m;
  o.r+=uWarm*m; o.b-=uWarm*.6*m;
  gl_FragColor=vec4(clamp(o,0.,1.),1.);
}`;

  let gl, tex, loc = {}, level = "off", video = null, raf = 0, ready = false, pipeOk = false, glOk = false, last = 0, capStream = null;

  function sh(type, src) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function initGL() {
    try {
      gl = glc.getContext("webgl", { alpha: false, antialias: false, preserveDrawingBuffer: true }) || glc.getContext("experimental-webgl", { alpha: false, preserveDrawingBuffer: true });
      if (!gl) return false;
      const p = gl.createProgram();
      gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FRAG)); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      gl.useProgram(p);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(p, "aPos"); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      ["uTex", "uSize", "uSmooth", "uBright", "uGlow", "uWarm", "uRad"].forEach(n => loc[n] = gl.getUniformLocation(p, n));
      gl.uniform1i(loc.uTex, 0);
      glc.addEventListener("webglcontextlost", e => { e.preventDefault(); glOk = false; level = "off"; row.hidden = true; syncUI(); update(); });
      return true;
    } catch (e) { console.warn("Filter kulit tidak tersedia:", e); return false; }
  }

  function renderGL(v, w, h) {
    if (glc.width !== w || glc.height !== h) { glc.width = w; glc.height = h; gl.viewport(0, 0, w, h); }
    const p = PRESETS[level];
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
    gl.uniform2f(loc.uSize, w, h);
    gl.uniform1f(loc.uSmooth, p.smooth); gl.uniform1f(loc.uBright, p.bright); gl.uniform1f(loc.uGlow, p.glow);
    gl.uniform1f(loc.uWarm, p.warm); gl.uniform1f(loc.uRad, p.rad);
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
      if (level !== "off" && glOk) { renderGL(v, w, h); ctx.drawImage(glc, 0, 0); }
      else ctx.drawImage(v, 0, 0, w, h);
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
