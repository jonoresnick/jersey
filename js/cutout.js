/* =====================================================================
   Logo cut-out: turns a logo on a plain background (a JPG, say) into a
   transparent PNG. Runs in the browser, nothing is uploaded.

   How it works: find the background colour from the image edge, then remove
   every pixel connected to the edge that is close to that colour, so colours
   inside the logo that happen to match (white eyes, white text) are kept.
   Edges get a soft partial transparency and are cleaned of background tint.
   It works best on a plain, single-colour background. Photos with busy
   backgrounds need a dedicated background remover first.
   ===================================================================== */
(function () {
  const UB = window.UB;
  const MAX = 900;

  function load(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, MAX / Math.max(img.width, img.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, c.width, c.height);
        resolve({ w: c.width, h: c.height, data: ctx.getImageData(0, 0, c.width, c.height) });
      };
      img.onerror = () => reject(new Error('That image could not be opened.'));
      img.src = dataUrl;
    });
  }

  /* Does the image already have transparency? */
  function hasAlpha(im) {
    const d = im.data.data;
    for (let i = 3; i < d.length; i += 4 * 7) if (d[i] < 250) return true;
    return false;
  }

  /* The most likely background colour, and how uniform the edge is (0 to 1). */
  function guessBackground(im) {
    const { w, h } = im, d = im.data.data, px = [];
    const at = (x, y) => { const i = (y * w + x) * 4; px.push([d[i], d[i + 1], d[i + 2]]); };
    for (let x = 0; x < w; x++) { at(x, 0); at(x, h - 1); }
    for (let y = 1; y < h - 1; y++) { at(0, y); at(w - 1, y); }
    const med = [0, 1, 2].map((c) => px.map((p) => p[c]).sort((a, b) => a - b)[px.length >> 1]);
    const near = px.filter((p) => dist(p[0], p[1], p[2], med) < 40).length / px.length;
    return { color: med, uniform: near };
  }

  // A colour distance that roughly follows how different two colours look.
  function dist(r, g, b, bg) {
    const rm = (r + bg[0]) / 2, dr = r - bg[0], dg = g - bg[1], db = b - bg[2];
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 3;
  }

  /* opts: { bg:[r,g,b], tolerance:0..100, soft:0..100, inner:bool }
     Returns a canvas with the cut-out, trimmed to the logo. */
  function run(im, opts) {
    const { w, h } = im, src = im.data.data, n = w * h;
    const bg = opts.bg, tol = 4 + opts.tolerance * 1.5, inner = !!opts.inner;
    const d = new Float32Array(n);
    for (let i = 0; i < n; i++) d[i] = dist(src[i * 4], src[i * 4 + 1], src[i * 4 + 2], bg);

    // Background pixels: connected to the edge (or anywhere, when "inner" is on).
    const isBg = new Uint8Array(n);
    if (inner) {
      for (let i = 0; i < n; i++) if (d[i] < tol) isBg[i] = 1;
    } else {
      const stack = [];
      const seed = (x, y) => { const i = y * w + x; if (!isBg[i] && d[i] < tol) { isBg[i] = 1; stack.push(i); } };
      for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
      for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }
      while (stack.length) {
        const i = stack.pop(), x = i % w, y = (i - x) / w;
        if (x > 0) seed(x - 1, y);
        if (x < w - 1) seed(x + 1, y);
        if (y > 0) seed(x, y - 1);
        if (y < h - 1) seed(x, y + 1);
      }
    }

    // Soft edge: pixels next to the background that are only partly different are partly see-through.
    const reach = Math.round(1 + opts.soft / 35), alpha = new Float32Array(n);
    const near = new Uint8Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (isBg[i]) continue;
      for (let dy = -reach; dy <= reach && !near[i]; dy++) for (let dx = -reach; dx <= reach; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && isBg[yy * w + xx]) { near[i] = 1; break; }
      }
    }
    for (let i = 0; i < n; i++) {
      if (isBg[i]) alpha[i] = 0;
      else if (near[i] && d[i] < tol * 1.7) alpha[i] = Math.min(1, Math.max(0.05, (d[i] - tol * 0.5) / (tol * 1.1)));
      else alpha[i] = 1;
    }

    // Drop specks: opaque islands much smaller than the logo.
    const seen = new Uint8Array(n), keep = new Uint8Array(n);
    const sizes = [];
    for (let s0 = 0; s0 < n; s0++) {
      if (seen[s0] || alpha[s0] < 0.5) continue;
      const comp = [s0]; seen[s0] = 1;
      for (let k = 0; k < comp.length; k++) {
        const i = comp[k], x = i % w, y = (i - x) / w;
        for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
          if (j >= 0 && !seen[j] && alpha[j] >= 0.5) { seen[j] = 1; comp.push(j); }
        }
      }
      sizes.push(comp);
    }
    const biggest = Math.max(1, ...sizes.map((c) => c.length));
    for (const c of sizes) if (c.length >= biggest * 0.02) for (const i of c) keep[i] = 1;

    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    const octx = out.getContext('2d'), o = octx.createImageData(w, h), od = o.data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let i = 0; i < n; i++) {
      let a = keep[i] || (alpha[i] > 0 && alpha[i] < 1 && near[i]) ? alpha[i] : 0;
      if (a <= 0) continue;
      let r = src[i * 4], g = src[i * 4 + 1], b = src[i * 4 + 2];
      if (a < 1) {                                  // take the background tint out of edge pixels
        r = bg[0] + (r - bg[0]) / a; g = bg[1] + (g - bg[1]) / a; b = bg[2] + (b - bg[2]) / a;
      }
      od[i * 4] = Math.max(0, Math.min(255, r)); od[i * 4 + 1] = Math.max(0, Math.min(255, g)); od[i * 4 + 2] = Math.max(0, Math.min(255, b)); od[i * 4 + 3] = Math.round(a * 255);
      const x = i % w, y = (i - x) / w;
      if (a > 0.3) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    octx.putImageData(o, 0, 0);
    if (x1 < 0) return out;                         // nothing left
    const pad = 4, cx = Math.max(0, x0 - pad), cy = Math.max(0, y0 - pad), cw = Math.min(w, x1 + pad + 1) - cx, ch = Math.min(h, y1 + pad + 1) - cy;
    const trimmed = document.createElement('canvas');
    trimmed.width = cw; trimmed.height = ch;
    trimmed.getContext('2d').drawImage(out, cx, cy, cw, ch, 0, 0, cw, ch);
    return trimmed;
  }

  UB.cutout = { load, hasAlpha, guessBackground, run };
})();
