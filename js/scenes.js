/* =====================================================================
   Scenes: backgrounds the player is placed on.
   Each scene has draw(ctx, W, H, design, kit), drawn behind the player.
   "photo" (the original backdrop) and "clear" (transparent) draw nothing here.
   To add a scene: add an entry below and a label in UB.SCENES (js/data.js).
   ===================================================================== */
(function () {
  const UB = window.UB;
  UB.SCENES = UB.SCENES || { photo: 'Photo', ice: 'Ice', arena: 'Arena', team: 'Team colour', clear: 'Transparent' };

  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const glow = (ctx, x, y, r, color, alpha) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color.replace('A', alpha)); g.addColorStop(1, color.replace('A', 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  const vignette = (ctx, W, H, strength) => {
    const g = ctx.createRadialGradient(W / 2, H * 0.48, H * 0.3, W / 2, H * 0.5, H * 0.85);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${strength})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };

  UB.scenes = {
    ice: {
      draw(ctx, W, H) {
        const horizon = H * 0.44, r = rng(11);
        // Glass and boards in the distance
        let g = ctx.createLinearGradient(0, 0, 0, horizon);
        g.addColorStop(0, '#222a35'); g.addColorStop(1, '#46515f');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon);
        for (let i = 0; i < 26; i++) glow(ctx, r() * W, r() * horizon * 0.8, 40 + r() * 70, 'rgba(255,238,205,A)', 0.16 + r() * 0.2);
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        for (let x = 0; x < W; x += 150) ctx.fillRect(x, 0, 3, horizon);
        g = ctx.createLinearGradient(0, horizon - 22, 0, horizon + 6);
        g.addColorStop(0, '#f3f5f7'); g.addColorStop(1, '#aeb6c0');
        ctx.fillStyle = g; ctx.fillRect(0, horizon - 22, W, 28);
        // Ice
        g = ctx.createLinearGradient(0, horizon, 0, H);
        g.addColorStop(0, '#b9d3e4'); g.addColorStop(0.45, '#dcecf6'); g.addColorStop(1, '#f6fbfe');
        ctx.fillStyle = g; ctx.fillRect(0, horizon + 6, W, H - horizon);
        glow(ctx, W * 0.5, H * 0.72, W * 0.55, 'rgba(255,255,255,A)', 0.75);
        // Skate marks
        ctx.lineCap = 'round';
        for (let i = 0; i < 150; i++) {
          const y = horizon + 14 + Math.pow(r(), 0.8) * (H - horizon), x = r() * W, len = 80 + r() * 320, bend = (r() - 0.5) * 70;
          ctx.strokeStyle = r() > 0.4 ? 'rgba(255,255,255,0.5)' : 'rgba(96,142,176,0.22)';
          ctx.lineWidth = 0.6 + r() * 1.3;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + len / 2, y + bend, x + len, y + bend * 0.3); ctx.stroke();
        }
        // Reflection of the lights on the ice
        for (let i = 0; i < 14; i++) glow(ctx, r() * W, horizon + 40 + r() * 60, 30 + r() * 60, 'rgba(255,255,255,A)', 0.22);
        vignette(ctx, W, H, 0.3);
      },
    },

    arena: {
      draw(ctx, W, H) {
        const r = rng(5);
        let g = ctx.createRadialGradient(W / 2, H * 0.3, 20, W / 2, H * 0.5, H * 0.95);
        g.addColorStop(0, '#2a3f63'); g.addColorStop(0.55, '#111c32'); g.addColorStop(1, '#05080f');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // Spotlight cone from above
        g = ctx.createLinearGradient(0, 0, 0, H * 0.9);
        g.addColorStop(0, 'rgba(190,215,255,0.34)'); g.addColorStop(1, 'rgba(190,215,255,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.moveTo(W * 0.42, 0); ctx.lineTo(W * 0.58, 0); ctx.lineTo(W * 0.92, H * 0.92); ctx.lineTo(W * 0.08, H * 0.92); ctx.closePath(); ctx.fill();
        // Crowd lights
        for (let i = 0; i < 70; i++) glow(ctx, r() * W, r() * H * 0.46, 8 + r() * 26, r() > 0.5 ? 'rgba(255,214,150,A)' : 'rgba(150,190,255,A)', 0.2 + r() * 0.5);
        // Floor glow
        const fg = ctx.createRadialGradient(W / 2, H * 0.9, 10, W / 2, H * 0.9, W * 0.6);
        fg.addColorStop(0, 'rgba(190,220,255,0.5)'); fg.addColorStop(1, 'rgba(190,220,255,0)');
        ctx.fillStyle = fg; ctx.fillRect(0, H * 0.55, W, H * 0.45);
        vignette(ctx, W, H, 0.45);
      },
    },

    team: {
      draw(ctx, W, H, d) {
        const base = d.team.palette[0];
        const dark = UB.luminance(base) > 0.6 ? UB.shade(base, -0.45) : base;
        let g = ctx.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.5, H * 0.9);
        g.addColorStop(0, UB.shade(dark, 0.22)); g.addColorStop(1, UB.shade(dark, -0.5));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.save();
        ctx.globalAlpha = 0.07; ctx.fillStyle = d.team.palette[2] || '#fff';
        ctx.translate(W / 2, H / 2); ctx.rotate(-0.5);
        for (let x = -W; x < W; x += 120) ctx.fillRect(x, -H, 46, H * 2);
        ctx.restore();
        vignette(ctx, W, H, 0.25);
      },
    },

    clear: { draw() {} },
  };
})();
