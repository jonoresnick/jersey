/* =====================================================================
   Accounts, teams, library, sharing and social posts: the pages around the
   designer. Everything goes through UB.api (js/api.js), UB.share and
   UB.social, and uses the designer through UB.app (exposed by js/site.js).
   ===================================================================== */
(function () {
  const UB = window.UB;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const A = () => UB.app, api = () => UB.api;
  const CUR_KEY = 'dj:current:v1', WS_KEY = 'dj:workspace:v1';
  const ROLE = { owner: 'Owner', editor: 'Editor', viewer: 'Viewer' };
  const DEMO = 'Demo mode: accounts and designs are saved in this browser only. They won’t appear on another device.';

  let me = null, spaces = [], activeWsId = null, current = null, pendingAfter = null;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };
  const initials = (n) => String(n || '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  function ago(t) {
    const s = Math.max(1, Math.round((Date.now() - t) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `${Math.round(s / 3600)} h ago`;
    if (s < 86400 * 30) return `${Math.round(s / 86400)} d ago`;
    return new Date(t).toLocaleDateString();
  }
  const fnv = (str) => { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  const designHash = () => fnv(JSON.stringify(A().design));
  const activeWs = () => spaces.find((w) => w.id === activeWsId) || spaces[0] || null;
  async function run(fn, errEl) {
    try { return await fn(); } catch (e) { if (errEl) { errEl.textContent = e.message; errEl.hidden = false; } else A().toast(e.message); return undefined; }
  }
  function copyText(text, done) {
    const ok = () => A().toast(done || 'Copied');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => A().toast('Select the text and copy it.'));
    else A().toast('Select the text and copy it.');
  }
  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  /* ---------------- session ---------------- */
  async function refresh() {
    me = await api().me();
    spaces = me ? await api().workspaces() : [];
    const saved = store.get(WS_KEY);
    activeWsId = spaces.some((w) => w.id === saved) ? saved : spaces[0] && spaces[0].id;
    if (current && !spaces.some((w) => w.id === current.wsId)) setCurrent(null);
    renderHeader();
  }
  function setCurrent(c) { current = c; store.set(CUR_KEY, c); refreshSaveBar(); }
  function setActiveWs(id) { activeWsId = id; store.set(WS_KEY, id); }

  async function init() {
    current = store.get(CUR_KEY);
    await refresh();
    wireDesignPage();
    refreshSaveBar();
  }

  /* ---------------- header ---------------- */
  function renderHeader() {
    const slot = $('#authSlot');
    if (!me) {
      slot.innerHTML = '<a class="nav-login" href="#signin">Log in</a><a class="btn primary sm" href="#signup">Sign up</a>';
      return;
    }
    slot.innerHTML = `<div class="avatar-wrap"><button class="avatar" type="button" id="avatarBtn" aria-haspopup="true" aria-expanded="false" aria-label="Account menu">${esc(initials(me.name))}</button>` +
      `<div class="menu-pop" id="avatarMenu" hidden><div class="menu-who"><strong>${esc(me.name)}</strong><span>${esc(me.email)}</span></div>` +
      `${activeWs() ? `<span class="menu-team">${esc(activeWs().name)} · ${ROLE[activeWs().role]}</span>` : ''}<a href="#account">Account</a><button type="button" id="logoutBtn">Log out</button></div></div>`;
  }
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('#avatarBtn'), menu = $('#avatarMenu');
    if (btn) { menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); return; }
    if (menu && !menu.hidden && (e.target.closest('#avatarMenu a') || !e.target.closest('#avatarMenu'))) menu.hidden = true;
    if (e.target.closest('#logoutBtn')) { await api().logOut(); setCurrent(null); await refresh(); A().toast('Logged out'); A().go('#home'); }
  });

  /* ---------------- routes ---------------- */
  let curRoute = '';
  function route(r, param) {
    curRoute = r;
    renderHeader();
    if (r === 'design') refreshSaveBar();
    if (r === 'signin' || r === 'signup') return renderAuth(r);
    if (['saved', 'assets', 'account'].includes(r) && !me) {
      pendingAfter = '#' + r; A().go('#signin'); return;
    }
    if (r === 'saved') renderLibrary();
    if (r === 'assets') renderAssets();
    if (r === 'account') renderAccount();
    if (r === 'view') renderView(param);
  }

  /* ---------------- sign up and log in ---------------- */
  function authForm(mode, onDone) {
    const up = mode === 'signup';
    return `<form class="auth-form" id="authForm" novalidate>` +
      (up ? '<label class="field"><span>Your name</span><input class="text-input full" name="name" autocomplete="name" required></label>' : '') +
      '<label class="field"><span>Email</span><input class="text-input full" name="email" type="email" autocomplete="email" required></label>' +
      `<label class="field"><span>Password</span><input class="text-input full" name="password" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" required minlength="8"></label>` +
      `<p class="form-error" id="authError" role="alert" hidden></p><button class="btn primary lg full" type="submit">${up ? 'Create account' : 'Log in'}</button></form>` +
      `<p class="hint demo">${DEMO}</p>`;
  }
  function mountAuth(root, mode, onDone) {
    const form = $('#authForm', root), err = $('#authError', root);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      err.hidden = true;
      const data = Object.fromEntries(new FormData(form));
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      const ok = await run(async () => { await (mode === 'signup' ? api().signUp(data) : api().logIn(data)); return true; }, err);
      btn.disabled = false;
      if (ok) { await refresh(); onDone(); }
    });
    const first = form.querySelector('input'); if (first) first.focus();
  }
  function renderAuth(mode) {
    const up = mode === 'signup';
    $('#authBox').innerHTML = `<h1 class="step-title wide" id="authTitle">${up ? 'Create your account' : 'Log in'}</h1>` +
      `<p class="lede narrow">${up ? 'Save designs, work with your team and share private reveal links.' : 'Welcome back.'}</p>` + authForm(mode) +
      `<p class="switch">${up ? 'Already have an account? <a href="#signin">Log in</a>' : 'New here? <a href="#signup">Create an account</a>'}</p>`;
    mountAuth($('#authBox'), mode, () => {
      const go = pendingAfter || '#home'; pendingAfter = null;
      A().toast(up ? 'Welcome to Digital Jersey' : 'Logged in');
      A().go(go);
    });
  }
  function authModal(mode, then) {
    A().openModal(mode === 'signup' ? 'Create an account to save' : 'Log in', authForm(mode) + `<p class="switch"><button class="link" type="button" id="authSwitch">${mode === 'signup' ? 'I already have an account' : 'Create an account instead'}</button></p>`, []);
    mountAuth($('#modalBody'), mode, () => { A().closeModal(); A().toast('Signed in'); if (then) then(); });
    $('#authSwitch').onclick = () => authModal(mode === 'signup' ? 'signin' : 'signup', then);
  }
  function requireLogin(then) { if (me) return then(); authModal('signup', then); }

  /* ---------------- save bar on the design page ---------------- */
  const defaultName = () => `${A().design.team.name || 'My team'} ${UB.KIT_NAMES[A().design.active]} jersey`;
  function refreshSaveBar() {
    const nameEl = $('#projName'), status = $('#saveStatus');
    if (!nameEl) return;
    if (document.activeElement !== nameEl) nameEl.value = current ? current.name : '';
    nameEl.placeholder = defaultName();
    const ws = activeWs();
    const btn = $('#saveBtn');
    if (!me) status.textContent = 'Log in to save designs to your team.';
    else if (current && A().design && current.savedHash === designHash()) status.textContent = `Saved to ${(spaces.find((w) => w.id === current.wsId) || {}).name || 'your library'} · ${ago(current.savedAt)}`;
    else if (current) status.textContent = 'Unsaved changes.';
    else status.textContent = `Not saved yet. It will go to ${ws ? ws.name : 'your library'}.`;
    btn.textContent = current && me ? 'Save new version' : 'Save to library';
  }
  document.addEventListener('dj:design', () => refreshSaveBar());

  async function thumb() {
    const c = document.createElement('canvas');
    await A().paint(A().design, A().kit(), c, 300);
    return c.toDataURL('image/jpeg', 0.8);
  }
  async function saveCurrent() {
    if (!me) return authModal('signup', saveCurrent);
    let ws = activeWs();
    if (ws && !api().can(ws.role, 'edit')) {
      const own = spaces.find((w) => w.role === 'owner');
      if (!own) return A().toast('You can only view this team. Create a team of your own to save copies.');
      ws = own; A().toast(`You’re a viewer on ${activeWs().name}, so this is saved to ${own.name}.`);
    }
    const name = $('#projName').value.trim() || defaultName();
    const res = await run(async () => api().saveProject({ wsId: ws.id, id: current && current.wsId === ws.id ? current.projectId : undefined, name, design: A().design, thumb: await thumb() }));
    if (!res) return;
    setActiveWs(ws.id);
    setCurrent({ projectId: res.id, wsId: ws.id, name: res.name, savedHash: designHash(), savedAt: res.updated });
    A().toast(`Saved to ${ws.name}`);
  }
  function wireDesignPage() {
    $('#saveBtn').addEventListener('click', saveCurrent);
    $('#shareBtn').addEventListener('click', () => shareDialog(A().design, ($('#projName').value.trim() || defaultName())));
    $('#socialBtn').addEventListener('click', socialDialog);
    $('#projName').addEventListener('input', (e) => { if (current) { current.name = e.target.value; store.set(CUR_KEY, current); } });
  }

  /* ---------------- library ---------------- */
  let libFolder = '', libQuery = '';
  async function renderLibrary() {
    const box = $('#libraryBox'), ws = activeWs();
    if (!ws) { box.innerHTML = '<h1 class="step-title wide" id="libTitle">Saved designs</h1><p class="lede narrow">You’re not on a team yet.</p>'; return; }
    const list = await run(() => api().projects(ws.id)) || [];
    const folders = [...new Set(list.map((p) => p.folder).filter(Boolean))].sort();
    if (libFolder && !folders.includes(libFolder)) libFolder = '';
    const shown = list.filter((p) => (!libFolder || p.folder === libFolder) && (!libQuery || p.name.toLowerCase().includes(libQuery.toLowerCase())));
    const edit = api().can(ws.role, 'edit');
    box.innerHTML =
      `<div class="page-head"><div><h1 class="step-title wide" id="libTitle">Saved designs</h1><p class="hint">${esc(ws.name)} · ${ROLE[ws.role]}${edit ? '' : ' · view only'}</p></div>` +
      `<div class="head-tools">${spaces.length > 1 ? `<select class="select" id="wsSelect" aria-label="Team">${spaces.map((w) => `<option value="${w.id}"${w.id === ws.id ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select>` : ''}` +
      `${edit ? '<button class="btn primary" id="newDesign" type="button">New design</button>' : ''}</div></div>` +
      (list.length > 1 || libQuery ? `<div class="lib-tools"><input class="text-input search" id="libSearch" type="search" placeholder="Search designs" value="${esc(libQuery)}" aria-label="Search designs">` +
        `${folders.length ? `<div class="pills small" role="radiogroup" aria-label="Folder"><button class="pill" type="button" role="radio" data-folder="" aria-checked="${!libFolder}">All</button>${folders.map((f) => `<button class="pill" type="button" role="radio" data-folder="${esc(f)}" aria-checked="${libFolder === f}">${esc(f)}</button>`).join('')}</div>` : ''}</div>` : '') +
      (shown.length ? `<div class="cards">${shown.map((p) => cardHtml(p, edit)).join('')}</div>`
        : `<div class="empty"><h2>${list.length ? 'Nothing matches' : 'No designs yet'}</h2><p class="hint">${list.length ? 'Try a different search or folder.' : 'Build a design on the Home tab and press “Save to library”. It’s kept here with every version.'}</p>${edit && !list.length ? '<button class="btn primary lg" id="newDesign2" type="button">Start your first design</button>' : ''}</div>`);
  }
  const cardHtml = (p, edit) =>
    `<div class="card lib-card" data-id="${p.id}"><button class="card-img" type="button" data-open="${p.id}" aria-label="Open ${esc(p.name)}">${p.thumb ? `<img src="${p.thumb}" alt="">` : ''}</button>` +
    `<div class="card-meta"><strong>${esc(p.name)}</strong><span>${p.folder ? esc(p.folder) + ' · ' : ''}${ago(p.updated)} · ${p.versions} version${p.versions === 1 ? '' : 's'}${p.by ? ' · ' + esc(p.by) : ''}</span></div>` +
    `<div class="card-actions"><button class="link" type="button" data-open="${p.id}">Open</button><button class="link" type="button" data-share="${p.id}">Share</button>` +
    `<details class="more"><summary>More</summary><div class="menu-pop"><button type="button" data-versions="${p.id}">Versions</button>${edit ? `<button type="button" data-rename="${p.id}">Rename</button><button type="button" data-dup="${p.id}">Duplicate</button><button type="button" data-move="${p.id}">Move to folder</button><button type="button" data-del="${p.id}" class="danger">Delete</button>` : ''}</div></details></div></div>`;

  async function openProject(id, versionId) {
    const meta = await run(() => api().project(id)); if (!meta) return;
    const d = await run(() => api().loadVersion(id, versionId)); if (!d) return;
    A().setDesign(d);
    setCurrent({ projectId: id, wsId: meta.wsId, name: meta.name, savedHash: versionId ? '' : designHash(), savedAt: meta.updated });
    A().go('#design');
  }
  function promptModal(title, label, value, cta, onOk, extra = '') {
    A().openModal(title, `<label class="field"><span>${label}</span><input class="text-input full" id="pmInput" value="${esc(value)}" maxlength="60" autocomplete="off"></label>${extra}<p class="form-error" id="pmError" hidden></p>`, [
      { label: cta, primary: true, run: () => { const v = $('#pmInput').value; run(async () => { await onOk(v); A().closeModal(); }, $('#pmError')); return false; } },
    ]);
    setTimeout(() => { const i = $('#pmInput'); if (i) { i.focus(); i.select(); } }, 30);
    $('#pmInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#modalActions .btn.primary').click(); } });
  }
  document.addEventListener('click', async (e) => {
    const t = e.target, box = t.closest('#libraryBox');
    if (!box) return;
    const id = (a) => { const el = t.closest(`[data-${a}]`); return el && el.dataset[a]; };
    const ws = activeWs();
    if (t.closest('#newDesign, #newDesign2')) {
      const brand = await run(() => api().brand(ws.id));
      A().newDesign(brand); setCurrent(null); A().go('#design'); return;
    }
    if (id('open')) return openProject(id('open'));
    if (id('share')) { const d = await run(() => api().loadVersion(id('share'))); const m = await run(() => api().project(id('share'))); if (d && m) shareDialog(d, m.name); return; }
    if (id('versions')) return versionsDialog(id('versions'));
    if (id('rename')) { const m = await run(() => api().project(id('rename'))); return promptModal('Rename design', 'Name', m.name, 'Rename', async (v) => { await api().renameProject(m.id, v); if (current && current.projectId === m.id) setCurrent({ ...current, name: v }); renderLibrary(); }); }
    if (id('dup')) { await run(() => api().duplicateProject(id('dup'))); A().toast('Duplicated'); return renderLibrary(); }
    if (id('move')) {
      const m = await run(() => api().project(id('move')));
      const known = [...new Set((await api().projects(ws.id)).map((p) => p.folder).filter(Boolean))];
      return promptModal('Move to folder', 'Folder name (leave empty for none)', m.folder, 'Move', async (v) => { await api().moveProject(m.id, v); renderLibrary(); }, known.length ? `<p class="hint">Existing: ${known.map(esc).join(', ')}</p>` : '');
    }
    if (id('del')) {
      const m = await run(() => api().project(id('del')));
      A().openModal('Delete this design?', `<p>“${esc(m.name)}” and all ${m.versions.length} version${m.versions.length === 1 ? '' : 's'} will be removed for everyone on the team. This can’t be undone.</p>`, [
        { label: 'Delete', primary: true, run: () => { run(async () => { await api().deleteProject(m.id); if (current && current.projectId === m.id) setCurrent(null); A().closeModal(); renderLibrary(); }); return false; } }]);
      return;
    }
    const f = t.closest('[data-folder]');
    if (f) { libFolder = f.dataset.folder; renderLibrary(); }
  });
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'wsSelect') return;
    setActiveWs(e.target.value); libFolder = ''; assetKind = 'all'; renderHeader();
    if (curRoute === 'saved') renderLibrary(); if (curRoute === 'assets') renderAssets(); if (curRoute === 'account') renderTeam();
  });
  document.addEventListener('input', (e) => { if (e.target.id === 'libSearch') { libQuery = e.target.value; clearTimeout(renderLibrary.t); renderLibrary.t = setTimeout(async () => { await renderLibrary(); const s = $('#libSearch'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }, 200); } });

  async function versionsDialog(id) {
    const m = await run(() => api().project(id)); if (!m) return;
    const edit = api().can((spaces.find((w) => w.id === m.wsId) || {}).role, 'edit');
    A().openModal(`Versions of “${m.name}”`, `<div class="versions">${m.versions.map((v, i) =>
      `<div class="version"><img src="${v.thumb || ''}" alt=""><div><strong>${i === 0 ? 'Latest' : esc(v.label)}</strong><span>${new Date(v.at).toLocaleString()} · ${esc(v.byName || '')}</span></div><button class="btn sm" type="button" data-ver="${v.id}">${edit ? 'Restore' : 'Open'}</button></div>`).join('')}</div>` +
      '<p class="hint">Restoring opens that version in the designer. Press Save to keep it as the newest version.</p>', []);
    $('#modalBody').onclick = (e) => { const b = e.target.closest('[data-ver]'); if (b) { A().closeModal(); openProject(id, b.dataset.ver); } };
  }

  /* ---------------- team (a section of Account) ---------------- */
  async function renderTeam() {
    const box = $('#teamBox'), ws = activeWs();
    if (!box) return;
    if (!ws) { box.innerHTML = ''; return; }
    const owner = ws.role === 'owner';
    const members = await run(() => api().members(ws.id));
    box.innerHTML =
      `<h2 class="section-title sm">Team</h2><div class="inline-form"><select class="select" id="wsSelect" aria-label="Team">${spaces.map((w) => `<option value="${w.id}"${w.id === ws.id ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select><button class="btn" id="newTeam" type="button">New team</button></div>` +
      `<p class="hint">Your role: ${ROLE[ws.role]}. Saved designs and assets belong to the team, so everyone on it shares them.</p>` +
      `<div class="inline-form"><input class="text-input wide" id="teamName" value="${esc(ws.name)}" maxlength="40" aria-label="Team name"${owner ? '' : ' disabled'}>${owner ? '<button class="btn" id="renameTeam" type="button">Rename</button>' : ''}</div>` +
      `<h3 class="sub-label">Members</h3><div class="members">${(members || []).map((m) =>
        `<div class="member"><span class="avatar sm">${esc(initials(m.name))}</span><div class="member-who"><strong>${esc(m.name)}${m.userId === me.id ? ' (you)' : ''}</strong><span>${esc(m.email)}${m.status === 'invited' ? ` · invited · code <b class="code">${esc(m.code || '')}</b>` : ''}</span></div>` +
        (owner && m.role !== 'owner' ? `<select class="select sm" data-role="${esc(m.userId)}" aria-label="Role for ${esc(m.name)}"><option value="editor"${m.role === 'editor' ? ' selected' : ''}>Editor</option><option value="viewer"${m.role === 'viewer' ? ' selected' : ''}>Viewer</option></select><button class="link danger" type="button" data-remove="${esc(m.userId)}">Remove</button>` : `<span class="role-tag">${ROLE[m.role]}</span>`) + '</div>').join('')}</div>` +
      (owner ? `<h3 class="sub-label">Invite someone</h3><div class="inline-form"><input class="text-input wide" id="invEmail" type="email" placeholder="name@team.com" aria-label="Email to invite"><select class="select" id="invRole" aria-label="Role"><option value="editor">Editor</option><option value="viewer">Viewer</option></select><button class="btn primary" id="inviteBtn" type="button">Invite</button></div>` +
        '<p class="hint">Editors can create and change designs and assets. Viewers can only look. You’ll get an invite code to send them; they sign up with that email and enter the code under “Join a team”.</p>' : '') +
      '<p class="form-error" id="teamError" role="alert" hidden></p>' +
      `<h3 class="sub-label">Join a team</h3><div class="inline-form"><input class="text-input wide" id="joinCode" placeholder="Invite code" aria-label="Invite code"><button class="btn" id="joinBtn" type="button">Join</button></div>` +
      `<div class="inline-form team-danger">${owner ? '<button class="btn danger-btn" id="delTeam" type="button">Delete this team</button>' : '<button class="btn danger-btn" id="leaveTeam" type="button">Leave this team</button>'}</div>`;
  }
  document.addEventListener('click', async (e) => {
    const t = e.target, box = t.closest('#teamBox');
    if (!box) return;
    const ws = activeWs(), err = $('#teamError');
    if (err) err.hidden = true;
    if (t.closest('#newTeam')) return promptModal('New team', 'Team name', '', 'Create', async (v) => { const w = await api().createWorkspace(v); await refresh(); setActiveWs(w.id); renderTeam(); });
    if (t.closest('#renameTeam')) { await run(async () => { await api().renameWorkspace(ws.id, $('#teamName').value); await refresh(); renderTeam(); A().toast('Renamed'); }, err); return; }
    if (t.closest('#inviteBtn')) {
      await run(async () => {
        const { code } = await api().invite(ws.id, $('#invEmail').value, $('#invRole').value);
        A().openModal('Invite created', `<p>Send this code to <b>${esc($('#invEmail').value)}</b>:</p><p class="code-big">${esc(code)}</p><p class="hint">They create an account with that email, open Account, and enter the code under “Join a team”.</p>`, [{ label: 'Copy code', primary: true, run: () => { copyText(code, 'Code copied'); return false; } }]);
        renderTeam();
      }, err); return;
    }
    if (t.closest('#joinBtn')) { await run(async () => { const n = await api().joinWithCode($('#joinCode').value); await refresh(); A().toast(`You joined ${n}`); renderTeam(); }, err); return; }
    const rm = t.closest('[data-remove]');
    if (rm) { await run(async () => { await api().removeMember(ws.id, rm.dataset.remove); renderTeam(); }, err); return; }
    if (t.closest('#delTeam')) return A().openModal('Delete this team?', `<p>“${esc(ws.name)}” and all of its designs and assets will be deleted for every member. This can’t be undone.</p>`, [{ label: 'Delete team', primary: true, run: () => { run(async () => { await api().deleteWorkspace(ws.id); await refresh(); A().closeModal(); renderTeam(); }, err); return false; } }]);
    if (t.closest('#leaveTeam')) { await run(async () => { await api().leaveWorkspace(ws.id); await refresh(); renderTeam(); A().toast('You left the team'); }, err); }
  });
  document.addEventListener('change', async (e) => {
    if (!e.target.closest('#teamBox')) return;
    if (e.target.dataset.role) await run(async () => { await api().setRole(activeWs().id, e.target.dataset.role, e.target.value); }, $('#teamError'));
  });

  /* ---------------- assets (shared by the whole team) ---------------- */
  const KINDS = { crest: 'Crest', sponsor: 'Sponsor', patch: 'Patch', other: 'Other' };
  const SLOT_FOR_USE = [['crest', 'Chest crest'], ['sponsor', 'Sponsor'], ['captain', 'Captaincy patch'], ['shoulders', 'Shoulder patches'], ['neck', 'Collar'], ['pantsL', 'Left pants leg'], ['pantsR', 'Right pants leg']];
  const KIND_FOR_SLOT = { crest: 'crest', sponsor: 'sponsor', captain: 'patch', shoulders: 'patch' };
  let assetKind = 'all', uploadKind = 'other', assetCache = [];
  async function renderAssets() {
    const box = $('#assetsBox'), ws = activeWs();
    if (!ws) { box.innerHTML = ''; return; }
    const edit = api().can(ws.role, 'edit');
    const list = (await run(() => api().assets(ws.id))) || [];
    const brand = await run(() => api().brand(ws.id));
    assetCache = list;
    const counts = Object.fromEntries(Object.keys(KINDS).map((k) => [k, list.filter((a) => a.kind === k).length]));
    const shown = list.filter((a) => assetKind === 'all' || a.kind === assetKind);
    const b = brand || { palette: A().design.team.palette.slice(), teamName: A().design.team.name, crest: null, sponsor: null };
    const opts = (cur) => '<option value="">None</option>' + list.map((a) => `<option value="${a.id}"${a.image && a.image === cur ? ' selected' : ''}>${esc(a.name)}</option>`).join('');
    box.innerHTML =
      `<div class="page-head"><div><h1 class="step-title wide" id="assetsTitle">Assets</h1><p class="hint">${esc(ws.name)} · shared with everyone on the team${edit ? '' : ' · view only'}</p></div>` +
      `<div class="head-tools">${spaces.length > 1 ? `<select class="select" id="wsSelect" aria-label="Team">${spaces.map((w) => `<option value="${w.id}"${w.id === ws.id ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</select>` : ''}</div></div>` +
      (edit ? `<div class="asset-drop" id="assetDrop"><button type="button" id="assetPick" class="asset-drop-btn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V4M7.5 8.5 12 4l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/></svg><strong>Drop logos here, or click to upload</strong><span>Crests, sponsors, patches and any other image. PNGs with a transparent background work best; plain-background JPGs get a clean-up step.</span></button>` +
        `<label class="asset-kind">Add as <select class="select sm" id="assetKind" aria-label="Type">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${(uploadKind === k) ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div><input type="file" id="assetFile" accept="image/*" multiple hidden>` : '') +
      `<div class="lib-tools"><div class="pills small" role="radiogroup" aria-label="Type"><button class="pill" type="button" role="radio" data-afilter="all" aria-checked="${assetKind === 'all'}">All ${list.length}</button>${Object.entries(KINDS).map(([k, v]) => `<button class="pill" type="button" role="radio" data-afilter="${k}" aria-checked="${assetKind === k}">${v} ${counts[k]}</button>`).join('')}</div></div>` +
      (shown.length ? `<div class="cards asset-grid">${shown.map((a) => `<div class="card asset-card" data-asset="${a.id}"><div class="asset-img"><img src="${a.image || ''}" alt="${esc(a.name)}"></div><div class="card-meta"><strong>${esc(a.name)}</strong><span>${KINDS[a.kind]} · ${ago(a.created)}${a.byName ? ' · ' + esc(a.byName) : ''}</span></div>` +
        `<div class="card-actions"><button class="link" type="button" data-use="${a.id}">Use in design</button>${edit ? `<details class="more"><summary>More</summary><div class="menu-pop"><button type="button" data-aren="${a.id}">Rename</button><button type="button" data-akind="${a.id}">Change type</button><button type="button" class="danger" data-adel="${a.id}">Delete</button></div></details>` : ''}</div></div>`).join('')}</div>`
        : `<div class="empty"><h2>${list.length ? 'Nothing of that type yet' : 'No assets yet'}</h2><p class="hint">${edit ? 'Upload your team’s logos above. They’re then one click away on the Home tab.' : 'Ask an editor or the owner to upload some.'}</p></div>`) +
      `<h2 class="section-title sm brand-title">Brand colours and defaults</h2><p class="hint first">New designs start with these. Change them once and every new design follows.</p>` +
      `<div class="brand-sw" id="brandSw">${b.palette.map((c, i) => `<label class="team-sw" style="--c:${c}"><span></span>${UB.PALETTE_SLOTS[i]}<input type="color" value="${c}" data-brand-slot="${i}"${edit ? '' : ' disabled'}></label>`).join('')}</div>` +
      `<div class="field-row brand-fields"><label class="field"><span>Team name on designs</span><input class="text-input wide" id="brandName" value="${esc(b.teamName || '')}" maxlength="40"${edit ? '' : ' disabled'}></label>` +
      `<label class="field"><span>Default crest</span><select class="select" id="brandCrest"${edit ? '' : ' disabled'}>${opts(b.crest)}</select></label><label class="field"><span>Default sponsor</span><select class="select" id="brandSponsor"${edit ? '' : ' disabled'}>${opts(b.sponsor)}</select></label></div>` +
      (edit ? '<div class="inline-form"><button class="btn primary" id="saveBrand" type="button">Save brand colours</button><button class="btn" id="applyBrand" type="button">Use on the open design</button></div>' : '');
    box._palette = b.palette.slice();
  }
  const assetById = (id) => assetCache.find((a) => a.id === id);
  async function addFiles(files) {
    const ws = activeWs(), kind = ($('#assetKind') || {}).value || 'other';
    let n = 0;
    for (const f of files) {
      const img = await run(() => A().prepareImage(f));
      if (!img) continue;
      const ok = await run(() => api().addAsset({ wsId: ws.id, name: f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '), kind, image: img }));
      if (ok) n++;
    }
    if (n) { A().toast(`${n} asset${n === 1 ? '' : 's'} added`); renderAssets(); }
  }
  document.addEventListener('click', async (e) => {
    const t = e.target, box = t.closest('#assetsBox');
    if (!box) return;
    const ws = activeWs(), id = (a) => { const el = t.closest(`[data-${a}]`); return el && el.dataset[a]; };
    if (t.closest('#assetPick')) { $('#assetFile').click(); return; }
    const af = t.closest('[data-afilter]');
    if (af) { assetKind = af.dataset.afilter; if (assetKind !== 'all') uploadKind = assetKind; renderAssets(); return; }
    if (id('use')) {
      const a = assetById(id('use'));
      A().openModal(`Use “${esc(a.name)}” in the design`, `<p class="hint first">Where should it go?</p><div class="pills">${SLOT_FOR_USE.map(([k, l]) => `<button class="pill" type="button" data-slot-use="${k}">${l}</button>`).join('')}</div>`, []);
      $('#modalBody').onclick = (ev) => { const b = ev.target.closest('[data-slot-use]'); if (!b) return; A().setLogo(b.dataset.slotUse, a.image); A().closeModal(); A().go('#home'); A().toast(`Added to ${A().slotLabel(b.dataset.slotUse).toLowerCase()}`); };
      return;
    }
    if (id('aren')) { const a = assetById(id('aren')); return promptModal('Rename asset', 'Name', a.name, 'Rename', async (v) => { await api().updateAsset(a.id, { name: v }); renderAssets(); }); }
    if (id('akind')) {
      const a = assetById(id('akind'));
      return A().openModal('Change type', `<label class="field"><span>Type</span><select class="select" id="kindSel">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}"${a.kind === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`, [{ label: 'Save', primary: true, run: () => { run(async () => { await api().updateAsset(a.id, { kind: $('#kindSel').value }); A().closeModal(); renderAssets(); }); return false; } }]);
    }
    if (id('adel')) {
      const a = assetById(id('adel'));
      return A().openModal('Delete this asset?', `<p>“${esc(a.name)}” will be removed for everyone on the team. Designs that already use it keep their copy.</p>`, [{ label: 'Delete', primary: true, run: () => { run(async () => { await api().deleteAsset(a.id); A().closeModal(); renderAssets(); }); return false; } }]);
    }
    if (t.closest('#saveBrand') || t.closest('#applyBrand')) {
      const brand = { palette: box._palette, teamName: $('#brandName').value, crest: (assetById($('#brandCrest').value) || {}).image || null, sponsor: (assetById($('#brandSponsor').value) || {}).image || null };
      if (t.closest('#saveBrand')) { await run(async () => { await api().setBrand(ws.id, brand); A().toast('Brand colours saved'); }); return; }
      const d = JSON.parse(JSON.stringify(A().design));
      d.team.palette = brand.palette.slice(); if (brand.teamName) d.team.name = brand.teamName;
      if (brand.crest) { d.crest.image = brand.crest; d.crest.style = 'image'; }
      if (brand.sponsor) d.photoLogos = { ...(d.photoLogos || {}), sponsor: brand.sponsor };
      A().setDesign(d); A().toast('Applied to the open design'); A().go('#home');
    }
  });
  document.addEventListener('change', (e) => {
    const box = e.target.closest('#assetsBox');
    if (!box) return;
    if (e.target.id === 'assetKind') uploadKind = e.target.value;
    if (e.target.id === 'assetFile' && e.target.files.length) { const files = [...e.target.files]; e.target.value = ''; addFiles(files); }
    if (e.target.dataset.brandSlot !== undefined) { box._palette[+e.target.dataset.brandSlot] = e.target.value; e.target.closest('.team-sw').style.setProperty('--c', e.target.value); }
  });
  document.addEventListener('dragover', (e) => { const z = e.target.closest('#assetDrop'); if (z) { e.preventDefault(); z.classList.add('is-over'); } });
  document.addEventListener('dragleave', (e) => { const z = e.target.closest('#assetDrop'); if (z && !z.contains(e.relatedTarget)) z.classList.remove('is-over'); });
  document.addEventListener('drop', (e) => { const z = e.target.closest('#assetDrop'); if (!z) return; e.preventDefault(); z.classList.remove('is-over'); addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))); });

  /* The designer's logo boxes: pick from the team's assets, or save an upload to them. */
  document.addEventListener('click', async (e) => {
    const box = e.target.closest('#drops .drop');
    if (!box) return;
    const slot = box.dataset.drop;
    if (e.target.closest('[data-asset-pick]')) {
      if (!me) return authModal('signup', () => {});
      const ws = activeWs();
      const list = (await run(() => api().assets(ws.id))) || [];
      A().openModal('Choose from your assets', list.length
        ? `<div class="asset-picker">${list.map((a) => `<button class="asset-pick-item" type="button" data-pick-asset="${a.id}"><span class="asset-img"><img src="${a.image || ''}" alt=""></span><span>${esc(a.name)}</span></button>`).join('')}</div>`
        : '<p>There’s nothing here yet. <a href="#assets">Upload your team’s logos on the Assets tab</a>.</p>', []);
      $('#modalBody').onclick = (ev) => { const b = ev.target.closest('[data-pick-asset]'); if (!b) { if (ev.target.closest('a')) A().closeModal(); return; } const a = list.find((x) => x.id === b.dataset.pickAsset); A().setLogo(slot, a.image); A().closeModal(); A().toast(`${a.name} added`); };
    }
    if (e.target.closest('[data-asset-save]')) {
      if (!me) return authModal('signup', () => {});
      const ws = activeWs(), img = A().getLogo(slot);
      if (!ws || !api().can(ws.role, 'edit')) return A().toast('Only editors and owners can add assets.');
      promptModal('Save to assets', 'Name', A().slotLabel(slot), 'Save', async (v) => { await api().addAsset({ wsId: ws.id, name: v, kind: KIND_FOR_SLOT[slot] || 'other', image: img }); A().toast('Saved to assets'); });
    }
  });

  /* ---------------- account ---------------- */
  function renderAccount() {
    $('#accountBox').innerHTML = `<h1 class="step-title wide" id="accTitle">Account</h1><p class="hint demo first">${DEMO}</p>` +
      `<h2 class="section-title sm">Profile</h2><form id="profileForm" class="stack"><label class="field"><span>Name</span><input class="text-input full" name="name" value="${esc(me.name)}" required></label><label class="field"><span>Email</span><input class="text-input full" value="${esc(me.email)}" disabled></label><p class="form-error" hidden></p><button class="btn primary" type="submit">Save</button></form>` +
      `<div id="teamBox"></div>` +
      `<h2 class="section-title sm">Change password</h2><form id="pwForm" class="stack"><label class="field"><span>Current password</span><input class="text-input full" name="current" type="password" autocomplete="current-password" required></label><label class="field"><span>New password</span><input class="text-input full" name="next" type="password" autocomplete="new-password" minlength="8" required></label><p class="form-error" hidden></p><button class="btn" type="submit">Change password</button></form>` +
      `<h2 class="section-title sm">Your data</h2><div class="inline-form"><button class="btn" id="exportData" type="button">Download my data</button><button class="btn" id="logout2" type="button">Log out</button></div>` +
      `<h2 class="section-title sm">Delete account</h2><p class="hint first">Removes your account and any team you own, with its designs and assets.</p><button class="btn danger-btn" id="delAccount" type="button">Delete my account</button>`;
    renderTeam();
  }
  document.addEventListener('submit', async (e) => {
    const f = e.target;
    if (f.id !== 'profileForm' && f.id !== 'pwForm') return;
    e.preventDefault();
    const err = $('.form-error', f); err.hidden = true;
    const data = Object.fromEntries(new FormData(f));
    await run(async () => {
      if (f.id === 'profileForm') { await api().updateProfile(data); await refresh(); A().toast('Saved'); }
      else { await api().changePassword(data); f.reset(); A().toast('Password changed'); }
    }, err);
  });
  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#accountBox')) return;
    if (e.target.closest('#logout2')) { await api().logOut(); setCurrent(null); await refresh(); A().go('#home'); }
    if (e.target.closest('#exportData')) { const d = await run(() => api().exportData()); if (d) download(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' }), 'digital-jersey-data.json'); }
    if (e.target.closest('#delAccount')) promptModal('Delete your account?', 'Type DELETE to confirm', '', 'Delete account', async (v) => {
      if (v.trim() !== 'DELETE') throw new Error('Type DELETE in capitals to confirm.');
      await api().deleteAccount(); setCurrent(null); await refresh(); A().go('#home'); A().toast('Account deleted');
    });
  });

  /* ---------------- share dialog ---------------- */
  function shareDialog(design, title) {
    const team = (activeWs() && activeWs().name) || design.team.name || '';
    A().openModal('Share a private link', `<div class="stack">
      <label class="field"><span>Title</span><input class="text-input full" id="shTitle" value="${esc(title)}" maxlength="80"></label>
      <label class="field"><span>Message (optional)</span><textarea class="text-input full" id="shMsg" rows="2" maxlength="300" placeholder="For approval before Friday’s launch."></textarea></label>
      <div class="field-row"><label class="field"><span>Password (optional)</span><input class="text-input" id="shPw" type="text" autocomplete="off" placeholder="None"></label>
      <label class="field"><span>Hidden until (optional)</span><input class="text-input" id="shEmbargo" type="datetime-local"></label></div>
      <label class="check"><input type="checkbox" id="shDl"><span>Let viewers download the image</span></label>
      <p class="form-error" id="shErr" hidden></p>
      <div id="shResult" hidden><label class="field"><span>Your link</span><input class="text-input full" id="shUrl" readonly></label><p class="hint" id="shNote"></p></div>
      <details class="how"><summary>How private is this?</summary><p class="hint">The link holds a copy of the design, so nothing is stored online. With a password, the design is encrypted and can’t be opened without it. The “hidden until” date is checked by the page that opens the link, so it keeps honest people honest but isn’t a guarantee. A link can’t be switched off once sent. Later edits don’t change old links.</p></details></div>`, [
      { label: 'Create link', primary: true, run: () => {
        const err = $('#shErr'); err.hidden = true;
        run(async () => {
          const embargo = $('#shEmbargo').value ? new Date($('#shEmbargo').value).toISOString() : '';
          const r = await UB.share.create({ title: $('#shTitle').value.trim() || title, team, message: $('#shMsg').value.trim(), embargo, password: $('#shPw').value, download: $('#shDl').checked, design });
          $('#shUrl').value = r.url; $('#shResult').hidden = false;
          $('#shNote').innerHTML = r.length > 9000 ? '<b>This link is long.</b> It works in browsers and email, but some apps cut long links. Smaller logos make shorter links.' : 'Anyone with this link' + ($('#shPw').value ? ' and the password' : '') + ' can see this design.';
          const b = $('#modalActions .btn.primary'); b.textContent = 'Copy link'; b.onclick = () => { $('#shUrl').select(); copyText(r.url, 'Link copied'); };
        }, err);
        return false;
      } }]);
  }

  /* ---------------- social post dialog ---------------- */
  function socialDialog() {
    const d = A().design, S = UB.social, o = { preset: 'post', scope: 'one', bg: 'ice', showTeam: true, showLogo: true };
    const headDefault = () => (o.scope === 'one' ? `New ${UB.KIT_NAMES[d.active]}\njersey` : 'The full\nset');
    o.headline = headDefault(); o.sub = '';
    const pills = (key, map, cur) => `<div class="pills small" role="radiogroup" data-sp="${key}">${Object.entries(map).map(([k, v]) => `<button class="pill" type="button" role="radio" data-val="${k}" aria-checked="${k === cur}">${esc(typeof v === 'string' ? v : v.label)}</button>`).join('')}</div>`;
    A().openModal('Social post', `<div class="social"><div class="social-prev"><canvas id="spCanvas" width="540" height="675"></canvas><video id="spVideo" controls hidden></video></div><div class="social-ctl">
      <p class="sub-label first">Size</p>${pills('preset', S.PRESETS, o.preset)}
      <p class="sub-label">Show</p>${pills('scope', { one: 'This kit', all: 'All three kits' }, o.scope)}
      <p class="sub-label">Background</p>${pills('bg', S.BACKGROUNDS, o.bg)}
      <label class="field"><span>Headline</span><textarea class="text-input full" id="spHead" rows="2" maxlength="40">${esc(o.headline)}</textarea></label>
      <label class="field"><span>Line under it</span><input class="text-input full" id="spSub" maxlength="60" placeholder="2026–27 season · On sale Friday"></label>
      <label class="check"><input type="checkbox" id="spTeam" checked><span>Team and kit name in the footer</span></label>
      <label class="check"><input type="checkbox" id="spLogo" checked><span>Logo in the footer</span></label>
      <p class="hint" id="spNote"></p></div></div>`, [
      { label: 'Download PNG', primary: true, run: async () => { const c = await build(); c.toBlob((b) => download(b, `${A().slug()}-${o.scope === 'one' ? d.active : 'set'}-${o.preset}.png`)); return false; } },
      { label: 'Reveal video', run: () => { makeVideo(); return false; } },
    ], { wide: true });
    const kits = () => (o.scope === 'one' ? [d.active] : ['home', 'away', 'third']);
    const build = () => S.compose({ design: d, kits: kits(), preset: o.preset, bg: o.bg, headline: o.headline, sub: o.sub, showTeam: o.showTeam, showLogo: o.showLogo });
    let timer = 0, seq = 0;
    const preview = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const my = ++seq, full = await build();
        if (my !== seq) return;
        const cv = $('#spCanvas'); if (!cv) return;
        $('#spVideo').hidden = true; cv.hidden = false;
        const k = Math.min(1, 560 / full.width, 520 / full.height * 1.3);
        cv.width = Math.round(full.width * k); cv.height = Math.round(full.height * k);
        cv.getContext('2d').drawImage(full, 0, 0, cv.width, cv.height);
        $('#spNote').textContent = `${S.PRESETS[o.preset].w} × ${S.PRESETS[o.preset].h} px`;
      }, 160);
    };
    async function makeVideo() {
      const note = $('#spNote'); note.textContent = 'Recording… this takes about ten seconds.';
      const r = await run(() => S.video({ design: d, kits: ['home', 'away', 'third'], preset: o.preset, bg: o.bg, sub: o.sub, showTeam: o.showTeam, showLogo: o.showLogo }, (p) => { note.textContent = `Recording… ${Math.round(p * 100)}%`; }), note);
      if (!r) return;
      const v = $('#spVideo'); v.src = URL.createObjectURL(r); v.hidden = false; $('#spCanvas').hidden = true; v.play().catch(() => {});
      note.innerHTML = `Done (${(r.size / 1048576).toFixed(1)} MB). <button class="link" type="button" id="spSave">Download video</button>`;
      $('#spSave').onclick = () => download(r, `${A().slug()}-reveal.webm`);
    }
    $('#modalBody').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sp] .pill'); if (!b) return;
      const key = b.closest('[data-sp]').dataset.sp; o[key] = b.dataset.val;
      $$('.pill', b.parentElement).forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      if (key === 'scope') { o.headline = headDefault(); $('#spHead').value = o.headline; }
      preview();
    });
    $('#spHead').addEventListener('input', (e) => { o.headline = e.target.value; preview(); });
    $('#spSub').addEventListener('input', (e) => { o.sub = e.target.value; preview(); });
    $('#spTeam').addEventListener('change', (e) => { o.showTeam = e.target.checked; preview(); });
    $('#spLogo').addEventListener('change', (e) => { o.showLogo = e.target.checked; preview(); });
    preview();
  }

  /* ---------------- reveal page (opened from a share link) ---------------- */
  let countdown = 0;
  async function renderView(payload) {
    clearInterval(countdown);
    const box = $('#viewBox');
    const info = UB.share.peek(payload || '');
    if (!info.ok) { box.innerHTML = '<div class="empty"><h1 class="step-title wide" id="viewTitle">This link doesn’t work</h1><p class="hint">It may have been cut short when it was copied. Ask for it again.</p><a class="btn primary" href="#home">Go to Digital Jersey</a></div>'; return; }
    const head = info.head, until = head.e ? Date.parse(head.e) : 0;
    const shell = (inner) => `<div class="reveal-head"><p class="eyebrow">${esc(head.w || 'Jersey reveal')}</p><h1 class="step-title wide" id="viewTitle">${esc(head.t)}</h1></div>${inner}`;
    if (until && Date.now() < until) {
      const tick = () => { const s = Math.max(0, Math.round((until - Date.now()) / 1000)); if (s <= 0) { clearInterval(countdown); renderView(payload); return; } const el = $('#cd'); if (el) el.textContent = `${Math.floor(s / 86400)}d ${Math.floor(s % 86400 / 3600)}h ${Math.floor(s % 3600 / 60)}m ${s % 60}s`; };
      box.innerHTML = shell(`<div class="embargo"><p class="lede">This reveal is under embargo until <b>${new Date(until).toLocaleString()}</b>.</p><p class="countdown" id="cd"></p></div>`);
      tick(); countdown = setInterval(tick, 1000); return;
    }
    const show = async (design) => {
      const kits = Object.keys(UB.KIT_NAMES);
      let kit = design.active || 'home', sideBack = false;
      const draw = async () => {
        const cv = $('#vCanvas'), wrap = $('#vBack');
        $$('#vKits .pill').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.k === kit)));
        $$('#vSide .pill').forEach((b) => b.setAttribute('aria-checked', String((b.dataset.s === 'back') === sideBack)));
        cv.hidden = sideBack; wrap.hidden = !sideBack;
        if (sideBack) wrap.innerHTML = UB.render.jersey(design, design.kits[kit], 'back', { attrs: 'role="img" aria-label="Back of the jersey"' });
        else await A().paint(design, design.kits[kit], cv);
      };
      box.innerHTML = shell(`${head.m ? `<p class="lede narrow">${esc(head.m)}</p>` : ''}<div class="reveal"><div class="preview-card big"><canvas id="vCanvas" width="1098" height="1122"></canvas><div class="back-wrap" id="vBack" hidden></div></div>` +
        `<div class="reveal-side"><div class="pills" id="vKits" role="radiogroup" aria-label="Kit">${kits.map((k) => `<button class="pill" type="button" role="radio" data-k="${k}" aria-checked="false">${UB.KIT_NAMES[k]}</button>`).join('')}</div>` +
        `<div class="pills" id="vSide" role="radiogroup" aria-label="Side"><button class="pill" type="button" role="radio" data-s="front" aria-checked="true">Front</button><button class="pill" type="button" role="radio" data-s="back" aria-checked="false">Back</button></div>` +
        `<div class="reveal-actions">${head.dl ? '<button class="btn primary" id="vDl" type="button">Download image</button>' : ''}<button class="btn" id="vOpen" type="button">Open in the designer</button></div>` +
        '<p class="hint">Made with <a href="#home">Digital Jersey</a>. Design your own in minutes.</p></div></div>');
      box.querySelector('#vKits').onclick = (e) => { const b = e.target.closest('[data-k]'); if (b) { kit = b.dataset.k; draw(); } };
      box.querySelector('#vSide').onclick = (e) => { const b = e.target.closest('[data-s]'); if (b) { sideBack = b.dataset.s === 'back'; draw(); } };
      const dl = box.querySelector('#vDl'); if (dl) dl.onclick = () => { if (sideBack) { sideBack = false; } draw().then(() => $('#vCanvas').toBlob((b) => download(b, `${(head.t || 'jersey').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${kit}.png`))); };
      box.querySelector('#vOpen').onclick = () => { A().setDesign(design); setCurrent(null); A().go('#design'); };
      draw();
    };
    if (info.locked) {
      box.innerHTML = shell('<form class="auth-form" id="pwGate"><p class="lede">This reveal is protected.</p><label class="field"><span>Password</span><input class="text-input full" name="pw" type="password" autocomplete="off" required></label><p class="form-error" id="gateErr" hidden></p><button class="btn primary lg full" type="submit">View</button></form>');
      $('#pwGate').addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = $('#gateErr'); err.hidden = true;
        const r = await run(() => UB.share.open(payload, new FormData(e.target).get('pw')), err);
        if (r) show(A().normalize(r.design));
      });
      return;
    }
    const r = await run(() => UB.share.open(payload));
    if (r) show(A().normalize(r.design));
  }

  UB.saas = { init, route, requireLogin, refresh };
})();
