/* =====================================================================
   3D view
   ---------------------------------------------------------------------
   A hockey player built from lofted cross-sections (three.js r147).
   Drag to turn, scroll or pinch to zoom.

   Each fabric part has its own canvas texture painted from the design:
     torso   u: 0 = left side, 0.25 = front centre, 0.75 = back centre; v: 0 = hem, 1 = collar
     sleeve  u: 0.5 = outer arm, 0.75 = front;                          v: 0 = cuff, 1 = shoulder
     legs    u: 0.5 = outer side, 0.75 = front;                         v: 0 = bottom, 1 = top
   Stripe units from the builder are converted to metres with K (m per unit).
   ===================================================================== */
(function () {
  const UB = window.UB;
  const K = 0.0022;           // builder stripe unit → metres
  const TAU = Math.PI * 2;

  /* ---------------- geometry helpers ---------------- */
  // Rings of points (same count each) → surface with UVs; seam normals averaged.
  function loft(rings, flip = false) {
    const M = rings.length, N = rings[0].length;
    const pos = [], uv = [], idx = [];
    for (let j = 0; j < M; j++) {
      for (let i = 0; i <= N; i++) {
        const p = rings[j][i % N];
        pos.push(p[0], p[1], p[2]);
        uv.push(i / N, j / (M - 1));
      }
    }
    for (let j = 0; j < M - 1; j++) {
      for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
        if (flip) idx.push(a, d, c, a, b, d);
        else idx.push(a, c, d, a, d, b);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const n = g.attributes.normal;
    for (let j = 0; j < M; j++) {
      const a = j * (N + 1), b = a + N;
      const x = n.getX(a) + n.getX(b), y = n.getY(a) + n.getY(b), z = n.getZ(a) + n.getZ(b), l = Math.hypot(x, y, z) || 1;
      n.setXYZ(a, x / l, y / l, z / l); n.setXYZ(b, x / l, y / l, z / l);
    }
    return g;
  }
  const sgnPow = (v, p) => Math.sign(v) * Math.pow(Math.abs(v), p);

  // Torso: superellipse cross-sections, with soft vertical folds toward the hem.
  function torsoGeometry() {
    const N = 96;
    const prof = [ // y, half-width, half-depth, z offset
      [0.80, 0.272, 0.172, 0.00], [0.84, 0.268, 0.170, 0.00], [0.92, 0.262, 0.166, 0.00], [1.02, 0.258, 0.164, 0.004],
      [1.12, 0.262, 0.168, 0.008], [1.22, 0.268, 0.166, 0.008], [1.30, 0.270, 0.160, 0.004], [1.36, 0.262, 0.150, 0.0],
      [1.40, 0.236, 0.138, -0.004], [1.43, 0.190, 0.122, -0.008], [1.455, 0.130, 0.104, -0.010], [1.47, 0.092, 0.084, -0.008],
      [1.475, 0.082, 0.076, -0.006],
    ];
    const y0 = prof[0][0], y1 = prof[prof.length - 1][0];
    const rings = [];
    // Interpolate a denser set of rings.
    for (let s = 0; s < prof.length - 1; s++) {
      const [ya, aa, ba, za] = prof[s], [yb, ab, bb, zb] = prof[s + 1];
      const steps = s < 8 ? 5 : 3;
      for (let t = 0; t < steps; t++) {
        const k = t / steps, y = ya + (yb - ya) * k, a = aa + (ab - aa) * k, b = ba + (bb - ba) * k, z0 = za + (zb - za) * k;
        const v = (y - y0) / (y1 - y0);
        const ring = [];
        for (let i = 0; i < N; i++) {
          const th = (i / N) * TAU, c = Math.cos(th), sn = Math.sin(th);
          const hem = Math.pow(Math.max(0, 1 - v / 0.55), 1.6);
          const fold = 1 + 0.012 * hem * Math.sin(9 * th + 1.3) + 0.006 * hem * Math.sin(5 * th + 2.2) + 0.004 * Math.sin(3 * th + v * 5);
          ring.push([-a * fold * sgnPow(c, 2 / 2.7), y, z0 + b * fold * sgnPow(sn, 2 / 2.7)]);
        }
        rings.push(ring);
      }
    }
    const last = prof[prof.length - 1];
    const ring = [];
    for (let i = 0; i < N; i++) { const th = (i / N) * TAU; ring.push([-last[1] * Math.cos(th), last[0], last[3] + last[2] * Math.sin(th)]); }
    rings.push(ring);
    return { geo: loft(rings, true), y0, y1 };
  }

  // A tube along a path (first point = v 0). radius(v) and optional folds(v, phi).
  function tube(path, radius, opts = {}) {
    const N = opts.N || 48, M = opts.M || 40;
    const curve = new THREE.CatmullRomCurve3(path.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
    const out = new THREE.Vector3(...(opts.outward || [1, 0, 0]));
    const reverse = !!opts.reverse, flip = (out.x < 0) !== reverse;
    const rings = [];
    for (let j = 0; j < M; j++) {
      const v = j / (M - 1), P = curve.getPointAt(v), T = curve.getTangentAt(v);
      const O = out.clone().sub(T.clone().multiplyScalar(out.dot(T))).normalize();
      let F = new THREE.Vector3().crossVectors(T, O).normalize();
      if (F.z < 0) F.negate();
      const ring = [];
      for (let i = 0; i < N; i++) {
        const phi = reverse ? Math.PI - (i / N) * TAU : (i / N) * TAU - Math.PI;   // u = 0.5 → outward
        let r = radius(v, phi);
        if (opts.folds) r *= 1 + opts.folds(v, phi);
        const sx = opts.squash ? opts.squash(v, phi) : 1;
        const fwd = opts.forward ? opts.forward(v) : 0;
        ring.push([
          P.x + r * Math.cos(phi) * O.x + r * sx * Math.sin(phi) * F.x + fwd * F.x,
          P.y + r * Math.cos(phi) * O.y + r * sx * Math.sin(phi) * F.y + fwd * F.y,
          P.z + r * Math.cos(phi) * O.z + r * sx * Math.sin(phi) * F.z + fwd * F.z,
        ]);
      }
      rings.push(ring);
    }
    return loft(rings, flip);
  }

  function roundedBox(w, h, d, r, seg = 4) {
    const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
    const p = g.attributes.position, v = new THREE.Vector3(), hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const c = new THREE.Vector3(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
      const n = v.clone().sub(c);
      if (n.lengthSq() > 0) n.normalize().multiplyScalar(r);
      p.setXYZ(i, c.x + n.x, c.y + n.y, c.z + n.z);
    }
    g.computeVertexNormals();
    return g;
  }

  /* ---------------- pose ---------------- */
  const POSE = {
    arm: (s) => [[0.305 * s, 0.86, 0.17], [0.33 * s, 1.08, -0.02], [0.27 * s, 1.27, 0.0], [0.205 * s, 1.36, 0.0]],
    leg: (s) => ({ hip: [0.125 * s, 0.82, 0.0], knee: [0.135 * s, 0.56, 0.02], ankle: [0.125 * s, 0.17, 0.0] }),
  };

  /* ---------------- fabric look ---------------- */
  function weaveNormalMap() {
    const n = 128, c = document.createElement('canvas');
    c.width = c.height = n;
    const x = c.getContext('2d'), img = x.createImageData(n, n), h = new Float32Array(n * n);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      h[j * n + i] = 0.5 + 0.25 * Math.sin(i * Math.PI / 2) * Math.sin(j * Math.PI / 2) + (rnd() - 0.5) * 0.25;
    }
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const dx = h[j * n + ((i + 1) % n)] - h[j * n + ((i + n - 1) % n)], dy = h[((j + 1) % n) * n + i] - h[((j + n - 1) % n) * n + i];
      const k = (j * n + i) * 4;
      img.data[k] = 128 - dx * 90; img.data[k + 1] = 128 - dy * 90; img.data[k + 2] = 255; img.data[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }

  /* ---------------- textures from the design ---------------- */
  const P = UB.paint;
  const TEX = { torso: [2048, 896], sleeve: [1024, 860], legL: [512, 512], legR: [512, 512], sock: [512, 512], helmet: [512, 256] };

  function newCanvas([w, h]) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  // Shapes (stripes, yoke, pattern, collar) for every texture, as one SVG per texture.
  function svgFor(part, d, kit) {
    const [W, H] = TEX[part], j = kit.jersey, col = (z) => UB.color(d, kit, z);
    const rect = (z) => `<rect width="${W}" height="${H}" fill="${col(z)}"/>`;
    const band = (y, h, fill) => `<rect x="0" y="${(H - y - h).toFixed(1)}" width="${W}" height="${h.toFixed(1)}" fill="${fill}"/>`;
    const bands = (style) => (UB.STRIPE_SETS[style] || UB.STRIPE_SETS.none).bands;
    const pat = UB.PATTERNS[j.pattern.type];
    const yp = UB.render._.yokePath(j.yoke, j.yokeDepth);
    let s = '';
    if (part === 'torso') {
      const pxm = H / 0.675;   // pixels per metre (vertical)
      s += rect('body');
      if (pat && j.pattern.type !== 'none') {
        const art = pat.draw({ color: col('pattern'), size: j.pattern.size, pos: j.pattern.pos, id: 'm3' });
        for (const cx of [W * 0.25, W * 0.75]) s += `<g transform="translate(${cx} ${H}) scale(2.4) translate(-200 -413)" opacity="${j.pattern.opacity}">${art}</g>`;
      }
      if (j.yoke !== 'none') {
        for (const cx of [W * 0.25, W * 0.75]) {
          s += `<g transform="translate(${cx} ${-0.02 * pxm}) scale(3.2 2.9) translate(-200 -38)">` +
            (j.yokeTrim > 0 ? `<path d="${yp}" transform="translate(0 ${j.yokeTrim})" fill="${col('yokeTrim')}"/>` : '') +
            `<path d="${yp}" fill="${col('yoke')}"/></g>`;
        }
      }
      for (const b of bands(j.hem.style)) {
        const y = (j.hem.offset + b.at * j.hem.size) * K * pxm, h = b.h * j.hem.size * K * pxm;
        s += band(y, h, col('stripe' + b.c));
      }
      // Collar: a band around the neck; V-neck and lace-up add a V at the front.
      const cb = 0.03 * pxm;
      s += `<rect x="0" y="0" width="${W}" height="${cb}" fill="${col('collar')}"/>`;
      if (j.collar === 'vneck' || j.collar === 'laceup') {
        const cx = W * 0.25, w = W * 0.045, depth = (j.collar === 'vneck' ? 0.12 : 0.15) * pxm;
        s += `<path d="M${cx - w} ${cb * 0.6}L${cx} ${depth}L${cx + w} ${cb * 0.6}L${cx + w - 18} ${cb * 0.6}L${cx} ${depth - 30}L${cx - w + 18} ${cb * 0.6}Z" fill="${col('collar')}"/>`;
        if (j.collar === 'laceup') {
          let lace = '';
          for (let k = 0; k < 4; k++) {
            const y = cb + 14 + k * 28, hw = w * (1 - (y + 14) / depth);
            lace += `M${cx - hw} ${y}L${cx + hw} ${y + 14}M${cx + hw} ${y}L${cx - hw} ${y + 14}`;
          }
          s += `<path d="M${cx - w + 18} ${cb * 0.6}L${cx} ${depth - 30}L${cx + w - 18} ${cb * 0.6}Z" fill="${col('collar')}" opacity=".85"/>`;
          s += `<path d="${lace}" stroke="${col('laces')}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
        }
      }
    } else if (part === 'sleeve') {
      const pxm = H / 0.58;
      s += rect('sleeves');
      if (pat && j.pattern.type !== 'none' && j.pattern.area === 'all') {
        s += `<g transform="translate(${W / 2} ${H}) scale(2.2) translate(-200 -413)" opacity="${j.pattern.opacity}">${pat.draw({ color: col('pattern'), size: j.pattern.size, pos: j.pattern.pos, id: 'm3s' })}</g>`;
      }
      if (j.yoke !== 'none') {
        const depth = Math.max(0.04, (j.yokeDepth - 70) * K * 0.9) * pxm;
        if (j.yokeTrim > 0) s += band(H - depth - j.yokeTrim * 1.6, depth + j.yokeTrim * 1.6, col('yokeTrim'));
        s += band(H - depth, depth, col('yoke'));
      }
      s += band(0, 0.028 * pxm, col('cuffs'));
      for (const b of bands(j.sleeve.style)) {
        const y = (j.sleeve.offset + b.at * j.sleeve.size) * K * pxm, h = b.h * j.sleeve.size * K * pxm;
        s += band(y, h, col('stripe' + b.c));
      }
    } else if (part === 'legL' || part === 'legR') {
      s += rect('pants');
      const side = (inset, w, z) => `<rect x="${W / 2 - inset - w / 2}" y="0" width="${w}" height="${H}" fill="${col(z)}"/>`;
      switch (kit.pants.stripe) {
        case 'single': s += side(0, 60, 'pantsStripe1'); break;
        case 'outlined': s += side(0, 84, 'pantsStripe2') + side(0, 56, 'pantsStripe1'); break;
        case 'twin': s += side(-18, 18, 'pantsStripe1') + side(18, 18, 'pantsStripe1'); break;
        case 'hem': s += band(20, 30, col('pantsStripe1')) + band(58, 10, col('pantsStripe2')); break;
      }
      s += band(H - 26, 26, UB.shade(col('pants'), -0.25));   // waistband
    } else if (part === 'sock') {
      const sk = kit.socks, style = sk.style === 'match' ? j.hem.style : sk.style;
      s += rect('socks');
      for (const b of bands(style)) {
        const top = 10, len = 290;                        // flat sock: y 10 (top) … 300 (bottom)
        const bottom = 250 - sk.offset - b.at * sk.size, h = b.h * sk.size;
        const y0 = (1 - (bottom - top) / len) * H, hh = (h / len) * H;
        s += band(y0, hh, col(b.c === 1 ? 'sockStripe1' : 'sockStripe2'));
      }
    } else if (part === 'helmet') {
      s += rect('helmet');
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${s}</svg>`;
  }

  function drawArchedText(ctx, txt, cx, cy, radius, px, f, fill, outline, maxW) {
    ctx.save();
    ctx.font = P.canvasFont(f, px);
    const spacing = px * 0.08;
    let widths = [...txt].map((ch) => ctx.measureText(ch).width + spacing);
    let total = widths.reduce((a, b) => a + b, 0) - spacing;
    const sx = maxW && total > maxW ? maxW / total : 1;
    widths = widths.map((w) => w * sx); total *= sx;
    let a = -total / 2 / radius;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'round';
    [...txt].forEach((ch, i) => {
      const w = widths[i], ang = a + w / 2 / radius;
      ctx.save();
      ctx.translate(cx + Math.sin(ang) * radius, cy + radius - Math.cos(ang) * radius);
      ctx.rotate(ang); ctx.scale(sx, 1);
      if (outline) { ctx.strokeStyle = outline; ctx.lineWidth = px * 0.14; ctx.strokeText(ch, 0, 0); }
      ctx.fillStyle = fill; ctx.fillText(ch, 0, 0);
      ctx.restore();
      a += w / radius;
    });
    ctx.restore();
  }

  async function paintExtras(part, ctx, d, kit) {
    const [W, H] = TEX[part], L = d.lettering, nf = P.fontOf(L.numberFont), col = (z) => UB.color(d, kit, z);
    const cols = { fill: col('number'), o1: col('numberOutline'), o2: col('numberOutline2') };
    const logos = d.photoLogos || {};
    await document.fonts.load(P.canvasFont(nf, 60)).catch(() => {});
    if (part === 'torso') {
      const pxm = H / 0.675, Y = (v) => H - v * H;
      await P.drawCrest(ctx, d, kit, W * 0.25, Y(0.6), 0.25 * pxm * (d.crest.scale || 1));
      // Captaincy on the left of the chest (as you face the player), sponsor on the right.
      if (d.player.captain && d.player.captain !== 'none') {
        const size = 0.075 * pxm;
        if (logos.captain) P.drawImageIn(ctx, await P.loadImg(logos.captain), W * 0.165, Y(0.82), size, size);
        else P.drawText(ctx, d.player.captain, W * 0.165, Y(0.82) + size * nf.size * 0.36, size * nf.size, nf, cols, Math.min(L.outlines, 1), 120);
      }
      P.drawImageIn(ctx, await P.loadImg(logos.sponsor), W * 0.335, Y(0.82), 0.11 * pxm, 0.05 * pxm);
      P.drawImageIn(ctx, await P.loadImg(logos.neck), W * 0.25, Y(0.9), 0.04 * pxm, 0.025 * pxm);
      // Back: name and number
      const name = (d.player.name || '').toUpperCase(), nameF = P.fontOf(L.nameFont);
      await document.fonts.load(P.canvasFont(nameF, 60)).catch(() => {});
      if (name) {
        const px = 0.065 * pxm * nameF.size;
        if (L.nameArch) drawArchedText(ctx, name, W * 0.75, Y(0.83), 0.9 * pxm, px, nameF, col('name'), L.outlines >= 1 ? col('numberOutline') : null, 0.36 * pxm);
        else P.drawText(ctx, name, W * 0.75, Y(0.79), px, nameF, { fill: col('name'), o1: col('numberOutline') }, L.outlines >= 1 ? 1 : 0, 0.36 * pxm);
      }
      P.drawText(ctx, d.player.number || '', W * 0.75, Y(0.38), 0.34 * pxm * nf.size, nf, cols, L.outlines, 0.36 * pxm);
    } else if (part === 'sleeve') {
      const pxm = H / 0.58;
      if (L.sleeveNumbers && d.player.number) P.drawText(ctx, d.player.number, W * 0.5, H - 0.74 * H + 0.05 * pxm, 0.13 * pxm * nf.size, nf, cols, Math.min(L.outlines, 1), 0.16 * pxm);
      if (d.crest.patch && d.crest.patch !== 'none') {
        const size = 0.07 * pxm, cx = W * 0.5, cy = H - 0.9 * H;
        if (d.crest.patch === 'image') P.drawImageIn(ctx, await P.loadImg(d.crest.patchImage), cx, cy, size, size);
        else await P.drawCrest(ctx, { ...d, crest: { ...d.crest, style: 'roundel' } }, kit, cx, cy, size);
      }
    } else if (part === 'legL' || part === 'legR') {
      const pxm = H / 0.3;
      const img = part === 'legL' ? logos.pantsL : logos.pantsR;
      const fx = part === 'legL' ? W * 0.72 : W * 0.28;
      if (img) P.drawImageIn(ctx, await P.loadImg(img), fx, H * 0.6, 0.09 * pxm, 0.06 * pxm);
      else if (part === 'legR' && L.pantsCrest) await P.drawCrest(ctx, { ...d, crest: { ...d.crest, style: d.crest.style === 'image' && d.crest.image ? 'image' : 'roundel' } }, kit, fx, H * 0.62, 0.08 * pxm);
    } else if (part === 'helmet') {
      if (L.helmetNumber && d.player.number) P.drawText(ctx, d.player.number, W * 0.75, H * 0.62, H * 0.2 * nf.size, nf, { fill: col('helmetDecal') }, 0, W * 0.12);
    }
  }

  /* ---------------- scene ---------------- */
  let three = null;

  function build(container) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    scene.environment.intensity = 0.8;

    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    camera.position.set(0.6, 1.25, 4.4);
    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.6;
    controls.maxDistance = 7;
    controls.minPolarAngle = 0.25;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.update();

    const key = new THREE.DirectionalLight(0xffffff, 1.6);
    key.position.set(-2.2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -1.5; key.shadow.camera.right = 1.5; key.shadow.camera.top = 2.2; key.shadow.camera.bottom = -0.5;
    key.shadow.radius = 4; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xdfe8ff, 0.7);
    rim.position.set(2.5, 2.5, -3);
    scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.35));

    const floor = new THREE.Mesh(new THREE.CircleGeometry(2.4, 64), new THREE.ShadowMaterial({ opacity: 0.28 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const weave = weaveNormalMap();
    const fabric = (map, repeat = [10, 5], extra = {}) => {
      const n = weave.clone(); n.needsUpdate = true; n.repeat.set(...repeat);
      return new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, map, normalMap: n, normalScale: new THREE.Vector2(0.25, 0.25), roughness: 0.85, sheen: 0.18, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xffffff), ...extra });
    };

    const textures = {};
    for (const k of Object.keys(TEX)) {
      const c = newCanvas(TEX[k]);
      const t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 8;
      t.wrapS = THREE.RepeatWrapping;
      textures[k] = { canvas: c, tex: t };
    }

    const root = new THREE.Group();
    scene.add(root);
    const add = (geo, mat, zone, cast = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = cast; m.receiveShadow = true;
      m.userData.zone = zone;
      root.add(m);
      return m;
    };

    const mats = {};
    // Jersey
    const torso = torsoGeometry();
    mats.torso = fabric(textures.torso.tex, [16, 6]);
    add(torso.geo, mats.torso, 'body');
    mats.sleeve = fabric(textures.sleeve.tex, [8, 6]);
    for (const s of [-1, 1]) {
      const geo = tube(POSE.arm(s), (v) => 0.074 + 0.03 * Math.pow(v, 0.8) + 0.014 * Math.exp(-(((v - 0.42) / 0.1) ** 2)) + 0.02 * Math.pow(v, 6), {
        outward: [s, 0, 0], reverse: s > 0, N: 64, M: 48,
        folds: (v, phi) => 0.03 * Math.exp(-(((v - 0.4) / 0.1) ** 2)) * Math.sin(v * 70 + phi * 1.5) + 0.012 * Math.sin(3 * phi + v * 8),
      });
      add(geo, mats.sleeve, 'sleeves');
    }
    // Pants: girdle + two legs
    mats.pants = new THREE.MeshPhysicalMaterial({ side: THREE.DoubleSide, color: 0xffffff, roughness: 0.55, clearcoat: 0.15, clearcoatRoughness: 0.6, sheen: 0.4, sheenRoughness: 0.4 });
    const gRings = [];
    for (let j = 0; j <= 10; j++) {
      const y = 1.0 - j * 0.022, a = 0.255 + j * 0.0045, b = 0.165 + j * 0.002, ring = [];
      for (let i = 0; i < 72; i++) { const th = (i / 72) * TAU; ring.push([a * sgnPow(Math.cos(th), 0.8), y, b * sgnPow(Math.sin(th), 0.8)]); }
      gRings.push(ring);
    }
    mats.girdle = mats.pants.clone();
    add(loft(gRings, true), mats.girdle, 'pants');
    for (const [s, part] of [[-1, 'legL'], [1, 'legR']]) {
      const L = POSE.leg(s);
      const geo = tube([[L.knee[0] + 0.005 * s, 0.53, 0.02], [L.hip[0] + 0.012 * s, 0.68, 0.01], [L.hip[0] + 0.01 * s, 0.84, 0.0]],
        (v) => 0.128 + 0.012 * Math.sin(v * Math.PI), { outward: [s, 0, 0], reverse: s > 0, N: 56, M: 30,
          folds: (v, phi) => 0.03 * Math.sin(4 * phi + v * 3 + s) * (1 - v) + 0.02 * Math.pow(1 - v, 6) });
      mats[part] = mats.pants.clone();
      mats[part].map = textures[part].tex;
      add(geo, mats[part], 'pants');
    }
    // Socks over shin pads
    mats.sock = fabric(textures.sock.tex, [6, 8]);
    for (const s of [-1, 1]) {
      const L = POSE.leg(s);
      const geo = tube([L.ankle, [L.ankle[0], 0.36, 0.015], [L.knee[0], 0.6, 0.02]],
        (v) => 0.058 + 0.03 * Math.sin(Math.min(1, v * 1.25) * Math.PI * 0.62) + 0.008 * Math.exp(-(((v - 0.86) / 0.07) ** 2)), {
          outward: [s, 0, 0], N: 48, M: 36,
          squash: (v, phi) => (Math.sin(phi) > 0 ? 1.12 : 0.95),
          folds: (v, phi) => 0.03 * Math.exp(-((v / 0.08) ** 2)) * Math.sin(phi * 6) + 0.006 * Math.sin(2 * phi + v * 10),
        });
      add(geo, mats.sock, 'socks');
    }
    // Skates
    mats.skates = new THREE.MeshPhysicalMaterial({ color: 0x17191c, roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    mats.skatesTrim = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xd8dde2, metalness: 1, roughness: 0.2 });
    const holder = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.45 });
    for (const s of [-1, 1]) {
      const x = POSE.leg(s).ankle[0];
      const boot = add(roundedBox(0.11, 0.16, 0.29, 0.04), mats.skates, 'skates'); boot.position.set(x, 0.135, 0.05);
      const tongue = add(roundedBox(0.075, 0.12, 0.04, 0.018), mats.skates, 'skates'); tongue.position.set(x, 0.2, 0.08); tongue.rotation.x = -0.25;
      const toe = add(roundedBox(0.105, 0.06, 0.1, 0.03), mats.skatesTrim, 'skatesTrim'); toe.position.set(x, 0.085, 0.15);
      const h = add(new THREE.BoxGeometry(0.035, 0.04, 0.3), holder, null); h.position.set(x, 0.045, 0.04);
      const b = add(roundedBox(0.008, 0.028, 0.32, 0.004), steel, null); b.position.set(x, 0.015, 0.04);
    }
    // Gloves (cuff, padded back of hand, finger rolls)
    mats.gloves = new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.6, sheen: 0.5, sheenRoughness: 0.5 });
    mats.glovesTrim = new THREE.MeshPhysicalMaterial({ color: 0xffc62e, roughness: 0.6, sheen: 0.5, sheenRoughness: 0.5 });
    for (const s of [-1, 1]) {
      const [W0, E] = POSE.arm(s);
      const w = new THREE.Vector3(...W0), dir = w.clone().sub(new THREE.Vector3(...E)).normalize();
      const g = new THREE.Group();
      g.position.copy(w);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.1, 0.14, 40, 1, true), mats.gloves); cuff.position.y = -0.02;
      const roll = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.018, 16, 40), mats.glovesTrim); roll.rotation.x = Math.PI / 2; roll.position.y = 0.05;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.096, 0.101, 0.05, 40, 1, true), mats.glovesTrim); band.position.y = -0.05;
      const hand = new THREE.Mesh(roundedBox(0.11, 0.15, 0.1, 0.035), mats.gloves); hand.position.set(0, -0.16, 0.0);
      g.add(cuff, roll, band, hand);
      for (let k = 0; k < 4; k++) {
        const f = new THREE.Mesh(new THREE.CapsuleGeometry(0.02, 0.07, 6, 12), mats.gloves);
        f.position.set(-0.039 + k * 0.026, -0.25, 0.025); f.rotation.x = 0.5;
        g.add(f);
      }
      g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.userData.zone = m.material === mats.glovesTrim ? 'glovesTrim' : 'gloves'; } });
      root.add(g);
    }
    // Stick, held across the body like the photo
    mats.stick = new THREE.MeshPhysicalMaterial({ color: 0x16181a, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const tape = new THREE.MeshStandardMaterial({ color: 0xf4f4f2, roughness: 0.85 });
    const stick = new THREE.Group();
    const shaftA = new THREE.Vector3(-0.42, 0.79, 0.27), shaftB = new THREE.Vector3(0.95, 0.83, 0.3);
    const len = shaftA.distanceTo(shaftB);
    const shaft = new THREE.Mesh(roundedBox(0.03, 0.022, len, 0.008), mats.stick);
    shaft.position.copy(shaftA.clone().add(shaftB).multiplyScalar(0.5));
    shaft.lookAt(shaftB);
    const knob = new THREE.Mesh(roundedBox(0.034, 0.026, 0.12, 0.01), tape); knob.position.copy(shaftA); knob.lookAt(shaftB); knob.translateZ(0.04);
    const blade = new THREE.Mesh(roundedBox(0.012, 0.075, 0.3, 0.006), mats.stick);
    blade.position.copy(shaftB).add(new THREE.Vector3(0.1, 0.07, 0.0)); blade.rotation.set(0, Math.PI / 2, 0.75);
    const bladeTape = new THREE.Mesh(roundedBox(0.014, 0.062, 0.2, 0.006), tape);
    bladeTape.position.copy(blade.position).add(new THREE.Vector3(0.04, 0.035, 0)); bladeTape.rotation.copy(blade.rotation);
    stick.add(shaft, knob, blade, bladeTape);
    stick.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.userData.zone = m.material === mats.stick ? 'stick' : null; } });
    root.add(stick);
    const stickGroup = stick;
    // Mannequin head and neck, helmet, visor
    const skin = new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.55 });
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.066, 0.16, 32), skin); neck.position.set(0, 1.52, -0.005);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 32), skin); head.scale.set(0.088, 0.115, 0.1); head.position.set(0, 1.68, 0.012);
    for (const m of [neck, head]) { m.castShadow = true; m.receiveShadow = true; root.add(m); }
    mats.helmet = new THREE.MeshPhysicalMaterial({ map: textures.helmet.tex, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.12 });
    const shell = add(new THREE.SphereGeometry(1, 64, 32, 0, TAU, 0, Math.PI * 0.56), mats.helmet, 'helmet');
    shell.scale.set(0.112, 0.118, 0.135); shell.position.set(0, 1.665, -0.005);
    mats.helmetTrim = new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.3, clearcoat: 0.8 });
    for (const s of [-1, 1]) {
      const ear = add(roundedBox(0.03, 0.08, 0.07, 0.014), mats.helmetTrim, 'helmetTrim');
      ear.position.set(0.105 * s, 1.625, 0.015);
    }
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.118, 0.12, 0.055, 48, 1, true, -Math.PI * 0.33, Math.PI * 0.66),
      new THREE.MeshPhysicalMaterial({ color: 0xdde8f5, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, side: THREE.DoubleSide, clearcoat: 1 }));
    visor.position.set(0, 1.645, 0.0);
    root.add(visor);

    three = { renderer, scene, camera, controls, textures, mats, container, root, stick: stickGroup, dirty: true, running: false, seq: 0 };
    controls.addEventListener('change', () => { three.dirty = true; });
    const ro = new ResizeObserver(() => resize());
    ro.observe(container);
    resize();
    return three;
  }

  function resize() {
    if (!three) return;
    const r = three.container.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width)), h = Math.max(1, Math.floor(r.height));
    three.renderer.setSize(w, h, false);
    three.renderer.domElement.style.width = '100%';
    three.renderer.domElement.style.height = '100%';
    three.camera.aspect = w / h;
    // Keep the whole player in frame on narrow screens.
    three.camera.fov = w / h < 0.8 ? 38 : 28;
    three.camera.updateProjectionMatrix();
    three.dirty = true;
  }

  function loop() {
    if (!three || !three.running) return;
    requestAnimationFrame(loop);
    const moved = three.controls.update();
    if (three.dirty || moved) {
      three.renderer.render(three.scene, three.camera);
      three.dirty = false;
    }
  }

  async function paint(d, kit) {
    const my = ++three.seq;
    const svgs = {};
    for (const k of Object.keys(TEX)) svgs[k] = svgFor(k, d, kit);
    const imgs = await Promise.all(Object.keys(TEX).map((k) => new Promise((res) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null);
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgs[k]);
    })));
    if (my !== three.seq) return;
    const keys = Object.keys(TEX);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i], { canvas } = three.textures[k], ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (imgs[i]) ctx.drawImage(imgs[i], 0, 0);
      await paintExtras(k, ctx, d, kit);
      if (my !== three.seq) return;
    }
    for (const k of keys) three.textures[k].tex.needsUpdate = true;
    const col = (z) => new THREE.Color(UB.color(d, kit, z)).convertSRGBToLinear();
    three.mats.gloves.color.copy(col('gloves'));
    three.mats.glovesTrim.color.copy(col('glovesTrim'));
    three.mats.skates.color.copy(col('skates'));
    three.mats.skatesTrim.color.copy(col('skatesTrim'));
    three.mats.stick.color.copy(col('stick'));
    three.mats.helmetTrim.color.copy(col('helmetTrim'));
    three.stick.visible = d.lettering.stick !== false;
    three.dirty = true;
  }

  /* Public API */
  function show(container, d, kit) {
    if (!window.THREE || !THREE.OrbitControls) return false;
    if (!three) build(container);
    else if (three.container !== container) {
      container.appendChild(three.renderer.domElement);
      three.container = container;
    }
    resize();
    if (!three.running) { three.running = true; loop(); }
    paint(d, kit);
    return true;
  }
  function hide() { if (three) three.running = false; }
  function zoneAt(clientX, clientY) {
    if (!three) return null;
    const r = three.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, three.camera);
    const hit = ray.intersectObjects(three.root.children, true).find((h) => h.object.visible);
    return hit ? hit.object.userData.zone || null : null;
  }
  async function snapshot(d, kit, w = 1400, h = 1600) {
    if (!three) return null;
    await paint(d, kit);
    const { renderer, camera } = three;
    const size = renderer.getSize(new THREE.Vector2()), aspect = camera.aspect;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    renderer.render(three.scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    renderer.setSize(size.x, size.y, false); camera.aspect = aspect; camera.updateProjectionMatrix();
    resize();
    return url;
  }

  UB.model3d = { show, hide, zoneAt, snapshot, repaint: (d, kit) => three && paint(d, kit), available: () => !!(window.THREE && THREE.OrbitControls) };
})();
