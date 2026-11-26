/* =====================================================================
   Digital Jersey: pages, design state and controls.
   Routes (hash): #home, #design, #explore. No build step.

   Controls in index.html bind to the design with a path:
     "team.*", "player.*", "lettering.*", "crest.*"  shared by all kits
     "kit.*"                                          the kit being edited
   data-pills  → a row of buttons for one value   (data-source = a list in js/data.js)
   data-bind   → a text box, slider or checkbox
   ===================================================================== */
(function () {
  const UB = window.UB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const STORE_KEY = 'digital-jersey:design:v1';

  const AI_ENDPOINT = '/api/ai-effect';   // Netlify function that asks Claude (see netlify/functions/ai-effect.mjs)
  let state, history = [], future = [], side = 'front';
  let fxTarget = 'stripe1', activeTab = 'style';

  /* ---------------- design model ---------------- */
  function deepMerge(base, over) {
    if (over === undefined) return base;
    if (base && typeof base === 'object' && !Array.isArray(base) && over && typeof over === 'object' && !Array.isArray(over)) {
      const out = { ...base };
      for (const k of Object.keys(over)) out[k] = deepMerge(base[k], over[k]);
      return out;
    }
    return over;
  }
  function applyTemplate(kit, tplId) {
    const tpl = UB.TEMPLATES.find((t) => t.id === tplId) || UB.TEMPLATES[0];
    kit.template = tpl.id;
    kit.jersey = deepMerge(clone(UB.DEFAULT_JERSEY), clone(tpl.jersey || {}));
    kit.pants = deepMerge({ stripe: 'single' }, tpl.pants || {});
    kit.socks = deepMerge({ style: 'match', offset: 40, size: 1 }, tpl.socks || {});
    const colors = { ...(kit.colors || UB.BASE_COLORS) };
    for (const z of UB.TEMPLATE_ZONES) colors[z] = UB.BASE_COLORS[z];
    kit.colors = { ...colors, ...(tpl.colors || {}) };
    return kit;
  }
  function makeKit(spec) {
    const kit = applyTemplate({ swap: !!spec.swap, colors: { ...UB.BASE_COLORS } }, spec.template);
    if (spec.colors) Object.assign(kit.colors, spec.colors);
    return kit;
  }
  function sampleDesign() {
    const s = clone({ ...UB.SAMPLE, kits: undefined });
    s.kits = {};
    for (const k of Object.keys(UB.KIT_NAMES)) s.kits[k] = makeKit(UB.SAMPLE.kits[k] || { template: 'original' });
    s.active = UB.SAMPLE.active || 'home';
    s.view = { scene: 'photo', pose: UB.POSES[0].id };
    return s;
  }
  function normalize(raw) {
    const base = sampleDesign();
    if (!raw || typeof raw !== 'object') return base;
    const out = deepMerge(base, { ...raw, kits: undefined });
    for (const k of Object.keys(UB.KIT_NAMES)) {
      const rk = raw.kits && raw.kits[k];
      if (rk) out.kits[k] = deepMerge(applyTemplate({ swap: !!rk.swap, colors: { ...UB.BASE_COLORS } }, rk.template), rk);
    }
    out.team.palette = (Array.isArray(out.team.palette) ? out.team.palette : base.team.palette).slice(0, 5).map((c) => (UB.isHex(c) ? c : '#888888'));
    if (!UB.KIT_NAMES[out.active]) out.active = 'home';
    return out;
  }
  const kit = () => state.kits[state.active];

  function resolve(path) {
    const parts = path.split('.');
    let obj = parts[0] === 'kit' ? kit() : state[parts[0]];
    for (let i = 1; i < parts.length - 1; i++) obj = obj[parts[i]];
    return [obj, parts[parts.length - 1]];
  }
  const get = (path) => { const [o, k] = resolve(path); return o ? o[k] : undefined; };
  const set = (path, v) => { const [o, k] = resolve(path); if (o) o[k] = v; };

  /* ---------------- storage and history ---------------- */
  const store = {
    read(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
    write(key, v) { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };
  function commit() {
    const s = JSON.stringify(state);
    if (history[history.length - 1] === s) return;
    history.push(s);
    if (history.length > 80) history.shift();
    future = [];
    store.write(STORE_KEY, state);
    syncUndo();
    document.dispatchEvent(new Event('dj:design'));
  }
  function restore(s) {
    const active = state.active;
    state = JSON.parse(s);
    state.active = active;
    store.write(STORE_KEY, state);
    syncAll();
  }
  function undo() { if (history.length < 2) return; future.push(history.pop()); restore(history[history.length - 1]); }
  function redo() { if (!future.length) return; const s = future.pop(); history.push(s); restore(s); }
  function syncUndo() { $('#undoBtn').disabled = history.length < 2; $('#redoBtn').disabled = !future.length; }

  /* ---------------- photo rendering (one at a time) ---------------- */
  const buf = document.createElement('canvas');
  let queue = Promise.resolve();
  function paintPhoto(d, k, target, width) {
    queue = queue.then(async () => {
      const ok = await UB.photo.render(d, k, buf);
      if (!ok) return false;
      target.width = width || buf.width;
      target.height = Math.round(buf.height * target.width / buf.width);
      target.getContext('2d').drawImage(buf, 0, 0, target.width, target.height);
      return true;
    }).catch(() => false);
    return queue;
  }

  let dirty = false, running = false;
  async function pump() {
    if (running) { dirty = true; return; }
    running = true;
    do {
      dirty = false;
      if (route === 'design' && mode3d) UB.viewer3d.paint(state, kit());
      else if (route === 'design' && side === 'front') {
        await paintPhoto(state, kit(), $('#photoCanvas'));
        tintFromPhoto();
      }
    } while (dirty);
    running = false;
  }
  function render() {
    if (route === 'design') {
      syncMode();
      const back = side === 'back';
      $('#photoCanvas').hidden = back;
      $('#backWrap').hidden = !back;
      if (back) $('#backWrap').innerHTML = UB.render.jersey(state, kit(), 'back', { attrs: 'role="img" aria-label="Back of the jersey"' });
      $('#previewCard').classList.toggle('checker', state.view.scene === 'clear' && !back);
      $('#previewHint').textContent = back ? 'The back is a flat drawing. Click any part to change its colour.' : 'Click any part to change its colour.';
      $$('#sidePills .pill').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.side === side)));
      renderKitPills();
      renderFx();
      renderTemplates();
      renderTeamColours();
      renderZones();
      renderOutliner();
      layoutStudio();
    }
    pump();
  }

  /* ---------------- colour behind the photo ---------------- */
  // Like album art: the page takes its colour from the bottom of the photo, so the
  // picture fades into the controls, and a blurred copy fills the screen behind it.
  function tintFromPhoto() {
    const src = $('#photoCanvas');
    try {
      const bg = $('#npBg');
      bg.getContext('2d').drawImage(src, 0, 0, bg.width, bg.height);
      const h = Math.round(src.height * 0.1), px = src.getContext('2d').getImageData(0, src.height - h, src.width, h).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < px.length; i += 16) { const a = px[i + 3] / 255; r += px[i] * a; g += px[i + 1] * a; b += px[i + 2] * a; n += a; }
      const hex = n > px.length / 64 ? '#' + [r, g, b].map((v) => Math.round(v / n).toString(16).padStart(2, '0')).join('') : state.team.palette[0];
      document.body.style.setProperty('--np-bg', deepen(hex));
    } catch (err) { /* a canvas we can't read keeps the last colour */ }
  }
  // Keep the hue, make it dark enough for white text.
  function deepen(hex) {
    const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
    const mx = Math.max(...c), mn = Math.min(...c), l = (mx + mn) / 2, d = mx - mn;
    let h = 0, sat = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
    if (d) h = mx === c[0] ? ((c[1] - c[2]) / d) % 6 : mx === c[1] ? (c[2] - c[0]) / d + 2 : (c[0] - c[1]) / d + 4;
    return `hsl(${Math.round(h * 60 + 360) % 360} ${Math.round(Math.min(sat, 0.5) * 100)}% ${Math.round(Math.min(Math.max(l * 0.45, 0.09), 0.16) * 100)}%)`;
  }

  /* ---------------- 3D view ---------------- */
  // The Blender player (js/viewer3d.js). Drag to turn it; every part is traced to a colour zone.
  let mode3d = false;
  function syncMode() {
    const card = $('#previewCard');
    card.classList.toggle('is-3d', mode3d);
    $('#view3d').hidden = !mode3d;
    $('#zoomLayer').hidden = mode3d;
    $('#sidePills').hidden = mode3d;
    $$('#modePills .pill').forEach((b) => b.setAttribute('aria-checked', String((b.dataset.mode === '3d') === mode3d)));
    if (mode3d) $('#zoomReset').hidden = true;
  }
  async function setMode(on) {
    if (!UB.viewer3d || !window.THREE) { toast('3D needs WebGL, which this browser does not offer.'); return; }
    mode3d = on; resetView(false); render();
    $('#previewHint').textContent = on ? 'Drag to turn the player, scroll or pinch to zoom. Click any part to colour it.' : 'Click any part to change its colour.';
    if (!on) return;
    try {
      await UB.viewer3d.open($('#view3d'));
      $('#v3dLoad').hidden = true;
      UB.viewer3d.paint(state, kit());
    } catch (err) {
      console.error(err); mode3d = false; render();
      toast(/webgl|context/i.test(String(err && err.message)) ? 'This browser has 3D graphics (WebGL) turned off, so the 3D view can\'t start.' : 'Could not start the 3D view: ' + ((err && err.message) || err));
    }
  }

  /* ---------------- outliner and viewport labels ---------------- */
  const OUTLINE = [['body', 'Jersey'], ['sleeves', 'Sleeves'], ['stripe1', 'Main stripe'], ['stripe2', 'Accent stripe'], ['collar', 'Collar'],
    ['number', 'Numbers'], ['pants', 'Pants'], ['socks', 'Socks'], ['gloves', 'Gloves'], ['helmet', 'Helmet']];
  function renderOutliner() {
    const k = kit(), tpl = UB.TEMPLATES.find((t) => t.id === k.template);
    $('#olKit').textContent = `${UB.KIT_NAMES[state.active]} · ${k.swap ? 'Light' : 'Dark'}`;
    $('#olList').innerHTML = OUTLINE.map(([z, l]) =>
      `<button class="zone-row ol-row" type="button" data-zone="${z}"><i style="background:${UB.color(state, k, z)}"></i><b>${l}</b><span>${esc(slotLabel(UB.zoneValue(k, z)))}</span></button>`).join('');
    $('#vpView').textContent = mode3d ? '3D view' : side === 'back' ? 'Back view' : 'Front view';
    $('#vpWhat').textContent = `${state.team.name || 'My team'} | ${UB.KIT_NAMES[state.active]} · ${tpl ? tpl.name : ''}`;
    $('#npTeam').textContent = state.team.name || 'My team';
    $('#npKit').textContent = `${UB.KIT_NAMES[state.active]} jersey${tpl ? ' · ' + tpl.name : ''}`;
  }

  /* ---------------- controls ---------------- */
  const sourceOf = (name) => UB[name] || {};
  const labelOf = (v) => (typeof v === 'string' ? v : v.label);
  const castVal = (el, v) => (el.dataset.kind === 'number' ? +v : el.dataset.kind === 'bool' ? v === 'true' : v);

  function buildPills() {
    UB.POSE_LABELS = Object.fromEntries(UB.POSES.map((p) => [p.id, p.label]));
    $('#poseBlock').hidden = UB.POSES.length < 2;
    $$('[data-pills]').forEach((el) => {
      const src = sourceOf(el.dataset.source);
      el.innerHTML = Object.entries(src).map(([k, v]) => {
        const style = el.dataset.look === 'font' ? ` style="font-family:${v.family};font-weight:${v.weight}"` : '';
        const text = el.dataset.look === 'font' ? esc(labelOf(v)) : esc(labelOf(v));
        return `<button class="pill" type="button" role="radio" data-val="${esc(k)}" aria-checked="false"${style}>${text}</button>`;
      }).join('');
    });
  }
  function syncControls() {
    $$('[data-pills]').forEach((el) => {
      const v = String(get(el.dataset.pills));
      $$('.pill', el).forEach((b) => b.setAttribute('aria-checked', String(b.dataset.val === v)));
    });
    $$('[data-bind]').forEach((el) => {
      const v = get(el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (document.activeElement !== el) el.value = v ?? '';
    });
    $$('[data-show-if]').forEach((el) => { const [p, vals] = el.dataset.showIf.split('='); el.hidden = !vals.split('|').includes(String(get(p))); });
    $$('[data-hide-if]').forEach((el) => { const [p, vals] = el.dataset.hideIf.split('='); el.hidden = vals.split('|').includes(String(get(p))); });
    const n = state.player.number;
    $('#numberNote').textContent = n === '99' ? '99 is retired across the NHL.' : n === '0' || n === '00' ? 'The NHL doesn’t issue 0 or 00.' : '';
    syncDrops();
    $$('#schemes .scheme').forEach((b) => {
      const same = UB.SCHEMES[+b.dataset.scheme].colors.every((c, i) => c.toLowerCase() === state.team.palette[i].toLowerCase());
      b.setAttribute('aria-checked', String(same));
    });
  }
  function syncAll() { syncControls(); syncUndo(); render(); }

  function renderKitPills() {
    $('#kitPills').innerHTML = Object.entries(UB.KIT_NAMES).map(([k, name]) =>
      `<button class="pill" type="button" role="radio" data-kit="${k}" aria-checked="${k === state.active}">${name}</button>`).join('');
  }
  function renderTeamColours() {
    $('#teamSwatches').innerHTML = state.team.palette.map((c, i) =>
      `<label class="team-sw" style="--c:${c}"><span></span>${UB.PALETTE_SLOTS[i]}<input type="color" value="${c}" data-slot="${i}" aria-label="${UB.PALETTE_SLOTS[i]} colour"></label>`).join('');
  }
  function renderSchemes() {
    $('#schemes').innerHTML = UB.SCHEMES.map((s, i) =>
      `<button class="scheme" type="button" role="radio" aria-checked="false" data-scheme="${i}" aria-label="${esc(s.name)}" title="${esc(s.name)}" style="--a:${s.colors[0]};--b:${s.colors[1]};--c:${s.colors[2]}"></button>`).join('');
  }
  function renderTemplates() {
    const k = kit();
    $('#tplGrid').innerHTML = UB.TEMPLATES.map((t) => {
      const preview = applyTemplate(clone(k), t.id);
      return `<button class="tpl" type="button" role="radio" data-tpl="${t.id}" aria-checked="${k.template === t.id}" aria-label="${esc(t.name)}">` +
        `${UB.render.jersey(state, preview, 'front', { thumb: true, attrs: 'aria-hidden="true"' })}${esc(t.name)}</button>`;
    }).join('');
  }

  /* ---------------- stripe effects ---------------- */
  function fxShown(zone) {
    const k = kit(), j = k.jersey, has = (style, c) => (UB.STRIPE_SETS[style] || UB.STRIPE_SETS.none).bands.some((b) => b.c === c);
    const sock = k.socks.style === 'match' ? j.hem.style : k.socks.style;
    switch (zone) {
      case 'stripe1': return has(j.hem.style, 1) || has(j.sleeve.style, 1);
      case 'stripe2': return has(j.hem.style, 2) || has(j.sleeve.style, 2);
      case 'pantsStripe1': return k.pants.stripe !== 'none';
      case 'pantsStripe2': return ['outlined', 'hem'].includes(k.pants.stripe);
      case 'sockStripe1': return has(sock, 1);
      default: return has(sock, 2);
    }
  }
  function renderFx() {
    const fx = kit().fx || {};
    $('#fxTargets').innerHTML = Object.entries(UB.FX.TARGETS).map(([k, l]) =>
      `<button class="pill" type="button" role="radio" data-fx-target="${k}" aria-checked="${k === fxTarget}">${esc(l)}${fx[k] ? ' ·' : ''}</button>`).join('');
    const e = fx[fxTarget];
    const pills = (key, map, cur) => `<div class="pills" role="radiogroup">${Object.entries(map).map(([v, l]) =>
      `<button class="pill" type="button" role="radio" data-fx-key="${key}" data-val="${v}" aria-checked="${v === cur}">${esc(l)}</button>`).join('')}</div>`;
    const slider = (key, label, min, max, step) => `<div class="slider-row"><label for="fx-${key}">${label}</label><input type="range" id="fx-${key}" data-fx-range="${key}" min="${min}" max="${max}" step="${step}" value="${e ? e[key] : 1}"></div>`;
    let h = fxShown(fxTarget) ? '' : '<p class="hint">This stripe isn’t on the jersey yet. Choose a stripe style first.</p>';
    h += '<p class="sub-label">Pattern</p>' + pills('pattern', UB.FX.PATTERNS, e ? e.pattern : 'none');
    if (e) {
      h += '<p class="sub-label">Finish</p>' + pills('relief', UB.FX.RELIEFS, e.relief) + slider('scale', 'Size', 0.5, 2.5, 0.1) + slider('spacing', 'Spacing', 1, 2.5, 0.1) + slider('rotate', 'Angle', 0, 90, 5);
      h += '<p class="sub-label">Colour</p>' + pills('color', UB.FX.COLORS, UB.isHex(e.color) ? '' : e.color);
    }
    $('#fxPanel').innerHTML = h;
  }
  function setFx(patch, done) {
    const k = kit(), fx = { ...(k.fx || {}) };
    if (patch.pattern === 'none') { const { [fxTarget]: _gone, ...rest } = fx; k.fx = rest; }
    else k.fx = { ...fx, [fxTarget]: { ...UB.FX.DEFAULT, ...(fx[fxTarget] || {}), ...patch } };
    render();
    if (done) commit();
  }
  async function askAI() {
    const text = $('#aiPrompt').value.trim(), note = $('#aiNote'), btn = $('#aiGo');
    if (!text) { note.textContent = 'Describe the effect first, for example “debossed stars on the main stripe”.'; return; }
    btn.disabled = true; btn.textContent = 'Thinking…';
    let spec = null, via = 'ai';
    try {
      const r = await fetch(AI_ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: text, target: fxTarget }) });
      if (!r.ok) throw new Error('AI service unavailable');
      spec = UB.FX.sanitize(await r.json());
    } catch (err) {
      via = 'local';
      spec = UB.FX.parseText(text);
    }
    btn.disabled = false; btn.textContent = 'Ask AI';
    if (!spec) { note.textContent = 'I couldn’t find a pattern in that. Try “debossed stars”, “raised dots” or “gold diagonal lines”.'; return; }
    const { target, ...effect } = spec;
    if (target) fxTarget = target;
    setFx(effect, true);
    note.textContent = (via === 'ai' ? 'Done. ' : 'Done with the built-in helper, because the AI service isn’t connected on this page. ') +
      (fxShown(fxTarget) ? 'Adjust anything below.' : 'That stripe isn’t on the jersey yet, so pick a stripe style to see it.');
  }

  /* ---------------- logo cut-out ---------------- */
  async function maybeCutout(url) {
    if (!UB.cutout || url.startsWith('data:image/svg')) return url;
    const im = await UB.cutout.load(url);
    return UB.cutout.hasAlpha(im) ? url : openCutout(im, url);
  }
  function openCutout(im, url) {
    return new Promise((resolve) => {
      const guess = UB.cutout.guessBackground(im), o = { bg: guess.color, tolerance: 22, soft: 35, inner: false };
      const cv = $('#cutCanvas'), modal = $('#cutModal');
      let picking = false, raf = 0;
      const sw = () => { $('#cutSwatch').style.background = `rgb(${o.bg.join(',')})`; };
      const draw = () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const src = picking ? (() => { const c = document.createElement('canvas'); c.width = im.w; c.height = im.h; c.getContext('2d').putImageData(im.data, 0, 0); return c; })() : UB.cutout.run(im, o);
          cv.width = src.width; cv.height = src.height;
          cv.getContext('2d').drawImage(src, 0, 0);
        });
      };
      $('#cutNote').textContent = guess.uniform > 0.7
        ? 'This image has a background. We found it and removed it. Adjust if it looks off.'
        : 'The background isn’t one plain colour, so the result may need tuning. For busy photos, use a background remover first.';
      $('#cutTol').value = o.tolerance; $('#cutSoft').value = o.soft; $('#cutInner').checked = false;
      $('#cutPick').textContent = 'Pick background colour';
      sw(); draw();
      modal.hidden = false;
      const done = (v) => {
        modal.hidden = true;
        $('#cutTol').oninput = $('#cutSoft').oninput = $('#cutInner').onchange = $('#cutPick').onclick = $('#cutUse').onclick = $('#cutKeep').onclick = cv.onclick = null;
        resolve(v);
      };
      $('#cutTol').oninput = (e) => { o.tolerance = +e.target.value; draw(); };
      $('#cutSoft').oninput = (e) => { o.soft = +e.target.value; draw(); };
      $('#cutInner').onchange = (e) => { o.inner = e.target.checked; draw(); };
      $('#cutPick').onclick = () => { picking = !picking; $('#cutPick').textContent = picking ? 'Click the background…' : 'Pick background colour'; draw(); };
      cv.onclick = (e) => {
        if (!picking) return;
        const r = cv.getBoundingClientRect(), k = Math.min(r.width / im.w, r.height / im.h);
        const x = Math.floor((e.clientX - r.left - (r.width - im.w * k) / 2) / k), y = Math.floor((e.clientY - r.top - (r.height - im.h * k) / 2) / k);
        if (x < 0 || y < 0 || x >= im.w || y >= im.h) return;
        const i = (y * im.w + x) * 4;
        o.bg = [im.data.data[i], im.data.data[i + 1], im.data.data[i + 2]];
        picking = false; $('#cutPick').textContent = 'Pick background colour'; sw(); draw();
      };
      $('#cutUse').onclick = () => done(UB.cutout.run(im, o).toDataURL('image/png'));
      $('#cutKeep').onclick = () => done(url);
      modal.onkeydown = (e) => { if (e.key === 'Escape') done(null); };
    });
  }

  /* ---------------- colour each part ---------------- */
  const PHOTO_ZONES = ['body', 'sleeves', 'yoke', 'yokeTrim', 'stripe1', 'stripe2', 'pattern', 'collar', 'number', 'numberOutline', 'numberOutline2', 'name',
    'crestBg', 'crestRing', 'crestText', 'pants', 'pantsStripe1', 'pantsStripe2', 'socks', 'sockStripe1', 'sockStripe2', 'helmet', 'gloves', 'glovesTrim'];
  const slotLabel = (v) => (/^p\d$/.test(v) ? UB.PALETTE_SLOTS[+v[1]] : String(v).toUpperCase());
  function renderZones() {
    const k = kit();
    $('#zones').innerHTML = UB.ZONE_GROUPS.map((g) => {
      const rows = UB.ZONES.filter((z) => z.group === g.id && PHOTO_ZONES.includes(z.id)).map((z) =>
        `<button class="zone-row" type="button" data-zone="${z.id}"><i style="background:${UB.color(state, k, z.id)}"></i><b>${esc(z.label)}</b><span>${esc(slotLabel(UB.zoneValue(k, z.id)))}</span></button>`).join('');
      return rows ? `<div class="zone-group"><h3>${esc(g.label)}</h3>${rows}</div>` : '';
    }).join('');
  }

  const pop = () => $('#popover');
  let popZone = null;
  function openPicker(zone, at) {
    const z = UB.ZONES.find((x) => x.id === zone);
    if (!z || !(PHOTO_ZONES.includes(zone) || (mode3d && UB.viewer3d.zones().includes(zone)))) return;
    popZone = zone;
    const k = kit(), v = UB.zoneValue(k, zone), hex = UB.color(state, k, zone);
    pop().innerHTML =
      `<div class="pop-head"><strong>${esc(z.label)}</strong><button class="icon-btn" type="button" data-pop-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>` +
      `<div class="pop-swatches">${state.team.palette.map((c, i) => `<button class="swatch" type="button" role="radio" data-slot="p${i}" aria-checked="${v === 'p' + i}" aria-label="${UB.PALETTE_SLOTS[i]}" style="--c:${c}"></button>`).join('')}</div>` +
      `<div class="pop-custom"><input type="color" id="popColor" value="${hex}" aria-label="Custom colour"><input type="text" id="popHex" value="${hex.toUpperCase()}" maxlength="7" spellcheck="false" aria-label="Hex colour"></div>`;
    pop().hidden = false;
    const w = pop().offsetWidth, h = pop().offsetHeight;
    pop().style.left = Math.max(8, Math.min(innerWidth - w - 8, at.x - w / 2)) + 'px';
    pop().style.top = (at.y + 16 + h > innerHeight - 8 ? Math.max(8, at.y - h - 16) : at.y + 16) + 'px';
  }
  function closePicker() { pop().hidden = true; popZone = null; }
  function setZone(value, done) {
    const k = kit();
    k.colors[popZone] = /^p\d$/.test(value) ? UB.swapSlot(k, popZone, value) : value;
    render();
    if (done) commit();
  }

  /* ---------------- logos ---------------- */
  const logo = (key) => ({ get: () => (state.photoLogos || {})[key], set: (v) => { state.photoLogos = { ...(state.photoLogos || {}), [key]: v || null }; } });
  const SLOTS = {
    crest: { label: 'Crest', where: 'Centre of the chest', get: () => state.crest.image, set: (v) => {
      state.crest.image = v;
      if (v) state.crest.style = 'image'; else if (state.crest.style === 'image') state.crest.style = 'roundel';
    } },
    sponsor: { label: 'Sponsor', where: 'Top right of the chest', ...logo('sponsor') },
    captain: { label: 'Captaincy patch', where: 'Top left of the chest', ...logo('captain') },
    neck: { label: 'Collar', where: 'Below the neckline', ...logo('neck') },
    pantsL: { label: 'Left pants leg', where: 'Front of the leg', ...logo('pantsL') },
    pantsR: { label: 'Right pants leg', where: 'Front of the leg', ...logo('pantsR') },
  };
  const ICON_UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/></svg>';
  function renderDrops() {
    $('#drops').innerHTML = Object.entries(SLOTS).map(([k, s]) =>
      `<div class="drop" data-drop="${k}"><button class="drop-box" type="button" data-pick aria-label="Upload ${esc(s.label.toLowerCase())}"></button>` +
      `<div class="drop-meta"><strong>${esc(s.label)}</strong><span>${esc(s.where)}</span></div><div class="drop-links"><button class="link" type="button" data-asset-pick>From assets</button><button class="link" type="button" data-asset-save hidden>Save to assets</button><button class="link" type="button" data-rm>Remove</button></div></div>`).join('');
  }
  function syncDrops() {
    $$('#drops .drop').forEach((box) => {
      const img = SLOTS[box.dataset.drop].get();
      const b = $('.drop-box', box);
      if (b.dataset.src !== (img || '')) {
        b.dataset.src = img || '';
        b.innerHTML = img ? `<img src="${img}" alt="">` : `<span>${ICON_UP}<small>Drop or click</small></span>`;
      }
      box.classList.toggle('has-image', !!img);
      $('[data-rm]', box).hidden = !img;
      $('[data-asset-save]', box).hidden = !img;
    });
  }
  function readImage(file) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Choose a PNG, JPG, SVG or WebP image.'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('That file could not be read.'));
      fr.onload = () => {
        if (file.type === 'image/svg+xml') return resolve(fr.result);
        const img = new Image();
        img.onload = () => {
          const s = Math.min(1, 600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('That image could not be opened.'));
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------------- save, download ---------------- */
  const slug = () => (state.team.name || 'jersey').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'jersey';
  async function exportPng(all) {
    const keys = all ? Object.keys(UB.KIT_NAMES) : [state.active];
    openModal('Your design', '<p class="hint">Drawing the image…</p>');
    const sheet = document.createElement('canvas'), W = 1098, H = 1122;
    sheet.width = W * keys.length; sheet.height = H;
    const sx = sheet.getContext('2d');
    for (let i = 0; i < keys.length; i++) {
      const c = document.createElement('canvas');
      await paintPhoto(state, state.kits[keys[i]], c);
      sx.drawImage(c, i * W, 0);
    }
    const blob = await new Promise((r) => sheet.toBlob(r, 'image/png'));
    const url = URL.createObjectURL(blob);
    openModal('Your design', `<img src="${url}" alt="Your design"><p class="hint">If the download doesn’t start, right-click the image (or press and hold) and save it.</p>`, [
      { label: 'Download PNG', primary: true, run: () => { const a = document.createElement('a'); a.href = url; a.download = `${slug()}-${all ? 'all-kits' : state.active}.png`; document.body.append(a); a.click(); a.remove(); return false; } },
    ]);
  }

  /* ---------------- modal and toast ---------------- */
  function openModal(title, body, actions = [], opts = {}) {
    $('.modal-card', $('#modal')).classList.toggle('wide', !!opts.wide);
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    const foot = $('#modalActions');
    foot.innerHTML = '';
    for (const a of actions.concat([{ label: actions.length ? 'Close' : 'OK' }])) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = a.primary ? 'btn primary' : 'btn'; b.textContent = a.label;
      b.onclick = () => { if (!a.run || a.run() !== false) closeModal(); };
      foot.append(b);
    }
    $('#modal').hidden = false;
  }
  function closeModal() { $('#modal').hidden = true; }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2200);
  }

  /* ---------------- explore ---------------- */
  const STARTERS = [
    ['twoband', 'Bulldog Gold', true], ['original', 'Harbour Navy', false], ['heritage', 'Crimson & White', false], ['northern', 'Royal Blue', true],
    ['chevron', 'Black & Gold', false], ['fade', 'Forest & Gold', false], ['honeycomb', 'Pacific Teal', true], ['sash', 'Flyer Orange', false],
    ['hoops', 'Purple & Gold', true], ['pinstripe', 'Steel & Gold', false], ['panels', 'Burgundy & Blue', true], ['camo', 'Black & Gold', false],
  ].map(([template, scheme, light]) => ({ template, scheme: UB.SCHEMES.find((s) => s.name === scheme), light }));
  let filter = 'all', exploreSeq = 0;

  function renderExplore() {
    const shown = STARTERS.map((s, i) => ({ ...s, i })).filter((s) => filter === 'all' || (filter === 'light') === s.light);
    $('#starterCards').innerHTML = shown.map((s) => {
      const t = UB.TEMPLATES.find((x) => x.id === s.template);
      return `<button class="card" type="button" data-starter="${s.i}"><span class="card-img"><canvas width="360" height="368" id="st${s.i}"></canvas></span>` +
        `<span><strong>${esc(t.name)}</strong><span>${esc(s.scheme.name)} · ${s.light ? 'Light' : 'Dark'}</span></span></button>`;
    }).join('');
    const my = ++exploreSeq;
    (async () => {
      for (const s of shown) {
        if (my !== exploreSeq || route !== 'explore') return;
        const d = clone(state);
        d.team.palette = s.scheme.colors.slice();
        const k = makeKit({ template: s.template, swap: s.light });
        const c = $(`#st${s.i}`);
        if (c) await paintPhoto(d, k, c, 360);
      }
    })();
  }
  function loadStarter(s) {
    state.team.palette = s.scheme.colors.slice();
    applyTemplate(kit(), s.template);
    kit().swap = s.light;
    commit();
    location.hash = '#design';
  }

  /* ---------------- routing ---------------- */
  let route = 'home';
  function go() {
    const [r0, ...rest] = (location.hash || '#home').slice(1).split('/'), param = rest.join('/');
    const r = ({ home: 'design', library: 'saved', team: 'account' })[r0] || r0;
    route = ['design', 'explore', 'signin', 'signup', 'saved', 'assets', 'account', 'view'].includes(r) ? r : 'design';
    const pageKey = route === 'signin' || route === 'signup' ? 'auth' : route;
    $$('.page').forEach((p) => { p.hidden = p.dataset.page !== pageKey; });
    $$('[data-nav]').forEach((a) => (a.dataset.nav === route ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    closePicker();
    document.body.dataset.route = route;
    window.scrollTo(0, 0);
    document.title = { design: 'Digital Jersey', explore: 'Explore · Digital Jersey', signin: 'Log in · Digital Jersey', signup: 'Sign up · Digital Jersey', saved: 'Saved designs · Digital Jersey', assets: 'Assets · Digital Jersey', account: 'Account · Digital Jersey', view: 'Jersey reveal' }[route];
    if (route === 'explore') renderExplore();
    syncControls();
    render();
    showTab(activeTab);
    layoutStudio();
    if (UB.saas) UB.saas.route(route, param);
  }

  /* ---------------- events ---------------- */
  function wire() {
    addEventListener('hashchange', go);
    addEventListener('scroll', () => $('.site-header').classList.toggle('scrolled', scrollY > 4), { passive: true });

    document.addEventListener('input', (e) => {
      const el = e.target;
      if (el.matches('[data-fx-range]')) { setFx({ [el.dataset.fxRange]: +el.value }, false); return; }
      if (el.matches('[data-bind]')) {
        let v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? parseFloat(el.value) : el.value;
        if (el.dataset.digits !== undefined) { v = String(v).replace(/\D/g, '').slice(0, 2); el.value = v; }
        set(el.dataset.bind, v);
        syncControls();
        render();
      }
      if (el.matches('[data-slot]')) {
        const i = +el.dataset.slot;
        state.team.palette[i] = el.value;
        el.closest('.team-sw').style.setProperty('--c', el.value);
        syncControls();
        render();
      }
      if (el.id === 'popColor' && popZone) { $('#popHex').value = el.value.toUpperCase(); setZone(el.value, false); }
    });
    document.addEventListener('change', (e) => {
      const el = e.target;
      if (el.matches('[data-bind], [data-slot], [data-fx-range]')) commit();
      if (el.id === 'popColor') commit();
      if (el.id === 'popHex' && popZone) {
        let v = el.value.trim();
        if (!v.startsWith('#')) v = '#' + v;
        if (UB.isHex(v)) { setZone(v.toLowerCase(), true); $('#popColor').value = v; } else toast('Use a 6-digit hex colour like #C8102E');
      }
    });

    document.addEventListener('click', (e) => {
      const t = e.target;
      const pill = t.closest('[data-pills] .pill');
      if (pill) {
        const el = pill.closest('[data-pills]');
        set(el.dataset.pills, castVal(el, pill.dataset.val));
        syncControls(); render(); commit();
        return;
      }
      const fxT = t.closest('[data-fx-target]');
      if (fxT) { fxTarget = fxT.dataset.fxTarget; renderFx(); return; }
      const fxK = t.closest('[data-fx-key]');
      if (fxK) { setFx({ [fxK.dataset.fxKey]: fxK.dataset.val }, true); return; }
      const tabBtn = t.closest('[data-tabbtn]');
      if (tabBtn) { showTab(tabBtn.dataset.tabbtn); return; }
      if (t.closest('#aiGo')) { askAI(); return; }
      const sum = t.closest('details.opt > summary');
      if (sum) { e.preventDefault(); return; }
      const kitBtn = t.closest('[data-kit]');
      if (kitBtn) { state.active = kitBtn.dataset.kit; store.write(STORE_KEY, state); syncControls(); render(); return; }
      const tpl = t.closest('[data-tpl]');
      if (tpl) { applyTemplate(kit(), tpl.dataset.tpl); syncControls(); render(); commit(); return; }
      const sch = t.closest('[data-scheme]');
      if (sch) { state.team.palette = UB.SCHEMES[+sch.dataset.scheme].colors.slice(); syncControls(); render(); commit(); return; }
      const modeBtn = t.closest('[data-mode]');
      if (modeBtn) { setMode(modeBtn.dataset.mode === '3d'); return; }
      const sideBtn = t.closest('[data-side]');
      if (sideBtn) { side = sideBtn.dataset.side; render(); return; }
      const filt = t.closest('[data-filter]');
      if (filt) { filter = filt.dataset.filter; $$('[data-filter]').forEach((b) => b.setAttribute('aria-checked', String(b === filt))); renderExplore(); return; }
      const starter = t.closest('[data-starter]');
      if (starter) { loadStarter(STARTERS[+starter.dataset.starter]); return; }
      // colour each part / click the preview
      const row = t.closest('.zone-row');
      if (row) { const r = row.getBoundingClientRect(); openPicker(row.dataset.zone, { x: r.left + r.width / 2, y: r.bottom - 8 }); return; }
      const hit = previewZone(e);
      if (hit) { openPicker(hit, { x: e.clientX, y: e.clientY }); return; }
      const sw = t.closest('.swatch[data-slot]');
      if (sw && popZone) {
        setZone(sw.dataset.slot, true);
        $$('.swatch', pop()).forEach((b) => b.setAttribute('aria-checked', String(b === sw)));
        const hex = UB.color(state, kit(), popZone);
        $('#popColor').value = hex; $('#popHex').value = hex.toUpperCase();
        return;
      }
      if (t.closest('[data-pop-close]')) { closePicker(); return; }
      if (popZone && !t.closest('#popover')) closePicker();

      // logos
      const box = t.closest('.drop');
      if (box && t.closest('[data-rm]')) { SLOTS[box.dataset.drop].set(null); syncControls(); render(); commit(); return; }
      if (box && t.closest('[data-pick]')) { pickSlot = box.dataset.drop; $('#logoFile').click(); return; }

      if (t.closest('#downloadBtn')) exportPng(false);
      if (t.closest('#downloadAllBtn')) exportPng(true);
      if (t.closest('#resetBtn')) openModal('Start over?', '<p class="hint">This replaces your design with the example. You can undo it.</p>', [{ label: 'Start over', primary: true, run: () => { state = sampleDesign(); commit(); syncAll(); } }]);
      if (t.id === 'modal') closeModal();
    });

    let pickSlot = null;
    $('#logoFile').addEventListener('change', (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f && pickSlot) accept(pickSlot, f);
    });
    async function accept(slot, file) {
      try {
        const img = await maybeCutout(await readImage(file));
        if (!img) return;
        SLOTS[slot].set(img); syncControls(); render(); commit(); toast(`${SLOTS[slot].label} added`);
      } catch (err) { toast(err.message); }
    }
    const drops = $('#drops');
    drops.addEventListener('dragover', (e) => { const b = e.target.closest('.drop'); if (b) { e.preventDefault(); b.classList.add('is-over'); } });
    drops.addEventListener('dragleave', (e) => { const b = e.target.closest('.drop'); if (b && !b.contains(e.relatedTarget)) b.classList.remove('is-over'); });
    drops.addEventListener('drop', (e) => { const b = e.target.closest('.drop'); if (!b) return; e.preventDefault(); b.classList.remove('is-over'); if (e.dataTransfer.files[0]) accept(b.dataset.drop, e.dataTransfer.files[0]); });

    $('#undoBtn').onclick = undo;
    $('#redoBtn').onclick = redo;
    $('#aiPrompt').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); askAI(); } });
    addEventListener('resize', () => { showTab(activeTab); layoutStudio(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closePicker(); closeModal(); }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    });
  }

  // Which part is under the pointer on the preview (photo or flat back)?
  function previewZone(e) {
    if (route !== 'design' || view.moved) return null;
    if (mode3d) return UB.viewer3d.zoneAt(e);
    const c = e.target.closest && e.target.closest('#photoCanvas');
    if (c) {
      const r = c.getBoundingClientRect();
      return UB.photo.zoneAt((e.clientX - r.left) / r.width * c.width, (e.clientY - r.top) / r.height * c.height);
    }
    const z = e.target.closest && e.target.closest('#backWrap [data-zone]');
    return z ? z.dataset.zone : null;
  }

  /* ---------------- phone tabs ---------------- */
  const mobile = () => matchMedia('(max-width: 960px)').matches;
  function showTab(tab) {
    activeTab = tab;
    $$('[data-tabbtn]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tabbtn === tab)));
    $$('.options .opt[data-tab]').forEach((el) => {
      el.classList.toggle('tab-off', el.dataset.tab !== tab);
      if (el.tagName === 'DETAILS') el.open = true;
    });
    $('#tabbar [aria-selected="true"]').scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  /* ---------------- studio layout (wide screens) ---------------- */
  // The picture fits the free space beside the floating panel; Save and share becomes a toolbar.
  const wide = () => matchMedia('(min-width: 961px)').matches;
  function layoutStudio() {
    const box = $('#stageBox'), body = $('#shareBody');
    if (!box || !body) return;
    const target = wide() ? $('#dock') : $('#shareOpt');
    if (body.parentElement !== target) target.append(body);
    const zl = $('#zoomLayer'), r = { width: zl.offsetWidth, height: zl.offsetHeight };   // ignores pinch zoom
    if (!r.width) return;
    // Computers: the whole player fits the screen. Phones: the photo fills the top edge to edge.
    const k = wide() ? Math.min(r.width / 1098, r.height / 1122) : Math.max(r.width / 1098, r.height / 1122);
    box.style.width = Math.ceil(1098 * k) + 'px'; box.style.height = Math.ceil(1122 * k) + 'px';
  }

  /* ---------------- pinch, pan and swipe on the preview ---------------- */
  const view = { s: 1, x: 0, y: 0, moved: false };
  function applyView(animate) {
    const layer = $('#zoomLayer');
    layer.style.transition = animate ? 'transform 0.18s ease' : 'none';
    layer.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.s})`;
    $('#zoomReset').hidden = view.s <= 1.01;
    const vz = $('#vpZoom'); if (vz) vz.textContent = Math.round(view.s * 100) + '%';
  }
  function clampView() {
    const r = $('#previewCard').getBoundingClientRect(), maxX = (r.width * (view.s - 1)) / 2, maxY = (r.height * (view.s - 1)) / 2;
    view.x = Math.max(-maxX, Math.min(maxX, view.x)); view.y = Math.max(-maxY, Math.min(maxY, view.y));
  }
  function resetView(animate) { view.s = 1; view.x = 0; view.y = 0; applyView(animate); }
  function flipSide() { side = side === 'front' ? 'back' : 'front'; resetView(false); render(); }

  function wireGestures() {
    const card = $('#previewCard'), pts = new Map();
    let start = null, pinch = null;
    const centre = () => { const a = [...pts.values()]; return a.length === 2 ? { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) } : null; };
    card.addEventListener('pointerdown', (e) => {
      if (mode3d || e.target.closest('.side-pills, .mode-pills, .zoom-reset')) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      view.moved = false;
      if (pts.size === 1) start = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
      if (pts.size === 2) { const c = centre(); pinch = { d: c.d, s: view.s, x: view.x, y: view.y, cx: c.x, cy: c.y }; }
    });
    addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2 && pinch) {
        const c = centre(), r = card.getBoundingClientRect();
        view.s = Math.max(1, Math.min(4, pinch.s * (c.d / pinch.d)));
        // keep the point between the fingers where it was
        const ox = pinch.cx - (r.left + r.width / 2 - pinch.x), oy = pinch.cy - (r.top + r.height / 2 - pinch.y);
        view.x = pinch.x + (c.x - pinch.cx) - ox * (view.s / pinch.s - 1);
        view.y = pinch.y + (c.y - pinch.cy) - oy * (view.s / pinch.s - 1);
        view.moved = true; clampView(); applyView(false);
      } else if (pts.size === 1 && start) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 6) view.moved = true;
        if (view.s > 1.01) { view.x = start.vx + dx; view.y = start.vy + dy; clampView(); applyView(false); }
        else if (view.moved && Math.abs(dx) > Math.abs(dy)) { view.x = dx * 0.5; view.y = 0; applyView(false); }
      }
    });
    const end = (e) => {
      if (!pts.has(e.pointerId)) return;
      const wasOne = pts.size === 1;
      pts.delete(e.pointerId);
      if (wasOne && start && view.s <= 1.01 && view.moved) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.2) { flipSide(); }
        else resetView(true);
      }
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) { start = null; if (view.s <= 1.01) resetView(false); setTimeout(() => { view.moved = false; }, 0); }
    };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    card.addEventListener('wheel', (e) => {
      if (mode3d || (!e.ctrlKey && !e.metaKey)) return;      // pinch on a trackpad, or ctrl and scroll
      e.preventDefault();
      view.s = Math.max(1, Math.min(4, view.s * Math.exp(-e.deltaY * 0.01)));
      clampView(); applyView(false);
    }, { passive: false });
    card.addEventListener('dblclick', () => { if (mode3d) return; if (view.s > 1.01) resetView(true); else { view.s = 2; applyView(true); } });
    $('#zoomReset').addEventListener('click', () => resetView(true));
    $('#vTools').addEventListener('click', (e) => {
      const b = e.target.closest('[data-vt]'); if (!b) return;
      const t = b.dataset.vt;
      if (mode3d && /^(zin|zout|fit|front|back)$/.test(t)) {
        if (t === 'zin') UB.viewer3d.zoom(0.8);
        if (t === 'zout') UB.viewer3d.zoom(1.25);
        if (t === 'fit' || t === 'front') UB.viewer3d.frame('front');
        if (t === 'back') UB.viewer3d.frame('back');
        return;
      }
      if (t === 'zin') { view.s = Math.min(4, view.s * 1.25); clampView(); applyView(true); }
      if (t === 'zout') { view.s = Math.max(1, view.s / 1.25); clampView(); applyView(true); }
      if (t === 'fit') resetView(true);
      if ((t === 'front' && side === 'back') || (t === 'back' && side === 'front')) flipSide();
      if (t === 'undo') undo();
      if (t === 'redo') redo();
      if (t === 'select') toast('Click any part of the player to change its colour.');
      $$('#vTools [data-vt="front"], #vTools [data-vt="back"]').forEach((x) => x.classList.toggle('on', x.dataset.vt === side));
    });
  }

  /* ---------------- boot ---------------- */
  /* What the account, library and sharing pages use. */
  UB.app = {
    get design() { return state; },
    kit: () => kit(),
    paint: paintPhoto,
    normalize: (d) => normalize(d),
    setDesign(d) { state = normalize(d); commit(); syncAll(); },
    setLogo(slot, img) { SLOTS[slot].set(img); syncControls(); render(); commit(); },
    getLogo: (slot) => SLOTS[slot].get(),
    slotLabel: (slot) => SLOTS[slot].label,
    prepareImage: async (file) => maybeCutout(await readImage(file)),
    newDesign(brand) {
      const d = sampleDesign();
      if (brand) {
        if (brand.palette && brand.palette.length === 5) d.team.palette = brand.palette.slice();
        if (brand.teamName) d.team.name = brand.teamName;
        if (brand.crest) { d.crest.image = brand.crest; d.crest.style = 'image'; }
        if (brand.sponsor) d.photoLogos = { ...(d.photoLogos || {}), sponsor: brand.sponsor };
      }
      state = d; commit(); syncAll();
    },
    toast: (m) => toast(m), openModal: (...a) => openModal(...a), closeModal: () => closeModal(), esc, slug: () => slug(),
    go: (hash) => { location.hash = hash; },
    exportPng: (all) => exportPng(all),
    reset: () => { state = sampleDesign(); commit(); syncAll(); },
  };

  function boot() {
    state = normalize(store.read(STORE_KEY));
    buildPills();
    renderSchemes();
    renderDrops();
    wire();
    wireGestures();
    commit();
    if (UB.saas) UB.saas.init();
    go();
    if (document.fonts) document.fonts.ready.then(render);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
