/* =====================================================================
   Stripe effects: a pattern on a stripe, flat, debossed or embossed.
   An effect is plain data, so people can set it with the controls or
   the AI helper can fill it in from a sentence:

     kit.fx[zone] = { pattern, relief, scale, spacing, rotate, color }

   zone      one of UB.FX.TARGETS
   pattern   a key of UB.FX.PATTERNS ("none" removes the effect)
   relief    flat | deboss | emboss
   scale     0.5 to 2.5 (size of each shape)
   spacing   1 to 2.5 (space between shapes)
   rotate    0 to 90 degrees
   color     "tone" (same colour as the stripe, a little lighter or darker),
             "p0".."p4" (team colours) or a hex colour

   To add a pattern: add a shape in SHAPES (drawn in a box from -0.5 to 0.5)
   and a label in UB.FX.PATTERNS.
   ===================================================================== */
(function () {
  const UB = window.UB;
  const FX = (UB.FX = {});

  FX.PATTERNS = { none: 'None', stars: 'Stars', dots: 'Dots', diamonds: 'Diamonds', chevrons: 'Chevrons', lines: 'Diagonal lines', checks: 'Checks',
    hexagons: 'Hexagons', crosses: 'Crosses', triangles: 'Triangles', waves: 'Waves' };
  FX.RELIEFS = { flat: 'Flat', deboss: 'Debossed', emboss: 'Embossed' };
  FX.TARGETS = { stripe1: 'Main stripe', stripe2: 'Accent stripe', pantsStripe1: 'Pants stripe', pantsStripe2: 'Pants accent', sockStripe1: 'Sock stripe', sockStripe2: 'Sock accent' };
  FX.COLORS = { tone: 'Tone on tone', p0: 'Primary', p1: 'Secondary', p2: 'Accent', p3: 'Trim', p4: 'Extra' };
  FX.DEFAULT = { pattern: 'stars', relief: 'deboss', scale: 1, spacing: 1.4, rotate: 0, color: 'tone' };

  // paint(p) -> attribute string for fill or stroke
  const fill = (d) => (p) => `<path d="${d}" fill="${p}"/>`;
  const line = (d, w) => (p) => `<path d="${d}" fill="none" stroke="${p}" stroke-width="${w}" stroke-linejoin="round"/>`;
  const SHAPES = {
    stars: fill('M0 -0.5L0.12 -0.16L0.48 -0.15L0.19 0.06L0.3 0.4L0 0.2L-0.3 0.4L-0.19 0.06L-0.48 -0.15L-0.12 -0.16Z'),
    dots: (p) => `<circle r="0.32" fill="${p}"/>`,
    diamonds: fill('M0 -0.5L0.4 0L0 0.5L-0.4 0Z'),
    chevrons: line('M-0.45 0.2L0 -0.25L0.45 0.2', 0.22),
    hexagons: line('M0.5 0L0.25 0.43L-0.25 0.43L-0.5 0L-0.25 -0.43L0.25 -0.43Z', 0.1),
    crosses: fill('M-0.12 -0.4h0.24v0.28h0.28v0.24h-0.28v0.28h-0.24v-0.28h-0.28v-0.24h0.28Z'),
    triangles: fill('M0 -0.45L0.45 0.4L-0.45 0.4Z'),
    waves: line('M-0.5 0Q-0.25 -0.35 0 0T0.5 0', 0.18),
  };

  /* A <pattern> that tiles the shape. Returns SVG for <defs>. */
  FX.patternDef = function (e, id, paint) {
    const size = 14 * e.scale;
    let tile = Math.max(size * e.spacing, size * 0.9), body;
    if (e.pattern === 'lines') {
      tile = Math.max(size * e.spacing, size * 0.9);
      const w = size * 0.3;
      body = `<path d="M0 ${tile}L${tile} 0M${-tile / 2} ${tile / 2}L${tile / 2} ${-tile / 2}M${tile / 2} ${tile * 1.5}L${tile * 1.5} ${tile / 2}" stroke="${paint}" stroke-width="${w}" fill="none"/>`;
    } else if (e.pattern === 'checks') {
      tile = size * 2;
      body = `<rect width="${size}" height="${size}" fill="${paint}"/><rect x="${size}" y="${size}" width="${size}" height="${size}" fill="${paint}"/>`;
    } else {
      body = `<g transform="translate(${tile / 2} ${tile / 2}) scale(${size})">${SHAPES[e.pattern](paint)}</g>`;
    }
    return `<pattern id="${id}" width="${tile}" height="${tile}" patternUnits="userSpaceOnUse" patternTransform="rotate(${e.rotate})">${body}</pattern>`;
  };

  /* The colour a pattern is drawn in. */
  FX.paint = function (e, d, kit, base) {
    if (/^p\d$/.test(e.color)) return d.team.palette[+e.color[1]] || base;
    if (UB.isHex(e.color)) return e.color;
    return UB.luminance(base) > 0.5 ? UB.shade(base, -0.22) : UB.shade(base, 0.3);
  };

  /* Accept anything (from the AI or a saved file) and return a safe effect, or null. */
  FX.sanitize = function (raw) {
    if (!raw || typeof raw !== 'object') return null;
    const num = (v, lo, hi, dflt) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : dflt);
    const pattern = Object.hasOwn(FX.PATTERNS, raw.pattern) ? raw.pattern : null;
    if (!pattern) return null;
    const color = Object.hasOwn(FX.COLORS, raw.color) ? raw.color : UB.isHex(raw.color) ? String(raw.color).toLowerCase() : 'tone';
    return {
      pattern,
      relief: Object.hasOwn(FX.RELIEFS, raw.relief) ? raw.relief : FX.DEFAULT.relief,
      scale: num(raw.scale, 0.5, 2.5, 1),
      spacing: num(raw.spacing, 1, 2.5, 1.4),
      rotate: num(raw.rotate, 0, 90, 0),
      color,
      target: Object.hasOwn(FX.TARGETS, raw.target) ? raw.target : null,
    };
  };

  /* The built-in helper: reads a sentence for the words it knows. Used when the
     AI service isn't reachable, so the feature still works offline. */
  FX.parseText = function (text) {
    const t = ' ' + String(text || '').toLowerCase() + ' ';
    const has = (...w) => w.some((x) => t.includes(x));
    const pick = (map) => Object.entries(map).find(([, words]) => has(...words));
    const pat = pick({
      stars: ['star'], dots: ['dot', 'polka', 'circle'], diamonds: ['diamond'], chevrons: ['chevron', 'arrow'], lines: ['diagonal', 'line', 'slash'],
      checks: ['check', 'plaid', 'gingham', 'square'], hexagons: ['hex', 'honeycomb'], crosses: ['cross', 'plus'], triangles: ['triang'], waves: ['wave', 'wavy'],
    });
    if (!pat) return null;
    const relief = has('deboss', 'engrav', 'indent', 'pressed', 'stamped') ? 'deboss' : has('emboss', 'raised', 'puffy', '3d') ? 'emboss' : has('flat', 'printed', 'print ') ? 'flat' : 'deboss';
    const scale = has('tiny', 'small', 'fine', 'little') ? 0.7 : has('huge', 'large', 'big', 'bold', 'chunky') ? 1.6 : 1;
    const spacing = has('tight', 'dense', 'packed', 'close') ? 1 : has('wide', 'sparse', 'spread', 'spaced') ? 2 : 1.4;
    const rotate = has('diagonal', 'slant', 'angled', '45') ? 45 : 0;
    const colors = [['primary', 'p0'], ['secondary', 'p1'], ['accent', 'p2'], ['trim', 'p3'], ['gold', '#d4a62a'], ['silver', '#b9bfc7'], ['white', '#ffffff'], ['black', '#111111'],
      ['red', '#c8102e'], ['blue', '#1f4fa3'], ['green', '#1d7a46'], ['orange', '#f47a20'], ['yellow', '#ffc62e'], ['purple', '#55247a']];
    const c = colors.find(([w]) => has(w));
    const target = has('sock') ? (has('accent', 'second') ? 'sockStripe2' : 'sockStripe1')
      : has('pant', 'short') ? (has('accent', 'second') ? 'pantsStripe2' : 'pantsStripe1')
        : has('accent', 'second', 'thin') ? 'stripe2' : has('main', 'hem', 'sleeve', 'jersey', 'stripe') ? 'stripe1' : null;
    return FX.sanitize({ pattern: pat[0], relief, scale, spacing, rotate: pat[0] === 'lines' ? rotate || 0 : rotate, color: c ? c[1] : 'tone', target });
  };
})();
