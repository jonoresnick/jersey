/* =====================================================================
   Hockey Uniform Builder — app state, controls and export.
   Controls in index.html bind to the design with data-bind="path":
     "team.*", "player.*", "lettering.*", "crest.*" → shared by all kits
     "kit.*"                                       → the kit being edited
   ===================================================================== */
(function () {
  const UB = window.UB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const STORE_KEY = 'hockey-uniform-builder:v1';
  const UI_KEY = 'hockey-uniform-builder:ui';

  let state, history = [], future = [];
  const ui = { tab: 'template', view: 'player' };

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
    s.active = 'home';
    s.version = 1;
    return s;
  }

  /* Fill in anything missing from an older or hand-edited design file. */
  function normalize(raw) {
    const base = sampleDesign();
    if (!raw || typeof raw !== 'object') return base;
    const out = deepMerge(base, { ...raw, kits: undefined });
    for (const k of Object.keys(UB.KIT_NAMES)) {
      const rk = raw.kits && raw.kits[k];
      if (rk) {
        const fresh = applyTemplate({ swap: !!rk.swap, colors: { ...UB.BASE_COLORS } }, rk.template);
        out.kits[k] = deepMerge(fresh, rk);
      }
    }
    if (!Array.isArray(out.team.palette) || out.team.palette.length < 5) out.team.palette = base.team.palette;
    out.team.palette = out.team.palette.slice(0, 5).map((c) => (UB.isHex(c) ? c : '#888888'));
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

  /* ---------------- persistence & history ---------------- */
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  }
  function saveUI() {
    try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* storage unavailable */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return normalize(JSON.parse(raw));
    } catch (e) { /* fall back to the sample */ }
    return sampleDesign();
  }

  function commit() {
    const s = JSON.stringify(state);
    if (history[history.length - 1] === s) return;
    history.push(s);
    if (history.length > 100) history.shift();
    future = [];
    save();
    syncUndo();
  }
  function restore(s) {
    const active = state.active;
    state = JSON.parse(s);
    state.active = active;
    save();
    syncAll();
  }
  function undo() {
    if (history.length < 2) return;
    future.push(history.pop());
    restore(history[history.length - 1]);
    toast('Undone');
  }
  function redo() {
    if (!future.length) return;
    const s = future.pop();
    history.push(s);
    restore(s);
    toast('Redone');
  }
  function syncUndo() {
    $('#btn-undo').disabled = history.length < 2;
    $('#btn-redo').disabled = !future.length;
  }

  /* ---------------- rendering ---------------- */
  let raf = 0;
  function render() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(doRender);
  }

  function doRender() {
    const k = kit(), R = UB.render, X = UB.real;
    const fig = (cls, svg, cap) => `<figure class="part ${cls}">${svg}<figcaption>${cap}</figcaption></figure>`;
    let html;
    if (ui.view === 'player') {
      html = `<div class="board board-real">` +
        fig('part-player', X.player(state, k, 'front', { attrs: 'role="img" aria-label="Player, front"' }), 'Front') +
        fig('part-player', X.player(state, k, 'back', { attrs: 'role="img" aria-label="Player, back"' }), 'Back') + `</div>`;
    } else if (ui.view === 'jersey') {
      html = `<div class="board board-real">` +
        fig('part-real-jersey', X.jersey(state, k, 'front', { attrs: 'role="img" aria-label="Jersey front"' }), 'Front') +
        fig('part-real-jersey', X.jersey(state, k, 'back', { attrs: 'role="img" aria-label="Jersey back"' }), 'Back') + `</div>`;
    } else {
      html = `<div class="board is-full">` +
        fig('part-jersey', R.jersey(state, k, 'front', { attrs: 'role="img" aria-label="Jersey front"' }), 'Front') +
        fig('part-jersey', R.jersey(state, k, 'back', { attrs: 'role="img" aria-label="Jersey back"' }), 'Back') +
        fig('part-helmet', R.helmet(state, k, { attrs: 'role="img" aria-label="Helmet"' }), 'Helmet') +
        fig('part-pants', R.pants(state, k, { attrs: 'role="img" aria-label="Pants"' }), 'Pants') +
        fig('part-socks', R.socks(state, k, { attrs: 'role="img" aria-label="Socks"' }), 'Socks') + `</div>`;
    }
    $('#stage').innerHTML = html;
    $('#stage-kit').textContent = `${UB.KIT_NAMES[state.active]} · ${k.swap ? 'Light' : 'Dark'} sweater`;
    renderContrast();
    renderKitTabs();
    if (ui.tab === 'template') renderTemplates();
    if (ui.tab === 'colours') renderZoneRows();
  }

  function renderContrast() {
    const k = kit(), L = state.lettering, c = (z) => UB.color(state, k, z);
    const body = c('body');
    const edge = L.outlines >= 2 ? c('numberOutline2') : L.outlines >= 1 ? c('numberOutline') : c('number');
    const ratio = Math.max(UB.contrast(c('number'), body), UB.contrast(edge, body));
    const el = $('#contrast');
    const level = ratio >= 3 ? 'good' : ratio >= 2 ? 'ok' : 'low';
    el.dataset.level = level;
    el.innerHTML = `<span class="dot"></span>Number contrast <b>${ratio.toFixed(1)}:1</b> · ${{ good: 'Easy to read', ok: 'Readable up close', low: 'Hard to read' }[level]}`;
  }

  function renderKitTabs() {
    $$('#kit-tabs [data-kit]').forEach((b) => {
      const k = state.kits[b.dataset.kit];
      b.setAttribute('aria-selected', String(b.dataset.kit === state.active));
      b.querySelector('.kit-dot').style.background = UB.color(state, k, 'body');
      b.querySelector('.kit-dot').style.boxShadow = `inset 0 -5px 0 ${UB.color(state, k, 'stripe1')}`;
    });
  }

  function renderTemplates() {
    const k = kit();
    $('#tpl-grid').innerHTML = UB.TEMPLATES.map((t) => {
      const preview = applyTemplate(clone(k), t.id);
      return `<button type="button" class="tpl${k.template === t.id ? ' is-on' : ''}" data-tpl="${t.id}" aria-pressed="${k.template === t.id}">` +
        `<span class="tpl-art">${UB.render.jersey(state, preview, 'front', { thumb: true, attrs: 'aria-hidden="true"' })}</span>` +
        `<span class="tpl-name">${esc(t.name)}</span><span class="tpl-note">${esc(t.note)}</span></button>`;
    }).join('');
  }

  /* ---------------- colours ---------------- */
  function slotLabel(v) {
    return /^p\d$/.test(v) ? UB.PALETTE_SLOTS[+v[1]] : String(v).toUpperCase();
  }

  function zoneUsed(z) {
    const k = kit(), j = k.jersey, L = state.lettering, c = state.crest;
    const allBands = [j.hem.style, j.sleeve.style, k.socks.style === 'match' ? j.hem.style : k.socks.style];
    const usesC2 = (styles) => styles.some((s) => (UB.STRIPE_SETS[s] || UB.STRIPE_SETS.none).bands.some((b) => b.c === 2));
    switch (z) {
      case 'yoke': return j.yoke !== 'none';
      case 'yokeTrim': return j.yoke !== 'none' && j.yokeTrim > 0;
      case 'pattern': return j.pattern.type !== 'none';
      case 'laces': return j.collar === 'laceup';
      case 'stripe1': return [j.hem.style, j.sleeve.style].some((s) => s !== 'none');
      case 'stripe2': return usesC2([j.hem.style, j.sleeve.style]);
      case 'numberOutline': return L.outlines >= 1;
      case 'numberOutline2': return L.outlines >= 2;
      case 'crestBg': case 'crestRing': return ['roundel', 'shield', 'wordmark', 'initials'].includes(c.style) || c.patch === 'mini';
      case 'crestText': return ['roundel', 'shield', 'wordmark', 'initials'].includes(c.style) || c.patch === 'mini';
      case 'pantsStripe1': return k.pants.stripe !== 'none';
      case 'pantsStripe2': return ['outlined', 'hem'].includes(k.pants.stripe);
      case 'sockStripe1': return allBands[2] !== 'none';
      case 'sockStripe2': return usesC2([allBands[2]]);
      case 'helmetDecal': return L.helmetNumber;
      case 'stick': return L.stick !== false;
      default: return true;
    }
  }

  function renderZoneRows() {
    const k = kit();
    $('#zones').innerHTML = UB.ZONE_GROUPS.map((g) => {
      const rows = UB.ZONES.filter((z) => z.group === g.id).map((z) => {
        const v = UB.zoneValue(k, z.id), used = zoneUsed(z.id);
        return `<button type="button" class="zone-row${used ? '' : ' is-unused'}" data-zone="${z.id}">` +
          `<span class="sw" style="background:${UB.color(state, k, z.id)}"></span>` +
          `<span class="zone-label">${esc(z.label)}${used ? '' : '<small>not shown</small>'}</span>` +
          `<span class="zone-val">${esc(slotLabel(v))}</span></button>`;
      }).join('');
      return `<div class="zone-group"><h4>${esc(g.label)}</h4>${rows}</div>`;
    }).join('');
  }

  function renderPalette() {
    $('#palette').innerHTML = state.team.palette.map((c, i) =>
      `<div class="pal-row"><label for="pal-${i}" class="pal-sw" style="background:${c}"><input type="color" id="pal-${i}" value="${c}" data-pal="${i}" aria-label="${UB.PALETTE_SLOTS[i]} colour"></label>` +
      `<span class="pal-name">${UB.PALETTE_SLOTS[i]}</span>` +
      `<input type="text" class="hex" id="pal-hex-${i}" value="${c.toUpperCase()}" data-pal-hex="${i}" maxlength="7" spellcheck="false" aria-label="${UB.PALETTE_SLOTS[i]} hex"></div>`).join('');
  }

  function renderSchemes() {
    $('#schemes').innerHTML = UB.SCHEMES.map((s, i) =>
      `<button type="button" class="scheme" data-scheme="${i}"><span class="scheme-dots">${s.colors.slice(0, 4).map((c) => `<i style="background:${c}"></i>`).join('')}</span>${esc(s.name)}</button>`).join('');
  }

  /* ---------------- colour picker popover ---------------- */
  const pop = () => $('#popover');
  let popZone = null;

  function openPicker(zone, at) {
    const z = UB.ZONES.find((x) => x.id === zone);
    if (!z) return;
    popZone = zone;
    const k = kit(), v = UB.zoneValue(k, zone), hex = UB.color(state, k, zone);
    const group = UB.ZONE_GROUPS.find((g) => g.id === z.group);
    const p = pop();
    p.innerHTML =
      `<div class="pop-head"><div><span class="eyebrow">${esc(group.label)}</span><strong>${esc(z.label)}</strong></div>` +
      `<button type="button" class="icon-btn" data-pop-close aria-label="Close">${ICON.close}</button></div>` +
      `<div class="pop-label">Team colours</div>` +
      `<div class="pop-swatches">${state.team.palette.map((c, i) =>
        `<button type="button" class="pswatch${v === 'p' + i ? ' is-on' : ''}" data-slot="p${i}" aria-pressed="${v === 'p' + i}"><span style="background:${c}"></span>${UB.PALETTE_SLOTS[i]}</button>`).join('')}</div>` +
      `<div class="pop-label">Custom colour <small>not linked to the team palette</small></div>` +
      `<div class="pop-custom"><label class="pal-sw" for="pop-color" style="background:${hex}"><input type="color" id="pop-color" value="${hex}"></label>` +
      `<input type="text" class="hex" id="pop-hex" value="${hex.toUpperCase()}" maxlength="7" spellcheck="false" aria-label="Hex colour"></div>`;
    p.hidden = false;
    const w = p.offsetWidth, h = p.offsetHeight;
    let left = Math.max(8, Math.min(innerWidth - w - 8, at.x - w / 2));
    let top = at.y + 14;
    if (top + h > innerHeight - 8) top = Math.max(8, at.y - h - 14);
    p.style.left = left + 'px';
    p.style.top = top + 'px';
    $$('.zone-row').forEach((r) => r.classList.toggle('is-active', r.dataset.zone === zone));
  }
  function closePicker() {
    pop().hidden = true;
    popZone = null;
    $$('.zone-row.is-active').forEach((r) => r.classList.remove('is-active'));
  }
  function setZone(zone, value, commitNow) {
    const k = kit();
    k.colors[zone] = /^p\d$/.test(value) ? UB.swapSlot(k, zone, value) : value;
    render();
    if (commitNow) commit();
  }

  /* ---------------- controls ---------------- */
  function sourceOf(name) { return UB[name] || {}; }

  function buildSelects() {
    $$('select[data-source]').forEach((el) => {
      const src = sourceOf(el.dataset.source);
      el.innerHTML = Object.entries(src).map(([k, v]) => `<option value="${k}">${esc(typeof v === 'string' ? v : v.label)}</option>`).join('');
    });
  }

  function buildSegs() {
    $$('[data-seg]').forEach((el) => {
      const src = sourceOf(el.dataset.source);
      el.innerHTML = Object.entries(src).map(([k, v]) => {
        const label = typeof v === 'string' ? v : v.label;
        const inner = el.dataset.look === 'font'
          ? `<span class="font-sample" style="font-family:${v.family};font-weight:${v.weight}">27</span><span class="font-name">${esc(label)}</span>`
          : esc(label);
        return `<button type="button" data-val="${k}" aria-pressed="false">${inner}</button>`;
      }).join('');
    });
  }

  function castSeg(el, v) {
    if (el.dataset.kind === 'number') return +v;
    if (el.dataset.kind === 'bool') return v === 'true';
    return v;
  }

  function fmt(el, v) {
    const u = el.dataset.unit || '';
    if (u === '%') return Math.round(v * 100) + '%';
    if (u === 'x') return (+v).toFixed(2).replace(/0$/, '') + '×';
    return Math.round(v) + u;
  }

  function syncControls() {
    $$('[data-bind]').forEach((el) => {
      const v = get(el.dataset.bind);
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el !== document.activeElement || el.type !== 'text') el.value = v ?? '';
      const out = $(`output[for="${el.id}"]`);
      if (out) out.textContent = fmt(el, v);
    });
    $$('[data-seg]').forEach((el) => {
      const v = String(get(el.dataset.seg));
      $$('button', el).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.val === v)));
    });
    $$('[data-show-if]').forEach((el) => {
      const [path, vals] = el.dataset.showIf.split('=');
      el.hidden = !vals.split('|').includes(String(get(path)));
    });
    $$('[data-hide-if]').forEach((el) => {
      const [path, vals] = el.dataset.hideIf.split('=');
      el.hidden = vals.split('|').includes(String(get(path)));
    });
    const n = state.player.number;
    $('#number-note').textContent = n === '99' ? '99 is retired across the NHL.' : n === '0' || n === '00' ? 'The NHL doesn’t issue 0 or 00.' : '';
    $('#crest-image-name').textContent = state.crest.image ? 'Logo uploaded' : 'No logo yet';
    $('#patch-image-name').textContent = state.crest.patchImage ? 'Patch uploaded' : 'No patch yet';
    $('#btn-crest-clear').hidden = !state.crest.image;
    $('#btn-patch-clear').hidden = !state.crest.patchImage;
    $$('#copy-from [data-copy]').forEach((b) => { b.hidden = b.dataset.copy === state.active; });
  }

  function syncAll() {
    renderPalette();
    syncControls();
    syncUndo();
    render();
  }

  function onBindInput(e, commitNow) {
    const el = e.target.closest('[data-bind]');
    if (!el) return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.type === 'range' || el.dataset.kind === 'number') v = parseFloat(el.value);
    else v = el.value;
    if (el.dataset.digits !== undefined) {
      v = String(v).replace(/\D/g, '').slice(0, 2);
      if (el.value !== v) el.value = v;
    }
    set(el.dataset.bind, v);
    const out = $(`output[for="${el.id}"]`);
    if (out) out.textContent = fmt(el, v);
    syncControls();
    render();
    if (commitNow) commit();
  }

  /* ---------------- images ---------------- */
  function readImage(file) {
    return new Promise((resolveP, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Choose a PNG, JPG, SVG or WebP image.'));
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('That file could not be read.'));
      fr.onload = () => {
        if (file.type === 'image/svg+xml') return resolveP(fr.result);
        const img = new Image();
        img.onload = () => {
          const max = 600, scale = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas');
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          resolveP(c.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('That image could not be opened.'));
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------------- export ---------------- */
  const fontCache = {};
  async function embeddedFontCSS() {
    const fams = new Set(['Saira+Condensed:wght@600;700;800']);
    fams.add(UB.FONTS[state.lettering.numberFont].gf);
    fams.add(UB.FONTS[state.lettering.nameFont].gf);
    const url = 'https://fonts.googleapis.com/css2?' + [...fams].map((f) => 'family=' + f).join('&') + '&display=block';
    if (fontCache[url]) return fontCache[url];
    try {
      let css = await (await fetch(url)).text();
      // Keep only the latin subsets to keep the file small.
      css = css.split('/* ').filter((b) => b && (b.startsWith('latin */') || !b.includes('*/'))).map((b) => '/* ' + b).join('');
      const urls = [...new Set([...css.matchAll(/url\((https:[^)]+)\)/g)].map((m) => m[1]))];
      for (const u of urls) {
        const blob = await (await fetch(u)).blob();
        const data = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
        css = css.split(u).join(data);
      }
      fontCache[url] = css;
      return css;
    } catch (e) {
      return `@import url('${url.replace('display=block', 'display=swap')}');`;
    }
  }

  function svgToPng(svg, w, h, scale = 2) {
    return new Promise((resolveP, reject) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = w * scale;
        c.height = h * scale;
        const ctx = c.getContext('2d');
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, w, h);
        c.toBlob((b) => (b ? resolveP(b) : reject(new Error('The image could not be created.'))), 'image/png');
      };
      img.onerror = () => reject(new Error('The image could not be created.'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  function download(blob, filename) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  const slug = () => (state.team.name || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'team';

  async function exportPng(all) {
    openModal({ title: all ? 'All three kits' : `${UB.KIT_NAMES[state.active]} uniform`, body: '<p class="muted">Drawing the image…</p>' });
    try {
      const css = await embeddedFontCSS();
      await document.fonts.ready;
      const flat = ui.view === 'flat';
      const lib = flat ? UB.render : UB.real;
      const svg = all ? lib.lineup(state, css) : lib.sheet(state, state.active, css);
      const [w, h] = flat ? (all ? [1500, 1060] : [1400, 1180]) : (all ? [1840, 1380] : [1840, 1330]);
      const blob = await svgToPng(svg, w, h);
      const url = URL.createObjectURL(blob);
      const name = `${slug()}-${all ? 'uniform-set' : state.active}.png`;
      openModal({
        title: all ? 'All three kits' : `${UB.KIT_NAMES[state.active]} uniform`,
        body: `<img class="export-img" src="${url}" alt="Uniform sheet for ${esc(state.team.name)}">` +
          `<p class="muted">If the download doesn’t start, right-click the image (or press and hold) and save it.</p>`,
        actions: [{ label: 'Download PNG', primary: true, run: () => download(blob, name) }],
      });
    } catch (e) {
      openModal({ title: 'Export failed', body: `<p>${esc(e.message)} Try again, or export an SVG instead.</p>` });
    }
  }

  async function exportSvg() {
    const css = await embeddedFontCSS();
    const svg = (ui.view === 'flat' ? UB.render : UB.real).sheet(state, state.active, css);
    download(new Blob([svg], { type: 'image/svg+xml' }), `${slug()}-${state.active}.svg`);
    toast('SVG exported');
  }

  function designJSON() { return JSON.stringify({ ...state, version: 1 }, null, 2); }

  function loadDesign(text) {
    const data = JSON.parse(text);
    if (!data || !data.kits || !data.team) throw new Error('This doesn’t look like a uniform design.');
    state = normalize(data);
    commit();
    syncAll();
  }

  /* ---------------- modal & toast ---------------- */
  function openModal({ title, body, actions = [] }) {
    const m = $('#modal');
    $('#modal-title').textContent = title;
    $('#modal-body').innerHTML = body;
    const foot = $('#modal-actions');
    foot.innerHTML = '';
    for (const a of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = a.primary ? 'btn btn-primary' : 'btn';
      b.textContent = a.label;
      b.onclick = () => { if (a.run() !== false) closeModal(); };
      foot.append(b);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'btn';
    close.textContent = actions.length ? 'Cancel' : 'Close';
    close.onclick = closeModal;
    foot.append(close);
    m.hidden = false;
    (foot.querySelector('.btn-primary') || close).focus();
  }
  function closeModal() { $('#modal').hidden = true; }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
  }

  /* ---------------- icons ---------------- */
  const ICON = {
    close: '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  /* ---------------- wiring ---------------- */
  function selectTab(tab) {
    ui.tab = tab;
    saveUI();
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    $$('.tabpanel').forEach((p) => { p.hidden = p.dataset.panel !== tab; });
    closePicker();
    render();
  }

  function wire() {
    document.addEventListener('input', (e) => {
      if (e.target.matches('[data-bind]')) onBindInput(e, false);
      if (e.target.matches('[data-pal]')) {
        const i = +e.target.dataset.pal;
        state.team.palette[i] = e.target.value;
        e.target.parentElement.style.background = e.target.value;
        $(`#pal-hex-${i}`).value = e.target.value.toUpperCase();
        render();
      }
      if (e.target.id === 'pop-color' && popZone) {
        $('#pop-hex').value = e.target.value.toUpperCase();
        e.target.parentElement.style.background = e.target.value;
        $$('.pswatch').forEach((b) => b.classList.remove('is-on'));
        setZone(popZone, e.target.value, false);
      }
    });
    document.addEventListener('change', (e) => {
      if (e.target.matches('[data-bind]')) onBindInput(e, true);
      if (e.target.matches('[data-pal]')) commit();
      if (e.target.matches('[data-pal-hex]')) {
        const i = +e.target.dataset.palHex;
        let v = e.target.value.trim();
        if (!v.startsWith('#')) v = '#' + v;
        if (UB.isHex(v)) { state.team.palette[i] = v.toLowerCase(); renderPalette(); render(); commit(); }
        else { e.target.value = state.team.palette[i].toUpperCase(); toast('Use a 6-digit hex colour like #C8102E'); }
      }
      if (e.target.id === 'pop-color' && popZone) commit();
      if (e.target.id === 'pop-hex' && popZone) {
        let v = e.target.value.trim();
        if (!v.startsWith('#')) v = '#' + v;
        if (UB.isHex(v)) { setZone(popZone, v.toLowerCase(), true); openPicker(popZone, { x: parseFloat(pop().style.left) + pop().offsetWidth / 2, y: parseFloat(pop().style.top) - 14 }); }
        else toast('Use a 6-digit hex colour like #C8102E');
      }
    });

    document.addEventListener('click', (e) => {
      const seg = e.target.closest('[data-seg] button[data-val]');
      if (seg) {
        const el = seg.closest('[data-seg]');
        set(el.dataset.seg, castSeg(el, seg.dataset.val));
        syncControls();
        render();
        commit();
        return;
      }
      const tab = e.target.closest('.tab[data-tab]');
      if (tab) return selectTab(tab.dataset.tab);

      const kb = e.target.closest('#kit-tabs [data-kit]');
      if (kb) {
        state.active = kb.dataset.kit;
        save();
        closePicker();
        syncControls();
        render();
        return;
      }
      const tpl = e.target.closest('[data-tpl]');
      if (tpl) {
        applyTemplate(kit(), tpl.dataset.tpl);
        syncControls();
        render();
        commit();
        toast(`${UB.TEMPLATES.find((t) => t.id === tpl.dataset.tpl).name} applied to ${UB.KIT_NAMES[state.active]}`);
        return;
      }
      const copy = e.target.closest('[data-copy]');
      if (copy) {
        const src = state.kits[copy.dataset.copy], k = kit();
        Object.assign(k, clone({ template: src.template, jersey: src.jersey, pants: src.pants, socks: src.socks, colors: src.colors }));
        syncControls();
        render();
        commit();
        toast(`Copied the ${UB.KIT_NAMES[copy.dataset.copy]} kit’s style`);
        return;
      }
      const scheme = e.target.closest('[data-scheme]');
      if (scheme) {
        state.team.palette = UB.SCHEMES[+scheme.dataset.scheme].colors.slice();
        renderPalette();
        render();
        commit();
        toast(`${UB.SCHEMES[+scheme.dataset.scheme].name} colours applied`);
        return;
      }
      const row = e.target.closest('.zone-row[data-zone]');
      if (row) {
        const r = row.getBoundingClientRect();
        if (popZone === row.dataset.zone) return closePicker();
        openPicker(row.dataset.zone, { x: r.left + r.width / 2, y: r.bottom - 6 });
        return;
      }
      const slot = e.target.closest('.pswatch[data-slot]');
      if (slot && popZone) {
        setZone(popZone, slot.dataset.slot, true);
        $$('.pswatch').forEach((b) => { b.classList.toggle('is-on', b === slot); b.setAttribute('aria-pressed', String(b === slot)); });
        const hex = UB.color(state, kit(), popZone);
        $('#pop-color').value = hex;
        $('#pop-color').parentElement.style.background = hex;
        $('#pop-hex').value = hex.toUpperCase();
        return;
      }
      if (e.target.closest('[data-pop-close]')) return closePicker();

      const part = e.target.closest('#stage [data-zone]');
      if (part) {
        openPicker(part.dataset.zone, { x: e.clientX, y: e.clientY });
        hideTip();
        return;
      }
      if (popZone && !e.target.closest('#popover')) closePicker();

      const menuBtn = e.target.closest('#btn-export');
      const menu = $('#export-menu');
      if (menuBtn) { menu.hidden = !menu.hidden; menuBtn.setAttribute('aria-expanded', String(!menu.hidden)); return; }
      if (!e.target.closest('#export-menu')) { menu.hidden = true; $('#btn-export').setAttribute('aria-expanded', 'false'); }
      const act = e.target.closest('[data-action]');
      if (act) { menu.hidden = true; ACTIONS[act.dataset.action](); }
    });

    $('#btn-undo').onclick = undo;
    $('#btn-redo').onclick = redo;

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closePicker(); closeModal(); $('#export-menu').hidden = true; }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      }
      if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    });

    // Hover label on the preview
    const stage = $('#stage');
    stage.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const part = e.target.closest('[data-zone]');
      if (!part) return hideTip();
      const z = UB.ZONES.find((x) => x.id === part.dataset.zone);
      const t = $('#tip');
      t.innerHTML = `<i style="background:${UB.color(state, kit(), z.id)}"></i>${esc(z.label)} <span>${esc(slotLabel(UB.zoneValue(kit(), z.id)))}</span>`;
      t.hidden = false;
      t.style.left = Math.min(innerWidth - t.offsetWidth - 8, e.clientX + 14) + 'px';
      t.style.top = e.clientY + 16 + 'px';
    });
    stage.addEventListener('pointerleave', hideTip);

    // Image uploads
    const upload = (input, key, label) => input.addEventListener('change', async () => {
      const file = input.files[0];
      input.value = '';
      if (!file) return;
      try {
        state.crest[key] = await readImage(file);
        if (key === 'image') state.crest.style = 'image';
        if (key === 'patchImage') state.crest.patch = 'image';
        syncControls();
        render();
        commit();
        toast(label);
      } catch (err) { toast(err.message); }
    });
    upload($('#crest-file'), 'image', 'Logo added to the crest');
    upload($('#patch-file'), 'patchImage', 'Logo added to the shoulders');
    $('#btn-crest-upload').onclick = () => $('#crest-file').click();
    $('#btn-patch-upload').onclick = () => $('#patch-file').click();
    $('#btn-crest-clear').onclick = () => { state.crest.image = null; if (state.crest.style === 'image') state.crest.style = 'roundel'; syncControls(); render(); commit(); };
    $('#btn-patch-clear').onclick = () => { state.crest.patchImage = null; if (state.crest.patch === 'image') state.crest.patch = 'mini'; syncControls(); render(); commit(); };

    $('#btn-swap').onclick = () => {
      const k = kit();
      for (const z of Object.keys(k.colors)) k.colors[z] = k.colors[z] === 'p0' ? 'p1' : k.colors[z] === 'p1' ? 'p0' : k.colors[z];
      render();
      commit();
      toast('Swapped Primary and Secondary on this kit');
    };

    $('#design-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try { loadDesign(await file.text()); toast('Design opened'); }
      catch (err) { openModal({ title: 'Couldn’t open that file', body: `<p>${esc(err.message)}</p>` }); }
    });

    $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
    addEventListener('resize', closePicker);
  }

  function hideTip() { $('#tip').hidden = true; }

  const ACTIONS = {
    png: () => exportPng(false),
    pngAll: () => exportPng(true),
    svg: () => exportSvg(),
    save: () => { download(new Blob([designJSON()], { type: 'application/json' }), `${slug()}-uniform.json`); toast('Design file saved'); },
    open: () => $('#design-file').click(),
    copy: () => {
      const text = designJSON();
      navigator.clipboard.writeText(text).then(() => toast('Design code copied'), () => {
        openModal({ title: 'Design code', body: `<p class="muted">Select all and copy this text.</p><textarea id="code-out" class="code" readonly>${esc(text)}</textarea>` });
        $('#code-out').select();
      });
    },
    paste: () => openModal({
      title: 'Paste design code',
      body: `<p class="muted">Paste the code from <b>Copy design code</b>. It replaces the current design; you can undo.</p><textarea id="code-in" class="code" spellcheck="false" placeholder="{ &quot;team&quot;: … }"></textarea><p class="err" id="code-err" hidden></p>`,
      actions: [{
        label: 'Load design', primary: true, run: () => {
          try { loadDesign($('#code-in').value); toast('Design loaded'); }
          catch (err) { const el = $('#code-err'); el.textContent = 'That code couldn’t be read. Check that you pasted all of it.'; el.hidden = false; return false; }
        },
      }],
    }),
    reset: () => openModal({
      title: 'Start over?',
      body: '<p>This replaces your design with the Harbour Storm example. You can undo it.</p>',
      actions: [{ label: 'Start over', primary: true, run: () => { state = sampleDesign(); commit(); syncAll(); toast('Back to the example design'); } }],
    }),
  };

  /* A small fabric-weave texture (mid-grey = no change under hard-light). */
  function makeNoise() {
    try {
      const n = 160, c = document.createElement('canvas');
      c.width = c.height = n;
      const ctx = c.getContext('2d'), img = ctx.createImageData(n, n);
      let seed = 1;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const weave = ((x + y) % 4 < 2 ? 6 : -6) + (y % 3 === 0 ? -5 : 0) + (x % 3 === 0 ? 4 : 0);
          const v = 128 + weave + (rnd() - 0.5) * 34;
          const i = (y * n + x) * 4;
          img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      return c.toDataURL('image/png');
    } catch (e) { return null; }
  }

  /* ---------------- boot ---------------- */
  function boot() {
    try { Object.assign(ui, JSON.parse(localStorage.getItem(UI_KEY) || '{}')); } catch (e) { /* defaults */ }
    if (!$(`.tabpanel[data-panel="${ui.tab}"]`)) ui.tab = 'template';
    if (!UB.VIEWS[ui.view]) ui.view = 'player';
    UB.NOISE = makeNoise();
    state = load();
    buildSelects();
    buildSegs();
    renderSchemes();
    wire();
    $$('#view-seg button').forEach((b) => b.addEventListener('click', () => {
      ui.view = b.dataset.view;
      saveUI();
      $$('#view-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      render();
    }));
    $$('#view-seg button').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.view === ui.view)));
    commit();
    selectTab(ui.tab);
    syncAll();
    if (document.fonts) document.fonts.ready.then(render);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
