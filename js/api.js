/* =====================================================================
   Data layer (local demo).

   Every page talks to UB.api and nothing else. This file is the browser-only
   version: accounts, teams and designs are saved in this browser's storage,
   so they don't follow you to another device and the passwords are only as
   safe as the browser. To go live, write another object with the same methods
   (a database and sign-in service behind it) and assign it to UB.api.

   Methods (all return promises unless noted):
     me()                                   the signed-in user or null
     signUp({name,email,password})  logIn({email,password})  logOut()
     updateProfile({name})  changePassword({current,next})  deleteAccount()  exportData()
     workspaces()                           teams I belong to, with my role
     createWorkspace(name)  renameWorkspace(id,name)  deleteWorkspace(id)  leaveWorkspace(id)
     members(wsId)  invite(wsId,email,role) -> {code}  joinWithCode(code)
     setRole(wsId,userId,role)  removeMember(wsId,userId)
     brand(wsId)  setBrand(wsId,brand)
     projects(wsId)  project(id)  loadVersion(projectId,versionId)
     saveProject({wsId,id,name,folder,design,thumb,label})
     renameProject(id,name)  moveProject(id,folder)  duplicateProject(id)  deleteProject(id)
     can(wsRole, action)                    sync; action is "edit" or "admin"
   Roles: owner, editor, viewer.
   ===================================================================== */
(function () {
  const UB = window.UB;
  const DB_KEY = 'dj:db:v1', SESSION_KEY = 'dj:session:v1', MAX_VERSIONS = 25;
  const enc = (s) => new TextEncoder().encode(s);
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
  const fail = (msg) => { throw new Error(msg); };
  const fresh = () => ({ users: [], workspaces: [], members: [], invites: [], projects: [], assets: {} });

  let db = read();
  function read() { try { return JSON.parse(localStorage.getItem(DB_KEY)) || fresh(); } catch (e) { return fresh(); } }
  function persist() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); }
    catch (e) { db = read(); fail('This browser is out of room. Delete an old design or a large logo and try again.'); }
  }
  const sessionId = () => { try { return localStorage.getItem(SESSION_KEY); } catch (e) { return null; } };
  const setSession = (id) => { try { id ? localStorage.setItem(SESSION_KEY, id) : localStorage.removeItem(SESSION_KEY); } catch (e) { /* storage unavailable */ } };

  async function hashPw(pw, salt) {
    const key = await crypto.subtle.importKey('raw', enc(pw), 'PBKDF2', false, ['deriveBits']);
    return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: 120000 }, key, 256));
  }
  const pub = (u) => u && { id: u.id, email: u.email, name: u.name, created: u.created };
  const user = () => db.users.find((u) => u.id === sessionId()) || null;
  const need = () => user() || fail('Log in first.');
  const role = (wsId, uId) => (db.members.find((m) => m.wsId === wsId && m.userId === uId && m.status === 'active') || {}).role || null;
  const needRole = (wsId, min) => {
    const r = role(wsId, need().id);
    if (!r) fail('You aren’t a member of that team.');
    if (min === 'edit' && r === 'viewer') fail('Viewers can’t change this team’s designs.');
    if (min === 'admin' && r !== 'owner') fail('Only the team owner can do that.');
    return r;
  };

  /* Logos are stored once and referenced, so versions stay small. */
  const LOGO_PATHS = [['crest', 'image'], ['crest', 'patchImage']];
  function walkLogos(d, fn) {
    for (const [a, b] of LOGO_PATHS) if (d[a] && typeof d[a][b] === 'string') d[a][b] = fn(d[a][b]);
    if (d.photoLogos) for (const k of Object.keys(d.photoLogos)) if (typeof d.photoLogos[k] === 'string') d.photoLogos[k] = fn(d.photoLogos[k]);
    return d;
  }
  function fnv(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36) + str.length.toString(36); }
  const pack = (d) => walkLogos(JSON.parse(JSON.stringify(d)), (v) => { if (!v.startsWith('data:')) return v; const h = fnv(v); db.assets[h] = v; return '@a:' + h; });
  const unpack = (d) => walkLogos(JSON.parse(JSON.stringify(d)), (v) => (v.startsWith('@a:') ? db.assets[v.slice(3)] || null : v));

  const api = {
    can: (r, action) => (action === 'admin' ? r === 'owner' : r === 'owner' || r === 'editor'),

    async me() { return pub(user()); },
    async signUp({ name, email, password }) {
      email = String(email || '').trim().toLowerCase(); name = String(name || '').trim();
      if (!name) fail('Enter your name.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
      if (String(password || '').length < 8) fail('Use a password of at least 8 characters.');
      if (db.users.some((u) => u.email === email)) fail('There’s already an account with that email. Log in instead.');
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      const u = { id: uid(), email, name, salt, hash: await hashPw(password, salt), created: Date.now() };
      db.users.push(u);
      const ws = { id: uid(), name: `${name.split(' ')[0]}’s team`, ownerId: u.id, created: Date.now(), brand: null };
      db.workspaces.push(ws);
      db.members.push({ wsId: ws.id, userId: u.id, email, name, role: 'owner', status: 'active' });
      persist(); setSession(u.id);
      return pub(u);
    },
    async logIn({ email, password }) {
      email = String(email || '').trim().toLowerCase();
      const u = db.users.find((x) => x.email === email);
      if (!u || (await hashPw(password || '', u.salt)) !== u.hash) fail('That email and password don’t match.');
      setSession(u.id);
      return pub(u);
    },
    async logOut() { setSession(null); },
    async updateProfile({ name }) {
      const u = need(); name = String(name || '').trim();
      if (!name) fail('Enter your name.');
      u.name = name; db.members.forEach((m) => { if (m.userId === u.id) m.name = name; });
      persist(); return pub(u);
    },
    async changePassword({ current, next }) {
      const u = need();
      if ((await hashPw(current || '', u.salt)) !== u.hash) fail('Your current password isn’t right.');
      if (String(next || '').length < 8) fail('Use a password of at least 8 characters.');
      u.salt = b64(crypto.getRandomValues(new Uint8Array(16))); u.hash = await hashPw(next, u.salt);
      persist();
    },
    async deleteAccount() {
      const u = need();
      for (const ws of db.workspaces.filter((w) => w.ownerId === u.id)) api._dropWorkspace(ws.id);
      db.members = db.members.filter((m) => m.userId !== u.id);
      db.users = db.users.filter((x) => x.id !== u.id);
      persist(); setSession(null);
    },
    async exportData() {
      const u = need(), ids = db.members.filter((m) => m.userId === u.id).map((m) => m.wsId);
      return { account: pub(u), teams: db.workspaces.filter((w) => ids.includes(w.id)), designs: db.projects.filter((p) => ids.includes(p.wsId)).map((p) => ({ ...p, versions: p.versions.map((v) => ({ ...v, design: unpack(v.design) })) })) };
    },

    async workspaces() {
      const u = need();
      return db.members.filter((m) => m.userId === u.id && m.status === 'active').map((m) => {
        const w = db.workspaces.find((x) => x.id === m.wsId);
        return w && { id: w.id, name: w.name, role: m.role, brand: w.brand };
      }).filter(Boolean);
    },
    async createWorkspace(name) {
      const u = need(); name = String(name || '').trim();
      if (!name) fail('Name the team.');
      const ws = { id: uid(), name, ownerId: u.id, created: Date.now(), brand: null };
      db.workspaces.push(ws);
      db.members.push({ wsId: ws.id, userId: u.id, email: u.email, name: u.name, role: 'owner', status: 'active' });
      persist(); return { id: ws.id, name, role: 'owner', brand: null };
    },
    async renameWorkspace(id, name) {
      needRole(id, 'admin'); name = String(name || '').trim();
      if (!name) fail('Name the team.');
      db.workspaces.find((w) => w.id === id).name = name; persist();
    },
    _dropWorkspace(id) {
      db.workspaces = db.workspaces.filter((w) => w.id !== id);
      db.members = db.members.filter((m) => m.wsId !== id);
      db.projects = db.projects.filter((p) => p.wsId !== id);
      db.invites = db.invites.filter((i) => i.wsId !== id);
    },
    async deleteWorkspace(id) {
      needRole(id, 'admin');
      if (db.members.filter((m) => m.userId === need().id && m.status === 'active').length < 2) fail('You need at least one team. Create another first.');
      api._dropWorkspace(id); persist();
    },
    async leaveWorkspace(id) {
      const r = needRole(id);
      if (r === 'owner') fail('Owners can’t leave. Delete the team or hand it over first.');
      db.members = db.members.filter((m) => !(m.wsId === id && m.userId === need().id)); persist();
    },

    async members(wsId) {
      needRole(wsId);
      return db.members.filter((m) => m.wsId === wsId).map((m) => ({ userId: m.userId, email: m.email, name: m.name, role: m.role, status: m.status, code: m.status === 'invited' ? (db.invites.find((i) => i.wsId === wsId && i.email === m.email) || {}).code : undefined }));
    },
    async invite(wsId, email, r) {
      needRole(wsId, 'admin');
      email = String(email || '').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.');
      if (!['editor', 'viewer'].includes(r)) fail('Choose editor or viewer.');
      if (db.members.some((m) => m.wsId === wsId && m.email === email)) fail('That person is already on the team.');
      const code = (uid() + uid()).slice(0, 10).toUpperCase();
      db.invites.push({ code, wsId, email, role: r });
      db.members.push({ wsId, userId: 'inv-' + code, email, name: email, role: r, status: 'invited' });
      persist(); return { code };
    },
    async joinWithCode(code) {
      const u = need();
      const inv = db.invites.find((i) => i.code === String(code || '').trim().toUpperCase());
      if (!inv) fail('That invite code isn’t valid.');
      if (inv.email !== u.email) fail(`This invite is for ${inv.email}. Log in with that email to join.`);
      db.members = db.members.filter((m) => !(m.wsId === inv.wsId && m.userId === 'inv-' + inv.code));
      db.members.push({ wsId: inv.wsId, userId: u.id, email: u.email, name: u.name, role: inv.role, status: 'active' });
      db.invites = db.invites.filter((i) => i !== inv);
      persist(); return db.workspaces.find((w) => w.id === inv.wsId).name;
    },
    async setRole(wsId, userId, r) {
      needRole(wsId, 'admin');
      const m = db.members.find((x) => x.wsId === wsId && x.userId === userId);
      if (!m || m.role === 'owner') fail('That role can’t be changed.');
      m.role = r; const inv = db.invites.find((i) => i.code === String(userId).replace('inv-', '')); if (inv) inv.role = r; persist();
    },
    async removeMember(wsId, userId) {
      needRole(wsId, 'admin');
      const m = db.members.find((x) => x.wsId === wsId && x.userId === userId);
      if (!m || m.role === 'owner') fail('The owner can’t be removed.');
      db.members = db.members.filter((x) => x !== m);
      db.invites = db.invites.filter((i) => !(i.wsId === wsId && i.email === m.email)); persist();
    },
    async brand(wsId) {
      needRole(wsId);
      const b = db.workspaces.find((w) => w.id === wsId).brand;
      if (!b) return null;
      const res = (v) => (v && v.startsWith('@a:') ? db.assets[v.slice(3)] || null : v);
      return { ...b, crest: res(b.crest), sponsor: res(b.sponsor) };
    },
    async setBrand(wsId, brand) {
      needRole(wsId, 'edit');
      const keep = (v) => { if (!v || !v.startsWith('data:')) return v || null; const h = fnv(v); db.assets[h] = v; return '@a:' + h; };
      db.workspaces.find((w) => w.id === wsId).brand = { palette: (brand.palette || []).slice(0, 5), crest: keep(brand.crest), sponsor: keep(brand.sponsor), teamName: brand.teamName || '' };
      persist();
    },

    async projects(wsId) {
      needRole(wsId);
      return db.projects.filter((p) => p.wsId === wsId).sort((a, b) => b.updated - a.updated).map((p) => {
        const v = p.versions[p.versions.length - 1];
        return { id: p.id, wsId: p.wsId, name: p.name, folder: p.folder || '', updated: p.updated, versions: p.versions.length, thumb: v && v.thumb, by: v && v.byName };
      });
    },
    async project(id) {
      const p = db.projects.find((x) => x.id === id) || fail('That design no longer exists.');
      needRole(p.wsId);
      return { id: p.id, wsId: p.wsId, name: p.name, folder: p.folder || '', updated: p.updated, versions: p.versions.map((v) => ({ id: v.id, at: v.at, label: v.label, byName: v.byName, thumb: v.thumb })).reverse() };
    },
    async loadVersion(projectId, versionId) {
      const p = db.projects.find((x) => x.id === projectId) || fail('That design no longer exists.');
      needRole(p.wsId);
      const v = versionId ? p.versions.find((x) => x.id === versionId) : p.versions[p.versions.length - 1];
      if (!v) fail('That version no longer exists.');
      return unpack(v.design);
    },
    async saveProject({ wsId, id, name, folder, design, thumb, label }) {
      const u = need(); needRole(wsId, 'edit');
      let p = id && db.projects.find((x) => x.id === id);
      name = String(name || '').trim() || 'Untitled design';
      const version = { id: uid(), at: Date.now(), by: u.id, byName: u.name, label: label || 'Saved', thumb, design: pack(design) };
      if (!p) { p = { id: uid(), wsId, name, folder: folder || '', created: Date.now(), updated: Date.now(), versions: [] }; db.projects.push(p); }
      else { needRole(p.wsId, 'edit'); p.name = name; if (folder !== undefined) p.folder = folder; }
      p.versions.push(version);
      if (p.versions.length > MAX_VERSIONS) p.versions.splice(0, p.versions.length - MAX_VERSIONS);
      p.updated = Date.now();
      persist();
      return { id: p.id, wsId: p.wsId, name: p.name, versionId: version.id, updated: p.updated };
    },
    async renameProject(id, name) { const p = db.projects.find((x) => x.id === id) || fail('Not found.'); needRole(p.wsId, 'edit'); p.name = String(name).trim() || p.name; p.updated = Date.now(); persist(); },
    async moveProject(id, folder) { const p = db.projects.find((x) => x.id === id) || fail('Not found.'); needRole(p.wsId, 'edit'); p.folder = String(folder || '').trim(); persist(); },
    async duplicateProject(id) {
      const p = db.projects.find((x) => x.id === id) || fail('Not found.'); needRole(p.wsId, 'edit');
      const last = p.versions[p.versions.length - 1], u = need();
      const copy = { ...p, id: uid(), name: p.name + ' copy', created: Date.now(), updated: Date.now(), versions: [{ ...last, id: uid(), at: Date.now(), by: u.id, byName: u.name, label: 'Copy' }] };
      db.projects.push(copy); persist(); return copy.id;
    },
    async deleteProject(id) { const p = db.projects.find((x) => x.id === id) || fail('Not found.'); needRole(p.wsId, 'edit'); db.projects = db.projects.filter((x) => x !== p); persist(); },
  };

  UB.api = api;
})();
