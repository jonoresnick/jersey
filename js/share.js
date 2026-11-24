/* =====================================================================
   Private share links (local demo).

   A link carries the whole design inside it: nothing is stored on a server.
   - The design is compressed, then, if you set a password, encrypted with
     AES-GCM (key from the password with PBKDF2). Without the password the
     link shows only the title and team name.
   - The embargo date is checked by the page that opens the link. That is a
     polite lock, not a guarantee: anyone technical can read the link's data.
     A real embargo needs a server to hold the design until the date.
   - Links can't be revoked once sent. Because they hold a snapshot, later
     edits to your design don't change an old link.
   ===================================================================== */
(function () {
  const UB = window.UB;
  const enc = (s) => new TextEncoder().encode(s), dec = (b) => new TextDecoder().decode(b);
  const toB64u = (buf) => { let s = ''; const a = new Uint8Array(buf); for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode(...a.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const fromB64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), (c) => c.charCodeAt(0)); };

  async function pipe(bytes, stream) {
    const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }
  const gzip = (b) => pipe(b, new CompressionStream('gzip'));
  const gunzip = (b) => pipe(b, new DecompressionStream('gzip'));

  async function key(password, salt, usage) {
    const base = await crypto.subtle.importKey('raw', enc(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 150000 }, base, { name: 'AES-GCM', length: 256 }, false, [usage]);
  }

  /* Shrink big logos so the link stays a sensible length. */
  function shrink(dataUrl, max = 220) {
    return new Promise((resolve) => {
      if (!dataUrl || !dataUrl.startsWith('data:image/') || dataUrl.startsWith('data:image/svg')) return resolve(dataUrl);
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/png'));
      };
      im.onerror = () => resolve(dataUrl);
      im.src = dataUrl;
    });
  }
  async function lean(design) {
    const d = JSON.parse(JSON.stringify(design));
    if (d.crest) { d.crest.image = await shrink(d.crest.image); d.crest.patchImage = await shrink(d.crest.patchImage); }
    if (d.photoLogos) for (const k of Object.keys(d.photoLogos)) d.photoLogos[k] = await shrink(d.photoLogos[k]);
    return d;
  }

  /* opts: { title, team, message, embargo (ISO string or ''), password, download, design } */
  async function create(opts) {
    const head = { t: opts.title || 'New jersey', w: opts.team || '', e: opts.embargo || '', m: opts.message || '', dl: opts.download ? 1 : 0 };
    const body = await gzip(enc(JSON.stringify(await lean(opts.design))));
    let pack;
    if (opts.password) {
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(opts.password, salt, 'encrypt'), body));
      pack = { v: 1, h: head, s: toB64u(salt), i: toB64u(iv), c: toB64u(ct) };
    } else pack = { v: 1, h: head, d: toB64u(body) };
    const payload = toB64u(enc(JSON.stringify(pack)));
    const base = location.href.split('#')[0];
    return { url: `${base}#view/${payload}`, length: payload.length };
  }

  /* Read the part of a link anyone can see: title, team, embargo and whether it needs a password. */
  function peek(payload) {
    try {
      const pack = JSON.parse(dec(fromB64u(payload)));
      return { head: pack.h, locked: !!pack.c, ok: pack.v === 1 };
    } catch (e) { return { ok: false }; }
  }
  async function open(payload, password) {
    const pack = JSON.parse(dec(fromB64u(payload)));
    let bytes;
    if (pack.c) {
      if (!password) throw new Error('Enter the password.');
      try { bytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64u(pack.i) }, await key(password, fromB64u(pack.s), 'decrypt'), fromB64u(pack.c))); }
      catch (e) { throw new Error('That password isn’t right.'); }
    } else bytes = fromB64u(pack.d);
    return { head: pack.h, design: JSON.parse(dec(await gunzip(bytes))) };
  }

  UB.share = { create, peek, open };
})();
