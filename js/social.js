/* =====================================================================
   Social posts and reveal video.
   compose() draws one post: a backdrop, a headline, the player(s) and a
   footer with the team name and logo. video() records a short reveal clip
   (WebM) that fades through each kit and ends on the full set.
   To add a size, add a line to PRESETS.
   ===================================================================== */
(function () {
  const UB = window.UB;
  const PRESETS = {
    post: { label: 'Instagram post', w: 1080, h: 1350, note: '4:5' },
    square: { label: 'Square', w: 1080, h: 1080, note: '1:1' },
    story: { label: 'Story or reel', w: 1080, h: 1920, note: '9:16' },
    wide: { label: 'Wide', w: 1920, h: 1080, note: '16:9' },
    x: { label: 'X or Facebook', w: 1600, h: 900, note: '16:9' },
  };
  const BACKGROUNDS = { ice: 'Ice', arena: 'Arena', team: 'Team colour', white: 'Light', clear: 'Transparent' };
  const ASPECT = 1098 / 1122;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  async function playerImage(design, kitKey) {
    const d = clone(design);
    d.view = { ...(d.view || {}), scene: 'clear' };
    const c = document.createElement('canvas');
    await UB.app.paint(d, design.kits[kitKey], c);
    return c;
  }
  const loadImage = (src) => new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  const lum = (hex) => UB.luminance(hex);

  function fitText(ctx, text, maxW, size, font) {
    ctx.font = font(size);
    const w = ctx.measureText(text).width;
    return w > maxW ? size * (maxW / w) : size;
  }

  /* o: { design, kits:['home'], preset, bg, headline, sub, showTeam, showLogo } -> canvas */
  async function compose(o) {
    const d = o.design, P = PRESETS[o.preset] || PRESETS.post, W = P.w, H = P.h, landscape = W > H * 1.15;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const base = Math.min(W, H);
    const primary = d.team.palette[0], first = d.kits[o.kits[0]];

    // Backdrop
    if (o.bg === 'white') {
      const g = ctx.createRadialGradient(W / 2, H * 0.4, 20, W / 2, H * 0.5, Math.max(W, H) * 0.8);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#dfe2e6');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    } else if (o.bg !== 'clear' && UB.scenes[o.bg]) UB.scenes[o.bg].draw(ctx, W, H, d, first);
    const ink = o.bg === 'white' || o.bg === 'clear' ? '#15181d' : '#ffffff';
    const font = UB.FONTS[d.lettering.numberFont] || UB.FONTS.graduate;
    const headFont = (px) => `${font.weight} ${Math.round(px)}px ${font.family}`;
    await document.fonts.load(headFont(40)).catch(() => {});
    await document.fonts.load('800 30px Nunito').catch(() => {});

    // Players
    const imgs = await Promise.all(o.kits.map((k) => playerImage(d, k)));
    const footH = o.showTeam || o.showLogo ? Math.round(base * 0.085) : 0;
    const drawPlayer = (img, cx, ph, alpha = 1) => {
      const pw = ph * ASPECT;
      ctx.save(); ctx.globalAlpha = alpha;
      ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = base * 0.03; ctx.shadowOffsetY = base * 0.012;
      ctx.drawImage(img, cx - pw / 2, H - ph, pw, ph);
      ctx.restore();
    };
    if (imgs.length === 1) {
      const ph = landscape ? H * 1.02 : Math.min(H * 0.74, (W * 1.15) / ASPECT);
      drawPlayer(imgs[0], landscape ? W * 0.72 : W / 2, ph);
    } else if (landscape) {
      const ph = H * 0.78;
      drawPlayer(imgs[1], W * 0.34, ph * 0.9); drawPlayer(imgs[2], W * 0.66, ph * 0.9); drawPlayer(imgs[0], W * 0.5, ph);
    } else {
      const ph = Math.min(H * 0.62, (W * 0.95) / ASPECT);
      drawPlayer(imgs[1], W * 0.2, ph * 0.8); drawPlayer(imgs[2], W * 0.8, ph * 0.8); drawPlayer(imgs[0], W / 2, ph);
    }

    // Headline
    const m = base * 0.07, maxW = landscape ? W * 0.44 : W - m * 2;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    let y = landscape ? H * 0.34 : m + base * 0.03;
    const eyebrow = (d.team.name || '').toUpperCase();
    if (eyebrow) {
      ctx.fillStyle = o.bg === 'white' || o.bg === 'clear' ? primary : 'rgba(255,255,255,0.78)';
      ctx.font = `800 ${Math.round(base * 0.026)}px Nunito, sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(base * 0.006)}px`;
      ctx.fillText(eyebrow, m, y);
      y += base * 0.012;
    }
    const head = String(o.headline || '').toUpperCase();
    if (head) {
      const lines = head.split(/\n/).slice(0, 3);
      const size = Math.min(...lines.map((ln) => fitText(ctx, ln, maxW, base * (landscape ? 0.12 : 0.115), headFont)));
      ctx.fillStyle = ink; ctx.font = headFont(size);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      lines.forEach((ln, i) => { y += size * (i === 0 ? 1.0 : 0.98); ctx.fillText(ln, m, y); });
      y += base * 0.02;
    }
    if (o.sub) {
      ctx.fillStyle = o.bg === 'white' || o.bg === 'clear' ? '#4a4e56' : 'rgba(255,255,255,0.85)';
      ctx.font = `600 ${Math.round(base * 0.03)}px Nunito, sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      ctx.fillText(o.sub, m, y + base * 0.035);
    }

    // Footer
    if (footH) {
      ctx.fillStyle = lum(primary) > 0.55 ? '#14171c' : primary;
      ctx.fillRect(0, H - footH, W, footH);
      ctx.fillStyle = '#fff'; ctx.textBaseline = 'middle';
      ctx.font = `800 ${Math.round(footH * 0.34)}px Nunito, sans-serif`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${Math.round(footH * 0.05)}px`;
      const label = [o.showTeam ? (d.team.name || '').toUpperCase() : '', o.kits.length === 1 ? UB.KIT_NAMES[o.kits[0]].toUpperCase() : ''].filter(Boolean).join('  ·  ');
      if (label) ctx.fillText(label, m, H - footH / 2 + 1);
      if (o.showLogo) {
        const logo = await loadImage((d.photoLogos && d.photoLogos.sponsor) || (d.crest && d.crest.image));
        if (logo) { const lh = footH * 0.64, lw = Math.min(lh * (logo.width / logo.height), W * 0.3); ctx.drawImage(logo, W - m - lw, H - footH / 2 - lh / 2, lw, lh); }
      }
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    return c;
  }

  const KIND = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  /* Fade through each kit, then the full set. Returns a WebM Blob. */
  async function video(o, onProgress) {
    if (!window.MediaRecorder) throw new Error('This browser can’t record video. Try Chrome, Edge or Firefox.');
    const names = o.kits.map((k) => UB.KIT_NAMES[k]);
    const frames = [];
    for (let i = 0; i < o.kits.length; i++) {
      frames.push(await compose({ ...o, kits: [o.kits[i]], headline: `The new\n${names[i]}` }));
      if (onProgress) onProgress((i + 1) / (o.kits.length + 2));
    }
    if (o.kits.length > 1) frames.push(await compose({ ...o, kits: o.kits.slice(0, 3), headline: 'The full\nset' }));
    const W = frames[0].width, H = frames[0].height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    const mime = KIND.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    const rec = new MediaRecorder(c.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise((res) => { rec.onstop = () => res(new Blob(chunks, { type: mime || 'video/webm' })); });
    const HOLD = 1900, FADE = 450, total = frames.length * HOLD + FADE;
    rec.start(200);
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = () => {
        const t = performance.now() - t0;
        if (t >= total) return resolve();
        const i = Math.min(frames.length - 1, Math.floor(t / HOLD)), local = t - i * HOLD;
        const zoom = 1 + 0.035 * Math.min(1, (t - i * HOLD) / HOLD);
        ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        const draw = (f, a) => { ctx.save(); ctx.globalAlpha = a; ctx.translate(W / 2, H); ctx.scale(zoom, zoom); ctx.translate(-W / 2, -H); ctx.drawImage(f, 0, 0); ctx.restore(); };
        draw(frames[i], 1);
        if (i + 1 < frames.length && local > HOLD - FADE) draw(frames[i + 1], (local - (HOLD - FADE)) / FADE);
        if (onProgress) onProgress(Math.min(1, (o.kits.length + 1 + t / total) / (o.kits.length + 2)));
        requestAnimationFrame(tick);
      };
      tick();
    });
    rec.stop();
    return done;
  }

  UB.social = { PRESETS, BACKGROUNDS, compose, video };
})();
