/* =====================================================================
   Photo mock-up view
   ---------------------------------------------------------------------
   Repaints a real mannequin photo with the current design.

   The template (js/photo-assets.js) holds:
     base  - the original photo (used as-is outside the uniform)
     maps  - per pixel: R = fabric shading, G = sheen/highlight,
             B = which part it belongs to (label × 20)
   Each frame we draw the design as flat colour "art" for each part in
   photo coordinates, then shade it: out = art × shading + sheen.

   GEO below describes where things sit on this photo (stripe angles,
   crest position, …). Units: photo pixels. `k` converts the builder's
   stripe units into pixels for that part.
   ===================================================================== */
(function () {
  const UB = window.UB;
  const A = () => UB.PHOTO_ASSETS;

  const LABELS = { 1: 'torso', 2: 'sleeveL', 3: 'sleeveR', 4: 'collar', 5: 'pants', 6: 'socks', 7: 'gloves', 8: 'glovesTrim', 9: 'helmet' };
  const ZONE_OF = { torso: 'body', sleeveL: 'sleeves', sleeveR: 'sleeves', collar: 'collar', pants: 'pants', socks: 'socks', gloves: 'gloves', glovesTrim: 'glovesTrim', helmet: 'helmet' };
  // Art layers stacked in one tall canvas: one layer per part that has stripes/logos.
  const LAYER = { torso: 0, sleeveL: 1, sleeveR: 1, pants: 2, socks: 3 };
  const N_LAYERS = 4;

  const norm = (x, y) => { const l = Math.hypot(x, y); return [x / l, y / l]; };
  const GEO = {
    torso: { hem: (x) => 688 + (x - 200) * 0.0115, k: 1.3, x0: 190, x1: 560, bow: 3,
      crest: [403, 433, 196], captain: [490, 330, 54], chestL: [335, 308, 76, 30], chestR: [452, 311, 36, 30], neck: [407, 262, 30, 18],
      flat: 'translate(381 215) scale(1.9 1.3) translate(-200 -38)', pattern: 'translate(381 215) scale(1.6) translate(-200 -38)' },
    sleeves: [
      { o: [140, 528], dir: norm(1, 0.36), k: 1.25, num: [181, 326, 17, 1, 92] },
      { o: [610, 552], dir: norm(1, -0.44), k: 1.25, num: [578, 333, -24, 0.42, 92] },
    ],
    socks: [
      { ref: (x) => 1132 + (x - 205) * 0.15, x0: 200, x1: 370, k: 1.3, bow: 6 },
      { ref: (x) => 1117, x0: 415, x1: 570, k: 1.3, bow: 6 },
    ],
    pants: { left: [[211, 680], [207, 905]], right: [[566, 680], [568, 906]], bottomL: 898, bottomR: 904,
      logoL: [298, 836, 56, 48, 0], logoR: [523, 815, 86, 30, -8] },
  };
  // Up = perpendicular to the band direction, pointing toward the shoulder (negative y).
  GEO.sleeves.forEach((s) => { const a = [s.dir[1], -s.dir[0]], b = [-s.dir[1], s.dir[0]]; s.up = a[1] < 0 ? a : b; });

  const R = (n) => Math.round(n * 10) / 10;
  const P = (p) => `${R(p[0])} ${R(p[1])}`;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];

  /* ---------- flat art for each layer (SVG, shapes only) ---------- */
  function hBand(x0, x1, yAt, h, bow) {
    const xm = (x0 + x1) / 2;
    return `M${x0} ${R(yAt(x0))}Q${xm} ${R(yAt(xm) + bow * 2)} ${x1} ${R(yAt(x1))}L${x1} ${R(yAt(x1) - h)}Q${xm} ${R(yAt(xm) - h + bow * 2)} ${x0} ${R(yAt(x0) - h)}Z`;
  }
  function sleeveBand(s, a, b) {
    const o1 = add(add(s.o, mul(s.dir, -160)), mul(s.up, a)), o2 = add(add(s.o, mul(s.dir, 160)), mul(s.up, a));
    const o3 = add(add(s.o, mul(s.dir, 160)), mul(s.up, b)), o4 = add(add(s.o, mul(s.dir, -160)), mul(s.up, b));
    const m1 = add(add(s.o, mul(s.up, a)), mul(s.up, -8)), m2 = add(add(s.o, mul(s.up, b)), mul(s.up, -8));
    return `M${P(o1)}Q${P(m1)} ${P(o2)}L${P(o3)}Q${P(m2)} ${P(o4)}Z`;
  }
  const bands = (style) => (UB.STRIPE_SETS[style] || UB.STRIPE_SETS.none).bands;

  function artSVG(d, kit) {
    const W = A().width, H = A().height, j = kit.jersey, col = (z) => UB.color(d, kit, z);
    const T = GEO.torso;
    const pat = UB.PATTERNS[j.pattern.type];
    const patArt = pat && j.pattern.type !== 'none'
      ? `<g transform="${T.pattern}" opacity="${j.pattern.opacity}">${pat.draw({ color: col('pattern'), size: j.pattern.size, pos: j.pattern.pos, id: 'ph' })}</g>` : '';
    const yp = UB.render._.yokePath(j.yoke, j.yokeDepth);
    const yoke = j.yoke !== 'none'
      ? `<g transform="${T.flat}">${j.yokeTrim > 0 ? `<path d="${yp}" transform="translate(0 ${j.yokeTrim})" fill="${col('yokeTrim')}"/>` : ''}<path d="${yp}" fill="${col('yoke')}"/></g>` : '';

    // Layer 0: body
    let torso = `<rect width="${W}" height="${H}" fill="${col('body')}"/>${patArt}${yoke}`;
    for (const b of bands(j.hem.style)) {
      const off = (j.hem.offset + b.at * j.hem.size) * T.k, h = b.h * j.hem.size * T.k;
      const ext = b.at === 0 && j.hem.offset < 3 ? 30 : 0;
      torso += `<path d="${hBand(T.x0, T.x1, (x) => T.hem(x) - off + ext, h + ext, T.bow)}" fill="${col('stripe' + b.c)}"/>`;
    }
    // Layer 1: sleeves
    let sleeves = `<rect width="${W}" height="${H}" fill="${col('sleeves')}"/>${j.pattern.area === 'all' ? patArt : ''}${yoke}`;
    for (const s of GEO.sleeves) {
      for (const b of bands(j.sleeve.style)) {
        const a = (j.sleeve.offset + b.at * j.sleeve.size) * s.k, h = b.h * j.sleeve.size * s.k;
        sleeves += `<path d="${sleeveBand(s, a, a + h)}" fill="${col('stripe' + b.c)}"/>`;
      }
    }
    // Layer 2: pants
    const pc = GEO.pants;
    let pants = `<rect width="${W}" height="${H}" fill="${col('pants')}"/>`;
    const side = (inset, w, z) => {
      const [a, b] = pc.left, [c, e] = pc.right;
      return `<path d="M${a[0] + inset} ${a[1]}L${a[0] + inset + w} ${a[1]}L${b[0] + inset + w} ${b[1]}L${b[0] + inset} ${b[1]}Z` +
        `M${c[0] - inset} ${c[1]}L${c[0] - inset - w} ${c[1]}L${e[0] - inset - w} ${e[1]}L${e[0] - inset} ${e[1]}Z" fill="${col(z)}"/>`;
    };
    switch (kit.pants.stripe) {
      case 'single': pants += side(-4, 22, 'pantsStripe1'); break;
      case 'outlined': pants += side(-4, 30, 'pantsStripe2') + side(1, 20, 'pantsStripe1'); break;
      case 'twin': pants += side(0, 7, 'pantsStripe1') + side(13, 7, 'pantsStripe1'); break;
      case 'hem':
        pants += `<path d="${hBand(180, 400, () => pc.bottomL - 14, 14, 2)}${hBand(400, 600, () => pc.bottomR - 14, 14, 2)}" fill="${col('pantsStripe1')}"/>`;
        pants += `<path d="${hBand(180, 400, () => pc.bottomL - 33, 5, 2)}${hBand(400, 600, () => pc.bottomR - 33, 5, 2)}" fill="${col('pantsStripe2')}"/>`;
        break;
    }
    // Layer 3: socks
    const sk = kit.socks, style = sk.style === 'match' ? j.hem.style : sk.style;
    let socks = `<rect width="${W}" height="${H}" fill="${col('socks')}"/>`;
    for (const s of GEO.socks) {
      for (const b of bands(style)) {
        const off = (sk.offset + b.at * sk.size) * s.k, h = b.h * sk.size * s.k;
        socks += `<path d="${hBand(s.x0, s.x1, (x) => s.ref(x) - off, h, s.bow)}" fill="${col(b.c === 1 ? 'sockStripe1' : 'sockStripe2')}"/>`;
      }
    }
    const layer = (k, inner) => `<g transform="translate(0 ${k * H})"><svg x="0" y="0" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" overflow="hidden">${inner}</svg></g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H * N_LAYERS}" viewBox="0 0 ${W} ${H * N_LAYERS}">` +
      layer(0, torso) + layer(1, sleeves) + layer(2, pants) + layer(3, socks) + `</svg>`;
  }

  /* ---------- lettering, crest and logos (canvas, so web fonts work) ---------- */
  function fontOf(id) { return UB.FONTS[id] || UB.FONTS.graduate; }
  function canvasFont(f, px) { return `${f.weight} ${Math.round(px)}px ${f.family}`; }

  /* Text centred on (x, y) baseline, squeezed to maxW, with up to two outlines. */
  function drawText(ctx, txt, x, y, px, f, cols, outlines, maxW) {
    if (!txt) return;
    ctx.save();
    ctx.font = canvasFont(f, px);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    const w = ctx.measureText(txt).width, sx = maxW && w > maxW ? maxW / w : 1;
    ctx.translate(x, y);
    ctx.scale(sx, 1);
    if (outlines >= 2) { ctx.strokeStyle = cols.o2; ctx.lineWidth = px * 0.17; ctx.strokeText(txt, 0, 0); }
    if (outlines >= 1) { ctx.strokeStyle = cols.o1; ctx.lineWidth = px * 0.085; ctx.strokeText(txt, 0, 0); }
    ctx.fillStyle = cols.fill;
    ctx.fillText(txt, 0, 0);
    ctx.restore();
  }

  const imgCache = new Map();
  function loadImg(src) {
    if (!src) return Promise.resolve(null);
    if (imgCache.has(src)) return imgCache.get(src);
    const p = new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
    imgCache.set(src, p);
    return p;
  }
  function drawImageIn(ctx, im, cx, cy, w, h, rot = 0) {
    if (!im) return;
    const s = Math.min(w / im.width, h / im.height);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(im, (-im.width * s) / 2, (-im.height * s) / 2, im.width * s, im.height * s);
    ctx.restore();
  }

  async function drawCrest(ctx, d, kit, cx, cy, size) {
    const c = d.crest, col = (z) => UB.color(d, kit, z), f = fontOf(d.lettering.numberFont);
    const initials = (c.initials || '').toUpperCase();
    const fitPx = (box, max) => {
      ctx.font = canvasFont(f, 100);
      const w = ctx.measureText(initials || 'X').width / 100;
      return Math.min(max, box / Math.max(w, 0.01));
    };
    const capY = (px) => cy + px * 0.36;
    switch (c.style) {
      case 'roundel': {
        const r = size / 2, px = fitPx(size * 0.72, size * 0.46);
        ctx.fillStyle = col('crestRing'); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col('crestBg'); ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = col('crestText'); ctx.lineWidth = size * 0.018; ctx.beginPath(); ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2); ctx.stroke();
        drawText(ctx, initials, cx, capY(px), px, f, { fill: col('crestText') }, 0);
        break;
      }
      case 'shield': {
        const path = new Path2D(UB.render._.shieldPath ? UB.render._.shieldPath(cx, cy, size * 0.86, size) : '');
        ctx.fillStyle = col('crestRing'); ctx.fill(path);
        ctx.save(); ctx.translate(cx, cy); ctx.scale(0.82, 0.82); ctx.translate(-cx, -cy); ctx.fillStyle = col('crestBg'); ctx.fill(path); ctx.restore();
        const px = fitPx(size * 0.6, size * 0.44);
        drawText(ctx, initials, cx, cy + px * 0.3, px, f, { fill: col('crestText') }, 0);
        break;
      }
      case 'wordmark': {
        const txt = (c.wordmark || '').toUpperCase();
        if (!txt) break;
        ctx.font = canvasFont(f, 100);
        const px = Math.min(size * 0.42, (size * 1.25) / Math.max(ctx.measureText(txt).width / 100, 0.01));
        ctx.save(); ctx.translate(cx, cy); ctx.rotate((-12 * Math.PI) / 180); ctx.translate(-cx, -cy);
        ctx.strokeStyle = col('crestRing'); ctx.lineWidth = px * 0.16; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(cx - size * 0.62, cy + px * 0.62); ctx.quadraticCurveTo(cx, cy + px * 0.9, cx + size * 0.66, cy + px * 0.42); ctx.stroke();
        drawText(ctx, txt, cx, cy + px * 0.34, px, f, { fill: col('crestText'), o1: col('crestRing'), o2: col('crestBg') }, 2, size * 1.3);
        ctx.restore();
        break;
      }
      case 'initials': {
        const px = fitPx(size * 1.05, size * 0.8);
        drawText(ctx, initials, cx, capY(px), px, f, { fill: col('crestText'), o1: col('crestRing'), o2: col('crestBg') }, 2, size * 1.1);
        break;
      }
      case 'image':
        drawImageIn(ctx, await loadImg(c.image), cx, cy, size, size);
        break;
    }
  }

  async function drawLetters(ctx, d, kit) {
    const H = A().height, L = d.lettering, nf = fontOf(L.numberFont), col = (z) => UB.color(d, kit, z);
    const cols = { fill: col('number'), o1: col('numberOutline'), o2: col('numberOutline2') };
    const T = GEO.torso, logos = d.photoLogos || {};
    await document.fonts.load(canvasFont(nf, 60)).catch(() => {});
    // Body
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, A().width, H); ctx.clip();
    await drawCrest(ctx, d, kit, T.crest[0], T.crest[1], T.crest[2] * (d.crest.scale || 1));
    if (d.player.captain && d.player.captain !== 'none') drawText(ctx, d.player.captain, T.captain[0], T.captain[1], T.captain[2] * nf.size, nf, cols, Math.min(L.outlines, 1), 50);
    drawImageIn(ctx, await loadImg(logos.chestL), T.chestL[0], T.chestL[1], T.chestL[2], T.chestL[3]);
    drawImageIn(ctx, await loadImg(logos.chestR), T.chestR[0], T.chestR[1], T.chestR[2], T.chestR[3]);
    drawImageIn(ctx, await loadImg(logos.neck), T.neck[0], T.neck[1], T.neck[2], T.neck[3]);
    ctx.restore();
    // Sleeves
    if (L.sleeveNumbers && d.player.number) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, H, A().width, H); ctx.clip();
      for (const s of GEO.sleeves) {
        const [x, y, rot, sx, size] = s.num, px = size * nf.size;
        ctx.save(); ctx.translate(x, H + y); ctx.rotate((rot * Math.PI) / 180); ctx.scale(sx, 1);
        drawText(ctx, d.player.number, 0, px * 0.36, px, nf, cols, Math.min(L.outlines, 1), px * 1.25);
        ctx.restore();
      }
      ctx.restore();
    }
    // Pants
    const pc = GEO.pants;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 2 * H, A().width, H); ctx.clip();
    ctx.translate(0, 2 * H);
    drawImageIn(ctx, await loadImg(logos.pantsL), pc.logoL[0], pc.logoL[1], pc.logoL[2], pc.logoL[3], pc.logoL[4]);
    drawImageIn(ctx, await loadImg(logos.pantsR), pc.logoR[0], pc.logoR[1], pc.logoR[2], pc.logoR[3], pc.logoR[4]);
    ctx.restore();
  }

  /* ---------- assets ---------- */
  let assets = null;
  async function loadAssets() {
    if (assets) return assets;
    const [base, maps, edge] = await Promise.all([loadImg(A().base), loadImg(A().maps), loadImg(A().edge)]);
    const W = A().width, H = A().height;
    const read = (im) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, W, H).data; };
    const m = read(maps), e = edge ? read(edge) : null;
    const n = W * H, lab = new Uint8Array(n), dif = new Float32Array(n), shn = new Float32Array(n);
    const alpha = new Float32Array(n), seam = [];
    for (let i = 0; i < n; i++) {
      lab[i] = Math.round(m[i * 4 + 2] / 20);
      dif[i] = m[i * 4] / 255;
      shn[i] = m[i * 4 + 1] / 255;
      alpha[i] = e ? e[i * 4] / 255 : (lab[i] ? 1 : 0);
      if (e && e[i * 4 + 1] > 127) seam.push(i);
    }
    assets = { W, H, base: read(base), lab, dif, shn, alpha, seam: Int32Array.from(seam) };
    return assets;
  }

  /* ---------- compose ---------- */
  let seq = 0;
  async function render(d, kit, canvas) {
    const my = ++seq;
    const a = await loadAssets();
    const { W, H } = a;
    const svg = artSVG(d, kit);
    const art = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    imgCache.delete('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
    if (my !== seq) return false;
    const atlas = document.createElement('canvas');
    atlas.width = W; atlas.height = H * N_LAYERS;
    const ax = atlas.getContext('2d');
    if (art) ax.drawImage(art, 0, 0);
    await drawLetters(ax, d, kit);
    if (my !== seq) return false;
    const ad = ax.getImageData(0, 0, W, H * N_LAYERS).data;

    const solid = {};
    for (const z of ['collar', 'gloves', 'glovesTrim', 'helmet']) solid[z] = UB.hexToRgb(UB.color(d, kit, z));
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(W, H), o = out.data, base = a.base;
    const layerOf = [null, 0, 1, 1, null, 2, 3, null, null, null];
    const solidOf = [null, null, null, null, solid.collar, null, null, solid.gloves, solid.glovesTrim, solid.helmet];
    const n = W * H, stride = W * H * 4;
    for (let i = 0; i < n; i++) {
      const p = i * 4, l = a.lab[i], k = a.alpha[i];
      o[p + 3] = 255;
      if (!l || k <= 0) { o[p] = base[p]; o[p + 1] = base[p + 1]; o[p + 2] = base[p + 2]; continue; }
      let r, g, b;
      const ly = layerOf[l];
      if (ly !== null) { const q = p + ly * stride; r = ad[q]; g = ad[q + 1]; b = ad[q + 2]; }
      else { const s = solidOf[l]; r = s[0]; g = s[1]; b = s[2]; }
      const D = a.dif[i], S = a.shn[i] * 255;
      r = r * D + S; g = g * D + S; b = b * D + S;
      if (k < 1) { const j = 1 - k; r = r * k + base[p] * j; g = g * k + base[p + 1] * j; b = b * k + base[p + 2] * j; }
      o[p] = r; o[p + 1] = g; o[p + 2] = b;
    }
    // Where two parts meet (jersey and pants, sleeve and glove…), soften the join.
    if (a.seam.length) {
      const src = new Uint8ClampedArray(o);
      for (const i of a.seam) {
        const x = i % W, y = (i - x) / W;
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        for (let c = 0; c < 3; c++) {
          const p = i * 4 + c, r = W * 4;
          o[p] = (src[p] * 4 + (src[p - 4] + src[p + 4] + src[p - r] + src[p + r]) * 2 + src[p - r - 4] + src[p - r + 4] + src[p + r - 4] + src[p + r + 4]) / 16;
        }
      }
    }
    ctx.putImageData(out, 0, 0);
    return true;
  }

  function zoneAt(x, y) {
    if (!assets) return null;
    const i = Math.floor(y) * assets.W + Math.floor(x);
    const l = LABELS[assets.lab[i]];
    return l ? ZONE_OF[l] : null;
  }

  UB.photo = { render, zoneAt, available: () => !!UB.PHOTO_ASSETS, GEO };
})();
