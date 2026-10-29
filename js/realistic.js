/* =====================================================================
   Realistic renderer
   ---------------------------------------------------------------------
   Draws the design as flat artwork, then lays lighting on top the way
   product mock-ups do:
     • a height map per piece (silhouette + fold ridges) lit by an SVG
       lighting filter and blended with hard-light (shadows multiply,
       highlights screen, so it works on white and dark fabric);
     • crease shadows and highlights, fabric weave, shoulder mesh,
       stitching, and a raised "tackle twill" look for letters.
   Lighting comes from the upper left. Shading never depends on colour,
   so every colour and pattern choice gets the same treatment.

   Jersey coordinates: the sweater spans x 128…872, y 20…948 (hanging,
   ghost-mannequin pose). The player figure places the jersey 290 lower
   and adds helmet, gloves, pants, socks, skates and stick around it.
   ===================================================================== */
(function () {
  const UB = window.UB;
  const { uid, R, esc, P, outlinedText, crest, font, stripeSet, yokePath, numberCols } = UB.render._;

  const K = 2.25;                                            // flat-design units → realistic units
  const OLD = 'translate(500 48) scale(2.25) translate(-200 -38)'; // flat jersey coords → realistic
  const NO_HIT = 'pointer-events="none"';
  const JY = 290;                                            // jersey offset inside the player figure

  const mirror = (d) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (m, x, y) => `${R(1000 - x)} ${y}`);
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];

  /* ---------------- jersey geometry ---------------- */
  const NECK = {
    vneck: 'C390 110 470 190 500 232C530 190 610 110 655 50',
    crew: 'C365 170 635 170 655 50',
    laceup: 'C365 165 635 165 655 50',
  };
  const BACK_NECK = 'Q500 98 655 50';
  const RIM = 'M655 50Q500 16 345 50';
  const torsoPath = (neck) =>
    `M345 50${neck}Q725 64 786 108Q736 190 724 352Q720 640 718 928Q500 948 282 928Q280 640 276 352Q264 190 214 108Q275 64 345 50Z`;
  const SLEEVE_L = 'M214 108C168 134 152 262 148 470C145 640 141 790 140 900Q196 916 252 906Q262 640 276 352Q264 190 214 108Z';
  const SLEEVES = SLEEVE_L + mirror(SLEEVE_L);

  const CO = [140, 900], CI = [252, 906];
  const CDIR = [0.9986, 0.0535], UP = [0.0535, -0.9986];
  const CMID = [196, 903];
  const AXIS = [0.0431, -0.9991], AXIS_DEG = 2.5;
  const BOW = 14;

  /* A curved band across both sleeves, a…b units above the cuff. */
  function sleeveBand(a, b) {
    const o = add(CO, mul(CDIR, -90)), i = add(CI, mul(CDIR, 90));
    const m = [(o[0] + i[0]) / 2, (o[1] + i[1]) / 2 + BOW];
    const p = (q, t) => add(q, mul(UP, t));
    const d = `M${P(p(o, a))}Q${P(p(m, a))} ${P(p(i, a))}L${P(p(i, b))}Q${P(p(m, b))} ${P(p(o, b))}Z`;
    return d + mirror(d);
  }
  /* A curved horizontal band (hem stripes, socks). */
  const hBand = (x0, x1, bottom, h, bow) =>
    `M${x0} ${R(bottom)}Q${(x0 + x1) / 2} ${R(bottom + bow)} ${x1} ${R(bottom)}L${x1} ${R(bottom - h)}Q${(x0 + x1) / 2} ${R(bottom - h + bow)} ${x0} ${R(bottom - h)}Z`;

  /* ---------------- shared defs ---------------- */
  /* Smooth "pillow" lighting from a height map in the alpha channel.
     Light = height minus the height sampled toward the light (upper left);
     edges also get a little ambient occlusion. Output is mid-grey ± light,
     meant for mix-blend-mode: hard-light. Uses only blurs and offsets, so
     there is no banding. */
  function lightFilter(id, name, blur, dist, gain, ao = 0.3) {
    return `<filter id="${id}${name}" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="${blur}" result="h"/>` +
      `<feOffset in="h" dx="${dist}" dy="${dist}" result="s"/>` +
      `<feComposite in="h" in2="s" operator="arithmetic" k2="${gain}" k3="${-gain}" result="lt"/>` +
      `<feComposite in="s" in2="h" operator="arithmetic" k2="${gain}" k3="${-gain}" result="dk"/>` +
      `<feComposite in="h" in2="h" operator="arithmetic" k2="${R(-ao / 0.55)}" k4="${ao}" result="ao"/>` +
      `<feFlood flood-color="#fff" result="W"/><feComposite in="W" in2="lt" operator="in" result="lw"/>` +
      `<feFlood flood-color="#000" result="B"/><feComposite in="B" in2="dk" operator="in" result="db"/>` +
      `<feComposite in="B" in2="ao" operator="in" result="ab"/>` +
      `<feFlood flood-color="#808080" result="G"/>` +
      `<feMerge result="mx"><feMergeNode in="G"/><feMergeNode in="ab"/><feMergeNode in="db"/><feMergeNode in="lw"/></feMerge>` +
      `<feComponentTransfer in="SourceAlpha" result="m"><feFuncA type="linear" slope="60"/></feComponentTransfer>` +
      `<feComposite in="mx" in2="m" operator="in"/></filter>`;
  }

  function defs(id) {
    let s = lightFilter(id, 'Lf', 14, 8, 2.7, 0.26) +
      lightFilter(id, 'Lp', 22, 11, 3.4, 0.4) +
      lightFilter(id, 'Lh', 26, 12, 3.8, 0.45) +
      `<filter id="${id}b5" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="5"/></filter>` +
      `<filter id="${id}b12" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="12"/></filter>` +
      `<filter id="${id}b24" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="24"/></filter>` +
      `<filter id="${id}tw" x="-10%" y="-10%" width="120%" height="125%" color-interpolation-filters="sRGB">` +
      `<feGaussianBlur in="SourceAlpha" stdDeviation="2.2" result="b"/>` +
      `<feDiffuseLighting in="b" surfaceScale="4" diffuseConstant="1" lighting-color="#fff" result="d"><feDistantLight azimuth="225" elevation="50"/></feDiffuseLighting>` +
      `<feComponentTransfer in="d" result="n"><feFuncR type="linear" slope=".65"/><feFuncG type="linear" slope=".65"/><feFuncB type="linear" slope=".65"/></feComponentTransfer>` +
      `<feComposite in="n" in2="SourceAlpha" operator="in" result="ln"/>` +
      `<feBlend in="ln" in2="SourceGraphic" mode="hard-light" result="lit"/>` +
      `<feComposite in="lit" in2="SourceAlpha" operator="in" result="lit2"/>` +
      `<feOffset in="SourceAlpha" dx="1.5" dy="3" result="o"/><feGaussianBlur in="o" stdDeviation="2.4" result="ob"/>` +
      `<feComponentTransfer in="ob" result="sh"><feFuncA type="linear" slope=".42"/></feComponentTransfer>` +
      `<feMerge><feMergeNode in="sh"/><feMergeNode in="lit2"/></feMerge></filter>` +
      `<pattern id="${id}mesh" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".72" fill="#000"/></pattern>` +
      `<linearGradient id="${id}vis" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f4f9ff" stop-opacity=".75"/><stop offset=".35" stop-color="#bcd9f5" stop-opacity=".35"/><stop offset=".6" stop-color="#7fa6d6" stop-opacity=".22"/><stop offset="1" stop-color="#d6c2f0" stop-opacity=".45"/></linearGradient>` +
      `<radialGradient id="${id}hin" cx=".5" cy=".2" r=".8"><stop offset="0" stop-color="#2a323b"/><stop offset="1" stop-color="#050709"/></radialGradient>` +
      `<linearGradient id="${id}steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6d7680"/><stop offset=".35" stop-color="#f2f5f8"/><stop offset=".6" stop-color="#9aa3ad"/><stop offset="1" stop-color="#555d66"/></linearGradient>` +
      `<linearGradient id="${id}shaft" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>` +
      `<linearGradient id="${id}int" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".45"/><stop offset=".6" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".04"/></linearGradient>`;
    if (UB.NOISE) {
      s += `<pattern id="${id}nz" width="160" height="160" patternUnits="userSpaceOnUse"><image href="${UB.NOISE}" width="160" height="160"/></pattern>`;
    }
    return s;
  }

  /* Height-map shading for one piece. folds: [{d, w, o}] ridges; fills: [{d, o}] raised areas. */
  function shade(id, filter, shape, clipId, folds = [], fills = [], base = 0.55) {
    return `<g filter="url(#${id}${filter})" style="mix-blend-mode:hard-light" ${NO_HIT}>` +
      `<path d="${shape}" fill="#000" fill-opacity="${base}"/>` +
      `<g clip-path="url(#${clipId})">` +
      fills.map((f) => `<path d="${f.d}" fill="#000" fill-opacity="${f.o}"/>`).join('') +
      folds.map((f) => `<path d="${f.d}" fill="none" stroke="#000" stroke-opacity="${f.o}" stroke-width="${f.w}" stroke-linecap="round"/>`).join('') +
      `</g></g>`;
  }
  /* Soft crease shadows (multiply) and highlights (screen), clipped to a shape. */
  function creases(id, clip, dark = [], light = [], blur = 'b12') {
    if (!dark.length && !light.length) return '';
    return `<g clip-path="url(#${clip})" ${NO_HIT}>` +
      (dark.length ? `<g filter="url(#${id}${blur})" style="mix-blend-mode:multiply">${dark.map((f) => `<path d="${f.d}" fill="none" stroke="#1a1d22" stroke-opacity="${f.o}" stroke-width="${f.w}" stroke-linecap="round"/>`).join('')}</g>` : '') +
      (light.length ? `<g filter="url(#${id}${blur})" style="mix-blend-mode:screen">${light.map((f) => `<path d="${f.d}" fill="none" stroke="#fff" stroke-opacity="${f.o}" stroke-width="${f.w}" stroke-linecap="round"/>`).join('')}</g>` : '') +
      `</g>`;
  }
  const noise = (id, op = 0.55) => (UB.NOISE ? `<rect x="-100" y="-100" width="1200" height="2300" fill="url(#${id}nz)" opacity="${op}" style="mix-blend-mode:hard-light" ${NO_HIT}/>` : '');
  function stitch(d, extra = '') {
    return `<g ${extra} ${NO_HIT}><path d="${d}" fill="none" stroke="#000" stroke-opacity=".28" stroke-width="2.4" stroke-dasharray="6 5" transform="translate(0 1.2)"/>` +
      `<path d="${d}" fill="none" stroke="#fff" stroke-opacity=".38" stroke-width="1.6" stroke-dasharray="6 5"/></g>`;
  }
  const clip = (cid, d) => `<clipPath id="${cid}"><path d="${d}"/></clipPath>`;

  /* ---------------- folds ---------------- */
  const F = (d, w, o) => ({ d, w, o });
  const TORSO_RIDGES = [
    F('M300 300Q500 278 700 300', 90, 0.16),
    F('M390 420C380 600 370 760 372 900', 70, 0.25), F('M610 420C620 600 630 760 628 900', 70, 0.25),
    F('M500 600C505 720 495 820 500 920', 50, 0.15),
    F('M292 380C340 470 380 560 420 650', 40, 0.3), F('M708 380C660 470 620 560 580 650', 40, 0.3),
    F('M290 902Q500 922 710 902', 30, 0.35),
  ];
  const TORSO_DARK = [
    F('M302 400C346 480 386 560 418 660', 16, 0.22), F('M698 400C654 480 614 560 582 660', 16, 0.26),
    F('M455 650C460 760 450 840 452 925', 18, 0.16), F('M548 655C545 760 552 850 548 925', 18, 0.2),
    F('M284 362Q300 420 300 500', 20, 0.3), F('M716 362Q700 420 700 500', 20, 0.36),
  ];
  const TORSO_LIGHT = [F('M360 440C355 600 350 760 352 900', 22, 0.2), F('M640 440C648 600 652 760 650 900', 22, 0.1)];
  const SLEEVE_RIDGES = [
    F('M172 220C164 450 160 700 158 880', 46, 0.3), F('M236 300C238 500 236 700 232 880', 36, 0.25),
    F('M145 560Q195 590 252 570', 26, 0.3), F('M140 612Q190 650 255 626', 22, 0.25), F('M140 842Q195 866 255 851', 18, 0.3),
  ];
  const SLEEVE_DARK = [F('M200 300C198 450 196 600 196 760', 14, 0.2), F('M150 586Q195 620 252 600', 12, 0.22), F('M262 400Q268 600 262 890', 16, 0.3)];
  const SLEEVE_LIGHT = [F('M176 260C168 480 162 700 160 860', 18, 0.22)];
  const both = (list) => list.concat(list.map((f) => ({ ...f, d: mirror(f.d) })));

  /* ---------------- jersey ---------------- */
  function jerseyArt(d, kit, view, id) {
    const j = kit.jersey, L = d.lettering, col = (z) => UB.color(d, kit, z);
    const fill = (z) => `fill="${col(z)}" data-zone="${z}"`;
    const front = view === 'front';
    const neck = front ? NECK[j.collar] || NECK.crew : BACK_NECK;
    const torso = torsoPath(neck);
    const nf = font(L.numberFont), cols = numberCols(d, kit);
    let df = clip(`${id}t`, torso) + clip(`${id}s`, SLEEVES) + clip(`${id}ts`, torso + SLEEVES);
    let s = '';

    // Inside of the collar, seen through the neck opening
    const lens = `M345 50${neck}Q500 16 345 50Z`;
    df += clip(`${id}lens`, lens);
    s += `<g clip-path="url(#${id}lens)">` +
      `<path d="${lens}" fill="${UB.shade(col('body'), -0.12)}" data-zone="body"/>` + noise(id, 0.5) +
      `<rect x="300" y="0" width="400" height="260" fill="url(#${id}int)" ${NO_HIT}/>` +
      `<path d="${lens}" fill="none" stroke="#000" stroke-opacity=".25" stroke-width="30" filter="url(#${id}b12)" ${NO_HIT}/>` +
      `<path d="${RIM}" fill="none" stroke="${col('collar')}" stroke-width="${front ? 50 : 28}" data-zone="collar"/>` +
      (front ? `<path d="${RIM}" transform="translate(0 25)" fill="none" stroke="${col('collarTrim')}" stroke-width="9" data-zone="collarTrim"/>` : '') +
      `<path d="${RIM}" transform="translate(0 ${front ? 30 : 16})" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="10" filter="url(#${id}b5)" ${NO_HIT}/>` +
      `</g>`;

    const pattern = UB.PATTERNS[j.pattern.type];
    const patArt = pattern && j.pattern.type !== 'none'
      ? `<g transform="${OLD}" opacity="${j.pattern.opacity}" data-zone="pattern">${pattern.draw({ color: col('pattern'), size: j.pattern.size, pos: j.pattern.pos, id: id + 'p', view })}</g>`
      : '';
    const yoke = j.yoke !== 'none'
      ? `<g transform="${OLD}">` +
        (j.yokeTrim > 0 ? `<path d="${yokePath(j.yoke, j.yokeDepth)}" transform="translate(0 ${j.yokeTrim})" ${fill('yokeTrim')}/>` : '') +
        `<path d="${yokePath(j.yoke, j.yokeDepth)}" ${fill('yoke')}/>` +
        `<path d="${yokePath(j.yoke, j.yokeDepth)}" fill="url(#${id}mesh)" fill-opacity=".2" ${NO_HIT}/>` +
        `<path d="${yokePath(j.yoke, j.yokeDepth)}" transform="translate(0 ${j.yokeTrim + 1.6})" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width=".7" stroke-dasharray="2.4 2" ${NO_HIT}/>` +
        `</g>`
      : '';

    /* --- torso --- */
    let t = `<rect x="200" y="0" width="600" height="1000" ${fill('body')}/>`;
    t += patArt;
    t += `<path d="M276 352Q280 500 280 640L334 640Q326 500 316 352ZM724 352Q720 500 720 640L666 640Q674 500 684 352Z" fill="url(#${id}mesh)" fill-opacity=".14" transform="translate(0 0)" ${NO_HIT}/>`;
    t += yoke;
    for (const b of stripeSet(j.hem.style)) {
      const bottom = 928 - j.hem.offset * K - b.at * j.hem.size * K, h = b.h * j.hem.size * K;
      const ext = b.at === 0 && j.hem.offset < 3 ? 40 : 0;
      t += `<path d="${hBand(200, 800, bottom + ext, h + ext, 20)}" ${fill('stripe' + b.c)}/>`;
    }
    // Collar on the body
    if (front && j.collar === 'laceup') {
      const hw = (y) => (34 * (292 - y)) / 152 + 5;
      t += `<path d="M462 130L500 292L538 130Z" ${fill('collar')}/>`;
      t += `<path d="M500 140L500 292" stroke="#000" stroke-opacity=".35" stroke-width="3" ${NO_HIT}/>`;
      const ys = [162, 188, 214, 240, 266];
      let lace = '';
      for (let i = 0; i < ys.length - 1; i++) {
        const y0 = ys[i], y1 = ys[i + 1];
        lace += `M${R(500 - hw(y0))} ${y0}L${R(500 + hw(y1))} ${y1}M${R(500 + hw(y0))} ${y0}L${R(500 - hw(y1))} ${y1}`;
      }
      t += `<g data-zone="laces"><path d="${lace}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="7" stroke-linecap="round" transform="translate(1 2)"/>` +
        `<path d="${lace}M500 268Q494 290 490 318M500 268Q508 292 511 326" fill="none" stroke="${col('laces')}" stroke-width="5.5" stroke-linecap="round"/></g>` +
        ys.map((y) => `<circle cx="${R(500 - hw(y))}" cy="${y}" r="4" fill="${UB.shade(col('collar'), -0.55)}"/><circle cx="${R(500 + hw(y))}" cy="${y}" r="4" fill="${UB.shade(col('collar'), -0.55)}"/>`).join('');
    }
    t += `<path d="M345 50${neck}" fill="none" stroke="${col('collar')}" stroke-width="${front ? 66 : 62}" data-zone="collar"/>`;
    t += `<path d="M345 50${neck}" fill="none" stroke="${col('collarTrim')}" stroke-width="14" data-zone="collarTrim"/>`;
    t += stitch(`M345 50${neck}`, `transform="translate(0 ${front ? 30 : 29})"`);
    if (front && j.collar === 'vneck') t += `<path d="M500 232L520 300" stroke="#000" stroke-opacity=".35" stroke-width="3" ${NO_HIT}/>`;
    t += stitch('M290 912Q500 932 710 912') + stitch('M290 900Q500 920 710 900');
    t += noise(id);
    // Shadow the sleeves cast on the body
    t += `<g filter="url(#${id}b12)" style="mix-blend-mode:multiply" ${NO_HIT}><path d="M280 360Q284 640 286 930M720 360Q716 640 714 930" fill="none" stroke="#0d1117" stroke-opacity=".55" stroke-width="22"/></g>`;

    // Lettering on the body
    let letters = '';
    if (front) {
      letters += crest(d, kit, 500, 444, 288 * (d.crest.scale || 1));
      if (d.player.captain && d.player.captain !== 'none') {
        letters += outlinedText(d.player.captain, 640, 278, 70 * nf.size, nf, cols, Math.min(L.outlines, 1), 90);
      }
    } else {
      const nameF = font(L.nameFont), name = (d.player.name || '').toUpperCase();
      if (name) {
        const ns = 54 * nameF.size, nameCol = col('name'), o1 = col('numberOutline');
        const outline = L.outlines >= 1;
        if (L.nameArch) {
          df += `<path id="${id}arc" d="M252 352Q500 258 748 352"/>`;
          const est = name.length * ns * nameF.w + (name.length - 1) * 4;
          const fit = est > 430 ? ` textLength="430" lengthAdjust="spacingAndGlyphs"` : '';
          const tx = (paint, zone) => `<text font-family="${nameF.family}" font-weight="${nameF.weight}" font-size="${R(ns)}" letter-spacing="4" text-anchor="middle" ${paint} data-zone="${zone}"${fit}><textPath href="#${id}arc" startOffset="50%">${esc(name)}</textPath></text>`;
          if (outline) letters += tx(`fill="${o1}" stroke="${o1}" stroke-width="${R(ns * 0.14)}" stroke-linejoin="round"`, 'numberOutline');
          letters += tx(`fill="${nameCol}"`, 'name');
        } else {
          letters += outlinedText(name, 500, 330, ns, nameF, { fill: nameCol, o1, z0: 'name', z1: 'numberOutline' }, outline ? 1 : 0, 430, ' letter-spacing="4"');
        }
      }
      letters += outlinedText(d.player.number || '', 500, 626, 265 * nf.size, nf, cols, L.outlines, 356);
    }
    t += `<g filter="url(#${id}tw)">${letters}</g>`;

    let out = s + `<g clip-path="url(#${id}t)">${t}</g>`;
    out += shade(id, 'Lf', torso, `${id}t`, view === 'front' ? TORSO_RIDGES : TORSO_RIDGES.slice(1).concat([F('M330 250Q400 300 470 285', 50, 0.25), F('M670 250Q600 300 530 285', 50, 0.25)]));
    out += creases(id, `${id}t`, TORSO_DARK, TORSO_LIGHT);

    /* --- sleeves --- */
    let sl = `<rect x="0" y="0" width="1000" height="1000" ${fill('sleeves')}/>`;
    if (j.pattern.area === 'all') sl += patArt;
    sl += yoke;
    let top = 30;
    for (const b of stripeSet(j.sleeve.style)) {
      const a = j.sleeve.offset * K + 90 + b.at * j.sleeve.size * K, h = b.h * j.sleeve.size * K;
      sl += `<path d="${sleeveBand(a, a + h)}" ${fill('stripe' + b.c)}/>`;
      top = Math.max(top, a + h);
    }
    sl += `<path d="${sleeveBand(-30, 30)}" ${fill('cuffs')}/>`;
    sl += stitch(`M${P(add(CO, mul(UP, 36)))}Q${P(add(CMID, [0, BOW + 0]).map((v, i) => v + UP[i] * 36))} ${P(add(CI, mul(UP, 36)))}`) ;
    sl += stitch(mirror(`M${P(add(CO, mul(UP, 36)))}Q${P(add(CMID, [0, BOW]).map((v, i) => v + UP[i] * 36))} ${P(add(CI, mul(UP, 36)))}`));
    sl += noise(id);
    let sletters = '';
    if (L.sleeveNumbers && d.player.number) {
      const dist = Math.min(600, Math.max(top + 150, 470)), p = add(CMID, mul(AXIS, dist)), sz = 100 * nf.size;
      const y = p[1] + sz * 0.36;
      sletters += `<g transform="rotate(${AXIS_DEG} ${P(p)})">${outlinedText(d.player.number, p[0], y, sz, nf, cols, Math.min(L.outlines, 1), 100)}</g>`;
      sletters += `<g transform="rotate(${-AXIS_DEG} ${R(1000 - p[0])} ${R(p[1])})">${outlinedText(d.player.number, 1000 - p[0], y, sz, nf, cols, Math.min(L.outlines, 1), 100)}</g>`;
    }
    if (front && d.crest.patch && d.crest.patch !== 'none') {
      sletters += crest(d, kit, 216, 226, 74, true) + crest(d, kit, 784, 226, 74, true);
    }
    sl += `<g filter="url(#${id}tw)">${sletters}</g>`;
    out += `<g clip-path="url(#${id}s)">${sl}</g>`;
    out += shade(id, 'Lf', SLEEVES, `${id}s`, both(SLEEVE_RIDGES));
    out += creases(id, `${id}s`, both(SLEEVE_DARK), SLEEVE_LIGHT.concat(SLEEVE_LIGHT.map((f) => ({ ...f, d: mirror(f.d), o: 0.08 }))));
    out += stitch('M276 352Q264 190 214 108') + stitch(mirror('M276 352Q264 190 214 108'));
    out += `<path d="${torso}${SLEEVES}" fill="none" stroke="#0a0f15" stroke-opacity=".28" stroke-width="1.6" stroke-linejoin="round" ${NO_HIT}/>`;
    return { defs: df, body: out };
  }

  /* ---------------- pants ---------------- */
  const PANTS = 'M262 1100C240 1250 228 1380 236 1475Q345 1500 470 1478L492 1330Q500 1318 508 1330L530 1478Q655 1500 764 1475C772 1380 760 1250 738 1100Z';
  const PANTS_EDGE_L = 'M266 1060C242 1250 228 1380 234 1520';
  function pantsArt(d, kit, view, id) {
    const col = (z) => UB.color(d, kit, z), fill = (z) => `fill="${col(z)}" data-zone="${z}"`;
    const side = (inset, w, z) =>
      `<path d="${PANTS_EDGE_L}" transform="translate(${inset + w / 2} 0)" fill="none" stroke="${col(z)}" stroke-width="${w}" data-zone="${z}"/>` +
      `<path d="${mirror(PANTS_EDGE_L)}" transform="translate(${-(inset + w / 2)} 0)" fill="none" stroke="${col(z)}" stroke-width="${w}" data-zone="${z}"/>`;
    let p = `<rect x="200" y="1050" width="600" height="500" ${fill('pants')}/>`;
    switch (kit.pants.stripe) {
      case 'single': p += side(0, 46, 'pantsStripe1'); break;
      case 'outlined': p += side(0, 64, 'pantsStripe2') + side(10, 44, 'pantsStripe1'); break;
      case 'twin': p += side(8, 16, 'pantsStripe1') + side(36, 16, 'pantsStripe1'); break;
      case 'hem': p += `<path d="${hBand(200, 800, 1452, 10, 14)}" ${fill('pantsStripe2')}/><path d="${hBand(200, 800, 1478, 22, 14)}" ${fill('pantsStripe1')}/>`; break;
    }
    if (view === 'front' && d.lettering.pantsCrest) p += `<g filter="url(#${id}tw)">${crest(d, kit, 655, 1380, 84, true)}</g>`;
    const seams = view === 'front'
      ? 'M500 1226L500 1322M246 1392Q350 1412 470 1386M754 1392Q650 1412 530 1386M378 1232L392 1480M622 1232L608 1480'
      : 'M246 1392Q350 1412 470 1386M754 1392Q650 1412 530 1386M500 1226L500 1320M330 1236Q400 1300 486 1290M670 1236Q600 1300 514 1290';
    p += `<path d="${seams}" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="3" ${NO_HIT}/>` + stitch(seams, 'transform="translate(4 0)"');
    p += noise(id, 0.3);
    let out = clip(`${id}pc`, PANTS);
    out += `<g clip-path="url(#${id}pc)">${p}</g>`;
    out += shade(id, 'Lp', PANTS, `${id}pc`, both([F('M330 1240C325 1330 330 1400 340 1460', 90, 0.35), F('M440 1250L458 1460', 40, 0.2), F('M300 1300Q350 1280 420 1300', 50, 0.2)]),
      [], 0.5);
    out += creases(id, `${id}pc`, both([F('M246 1392Q350 1412 470 1386', 10, 0.5), F('M478 1330L470 1478', 14, 0.55)]), [F('M300 1260C296 1340 300 1400 306 1460', 24, 0.3)], 'b5');
    out += `<path d="${PANTS}" fill="none" stroke="#0a0f15" stroke-opacity=".3" stroke-width="1.6" ${NO_HIT}/>`;
    return out;
  }

  /* ---------------- socks ---------------- */
  const SOCK_L = 'M300 1440L468 1440C482 1500 478 1560 466 1640C456 1700 446 1760 442 1800L328 1800C324 1760 316 1700 306 1640C294 1560 288 1500 300 1440Z';
  const SOCKS = SOCK_L + mirror(SOCK_L);
  function socksArt(d, kit, view, id) {
    const col = (z) => UB.color(d, kit, z);
    const sk = kit.socks, style = sk.style === 'match' ? kit.jersey.hem.style : sk.style;
    let s = `<rect x="200" y="1400" width="600" height="420" fill="${col('socks')}" data-zone="socks"/>`;
    for (const b of stripeSet(style)) {
      const bottom = 1440 + (250 - sk.offset - b.at * sk.size - 10) * 1.24, h = b.h * sk.size * 1.6;
      const z = b.c === 1 ? 'sockStripe1' : 'sockStripe2';
      s += `<path d="${hBand(280, 490, bottom, h, 14)}${mirror(hBand(280, 490, bottom, h, 14))}" fill="${col(z)}" data-zone="${z}"/>`;
    }
    s += noise(id, 0.6);
    const knee = (cx) => `M${cx - 62} 1500a62 46 0 1 0 124 0a62 46 0 1 0-124 0Z`;
    let out = clip(`${id}sc`, SOCKS) + `<g clip-path="url(#${id}sc)">${s}</g>`;
    out += shade(id, 'Lp', SOCKS, `${id}sc`, both([F('M384 1470C384 1560 385 1700 385 1790', 70, 0.35)]), [{ d: knee(384) + knee(616), o: 0.3 }], 0.5);
    out += creases(id, `${id}sc`, both([F('M332 1762Q385 1778 440 1760', 6, 0.5), F('M318 1560Q330 1640 334 1740', 14, 0.35)]), []);
    return out;
  }

  /* ---------------- skates ---------------- */
  function skate(cx, front, id, col) {
    const boot = `M${cx - 70} 1788C${cx - 82} 1850 ${cx - 84} 1892 ${cx - 66} 1916L${cx + 66} 1916C${cx + 84} 1892 ${cx + 82} 1850 ${cx + 70} 1788Q${cx} 1770 ${cx - 70} 1788Z`;
    let s = '';
    if (front) {
      s += `<path d="M${cx - 50} 1800L${cx - 48} 1742Q${cx} 1724 ${cx + 48} 1742L${cx + 50} 1800Z" fill="${col('skates')}" data-zone="skates"/>`;
      s += `<path d="M${cx - 38} 1750Q${cx} 1738 ${cx + 38} 1750" fill="none" stroke="${col('skatesTrim')}" stroke-width="6" data-zone="skatesTrim"/>`;
    } else {
      s += `<path d="M${cx - 28} 1800L${cx - 30} 1732Q${cx} 1714 ${cx + 30} 1732L${cx + 28} 1800Z" fill="${col('skates')}" data-zone="skates"/>`;
    }
    s += `<path d="${boot}" fill="${col('skates')}" data-zone="skates"/>`;
    s += `<path d="M${cx - 78} 1860Q${cx} 1840 ${cx + 78} 1860L${cx + 80} 1878Q${cx} 1858 ${cx - 80} 1878Z" fill="${col('skatesTrim')}" data-zone="skatesTrim"/>`;
    if (front) {
      let lace = '';
      for (let y = 1796; y < 1880; y += 16) lace += `M${cx - 22} ${y}L${cx + 22} ${y + 8}M${cx + 22} ${y}L${cx - 22} ${y + 8}`;
      s += `<path d="${lace}" stroke="#f1f3f5" stroke-width="3.5" stroke-linecap="round" ${NO_HIT}/>`;
      s += `<ellipse cx="${cx}" cy="1900" rx="52" ry="16" fill="#fff" fill-opacity=".12" ${NO_HIT}/>`;
    }
    s += `<path d="M${cx - 46} 1914L${cx + 46} 1914L${cx + 16} 1950L${cx - 16} 1950Z" fill="#eceef1" ${NO_HIT}/>`;
    s += `<path d="M${cx - 46} 1914L${cx + 46} 1914L${cx + 38} 1922L${cx - 38} 1922Z" fill="#000" fill-opacity=".3" ${NO_HIT}/>`;
    s += `<path d="M${cx + 16} 1950L${cx + 46} 1914L${cx + 40} 1914L${cx + 8} 1950Z" fill="#000" fill-opacity=".15" ${NO_HIT}/>`;
    s += `<rect x="${cx - 5}" y="1948" width="10" height="18" rx="2" fill="url(#${id}steel)" ${NO_HIT}/>`;
    const shape = boot + (front ? `M${cx - 50} 1800L${cx - 48} 1742Q${cx} 1724 ${cx + 48} 1742L${cx + 50} 1800Z` : `M${cx - 28} 1800L${cx - 30} 1732Q${cx} 1714 ${cx + 30} 1732L${cx + 28} 1800Z`);
    return { art: s, shape };
  }
  function skatesArt(d, kit, view, id) {
    const col = (z) => UB.color(d, kit, z), front = view === 'front';
    const a = skate(385, front, id, col), b = skate(615, front, id, col);
    return clip(`${id}sk`, a.shape + b.shape) + a.art + b.art + shade(id, 'Lh', a.shape + b.shape, `${id}sk`, [F(`M385 1780L385 1910`, 30, 0.25), F(`M615 1780L615 1910`, 30, 0.25)], [], 0.55);
  }

  /* ---------------- gloves ---------------- */
  const GLOVE_CUFF = 'M122 1174Q196 1156 272 1174L284 1274Q198 1290 110 1274Z';
  const GLOVE_HAND = 'M128 1266C122 1300 118 1362 128 1410Q150 1442 198 1444Q248 1442 266 1410C278 1362 278 1300 272 1266Z';
  const THUMB = 'M256 1296C290 1292 300 1330 292 1366C286 1384 266 1386 258 1372Z';
  function glovesArt(d, kit, id) {
    const col = (z) => UB.color(d, kit, z), fill = (z) => `fill="${col(z)}" data-zone="${z}"`;
    const one = (m) => {
      const M = m ? mirror : (x) => x;
      let s = `<path d="${M(THUMB)}" ${fill('gloves')}/>`;
      s += `<path d="${M(GLOVE_HAND)}" ${fill('gloves')}/>`;
      s += `<path d="${M('M124 1386Q198 1400 274 1386C272 1398 270 1404 266 1410Q248 1442 198 1444Q150 1442 128 1410C126 1402 124 1394 124 1386Z')}" ${fill('glovesTrim')}/>`;
      s += `<path d="${M('M164 1330Q160 1390 166 1440M200 1332L199 1444M236 1330Q240 1390 234 1440')}" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="3.5" ${NO_HIT}/>`;
      s += `<path d="${M(GLOVE_CUFF)}" ${fill('gloves')}/>`;
      s += `<path d="${M('M122 1174Q196 1156 272 1174L274 1200Q196 1182 120 1200Z')}" ${fill('glovesTrim')}/>`;
      s += `<path d="${M('M114 1244Q198 1260 282 1244')}" stroke="#000" stroke-opacity=".3" stroke-width="3" fill="none" ${NO_HIT}/>`;
      return s;
    };
    const shapes = GLOVE_CUFF + GLOVE_HAND + THUMB + mirror(GLOVE_CUFF) + mirror(GLOVE_HAND) + mirror(THUMB);
    const ridges = [F('M146 1340Q142 1390 148 1430', 28, 0.45), F('M182 1340L182 1440', 28, 0.45), F('M218 1340L218 1440', 28, 0.45), F('M252 1340Q256 1390 250 1428', 24, 0.45),
      F('M126 1186Q196 1170 270 1186', 22, 0.4), F('M160 1215L156 1265', 44, 0.3), F('M236 1215L240 1265', 44, 0.3)];
    return clip(`${id}gl`, shapes) + one(false) + one(true) + shade(id, 'Lp', shapes, `${id}gl`, both(ridges), [], 0.5);
  }

  /* ---------------- stick ---------------- */
  function stickArt(d, kit, view, id) {
    const col = UB.color(d, kit, 'stick');
    const m = view === 'back' ? mirror : (x) => x;
    const x0 = 196, y0 = 1262, x1 = 730, y1 = 1930;
    const ang = (Math.atan2(y1 - y0, x1 - x0) * 180) / Math.PI, len = Math.hypot(x1 - x0, y1 - y0);
    const flip = view === 'back' ? `translate(1000 0) scale(-1 1)` : '';
    let s = `<g transform="${flip}"><g transform="translate(${x0} ${y0}) rotate(${R(ang)})">` +
      `<rect x="-40" y="-12" width="${R(len + 40)}" height="24" rx="5" fill="${col}" data-zone="stick"/>` +
      `<rect x="-40" y="-12" width="${R(len + 40)}" height="24" rx="5" fill="url(#${id}shaft)" ${NO_HIT}/>` +
      `<rect x="-44" y="-14" width="70" height="28" rx="7" fill="#f2f2f0" ${NO_HIT}/>` +
      `<path d="M-40 -14L-30 14M-26 -14L-16 14M-12 -14L-2 14M2 -14L12 14M16 -14L26 14" stroke="#000" stroke-opacity=".18" stroke-width="2" ${NO_HIT}/>` +
      `<rect x="${R(len * 0.35)}" y="-12" width="140" height="24" fill="#fff" fill-opacity=".1" ${NO_HIT}/>` +
      `</g>`;
    const blade = 'M716 1906L736 1950Q800 1966 880 1958Q912 1952 906 1932Q866 1928 806 1932Q766 1930 750 1904Z';
    s += `<path d="${blade}" fill="${col}" data-zone="stick"/>`;
    s += `<path d="M752 1930Q800 1936 870 1934L876 1954Q806 1962 758 1948Z" fill="#f4f4f2" ${NO_HIT}/>`;
    s += `<path d="M770 1932L776 1950M790 1934L796 1952M810 1934L816 1954M830 1934L836 1954M850 1934L856 1954" stroke="#000" stroke-opacity=".18" stroke-width="2" ${NO_HIT}/>`;
    s += `<path d="${blade}" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="1.5" ${NO_HIT}/></g>`;
    return s;
  }

  /* ---------------- helmet ---------------- */
  const SHELL_F = 'M340 230C330 120 400 42 500 40C600 42 670 120 660 230L662 300Q650 318 628 318L612 250Q500 236 388 250L372 318Q350 318 338 300Z';
  const SHELL_B = 'M340 230C330 120 400 42 500 40C600 42 670 120 660 230L662 300Q650 318 628 318L618 272Q500 300 382 272L372 318Q350 318 338 300Z';
  const EAR = 'M334 258Q326 300 340 340Q364 352 382 334L388 266Q362 250 334 258Z';
  function helmetArt(d, kit, view, id) {
    const col = (z) => UB.color(d, kit, z), fill = (z) => `fill="${col(z)}" data-zone="${z}"`;
    const front = view === 'front', shell = front ? SHELL_F : SHELL_B;
    const nf = font(d.lettering.numberFont);
    let s = '';
    if (front) s += `<path d="M384 250Q500 236 616 250L632 324Q500 360 368 324Z" fill="url(#${id}hin)" ${NO_HIT}/>`;
    else s += `<path d="M382 272Q500 300 618 272L624 318Q500 340 376 318Z" fill="url(#${id}hin)" ${NO_HIT}/>`;
    let h = `<path d="${shell}" ${fill('helmet')}/>`;
    h += `<path d="M352 205C380 150 430 120 500 118C570 120 620 150 648 205" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="3" ${NO_HIT}/>`;
    h += [[446, 76, -14], [554, 76, 14], [500, 64, 0], [400, 112, -40], [600, 112, 40]].map(([x, y, a]) =>
      `<rect x="${x - 24}" y="${y - 7}" width="48" height="14" rx="7" fill="#05070a" fill-opacity=".7" transform="rotate(${a} ${x} ${y})" ${NO_HIT}/>`).join('');
    if (!front && d.lettering.helmetNumber && d.player.number) {
      h += `<text x="500" y="222" font-family="${nf.family}" font-weight="${nf.weight}" font-size="${R(70 * nf.size)}" text-anchor="middle" ${fill('helmetDecal')}>${esc(d.player.number)}</text>`;
    }
    if (!front) h += `<rect x="478" y="262" width="44" height="18" rx="5" fill="#9aa3ad" ${NO_HIT}/>`;
    let out = clip(`${id}hs`, shell) + clip(`${id}he`, EAR + mirror(EAR)) + s + `<g clip-path="url(#${id}hs)">${h}</g>`;
    out += shade(id, 'Lh', shell, `${id}hs`, [F('M500 60L500 220', 50, 0.3)], [], 0.55);
    out += `<g filter="url(#${id}b12)" style="mix-blend-mode:screen" ${NO_HIT}><ellipse cx="430" cy="110" rx="62" ry="22" fill="#fff" fill-opacity=".55" transform="rotate(-32 430 110)"/></g>`;
    out += `<path d="${EAR}" ${fill('helmetTrim')}/><path d="${mirror(EAR)}" ${fill('helmetTrim')}/>`;
    out += shade(id, 'Lh', EAR + mirror(EAR), `${id}he`, [], [], 0.6);
    out += [352, 362, 648, 638].map((x, i) => `<circle cx="${x}" cy="${i % 2 ? 312 : 296}" r="4" fill="#000" fill-opacity=".5" ${NO_HIT}/>`).join('');
    if (front) {
      const visor = 'M386 248Q500 232 614 248L622 298Q500 328 378 298Z';
      out += `<path d="${visor}" fill="url(#${id}vis)" ${NO_HIT}/>`;
      out += `<path d="M400 252L452 246L420 306L392 300Z" fill="#fff" fill-opacity=".28" ${NO_HIT}/>`;
      out += `<path d="${visor}" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.5" ${NO_HIT}/>`;
      out += `<circle cx="384" cy="262" r="6" fill="#c3c9cf" ${NO_HIT}/><circle cx="616" cy="262" r="6" fill="#c3c9cf" ${NO_HIT}/>`;
    }
    out += `<path d="${shell}" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.6" ${NO_HIT}/>`;
    return out;
  }

  /* ---------------- figures ---------------- */
  function jersey(d, kit, view, opt = {}) {
    const id = uid(), art = jerseyArt(d, kit, view, id);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="80 -10 840 1040" ${opt.attrs || ''}><defs>${defs(id)}${art.defs}</defs>` +
      `<ellipse cx="500" cy="990" rx="330" ry="22" fill="#0a1420" fill-opacity=".3" filter="url(#${id}b12)" ${NO_HIT}/>` +
      `<g style="isolation:isolate">${art.body}</g></svg>`;
  }

  function player(d, kit, view, opt = {}) {
    const id = uid(), art = jerseyArt(d, kit, view, id);
    let s = `<ellipse cx="500" cy="1962" rx="300" ry="20" fill="#0a1420" fill-opacity=".35" filter="url(#${id}b12)" ${NO_HIT}/>`;
    s += socksArt(d, kit, view, id);
    s += skatesArt(d, kit, view, id);
    s += pantsArt(d, kit, view, id);
    s += `<g filter="url(#${id}b24)" ${NO_HIT}><path d="M290 1222Q500 1250 710 1222L710 1262Q500 1286 290 1262Z" fill="#000" fill-opacity=".45"/></g>`;
    s += `<g transform="translate(0 ${JY})">${art.body}</g>`;
    if (d.lettering.stick !== false) s += stickArt(d, kit, view, id);
    s += glovesArt(d, kit, id);
    s += `<g transform="translate(500 322) scale(.78) translate(-500 -340)">${helmetArt(d, kit, view, id)}</g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 10 880 1975" ${opt.attrs || ''}><defs>${defs(id)}` +
      `<g transform="translate(0 ${JY})">${art.defs}</g></defs><g style="isolation:isolate">${s}</g></svg>`;
  }

  /* ---------------- export sheets ---------------- */
  const BG = '#EEF1F4', INK = '#0E1A26', MUTED = '#5A6B7B', TITLE = "'Saira Condensed', 'Arial Narrow', sans-serif";
  function header(d, sub, W) {
    const sw = d.team.palette.map((c, i) => {
      const x = W - 60 - (5 - i) * 130;
      return `<rect x="${x}" y="52" width="30" height="30" rx="5" fill="${c}" stroke="${INK}" stroke-opacity=".25"/>` +
        `<text x="${x + 38}" y="64" font-family="${TITLE}" font-size="13" font-weight="600" letter-spacing="1" fill="${MUTED}">${UB.PALETTE_SLOTS[i].toUpperCase()}</text>` +
        `<text x="${x + 38}" y="81" font-family="ui-monospace, Menlo, monospace" font-size="14" fill="${INK}">${c.toUpperCase()}</text>`;
    }).join('');
    return `<rect width="100%" height="100%" fill="${BG}"/>` +
      `<text x="60" y="84" font-family="${TITLE}" font-size="56" font-weight="800" fill="${INK}">${esc((d.team.name || 'My team').toUpperCase())}</text>` +
      `<text x="62" y="114" font-family="${TITLE}" font-size="19" font-weight="600" letter-spacing="2" fill="${MUTED}">${esc(sub.toUpperCase())}</text>` + sw;
  }
  function sheet(d, kitKey, css = '') {
    const kit = d.kits[kitKey], W = 1840, H = 1330;
    const tpl = UB.TEMPLATES.find((t) => t.id === kit.template);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${css ? `<style>${css}</style>` : ''}` +
      header(d, `${UB.KIT_NAMES[kitKey]} uniform · ${kit.swap ? 'light' : 'dark'} sweater${tpl ? ' · ' + tpl.name : ''}`, W) +
      player(d, kit, 'front', { attrs: 'x="40" y="160" width="560" height="1140"' }) +
      player(d, kit, 'back', { attrs: 'x="600" y="160" width="560" height="1140"' }) +
      jersey(d, kit, 'front', { attrs: 'x="1200" y="150" width="590" height="560"' }) +
      jersey(d, kit, 'back', { attrs: 'x="1200" y="730" width="590" height="560"' }) +
      `</svg>`;
  }
  function lineup(d, css = '') {
    const W = 1840, H = 1380;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${css ? `<style>${css}</style>` : ''}` +
      header(d, 'Uniform set · home, away and third', W);
    ['home', 'away', 'third'].forEach((k, i) => {
      const x = 60 + i * 600;
      s += `<text x="${x + 270}" y="190" text-anchor="middle" font-family="${TITLE}" font-size="24" font-weight="700" letter-spacing="3" fill="${INK}">${UB.KIT_NAMES[k].toUpperCase()}</text>`;
      s += player(d, d.kits[k], 'front', { attrs: `x="${x}" y="210" width="540" height="1140"` });
    });
    return s + `</svg>`;
  }

  UB.real = { jersey, player, sheet, lineup };
})();
