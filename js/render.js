/* =====================================================================
   SVG rendering for the jersey (front/back), pants, socks and helmet.
   Every coloured shape carries data-zone="<zone id>" so clicking it in
   the preview opens that zone's colour picker.
   ===================================================================== */
(function () {
  const UB = window.UB;
  let uidN = 0;
  const uid = () => 'u' + (++uidN).toString(36) + '-';
  const R = (n) => Math.round(n * 100) / 100;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const P = (p) => `${R(p[0])} ${R(p[1])}`;
  const poly = (pts) => 'M' + pts.map(P).join('L') + 'Z';
  const NO_HIT = 'pointer-events="none"';
  const OUTLINE = '#0a1420';

  const V = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1]],
    mul: (a, k) => [a[0] * k, a[1] * k],
    mid: (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
    norm: (a) => { const l = Math.hypot(a[0], a[1]); return [a[0] / l, a[1] / l]; },
  };

  /* ---------- jersey geometry (left half; the right half is mirrored) ---------- */
  const G = {
    neck: [160, 38], seam: [118, 50], shoulder: [75, 62],
    cuffOut: [8, 262], cuffIn: [68, 290], armpit: [118, 160], hem: [112, 405],
  };
  const MX = (p) => [400 - p[0], p[1]];
  const NECK = {
    crew: 'Q200 98 240 38',
    laceup: 'Q200 98 240 38',
    vneck: 'Q184 56 200 98Q216 56 240 38',
  };
  const BACK_NECK = 'Q200 62 240 38';
  const SLEEVE = [[118, -20], [118, 160], [68, 290], [60, 340], [-60, 340], [-60, -20]];
  const TORSO = [[118, -20], [282, -20], [282, 160], [295, 440], [105, 440], [118, 160]];

  const CUFF_DIR = V.norm(V.sub(G.cuffIn, G.cuffOut));
  const UP = [CUFF_DIR[1], -CUFF_DIR[0]];            // perpendicular to the cuff, toward the shoulder
  const CUFF_MID = V.mid(G.cuffOut, G.cuffIn);
  const AXIS = V.norm(V.sub(V.mid(G.shoulder, G.armpit), CUFF_MID));
  const AXIS_DEG = (Math.atan2(AXIS[0], -AXIS[1]) * 180) / Math.PI;

  function silhouette(neck) {
    return `M${P(G.neck)}${neck}L${P(MX(G.shoulder))}L${P(MX(G.cuffOut))}L${P(MX(G.cuffIn))}L${P(MX(G.armpit))}` +
      `L${P(MX(G.hem))}Q200 413 ${P(G.hem)}L${P(G.armpit)}L${P(G.cuffIn)}L${P(G.cuffOut)}L${P(G.shoulder)}Z`;
  }

  /* A band across both sleeves, a…b units up from the cuff edge, parallel to the cuff. */
  function sleeveBand(a, b) {
    const o = V.sub(G.cuffOut, V.mul(CUFF_DIR, 70)), i = V.add(G.cuffIn, V.mul(CUFF_DIR, 70));
    const pts = [V.add(o, V.mul(UP, a)), V.add(i, V.mul(UP, a)), V.add(i, V.mul(UP, b)), V.add(o, V.mul(UP, b))];
    return poly(pts) + poly(pts.map(MX));
  }
  /* A point d units along the left sleeve's centre line (from the cuff). */
  const sleevePoint = (d) => V.add(CUFF_MID, V.mul(AXIS, d));

  function yokePath(style, depth) {
    const D = depth;
    switch (style) {
      case 'straight': return `M-60 -20H460V${D}H-60Z`;
      case 'v': return `M-60 -20H460V${D - 22}L200 ${D + 22}L-60 ${D - 22}Z`;
      case 'curved': return `M-60 -20H460V${D - 20}Q200 ${D + 50} -60 ${D - 20}Z`;
      case 'arched': return `M-60 -20H460V${D + 20}Q200 ${D - 60} -60 ${D + 20}Z`;
      default: return '';
    }
  }

  const stripeSet = (style) => (UB.STRIPE_SETS[style] || UB.STRIPE_SETS.none).bands;

  /* ---------- lettering ---------- */
  function font(id) { return UB.FONTS[id] || UB.FONTS.graduate; }

  /* Text with up to two outlines. cols = {fill, o1, o2, z0, z1, z2}. */
  function outlinedText(txt, x, y, size, f, cols, outlines, maxW, extra = '') {
    if (!txt) return '';
    const spacing = parseFloat((extra.match(/letter-spacing="([\d.]+)"/) || [])[1] || 0);
    const est = txt.length * size * f.w + (txt.length - 1) * spacing;
    const fit = maxW && est > maxW ? ` textLength="${R(maxW)}" lengthAdjust="spacingAndGlyphs"` : '';
    const base = `x="${R(x)}" y="${R(y)}" font-family="${f.family}" font-weight="${f.weight}" font-size="${R(size)}" text-anchor="middle"${fit}${extra}`;
    const t = esc(txt);
    let s = '';
    if (outlines >= 2) s += `<text ${base} fill="${cols.o2}" stroke="${cols.o2}" stroke-width="${R(size * 0.17)}" stroke-linejoin="round" data-zone="${cols.z2}">${t}</text>`;
    if (outlines >= 1) s += `<text ${base} fill="${cols.o1}" stroke="${cols.o1}" stroke-width="${R(size * 0.085)}" stroke-linejoin="round" data-zone="${cols.z1}">${t}</text>`;
    return s + `<text ${base} fill="${cols.fill}" data-zone="${cols.z0}">${t}</text>`;
  }

  function numberCols(d, kit) {
    const c = (z) => UB.color(d, kit, z);
    return { fill: c('number'), o1: c('numberOutline'), o2: c('numberOutline2'), z0: 'number', z1: 'numberOutline', z2: 'numberOutline2' };
  }

  /* ---------- crest ---------- */
  function shieldPath(cx, cy, w, h) {
    const l = cx - w / 2, rt = cx + w / 2, t = cy - h / 2, b = cy + h / 2;
    return `M${R(l)} ${R(t + h * 0.08)}Q${R(cx - w * 0.25)} ${R(t + h * 0.02)} ${R(cx)} ${R(t - h * 0.04)}` +
      `Q${R(cx + w * 0.25)} ${R(t + h * 0.02)} ${R(rt)} ${R(t + h * 0.08)}L${R(rt)} ${R(cy)}` +
      `Q${R(rt)} ${R(cy + h * 0.36)} ${R(cx)} ${R(b)}Q${R(l)} ${R(cy + h * 0.36)} ${R(l)} ${R(cy)}Z`;
  }

  function crest(d, kit, cx, cy, size, mini = false) {
    const c = d.crest, col = (z) => UB.color(d, kit, z), f = font(d.lettering.numberFont);
    let style = c.style;
    if (mini) style = c.patch === 'image' ? 'image' : 'roundel';
    const img = mini ? c.patchImage : c.image;
    const initials = (c.initials || '').toUpperCase();
    const fitInitials = (box, max) => Math.min(max, box / Math.max(1, initials.length * f.w)) * f.size;

    switch (style) {
      case 'roundel': {
        const r = size / 2, fs = fitInitials(size * 0.72, size * 0.46);
        return `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r)}" fill="${col('crestRing')}" data-zone="crestRing"/>` +
          `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r * 0.8)}" fill="${col('crestBg')}" data-zone="crestBg"/>` +
          `<circle cx="${R(cx)}" cy="${R(cy)}" r="${R(r * 0.72)}" fill="none" stroke="${col('crestText')}" stroke-width="${R(size * 0.018)}" data-zone="crestText"/>` +
          (initials ? `<text x="${R(cx)}" y="${R(cy + fs * 0.36)}" font-family="${f.family}" font-weight="${f.weight}" font-size="${R(fs)}" text-anchor="middle" fill="${col('crestText')}" data-zone="crestText">${esc(initials)}</text>` : '');
      }
      case 'shield': {
        const w = size * 0.86, h = size, fs = fitInitials(w * 0.7, size * 0.44);
        const inner = `transform="translate(${R(cx)} ${R(cy)}) scale(0.82) translate(${R(-cx)} ${R(-cy)})"`;
        return `<path d="${shieldPath(cx, cy, w, h)}" fill="${col('crestRing')}" data-zone="crestRing"/>` +
          `<path d="${shieldPath(cx, cy, w, h)}" fill="${col('crestBg')}" ${inner} data-zone="crestBg"/>` +
          (initials ? `<text x="${R(cx)}" y="${R(cy + fs * 0.3)}" font-family="${f.family}" font-weight="${f.weight}" font-size="${R(fs)}" text-anchor="middle" fill="${col('crestText')}" data-zone="crestText">${esc(initials)}</text>` : '');
      }
      case 'wordmark': {
        const txt = (c.wordmark || '').toUpperCase();
        if (!txt) return '';
        const fs = Math.min(size * 0.42, (size * 1.25) / Math.max(1, txt.length * f.w)) * f.size;
        const tail = `<path d="M${R(cx - size * 0.62)} ${R(cy + fs * 0.62)}Q${R(cx)} ${R(cy + fs * 0.9)} ${R(cx + size * 0.66)} ${R(cy + fs * 0.42)}" fill="none" stroke="${col('crestRing')}" stroke-width="${R(fs * 0.16)}" stroke-linecap="round" data-zone="crestRing"/>`;
        const cols = { fill: col('crestText'), o1: col('crestRing'), o2: col('crestBg'), z0: 'crestText', z1: 'crestRing', z2: 'crestBg' };
        return `<g transform="rotate(-12 ${R(cx)} ${R(cy)})">${tail}${outlinedText(txt, cx, cy + fs * 0.34, fs, f, cols, 2, size * 1.3)}</g>`;
      }
      case 'initials': {
        const fs = fitInitials(size * 1.05, size * 0.8);
        const cols = { fill: col('crestText'), o1: col('crestRing'), o2: col('crestBg'), z0: 'crestText', z1: 'crestRing', z2: 'crestBg' };
        return outlinedText(initials, cx, cy + fs * 0.36, fs, f, cols, 2, size * 1.1);
      }
      case 'image':
        return img ? `<image href="${img}" x="${R(cx - size / 2)}" y="${R(cy - size / 2)}" width="${R(size)}" height="${R(size)}" preserveAspectRatio="xMidYMid meet"/>` : '';
      default:
        return '';
    }
  }

  /* ---------- jersey ---------- */
  function jersey(d, kit, view, opt = {}) {
    const id = uid(), j = kit.jersey, col = (z) => UB.color(d, kit, z);
    const front = view === 'front';
    const neck = front ? NECK[j.collar] || NECK.crew : BACK_NECK;
    const sil = silhouette(neck);
    const fill = (z) => `fill="${col(z)}" data-zone="${z}"`;

    let defs = `<clipPath id="${id}s"><path d="${sil}"/></clipPath>` +
      `<clipPath id="${id}sl"><path d="${poly(SLEEVE)}${poly(SLEEVE.map(MX))}"/></clipPath>` +
      `<clipPath id="${id}t"><path d="${poly(TORSO)}"/></clipPath>` +
      `<linearGradient id="${id}sh" x1="0" y1="0" x2="1" y2="0">` +
      `<stop offset="0" stop-color="#000" stop-opacity=".2"/><stop offset=".2" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset=".5" stop-color="#fff" stop-opacity=".08"/><stop offset=".8" stop-color="#000" stop-opacity="0"/>` +
      `<stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>` +
      `<linearGradient id="${id}sv" x1="0" y1="0" x2="0" y2="1"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>`;
    if (!opt.thumb) defs += `<filter id="${id}f" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="${OUTLINE}" flood-opacity=".22"/></filter>`;

    let s = '';
    // Inside of the collar, seen through the front neck opening.
    if (front) {
      s += `<path d="M${P(G.neck)}${neck}Q200 54 160 38Z" fill="${UB.shade(col('body'), -0.45)}" ${NO_HIT}/>`;
      s += `<path d="M160 38Q200 54 240 38" fill="none" stroke="${col('collar')}" stroke-width="7" data-zone="collar"/>`;
    }

    let g = `<path d="${sil}" ${fill('body')}/>`;
    g += `<g clip-path="url(#${id}sl)"><rect x="-60" y="-20" width="520" height="460" ${fill('sleeves')}/></g>`;

    const pat = UB.PATTERNS[j.pattern.type];
    if (pat && j.pattern.type !== 'none') {
      const art = pat.draw({ color: col('pattern'), size: j.pattern.size, pos: j.pattern.pos, id, view });
      g += `<g clip-path="url(#${id}${j.pattern.area === 'all' ? 's' : 't'})" opacity="${j.pattern.opacity}" data-zone="pattern">${art}</g>`;
    }

    if (j.yoke !== 'none') {
      const yp = yokePath(j.yoke, j.yokeDepth);
      if (j.yokeTrim > 0) g += `<path d="${yp}" transform="translate(0 ${j.yokeTrim})" ${fill('yokeTrim')}/>`;
      g += `<path d="${yp}" ${fill('yoke')}/>`;
    }

    // Hem stripes
    let hem = '';
    for (const b of stripeSet(j.hem.style)) {
      const bottom = 405 - j.hem.offset - b.at * j.hem.size, h = b.h * j.hem.size;
      const ext = b.at === 0 && j.hem.offset < 3 ? 12 : 0;
      hem += `<rect x="-20" y="${R(bottom - h)}" width="440" height="${R(h + ext)}" ${fill('stripe' + b.c)}/>`;
    }
    if (hem) g += `<g clip-path="url(#${id}t)">${hem}</g>`;

    // Cuffs and sleeve stripes
    let sl = `<path d="${sleeveBand(-12, 12)}" ${fill('cuffs')}/>`;
    let sleeveTop = 12;
    for (const b of stripeSet(j.sleeve.style)) {
      const a = j.sleeve.offset + b.at * j.sleeve.size, h = b.h * j.sleeve.size;
      sl += `<path d="${sleeveBand(a, a + h)}" ${fill('stripe' + b.c)}/>`;
      sleeveTop = Math.max(sleeveTop, a + h);
    }
    g += `<g clip-path="url(#${id}sl)">${sl}</g>`;

    // Collar
    if (front && j.collar === 'laceup') g += `<path d="M186 60L200 116L214 60Z" ${fill('collar')}/>`;
    g += `<path d="M${P(G.neck)}${neck}" fill="none" stroke="${col('collar')}" stroke-width="${front ? 18 : 16}" data-zone="collar"/>`;
    if (front && j.collar === 'laceup') {
      const hw = (y) => (14 * (116 - y)) / 56 + 2;
      const L = (y) => `${R(200 - hw(y))} ${y}`, Rt = (y) => `${R(200 + hw(y))} ${y}`;
      const lc = col('laces');
      g += `<g data-zone="laces"><path d="M${L(74)}L${Rt(84)}L${L(94)}L${Rt(104)}M${Rt(74)}L${L(84)}L${Rt(94)}L${L(104)}` +
        `M200 104Q196 116 193 132M200 104Q205 118 207 136" fill="none" stroke="${lc}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>` +
        [74, 84, 94, 104].map((y) => `<circle cx="${R(200 - hw(y))}" cy="${y}" r="1.6" fill="${UB.shade(col('collar'), -0.5)}"/><circle cx="${R(200 + hw(y))}" cy="${y}" r="1.6" fill="${UB.shade(col('collar'), -0.5)}"/>`).join('') +
        `</g>`;
    }

    // Fabric shading and seams
    g += `<rect x="0" y="20" width="400" height="400" fill="url(#${id}sh)" ${NO_HIT}/>`;
    g += `<rect x="0" y="20" width="400" height="400" fill="url(#${id}sv)" ${NO_HIT}/>`;
    g += `<path d="M118 50L118 160M282 50L282 160" stroke="#000" stroke-opacity=".22" stroke-width="1.2" ${NO_HIT}/>`;
    g += `<path d="M121.5 52L121.5 158M278.5 52L278.5 158M114 397Q200 405 286 397" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width=".8" stroke-dasharray="3 3" ${NO_HIT}/>`;

    s += `<g clip-path="url(#${id}s)">${g}</g>`;
    s += `<path d="${sil}" fill="none" stroke="${OUTLINE}" stroke-opacity=".55" stroke-width="1.4" stroke-linejoin="round" ${NO_HIT}/>`;

    // Lettering
    const L = d.lettering, nf = font(L.numberFont), cols = numberCols(d, kit);
    if (front) {
      s += crest(d, kit, 200, 214, 128 * (d.crest.scale || 1));
      if (!opt.thumb) {
        if (d.player.captain && d.player.captain !== 'none') {
          s += outlinedText(d.player.captain, 262, 136, 30 * nf.size, nf, cols, Math.min(L.outlines, 1), 40);
        }
        if (d.crest.patch && d.crest.patch !== 'none') {
          const p = sleevePoint(172), sz = 34;
          s += `<g transform="rotate(${R(AXIS_DEG)} ${P(p)})">${crest(d, kit, p[0], p[1], sz, true)}</g>`;
          s += `<g transform="rotate(${R(-AXIS_DEG)} ${R(400 - p[0])} ${R(p[1])})">${crest(d, kit, 400 - p[0], p[1], sz, true)}</g>`;
        }
      }
    } else if (!opt.thumb) {
      const nameF = font(L.nameFont), name = (d.player.name || '').toUpperCase();
      if (name) {
        const ns = 24 * nameF.size, nameCol = UB.color(d, kit, 'name');
        const nc = { fill: nameCol, o1: UB.color(d, kit, 'numberOutline'), z0: 'name', z1: 'numberOutline' };
        const nameOutline = L.outlines >= 1 ? 1 : 0;
        if (L.nameArch) {
          defs += `<path id="${id}arc" d="M90 170Q200 128 310 170"/>`;
          const est = name.length * ns * nameF.w + (name.length - 1) * 2;
          const fit = est > 190 ? ` textLength="190" lengthAdjust="spacingAndGlyphs"` : '';
          const t = (paint, zone) => `<text font-family="${nameF.family}" font-weight="${nameF.weight}" font-size="${R(ns)}" letter-spacing="2" text-anchor="middle" ${paint} data-zone="${zone}"${fit}><textPath href="#${id}arc" startOffset="50%">${esc(name)}</textPath></text>`;
          if (nameOutline) s += t(`fill="${nc.o1}" stroke="${nc.o1}" stroke-width="${R(ns * 0.14)}" stroke-linejoin="round"`, 'numberOutline');
          s += t(`fill="${nameCol}"`, 'name');
        } else {
          s += outlinedText(name, 200, 160, ns, nameF, { ...nc, o1: nc.o1 }, nameOutline, 190, ' letter-spacing="2"');
        }
      }
      const num = d.player.number || '';
      s += outlinedText(num, 200, 294, 118 * nf.size, nf, cols, L.outlines, 158);
      if (L.sleeveNumbers && num) {
        const dist = Math.min(150, sleeveTop + 30), p = sleevePoint(dist), sz = 34 * nf.size;
        const y = (q) => q[1] + sz * 0.36;
        s += `<g transform="rotate(${R(AXIS_DEG)} ${P(p)})">${outlinedText(num, p[0], y(p), sz, nf, cols, Math.min(L.outlines, 1), 56)}</g>`;
        s += `<g transform="rotate(${R(-AXIS_DEG)} ${R(400 - p[0])} ${R(p[1])})">${outlinedText(num, 400 - p[0], y(p), sz, nf, cols, Math.min(L.outlines, 1), 56)}</g>`;
      }
    }

    const body = opt.thumb ? s : `<g filter="url(#${id}f)">${s}</g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 20 400 412" ${opt.attrs || ''}><defs>${defs}</defs>${body}</svg>`;
  }

  /* ---------- pants (breezers) ---------- */
  function pants(d, kit, opt = {}) {
    const id = uid(), col = (z) => UB.color(d, kit, z), fill = (z) => `fill="${col(z)}" data-zone="${z}"`;
    const shape = 'M48 12L252 12L262 48C272 100 282 160 288 212C252 226 202 228 166 220L154 118L146 118L134 220C98 228 48 226 12 212C18 160 28 100 38 48Z';
    const edgeL = 'M50 -10L38 48C28 100 18 160 12 212L9 250';
    const edgeR = 'M250 -10L262 48C272 100 282 160 288 212L291 250';
    const side = (inset, w, z) =>
      `<path d="${edgeL}" transform="translate(${inset + w / 2} 0)" fill="none" stroke="${col(z)}" stroke-width="${w}" data-zone="${z}"/>` +
      `<path d="${edgeR}" transform="translate(${-(inset + w / 2)} 0)" fill="none" stroke="${col(z)}" stroke-width="${w}" data-zone="${z}"/>`;
    let st = '';
    switch (kit.pants.stripe) {
      case 'single': st = side(0, 22, 'pantsStripe1'); break;
      case 'outlined': st = side(0, 32, 'pantsStripe2') + side(5, 22, 'pantsStripe1'); break;
      case 'twin': st = side(4, 8, 'pantsStripe1') + side(18, 8, 'pantsStripe1'); break;
      case 'hem': st = `<rect x="0" y="180" width="300" height="5" ${fill('pantsStripe2')}/><rect x="0" y="189" width="300" height="16" ${fill('pantsStripe1')}/>`; break;
    }
    let g = `<path d="${shape}" ${fill('pants')}/>${st}`;
    g += `<rect x="0" y="12" width="300" height="24" fill="#000" fill-opacity=".1" ${NO_HIT}/>`;
    g += `<path d="M40 36H260M150 36V114" stroke="#000" stroke-opacity=".28" stroke-width="1.2" fill="none" ${NO_HIT}/>`;
    g += `<path d="M44 30H256" stroke="#fff" stroke-opacity=".25" stroke-width=".8" stroke-dasharray="3 3" ${NO_HIT}/>`;
    g += `<rect x="0" y="0" width="300" height="240" fill="url(#${id}sh)" ${NO_HIT}/>`;
    const defs = `<clipPath id="${id}c"><path d="${shape}"/></clipPath>` +
      `<linearGradient id="${id}sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".2"/><stop offset=".25" stop-color="#000" stop-opacity="0"/><stop offset=".5" stop-color="#000" stop-opacity=".12"/><stop offset=".75" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></linearGradient>` +
      `<filter id="${id}f" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="${OUTLINE}" flood-opacity=".2"/></filter>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 0 312 246" ${opt.attrs || ''}><defs>${defs}</defs>` +
      `<g filter="url(#${id}f)"><g clip-path="url(#${id}c)">${g}</g>` +
      `<path d="${shape}" fill="none" stroke="${OUTLINE}" stroke-opacity=".55" stroke-width="1.3" stroke-linejoin="round" ${NO_HIT}/></g></svg>`;
  }

  /* ---------- socks ---------- */
  function socks(d, kit, opt = {}) {
    const id = uid(), col = (z) => UB.color(d, kit, z), fill = (z) => `fill="${col(z)}" data-zone="${z}"`;
    const shape = 'M6 10L104 10L97 300Q55 318 13 300Z';
    const sk = kit.socks, style = sk.style === 'match' ? kit.jersey.hem.style : sk.style;
    let bands = '';
    for (const b of stripeSet(style)) {
      const bottom = 250 - sk.offset - b.at * sk.size, h = b.h * sk.size;
      bands += `<rect x="-10" y="${R(bottom - h)}" width="130" height="${R(h)}" fill="${col(b.c === 1 ? 'sockStripe1' : 'sockStripe2')}" data-zone="${b.c === 1 ? 'sockStripe1' : 'sockStripe2'}"/>`;
    }
    const one = (x) => `<g transform="translate(${x} 0)"><g clip-path="url(#${id}c)">` +
      `<path d="${shape}" ${fill('socks')}/>${bands}` +
      `<path d="M8 24H102" stroke="#000" stroke-opacity=".2" stroke-width="1.2" ${NO_HIT}/>` +
      `<rect x="0" y="0" width="110" height="320" fill="url(#${id}sh)" ${NO_HIT}/></g>` +
      `<path d="${shape}" fill="none" stroke="${OUTLINE}" stroke-opacity=".55" stroke-width="1.3" stroke-linejoin="round" ${NO_HIT}/></g>`;
    const defs = `<clipPath id="${id}c"><path d="${shape}"/></clipPath>` +
      `<linearGradient id="${id}sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity=".22"/><stop offset=".45" stop-color="#fff" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient>` +
      `<filter id="${id}f" x="-10%" y="-10%" width="120%" height="120%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="${OUTLINE}" flood-opacity=".2"/></filter>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250 330" ${opt.attrs || ''}><defs>${defs}</defs><g filter="url(#${id}f)">${one(12)}${one(128)}</g></svg>`;
  }

  /* ---------- helmet (side view, facing right) ---------- */
  function helmet(d, kit, opt = {}) {
    const id = uid(), col = (z) => UB.color(d, kit, z), fill = (z) => `fill="${col(z)}" data-zone="${z}"`;
    const shell = 'M34 128C26 72 72 24 138 24C196 24 230 62 226 104L224 116L160 118C150 98 112 98 104 120L104 138L44 140C38 138 35 134 34 128Z';
    const ear = 'M108 120C112 100 154 100 158 120L160 146C144 158 122 158 108 146Z';
    const f = font(d.lettering.numberFont), num = d.player.number || '';
    let g = `<path d="${shell}" ${fill('helmet')}/>`;
    g += `<ellipse cx="122" cy="50" rx="56" ry="15" fill="#fff" fill-opacity=".22" transform="rotate(-6 122 50)" ${NO_HIT}/>`;
    g += [[116, 34, -6], [152, 33, 6], [186, 44, 24], [70, 58, -42]].map(([x, y, a]) =>
      `<rect x="${x - 13}" y="${y - 4}" width="26" height="8" rx="4" fill="#000" fill-opacity=".45" transform="rotate(${a} ${x} ${y})" ${NO_HIT}/>`).join('');
    g += `<path d="M38 126L102 124M162 112L222 108" stroke="#000" stroke-opacity=".25" stroke-width="1.2" fill="none" ${NO_HIT}/>`;
    if (d.lettering.helmetNumber && num) {
      g += `<text x="66" y="${R(112)}" font-family="${f.family}" font-weight="${f.weight}" font-size="${R(26 * f.size)}" text-anchor="middle" fill="${col('helmetDecal')}" data-zone="helmetDecal">${esc(num)}</text>`;
    }
    const defs = `<filter id="${id}f" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="${OUTLINE}" flood-opacity=".2"/></filter>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 0 230 180" ${opt.attrs || ''}><defs>${defs}</defs><g filter="url(#${id}f)">` +
      g + `<path d="${shell}" fill="none" stroke="${OUTLINE}" stroke-opacity=".55" stroke-width="1.3" stroke-linejoin="round" ${NO_HIT}/>` +
      `<path d="M150 150C160 168 178 174 198 166" fill="none" stroke="${col('helmetTrim')}" stroke-width="5" stroke-linecap="round" data-zone="helmetTrim"/>` +
      `<path d="${ear}" ${fill('helmetTrim')} stroke="${OUTLINE}" stroke-opacity=".5" stroke-width="1.1"/>` +
      [124, 134, 144].map((x) => `<circle cx="${x}" cy="130" r="2.6" fill="#000" fill-opacity=".45" ${NO_HIT}/>`).join('') +
      `</g></svg>`;
  }

  /* ---------- export sheets ---------- */
  const SHEET_BG = '#EEF3F6', SHEET_INK = '#0E1A26', SHEET_MUTED = '#5A6B7B';
  const TITLE_FONT = "'Saira Condensed', 'Arial Narrow', sans-serif";

  function swatchRow(d, x, y) {
    return d.team.palette.map((c, i) => {
      const cx = x + i * 118;
      return `<rect x="${cx}" y="${y}" width="26" height="26" rx="4" fill="${c}" stroke="${SHEET_INK}" stroke-opacity=".25"/>` +
        `<text x="${cx + 34}" y="${y + 11}" font-family="${TITLE_FONT}" font-size="12" font-weight="600" letter-spacing="1" fill="${SHEET_MUTED}">${UB.PALETTE_SLOTS[i].toUpperCase()}</text>` +
        `<text x="${cx + 34}" y="${y + 26}" font-family="ui-monospace, Menlo, monospace" font-size="13" fill="${SHEET_INK}">${c.toUpperCase()}</text>`;
    }).join('');
  }

  /* One kit: front, back, helmet, pants and socks. */
  function sheet(d, kitKey, css = '') {
    const kit = d.kits[kitKey], W = 1400, H = 1180;
    const label = `${UB.KIT_NAMES[kitKey]} uniform · ${kit.swap ? 'light' : 'dark'} sweater`.toUpperCase();
    const tpl = UB.TEMPLATES.find((t) => t.id === kit.template);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      (css ? `<style>${css}</style>` : '') +
      `<rect width="${W}" height="${H}" fill="${SHEET_BG}"/>` +
      `<rect x="${W / 2 - 3}" y="120" width="6" height="660" fill="#D2232A" fill-opacity=".14"/>` +
      `<text x="60" y="78" font-family="${TITLE_FONT}" font-size="52" font-weight="800" fill="${SHEET_INK}">${esc((d.team.name || 'My team').toUpperCase())}</text>` +
      `<text x="62" y="106" font-family="${TITLE_FONT}" font-size="18" font-weight="600" letter-spacing="2" fill="${SHEET_MUTED}">${esc(label)}${tpl ? ' · ' + esc(tpl.name.toUpperCase()) : ''}</text>` +
      `<g transform="translate(${W - 60 - 118 * 5 + 30} 66)">${swatchRow(d, 0, 0)}</g>` +
      jersey(d, kit, 'front', { attrs: `x="50" y="130" width="630" height="649"` }) +
      jersey(d, kit, 'back', { attrs: `x="720" y="130" width="630" height="649"` }) +
      helmet(d, kit, { attrs: `x="90" y="830" width="330" height="258"` }) +
      pants(d, kit, { attrs: `x="500" y="820" width="380" height="300"` }) +
      socks(d, kit, { attrs: `x="980" y="810" width="300" height="340"` }) +
      `</svg>`;
  }

  /* All three kits side by side, front and back. */
  function lineup(d, css = '') {
    const W = 1500, H = 1060, keys = ['home', 'away', 'third'];
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
      (css ? `<style>${css}</style>` : '') +
      `<rect width="${W}" height="${H}" fill="${SHEET_BG}"/>` +
      `<text x="60" y="78" font-family="${TITLE_FONT}" font-size="52" font-weight="800" fill="${SHEET_INK}">${esc((d.team.name || 'My team').toUpperCase())}</text>` +
      `<text x="62" y="106" font-family="${TITLE_FONT}" font-size="18" font-weight="600" letter-spacing="2" fill="${SHEET_MUTED}">UNIFORM SET · HOME, AWAY AND THIRD</text>` +
      `<g transform="translate(${W - 60 - 118 * 5 + 30} 66)">${swatchRow(d, 0, 0)}</g>`;
    keys.forEach((k, i) => {
      const x = 60 + i * 470;
      s += `<text x="${x + 215}" y="170" text-anchor="middle" font-family="${TITLE_FONT}" font-size="22" font-weight="700" letter-spacing="3" fill="${SHEET_INK}">${UB.KIT_NAMES[k].toUpperCase()}</text>`;
      s += jersey(d, d.kits[k], 'front', { attrs: `x="${x}" y="190" width="430" height="443"` });
      s += jersey(d, d.kits[k], 'back', { attrs: `x="${x + 60}" y="610" width="310" height="320"` });
      s += socks(d, d.kits[k], { attrs: `x="${x + 160}" y="935" width="110" height="110"` });
    });
    return s + `</svg>`;
  }

  UB.render = { jersey, pants, socks, helmet, sheet, lineup, crest };
  /* Shared helpers for the realistic renderer. */
  UB.render._ = { uid, R, esc, P, outlinedText, crest, font, stripeSet, yokePath, numberCols, shieldPath };
})();
