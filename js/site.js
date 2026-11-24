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
  const SAVED_KEY = 'digital-jersey:saved:v1';

  let state, history = [], future = [], side = 'front';

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
      if (route === 'design' && side === 'front') await paintPhoto(state, kit(), $('#photoCanvas'));
      if (route === 'home') await paintPhoto(state, kit(), $('#heroCanvas'));
    } while (dirty);
    running = false;
  }
  function render() {
    if (route === 'design') {
      const back = side === 'back';
      $('#photoCanvas').hidden = back;
      $('#backWrap').hidden = !back;
      if (back) $('#backWrap').innerHTML = UB.render.jersey(state, kit(), 'back', { attrs: 'role="img" aria-label="Back of the jersey"' });
      $('#previewCard').classList.toggle('checker', state.view.scene === 'clear' && !back);
      $('#previewHint').textContent = back ? 'The back is a flat drawing. Click any part to change its colour.' : 'Click any part to change its colour.';
      $$('#sidePills .pill').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.side === side)));
      renderKitPills();
      renderTemplates();
      renderTeamColours();
      renderZones();
    }
    pump();
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
    if (!z || !PHOTO_ZONES.includes(zone)) return;
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
      `<div class="drop-meta"><strong>${esc(s.label)}</strong><span>${esc(s.where)}</span></div><button class="link" type="button" data-rm>Remove</button></div>`).join('');
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
  function saveDesign() {
    const c = document.createElement('canvas');
    paintPhoto(state, kit(), c, 360).then(() => {
      const list = store.read(SAVED_KEY) || [];
      const tpl = UB.TEMPLATES.find((t) => t.id === kit().template);
      list.unshift({ id: Date.now().toString(36), title: state.team.name || 'My jersey', sub: `${tpl ? tpl.name : ''} · ${UB.KIT_NAMES[state.active]}`, thumb: c.toDataURL('image/jpeg', 0.82), design: state });
      if (store.write(SAVED_KEY, list.slice(0, 12))) toast('Saved. Find it under Explore.');
      else toast('This browser has no room to save. Remove a design or a large logo.');
    });
  }
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
  function openModal(title, body, actions = []) {
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
    const saved = store.read(SAVED_KEY) || [];
    $('#savedBlock').hidden = !saved.length;
    $('#savedCards').innerHTML = saved.map((s) =>
      `<div class="card" data-saved="${s.id}"><button class="card-img" type="button" data-open-saved="${s.id}" aria-label="Open ${esc(s.title)}"><img src="${s.thumb}" alt=""></button>` +
      `<div><strong>${esc(s.title)}</strong><span>${esc(s.sub)}</span></div><div class="card-actions"><button class="link" type="button" data-open-saved="${s.id}">Open</button><button class="link" type="button" data-del-saved="${s.id}">Delete</button></div></div>`).join('');
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

  /* ---------------- home extras ---------------- */
  function renderHome() {
    const mini = (id) => UB.render.jersey(state, applyTemplate(clone(kit()), id), 'front', { thumb: true });
    $('#howTiles').innerHTML = ['twoband', 'heritage', 'chevron', 'hoops', 'northern', 'fade'].map(mini).join('');
    $('#howSwatches').innerHTML = state.team.palette.map((c) => `<i style="background:${c}"></i>`).join('');
    $('#homeTemplates').innerHTML = UB.TEMPLATES.map((t) =>
      `<a class="tpl-tile" href="#design" data-tpl-link="${t.id}">${mini(t.id)}<strong>${esc(t.name)}</strong><span>${esc(t.note)}</span></a>`).join('');
  }

  /* ---------------- routing ---------------- */
  let route = 'home';
  function go() {
    const r = (location.hash || '#home').slice(1);
    route = ['home', 'design', 'explore'].includes(r) ? r : 'home';
    $$('.page').forEach((p) => { p.hidden = p.dataset.page !== route; });
    $$('[data-nav]').forEach((a) => (a.dataset.nav === route ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    closePicker();
    window.scrollTo(0, 0);
    document.title = { home: 'Digital Jersey', design: 'Design · Digital Jersey', explore: 'Explore · Digital Jersey' }[route];
    if (route === 'home') renderHome();
    if (route === 'explore') renderExplore();
    syncControls();
    render();
  }

  /* ---------------- events ---------------- */
  function wire() {
    addEventListener('hashchange', go);
    addEventListener('scroll', () => $('.site-header').classList.toggle('scrolled', scrollY > 4), { passive: true });

    document.addEventListener('input', (e) => {
      const el = e.target;
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
      if (el.matches('[data-bind], [data-slot]')) commit();
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
      const kitBtn = t.closest('[data-kit]');
      if (kitBtn) { state.active = kitBtn.dataset.kit; store.write(STORE_KEY, state); syncControls(); render(); return; }
      const tpl = t.closest('[data-tpl]');
      if (tpl) { applyTemplate(kit(), tpl.dataset.tpl); syncControls(); render(); commit(); return; }
      const tplLink = t.closest('[data-tpl-link]');
      if (tplLink) { applyTemplate(kit(), tplLink.dataset.tplLink); commit(); return; }
      const sch = t.closest('[data-scheme]');
      if (sch) { state.team.palette = UB.SCHEMES[+sch.dataset.scheme].colors.slice(); syncControls(); render(); commit(); return; }
      const sideBtn = t.closest('[data-side]');
      if (sideBtn) { side = sideBtn.dataset.side; render(); return; }
      const filt = t.closest('[data-filter]');
      if (filt) { filter = filt.dataset.filter; $$('[data-filter]').forEach((b) => b.setAttribute('aria-checked', String(b === filt))); renderExplore(); return; }
      const starter = t.closest('[data-starter]');
      if (starter) { loadStarter(STARTERS[+starter.dataset.starter]); return; }
      const open = t.closest('[data-open-saved]');
      if (open) {
        const s = (store.read(SAVED_KEY) || []).find((x) => x.id === open.dataset.openSaved);
        if (s) { state = normalize(s.design); commit(); location.hash = '#design'; }
        return;
      }
      const del = t.closest('[data-del-saved]');
      if (del) { store.write(SAVED_KEY, (store.read(SAVED_KEY) || []).filter((x) => x.id !== del.dataset.delSaved)); renderExplore(); return; }

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

      if (t.closest('#saveBtn')) saveDesign();
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
      try { SLOTS[slot].set(await readImage(file)); syncControls(); render(); commit(); toast(`${SLOTS[slot].label} added`); } catch (err) { toast(err.message); }
    }
    const drops = $('#drops');
    drops.addEventListener('dragover', (e) => { const b = e.target.closest('.drop'); if (b) { e.preventDefault(); b.classList.add('is-over'); } });
    drops.addEventListener('dragleave', (e) => { const b = e.target.closest('.drop'); if (b && !b.contains(e.relatedTarget)) b.classList.remove('is-over'); });
    drops.addEventListener('drop', (e) => { const b = e.target.closest('.drop'); if (!b) return; e.preventDefault(); b.classList.remove('is-over'); if (e.dataTransfer.files[0]) accept(b.dataset.drop, e.dataTransfer.files[0]); });

    $('#undoBtn').onclick = undo;
    $('#redoBtn').onclick = redo;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closePicker(); closeModal(); }
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    });
  }

  // Which part is under the pointer on the preview (photo or flat back)?
  function previewZone(e) {
    if (route !== 'design') return null;
    const c = e.target.closest && e.target.closest('#photoCanvas');
    if (c) {
      const r = c.getBoundingClientRect();
      return UB.photo.zoneAt((e.clientX - r.left) / r.width * c.width, (e.clientY - r.top) / r.height * c.height);
    }
    const z = e.target.closest && e.target.closest('#backWrap [data-zone]');
    return z ? z.dataset.zone : null;
  }

  /* ---------------- boot ---------------- */
  function boot() {
    state = normalize(store.read(STORE_KEY));
    buildPills();
    renderSchemes();
    renderDrops();
    wire();
    commit();
    go();
    if (document.fonts) document.fonts.ready.then(render);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
