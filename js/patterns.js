/* =====================================================================
   Jersey patterns
   ---------------------------------------------------------------------
   Each pattern returns SVG markup in jersey coordinates (the sweater
   spans roughly x 8…392, y 38…413). The builder clips it to the body
   (or body + sleeves) and applies the Strength slider as opacity.

   draw() receives:
     color — hex colour of the Pattern zone
     size  — Size slider (0.5 … 2)
     pos   — Position slider (−100 … 100), shifts the pattern up/down
     id    — unique prefix for any <defs> ids you create

   To add a pattern, add an entry here; it shows up in the Jersey tab.
   ===================================================================== */
(function () {
  const UB = window.UB;
  const R = (n) => Math.round(n * 10) / 10;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* A smooth irregular blob, for camo. */
  function blob(cx, cy, r, rnd) {
    const k = 9, pts = [];
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2, rr = r * (0.55 + rnd() * 0.6);
      pts.push([cx + Math.cos(a) * rr * 1.45, cy + Math.sin(a) * rr]);
    }
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let m = mid(pts[0], pts[1]), d = `M${R(m[0])} ${R(m[1])}`;
    for (let i = 1; i <= k; i++) {
      const p = pts[i % k], n = mid(p, pts[(i + 1) % k]);
      d += `Q${R(p[0])} ${R(p[1])} ${R(n[0])} ${R(n[1])}`;
    }
    return d + 'Z';
  }

  UB.PATTERNS = {
    none: { label: 'None', draw: () => '' },

    pinstripe: {
      label: 'Pinstripes',
      draw({ color, size }) {
        const step = 14 * size, w = Math.max(1, 2 * size);
        let d = '';
        for (let x = step / 2; x < 410; x += step) d += `M${R(x)} 0h${R(w)}v440h${R(-w)}z`;
        return `<path d="${d}" fill="${color}"/>`;
      },
    },

    hoops: {
      label: 'Hoops',
      draw({ color, size, pos }) {
        const h = 22 * size, gap = 24 * size;
        let d = '';
        for (let y = 176 + pos; y < 440; y += h + gap) d += `M-20 ${R(y)}h440v${R(h)}h-440z`;
        return `<path d="${d}" fill="${color}"/>`;
      },
    },

    sash: {
      label: 'Sash',
      draw: ({ color, size, pos }) =>
        `<rect x="-400" y="${R(-34 * size)}" width="800" height="${R(68 * size)}" fill="${color}" transform="translate(200 ${R(232 + pos)}) rotate(38)"/>`,
    },

    chevron: {
      label: 'Chevron',
      draw({ color, size, pos }) {
        const y = 292 + pos, t = 44 * size, rise = 125;
        return `<path d="M-60 ${R(y - rise)}L200 ${R(y)}L460 ${R(y - rise)}L460 ${R(y - rise + t)}L200 ${R(y + t)}L-60 ${R(y - rise + t)}Z" fill="${color}"/>`;
      },
    },

    fade: {
      label: 'Fade',
      draw({ color, size, pos, id }) {
        const a = clamp(0.2 + pos / 400, 0, 0.9), b = clamp(a + 0.55 * size, a + 0.05, 1);
        return `<defs><linearGradient id="${id}fd" x1="0" y1="0" x2="0" y2="1">` +
          `<stop offset="${R(a)}" stop-color="${color}" stop-opacity="0"/><stop offset="${R(b)}" stop-color="${color}"/></linearGradient></defs>` +
          `<rect x="-20" y="20" width="440" height="400" fill="url(#${id}fd)"/>`;
      },
    },

    hex: {
      label: 'Honeycomb',
      draw({ color, size, pos }) {
        const r = 13 * size, h = (r * Math.sqrt(3)) / 2;
        let d = '';
        for (let c = 0, x = -r; x < 420; c++, x += 1.5 * r) {
          for (let y = (c % 2 ? h : 0) - 2 * h + (pos % (2 * h)); y < 440; y += 2 * h) {
            d += `M${R(x + r)} ${R(y)}L${R(x + r / 2)} ${R(y + h)}L${R(x - r / 2)} ${R(y + h)}L${R(x - r)} ${R(y)}L${R(x - r / 2)} ${R(y - h)}L${R(x + r / 2)} ${R(y - h)}Z`;
          }
        }
        return `<path d="${d}" fill="none" stroke="${color}" stroke-width="${R(2.4 * size)}"/>`;
      },
    },

    camo: {
      label: 'Camo',
      draw({ color, size, pos }) {
        const rnd = rng(7), n = Math.round(70 / (size * size));
        let a = '', b = '';
        for (let i = 0; i < n; i++) {
          const d = blob(rnd() * 460 - 30, rnd() * 430 + 10 + pos, (14 + rnd() * 22) * size, rnd);
          if (i % 3 === 0) b += d; else a += d;
        }
        return `<path d="${a}" fill="${color}"/><path d="${b}" fill="${UB.shade(color, 0.45)}"/>`;
      },
    },

    diagonal: {
      label: 'Diagonal stripes',
      draw({ color, size, pos }) {
        const step = 34 * size, h = 12 * size;
        let d = '';
        for (let y = -400 + (pos % step); y < 800; y += step) d += `M-400 ${R(y)}h1200v${R(h)}h-1200z`;
        return `<path d="${d}" fill="${color}" transform="rotate(-35 200 220)"/>`;
      },
    },

    sidepanels: {
      label: 'Side panels',
      draw({ color, size, pos }) {
        const w = 40 * size, y = 140 + pos;
        return `<path d="M0 ${R(y)}H${R(118 + w)}V440H0ZM${R(282 - w)} ${R(y)}H420V440H${R(282 - w)}Z" fill="${color}"/>`;
      },
    },

    peaks: {
      label: 'Peaks',
      draw({ color, size, pos }) {
        const y = 300 + pos, amp = 34 * size, t = 24 * size, step = 50 * size, top = [];
        for (let i = 0, x = -60; x <= 470; i++, x += step) top.push([x, i % 2 ? y - amp : y]);
        const d = 'M' + top.map((p) => `${R(p[0])} ${R(p[1])}`).join('L') +
          'L' + top.slice().reverse().map((p) => `${R(p[0])} ${R(p[1] + t)}`).join('L') + 'Z';
        return `<path d="${d}" fill="${color}"/>`;
      },
    },

    split: {
      label: 'Two-tone split',
      draw: ({ color }) => `<rect x="200" y="0" width="230" height="440" fill="${color}"/>`,
    },

    speed: {
      label: 'Speed lines',
      draw({ color, size, pos }) {
        let d = '';
        for (let i = 0; i < 9; i++) {
          const y = 236 + pos + i * 18 * size, h = (0.8 + i * 0.95) * size;
          d += `M-20 ${R(y)}h440v${R(h)}h-440z`;
        }
        return `<path d="${d}" fill="${color}"/>`;
      },
    },
  };
})();
