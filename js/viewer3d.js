/* 3D view: the Blender player, traced part by part to the designer's colour zones.
 *
 * The model (js/model-assets.js, made by blender/export_web.py) keeps every Blender
 * object and material name. TRACE below reads those names and decides which colour
 * zone each piece belongs to, so changing "Socks" in the designer repaints exactly the
 * sock fabric, and the black hoops knitted into the same sock follow "Sock stripe".
 * Pieces that are not part of the uniform (skin, steel, visor, tape) keep their colour.
 */
(function () {
  'use strict';
  const UB = (window.UB = window.UB || {});

  // [test on object name, material name] -> zone. First match wins; null keeps the model's colour.
  const TRACE = [
    [/^(jersey_body)$/, 'Jersey_Yellow', 'body'],
    [/^sleeve_/, 'Jersey_Yellow', 'sleeves'],
    [/^sock_/, 'Jersey_Yellow', 'socks'],
    [/^(jersey_body|sleeve_)/, 'Fabric_Black', 'stripe1'],
    [/^sock_/, 'Fabric_Black', 'sockStripe1'],
    [/^collar_binding$/, 'Fabric_Black', 'collar'],
    [/^number_.*_outline$/, 'Fabric_Black', 'numberOutline'],
    [/^number_(left|right)$/, 'Plastic_White', 'number'],
    [/^seam_/, 'Seam_Gold', 'stripe2'],
    [/^skate_tongue_(left|right)$/, 'Fabric_Black', 'skatesTrim'],
    [/^skate_/, 'Gloss_Black', 'skates'],
    [/^stick_/, 'Gloss_Black', 'stick'],
    [/^glove_/, 'Glove_Black', 'gloves'],
    [/^glove_/, 'Glove_Yellow', 'glovesTrim'],
    [/^helmet_/, 'Helmet_Gloss', 'helmet'],
    [/^helmet_strap/, 'Strap_Black', 'helmetTrim'],
    [/^helmet_(num|paw)/, null, 'helmetDecal'],
    [/^pants_/, 'Pants_Nylon', 'pants'],
    [/^pants_/, 'Pants_Binding', 'pantsStripe1'],
    [/^paw_/, 'Paw_Gold', 'pantsStripe2'],
  ];
  // Fabric that takes the designer's stripes. The model has no UV map on these, so the
  // stripes are drawn in the shader by distance along each garment: up from the jersey hem,
  // up the sleeve from the cuff, up the sock from its bottom. Units match js/photo.js
  // (k is the same scale; 370 photo pixels = the width of the jersey at the hem).
  const GARMENTS = [
    { re: /^jersey_body$/, set: 'hem', base: 'body', s1: 'stripe1', s2: 'stripe2', k: 1.3, limb: false },
    { re: /^sleeve_(left|right)$/, set: 'sleeve', base: 'sleeves', s1: 'stripe1', s2: 'stripe2', k: 1.25, limb: true },
    { re: /^sock_(left|right)$/, set: 'socks', base: 'socks', s1: 'sockStripe1', s2: 'sockStripe2', k: 1.3, limb: false },
  ];
  const FABRIC = new Set(['Jersey_Yellow', 'Fabric_Black']);
  // Pants stripes run down the outer side seam of each leg (or round the leg near the hem).
  const PANTS = { base: 'pants', s1: 'pantsStripe1', s2: 'pantsStripe2' };
  const traceOf = (obj, mat) => {
    for (const [re, m, zone] of TRACE) if (re.test(obj) && (m === null || m === mat)) return zone;
    return null;
  };
  // How each kind of material catches light.
  const FINISH = {
    Jersey_Yellow: { roughness: 0.85, sheen: 0.25 }, Fabric_Black: { roughness: 0.85, sheen: 0.25 }, Seam_Gold: { roughness: 0.7 },
    Helmet_Gloss: { roughness: 0.18, clearcoat: 1 }, Gloss_Black: { roughness: 0.25, clearcoat: 0.6 },
    Pants_Nylon: { roughness: 0.45, sheen: 0.3 }, Pants_Binding: { roughness: 0.6 }, Glove_Black: { roughness: 0.5 }, Glove_Yellow: { roughness: 0.5 },
    Plastic_White: { roughness: 0.55 }, Paw_Gold: { roughness: 0.5 },
  };

  let THREE, renderer, scene, camera, controls, root, host, ready = null, hovered = null, tip, lastPaint = '';
  const parts = [];           // { mesh, zone, object }
  const ray = { r: null, p: null, down: null, click: false };

  function setup(el) {
    try { return start(el); } catch (err) { return Promise.reject(err); }
  }
  function start(el) {
    THREE = window.THREE;
    host = el;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.append(renderer.domElement);
    renderer.domElement.setAttribute('aria-label', 'The player in 3D. Drag to turn, scroll or pinch to zoom, click a part to colour it.');
    renderer.domElement.setAttribute('role', 'img');

    scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);

    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(2.5, 5, 3.5); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -1.5, right: 1.5, top: 2.5, bottom: -0.5, near: 0.5, far: 15 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 0.9); rim.position.set(-3, 3, -4); scene.add(rim);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x30343a, 0.35));

    const floor = new THREE.Mesh(new THREE.CircleGeometry(3, 64), new THREE.ShadowMaterial({ opacity: 0.32 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const grid = new THREE.GridHelper(8, 32, 0x5a6270, 0x3a4048);
    grid.material.transparent = true; grid.material.opacity = 0.35; grid.position.y = 0.001; scene.add(grid);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 0.8; controls.maxDistance = 9;
    controls.maxPolarAngle = Math.PI * 0.53;
    controls.screenSpacePanning = true;
    controls.addEventListener('change', () => { if (tip) tip.hidden = true; });

    tip = document.createElement('div');
    tip.className = 'v3d-tip'; tip.hidden = true;
    el.append(tip);

    ray.r = new THREE.Raycaster(); ray.p = new THREE.Vector2();
    const cv = renderer.domElement;
    cv.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && !e.buttons) hover(e); });
    cv.addEventListener('pointerleave', () => hover(null));
    cv.addEventListener('pointerdown', (e) => { ray.down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
    cv.addEventListener('pointerup', (e) => {
      // a click (not a drag) on a part; the page asks for it with zoneAt() from its click handler
      const d = ray.down; ray.down = null;
      ray.click = !!d && Math.hypot(e.clientX - d.x, e.clientY - d.y) <= 6 && performance.now() - d.t <= 600;
    });
    new ResizeObserver(resize).observe(el);

    return new Promise((resolve, reject) => {
      // Decode the embedded model here rather than fetching a data: link, which some hosts block.
      const b64 = UB.MODEL_GLB.slice(UB.MODEL_GLB.indexOf(',') + 1), bin = atob(b64), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      new THREE.GLTFLoader().parse(buf.buffer, '', (gltf) => {
        root = gltf.scene;
        root.traverse((o) => {
          if (!o.isMesh) return;
          const name = o.parent && o.parent.type === 'Group' && o.parent !== root && o.parent.parent ? o.parent.name : o.name;
          const matName = o.material.name;
          const zone = traceOf(name, matName);
          const fin = FINISH[matName] || {};
          const src = o.material;
          const m = new THREE.MeshPhysicalMaterial({
            color: src.color.clone(), roughness: fin.roughness ?? src.roughness, metalness: src.metalness,
            transparent: src.transparent, opacity: src.opacity, side: src.transparent ? THREE.DoubleSide : THREE.FrontSide,
            clearcoat: fin.clearcoat || 0, clearcoatRoughness: 0.12, sheen: fin.sheen || 0, sheenRoughness: 0.6,
            emissive: 0x000000, depthWrite: !src.transparent, envMapIntensity: 0.55,
          });
          m.name = matName;
          o.material = m;
          o.castShadow = !src.transparent; o.receiveShadow = true;
          const g = FABRIC.has(matName) && GARMENTS.find((x) => x.re.test(name));
          if (matName === 'Pants_Nylon') { parts.push({ mesh: o, zone: 'pants', object: name, garment: 'pants', gdef: PANTS }); return; }
          parts.push({ mesh: o, zone: g ? g.base : zone, object: name, garment: g ? name : null, gdef: g || null });
        });
        // Stand the player on the floor and face the camera.
        const box = bodyBox();
        root.position.y -= box.min.y;
        root.position.x -= (box.min.x + box.max.x) / 2;
        root.position.z -= (box.min.z + box.max.z) / 2;
        scene.add(root);
        buildGarments();
        placeNumbers();
        frame('front', false);
        resize();
        loop();
        resolve();
      }, reject);
    });
  }

  /* ---------- stripes and yoke on the fabric ---------- */
  const garments = new Map();   // object name -> { def, o, d, L, mpp, tex, ctx, bands, U }
  const V3 = () => new window.THREE.Vector3(), COL = () => new window.THREE.Color();   // the THREE variable is set later, in setup()
  // Shoulder yoke, shared by the jersey body and both sleeves (same flat units as js/render.js yokePath).
  const YU = { yOn: { value: 0 }, yStyle: { value: 1 }, yD: { value: 108 }, yTrim: { value: 6 }, yCol: { value: COL() }, yTrimCol: { value: COL() },
    yHem: { value: 0 }, yCx: { value: 0 }, yMpp: { value: 0.0014 } };
  const YOFF = { yOn: { value: 0 }, yStyle: { value: 1 }, yD: { value: 0 }, yTrim: { value: 0 }, yCol: { value: COL() }, yTrimCol: { value: COL() },
    yHem: { value: 0 }, yCx: { value: 0 }, yMpp: { value: 1 } };
  const YSTYLE = { straight: 1, v: 2, curved: 3, arched: 4 };
  // Where a point sits on the flat jersey drawing, using the photo's flat scale (1.9 across, 1.3 down).
  // The default yoke depth (108) sits on the yoke seam the modeller stitched across the chest (yHem holds its height).
  function flatOf(q) {
    return { x: 200 + (q.x - YU.yCx.value) / YU.yMpp.value / 1.9, y: 108 + (YU.yHem.value - q.y) / (1.3 * YU.yMpp.value) };
  }
  function yokeLine(fx) {
    const D = YU.yD.value, t = Math.min(1, Math.max(0, (fx + 60) / 520));
    switch (YU.yStyle.value) {
      case 2: return D - 22 + 44 * (1 - Math.abs(fx - 200) / 260);
      case 3: return D - 20 + 140 * t * (1 - t);
      case 4: return D + 20 - 160 * t * (1 - t);
      default: return D;
    }
  }
  const FRAG_HEAD = `uniform sampler2D stripeMap; uniform vec3 axO; uniform vec3 axD; uniform float axL; uniform vec3 gBase;
uniform float yOn; uniform int yStyle; uniform float yD; uniform float yTrim; uniform vec3 yCol; uniform vec3 yTrimCol;
uniform float yHem; uniform float yCx; uniform float yMpp; varying vec3 vStripeP;
`;
  const FRAG_BODY = `
  float st = clamp(dot(vStripeP - axO, axD) / axL, 0.0, 1.0);
  vec4 tx = texture2D(stripeMap, vec2(0.5, st));
  vec3 gc = gBase;
  if (yOn > 0.5) {
    float fy = 108.0 + (yHem - vStripeP.y) / (1.3 * yMpp);
    float fx = 200.0 + (vStripeP.x - yCx) / yMpp / 1.9;
    float tt = clamp((fx + 60.0) / 520.0, 0.0, 1.0);
    float B = yD;
    if (yStyle == 2) B = yD - 22.0 + 44.0 * (1.0 - abs(fx - 200.0) / 260.0);
    else if (yStyle == 3) B = yD - 20.0 + 140.0 * tt * (1.0 - tt);
    else if (yStyle == 4) B = yD + 20.0 - 160.0 * tt * (1.0 - tt);
    if (fy < B) gc = yCol; else if (fy < B + yTrim) gc = yTrimCol;
  }
  if (tx.a > 0.5) gc = pow(tx.rgb, vec3(2.2));
  vec4 diffuseColor = vec4(gc, opacity);`;

  function buildGarments() {
    root.updateMatrixWorld(true);
    const v = V3();
    const pointsOf = (meshes) => {
      const out = [];
      meshes.forEach((m) => { const a = m.geometry.attributes.position; for (let i = 0; i < a.count; i += 3) out.push(v.fromBufferAttribute(a, i).applyMatrix4(m.matrixWorld).clone()); });
      return out;
    };
    const meshesOf = (re) => parts.filter((p) => re.test(p.object)).map((p) => p.mesh);
    buildPants(pointsOf);
    const byName = {};
    parts.forEach((p) => { if (p.garment && p.garment !== 'pants') (byName[p.garment] = byName[p.garment] || { def: p.gdef, meshes: [] }).meshes.push(p.mesh); });
    // the width of the jersey at the hem sets the scale, as in the photo
    const body = byName.jersey_body ? pointsOf(byName.jersey_body.meshes) : [];
    const minY = Math.min(...body.map((q) => q.y));
    const hemPts = body.filter((q) => q.y < minY + 0.08);
    const mpp = hemPts.length ? (Math.max(...hemPts.map((q) => q.x)) - Math.min(...hemPts.map((q) => q.x))) / 370 : 0.0014;
    const seam = pointsOf(meshesOf(/^seam_yoke_/)), topY = Math.max(...body.map((q) => q.y));
    YU.yHem.value = seam.length ? seam.reduce((a, q) => a + q.y, 0) / seam.length : topY - 0.13;
    YU.yMpp.value = mpp;
    YU.yCx.value = hemPts.length ? (Math.max(...hemPts.map((q) => q.x)) + Math.min(...hemPts.map((q) => q.x))) / 2 : 0;
    for (const [name, g] of Object.entries(byName)) {
      const pts = pointsOf(g.meshes), side = (name.match(/(left|right)$/) || [])[1];
      let d = new THREE.Vector3(0, 1, 0);
      if (g.def.limb) {
        // from the cuff (lowest end) toward the shoulder
        const ys = pts.map((q) => q.y).sort((a, b) => a - b), lo = ys[Math.floor(ys.length * 0.06)], hi = ys[Math.floor(ys.length * 0.94)];
        const avg = (f) => { const s = pts.filter(f), c = V3(); s.forEach((q) => c.add(q)); return c.divideScalar(s.length || 1); };
        d = avg((q) => q.y >= hi).sub(avg((q) => q.y <= lo)).normalize();
      }
      const ts = pts.map((q) => q.dot(d));
      let t0 = Math.min(...ts);
      // Measure from what you can see: the sleeve where it leaves the glove, the sock where it leaves the skate.
      const cover = g.def.limb ? meshesOf(new RegExp('^glove_' + side + '$')) : g.def.set === 'socks' ? meshesOf(new RegExp('^skate_(boot|ankle|tongue)_' + side + '$')) : [];
      if (cover.length) t0 = Math.max(t0, Math.max(...pointsOf(cover).map((q) => q.dot(d))));
      const L = Math.max(...ts) - t0, o = d.clone().multiplyScalar(t0);
      const cv = document.createElement('canvas'); cv.width = 1; cv.height = 1024;
      const tex = new THREE.CanvasTexture(cv);
      tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const jersey = g.def.set !== 'socks';
      const U = Object.assign({ stripeMap: { value: tex }, axO: { value: o }, axD: { value: d }, axL: { value: L }, gBase: { value: COL() } }, jersey ? YU : YOFF);
      const G = { def: g.def, o, d, L, mpp, tex, ctx: cv.getContext('2d'), bands: [], U, jersey, pts, t0, side };
      garments.set(name, G);
      g.meshes.forEach((m) => {
        const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.85, sheen: 0.25, sheenRoughness: 0.6, envMapIntensity: 0.55 });
        mat.name = 'Fabric (striped)';
        mat.onBeforeCompile = (sh) => {
          Object.assign(sh.uniforms, U);
          sh.vertexShader = 'varying vec3 vStripeP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vStripeP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
          sh.fragmentShader = FRAG_HEAD + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', FRAG_BODY);
        };
        m.material = mat;
      });
    }
  }
  // Shoulder numbers: the model has them on the front of the shoulders; move each onto the outside of its
  // upper sleeve, upright along the arm and turned a little toward the front, where a pro jersey has them.
  const NUM_SCALE = 1.7;
  function placeNumbers() {
    for (const side of ['left', 'right']) {
      const G = garments.get('sleeve_' + side), num = parts.find((p) => p.object === 'number_' + side);
      if (!G || !num) continue;
      const out = new THREE.Vector3(side === 'left' ? 1 : -1, 0, 0);
      const N = out.clone().sub(G.d.clone().multiplyScalar(out.dot(G.d))).normalize();
      N.add(new THREE.Vector3(0, 0, 0.42)).sub(G.d.clone().multiplyScalar(0.42 * G.d.z)).normalize();
      const band = G.pts.filter((q) => { const t = (q.dot(G.d) - G.t0) / G.L; return t > 0.55 && t < 0.63; });
      if (!band.length) continue;
      const anchor = band.reduce((a, q) => (q.dot(N) > a.dot(N) ? q : a));
      const U = G.d.clone().sub(N.clone().multiplyScalar(G.d.dot(N))).normalize(), R = U.clone().cross(N);
      // the number's local axes (from Blender text): x = reading direction, y = out of the face, z = down
      const rot = new THREE.Matrix4().makeBasis(R, N, U.clone().negate());
      const mesh = num.mesh, outline = parts.find((p) => p.object === 'number_' + side + '_outline');
      mesh.updateMatrixWorld(true);
      const rel = outline ? mesh.matrixWorld.clone().invert().multiply(outline.mesh.matrixWorld) : null;
      const box = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position), c = box.getCenter(new THREE.Vector3());
      c.y = box.max.y;
      // The modelled numbers are about 5 cm tall; shoulder numbers on a pro jersey are closer to 9 cm.
      const world = rot.clone().multiply(new THREE.Matrix4().makeScale(NUM_SCALE, NUM_SCALE, NUM_SCALE));
      const pos = anchor.clone().add(N.clone().multiplyScalar(0.008)).sub(c.clone().applyMatrix4(world));
      world.setPosition(pos);
      const setWorld = (m, W) => { const parentInv = m.parent.matrixWorld.clone().invert(); parentInv.multiply(W).decompose(m.position, m.quaternion, m.scale); m.updateMatrixWorld(true); };
      root.updateMatrixWorld(true);
      setWorld(mesh, world);
      if (outline) setWorld(outline.mesh, world.clone().multiply(rel));
    }
  }

  // Draw one garment's stripes into its strip texture (bottom of the canvas = the hem, cuff or skate top).
  // Stripes are opaque; everywhere else is clear so the shader shows the body colour or the yoke.
  function stripeGarment(G, state, kit) {
    const j = kit.jersey, sk = kit.socks, def = G.def;
    const cfg = def.set === 'socks' ? { style: sk.style === 'match' ? j.hem.style : sk.style, offset: sk.offset, size: sk.size } : j[def.set];
    const set = UB.STRIPE_SETS[cfg.style] || UB.STRIPE_SETS.none, H = 1024, c = G.ctx;
    G.U.gBase.value.set(UB.color(state, kit, def.base)).convertSRGBToLinear();
    c.clearRect(0, 0, 1, H);
    G.bands = [];
    for (const b of set.bands) {
      let t0 = (cfg.offset + b.at * cfg.size) * def.k * G.mpp, t1 = t0 + b.h * cfg.size * def.k * G.mpp;
      if (b.at === 0 && cfg.offset < 3) t0 = -1;
      const zone = b.c === 1 ? def.s1 : def.s2;
      G.bands.push({ t0, t1, zone });
      c.fillStyle = UB.color(state, kit, zone);
      const y0 = H - (t1 / G.L) * H, y1 = H - (Math.max(t0, 0) / G.L) * H;
      c.fillRect(0, y0, 1, y1 - y0);
    }
    G.tex.needsUpdate = true;
  }
  function paintYoke(state, kit) {
    const j = kit.jersey;
    YU.yOn.value = j.yoke && j.yoke !== 'none' ? 1 : 0;
    YU.yStyle.value = YSTYLE[j.yoke] || 1; YU.yD.value = j.yokeDepth; YU.yTrim.value = j.yokeTrim || 0;
    YU.yCol.value.set(UB.color(state, kit, 'yoke')).convertSRGBToLinear();
    YU.yTrimCol.value.set(UB.color(state, kit, 'yokeTrim')).convertSRGBToLinear();
  }
  // Which colour zone a point on a striped garment is.
  function garmentZone(name, point) {
    if (name === 'pants') return P.U ? pantsZone(point) : 'pants';
    const G = garments.get(name);
    if (!G) return null;
    const t = point.dot(G.d) - G.o.dot(G.d);
    for (let i = G.bands.length - 1; i >= 0; i--) if (t >= G.bands[i].t0 && t <= G.bands[i].t1) return G.bands[i].zone;
    if (G.jersey && YU.yOn.value) {
      const f = flatOf(point), B = yokeLine(f.x);
      if (f.y < B) return 'yoke';
      if (f.y < B + YU.yTrim.value) return 'yokeTrim';
    }
    return G.def.base;
  }

  /* Pants: distance round the leg from the outer seam, and height above the hem. */
  const P = { mpp: 0.0014, U: null, v: [], h: [] };
  function buildPants(pointsOf) {
    const meshes = parts.filter((p) => p.garment === 'pants').map((p) => p.mesh);
    if (!meshes.length) return;
    const legs = ['left', 'right'].map((sd) => pointsOf(parts.filter((p) => p.object === 'pants_leg_' + sd && p.garment === 'pants').map((p) => p.mesh)));
    const body = pointsOf(parts.filter((p) => p.object === 'jersey_body').map((p) => p.mesh));
    const minY = Math.min(...body.map((q) => q.y)), hem = body.filter((q) => q.y < minY + 0.08);
    if (hem.length) P.mpp = (Math.max(...hem.map((q) => q.x)) - Math.min(...hem.map((q) => q.x))) / 370;
    const leg = legs.map((pts) => {
      const xs = pts.map((q) => q.x), zs = pts.map((q) => q.z);
      return { cx: xs.reduce((a, b) => a + b, 0) / xs.length, cz: zs.reduce((a, b) => a + b, 0) / zs.length,
        r: (Math.max(...xs) - Math.min(...xs)) / 2, y0: Math.min(...pts.map((q) => q.y)) };
    });
    P.leg = leg;
    const V2 = () => new THREE.Vector2(), C = () => new THREE.Color();
    P.U = {
      pLeg: { value: new THREE.Vector4(leg[0].cx, leg[1].cx, (leg[0].cz + leg[1].cz) / 2, (leg[0].r + leg[1].r) / 2) },
      pHem: { value: Math.min(leg[0].y0, leg[1].y0) }, pBase: { value: C() },
      pvB: { value: [V2(), V2(), V2()] }, pvC: { value: [C(), C(), C()] }, pvN: { value: 0 },
      phB: { value: [V2(), V2()] }, phC: { value: [C(), C()] }, phN: { value: 0 },
    };
    meshes.forEach((m) => {
      const mat = new THREE.MeshPhysicalMaterial({ roughness: 0.45, sheen: 0.3, sheenRoughness: 0.6, envMapIntensity: 0.55 });
      mat.name = 'Pants (striped)';
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, P.U);
        sh.vertexShader = 'varying vec3 vStripeP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vStripeP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
        sh.fragmentShader = `uniform vec4 pLeg; uniform float pHem; uniform vec3 pBase; uniform vec2 pvB[3]; uniform vec3 pvC[3]; uniform int pvN;
uniform vec2 phB[2]; uniform vec3 phC[2]; uniform int phN; varying vec3 vStripeP;\n` +
          sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
  float mid = 0.5 * (pLeg.x + pLeg.y);
  float cx = vStripeP.x < mid ? min(pLeg.x, pLeg.y) : max(pLeg.x, pLeg.y);
  float outward = sign(cx - mid);
  float arc = abs(atan(vStripeP.z - pLeg.z, (vStripeP.x - cx) * outward)) * pLeg.w;
  float up = vStripeP.y - pHem;
  vec3 pc = pBase;
  for (int i = 0; i < 3; i++) { if (i < pvN && arc >= pvB[i].x && arc <= pvB[i].y) pc = pvC[i]; }
  for (int i = 0; i < 2; i++) { if (i < phN && up >= phB[i].x && up <= phB[i].y) pc = phC[i]; }
  vec4 diffuseColor = vec4(pc, opacity);`);
      };
      m.material = mat;
    });
  }
  // The same bands as js/photo.js, in photo pixels: side stripes as distance from the seam, leg bands as height above the hem.
  const PANTS_SETS = {
    none: { v: [], h: [] },
    single: { v: [[0, 11, 1]], h: [] },
    outlined: { v: [[0, 15, 2], [0, 10, 1]], h: [] },
    twin: { v: [[3, 10, 1]], h: [] },
    hem: { v: [], h: [[14, 28, 1], [33, 38, 2]] },
  };
  function stripePants(state, kit) {
    if (!P.U) return;
    const set = PANTS_SETS[kit.pants.stripe] || PANTS_SETS.none, k = P.mpp * 1.6;
    const lin = (zone, c) => c.set(UB.color(state, kit, zone)).convertSRGBToLinear();
    lin('pants', P.U.pBase.value);
    P.v = set.v.map(([a, b, c]) => ({ a: a * k, b: b * k, zone: c === 1 ? 'pantsStripe1' : 'pantsStripe2' }));
    P.h = set.h.map(([a, b, c]) => ({ a: a * k, b: b * k, zone: c === 1 ? 'pantsStripe1' : 'pantsStripe2' }));
    P.v.forEach((x, i) => { P.U.pvB.value[i].set(x.a, x.b); lin(x.zone, P.U.pvC.value[i]); });
    P.h.forEach((x, i) => { P.U.phB.value[i].set(x.a, x.b); lin(x.zone, P.U.phC.value[i]); });
    P.U.pvN.value = P.v.length; P.U.phN.value = P.h.length;
  }
  function pantsZone(q) {
    const L = P.U.pLeg.value, mid = (L.x + L.y) / 2, cx = q.x < mid ? Math.min(L.x, L.y) : Math.max(L.x, L.y);
    const arc = Math.abs(Math.atan2(q.z - L.z, (q.x - cx) * Math.sign(cx - mid))) * L.w, up = q.y - P.U.pHem.value;
    let z = 'pants';
    P.v.forEach((x) => { if (arc >= x.a && arc <= x.b) z = x.zone; });
    P.h.forEach((x) => { if (up >= x.a && up <= x.b) z = x.zone; });
    return z;
  }


  // The player without the stick, so the camera centres on the body rather than the blade.
  function bodyBox() {
    root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    parts.forEach((p) => { if (!/^stick_/.test(p.object)) box.expandByObject(p.mesh); });
    return box;
  }
  function size() { const r = host.getBoundingClientRect(); return { w: Math.max(1, r.width), h: Math.max(1, r.height) }; }
  function resize() {
    if (!renderer) return;
    const { w, h } = size();
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  let tween = null;
  function frame(view, animate = true) {
    const box = bodyBox(), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const dist = (s.y * 0.62) / Math.tan((camera.fov * Math.PI) / 360) * Math.max(1, 0.75 / Math.min(1, camera.aspect));
    const yaw = { front: 0, back: Math.PI, left: -Math.PI / 2, right: Math.PI / 2, three: Math.PI / 5 }[view] ?? 0;
    const to = new THREE.Vector3(c.x + Math.sin(yaw) * dist, c.y + s.y * 0.08, c.z + Math.cos(yaw) * dist);
    if (!animate) { camera.position.copy(to); controls.target.copy(c); controls.update(); return; }
    tween = { from: camera.position.clone(), to, t0: performance.now(), target0: controls.target.clone(), target1: c };
  }
  function zoom(f) {
    const d = camera.position.clone().sub(controls.target).multiplyScalar(f);
    const len = Math.max(controls.minDistance, Math.min(controls.maxDistance, d.length()));
    camera.position.copy(controls.target).add(d.setLength(len));
  }
  function loop() {
    requestAnimationFrame(loop);
    if (!host.offsetParent) return;                // hidden: skip the work
    if (tween) {
      const k = Math.min(1, (performance.now() - tween.t0) / 450), e = 1 - Math.pow(1 - k, 3);
      // swing around the target rather than straight through the player
      const a = tween.from.clone().sub(tween.target0), b = tween.to.clone().sub(tween.target1);
      const sa = new THREE.Spherical().setFromVector3(a), sb = new THREE.Spherical().setFromVector3(b);
      let dth = sb.theta - sa.theta; if (dth > Math.PI) dth -= 2 * Math.PI; if (dth < -Math.PI) dth += 2 * Math.PI;
      const sp = new THREE.Spherical(sa.radius + (sb.radius - sa.radius) * e, sa.phi + (sb.phi - sa.phi) * e, sa.theta + dth * e);
      controls.target.lerpVectors(tween.target0, tween.target1, e);
      camera.position.setFromSpherical(sp).add(controls.target);
      if (k >= 1) tween = null;
    }
    controls.update();
    renderer.render(scene, camera);
  }

  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    ray.p.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.r.setFromCamera(ray.p, camera);
    const hits = ray.r.intersectObjects(parts.map((p) => p.mesh), false);
    for (const h of hits) {
      const p = parts.find((x) => x.mesh === h.object);
      if (p && p.mesh.material.name === 'Visor_Clear') continue;   // see through the visor
      if (p && p.garment) return { ...p, zone: garmentZone(p.garment, h.point) };
      return p && p.zone ? p : null;
    }
    return null;
  }
  function hover(e) {
    const p = e ? pick(e) : null;
    const zone = p ? p.zone : null;
    if (zone !== hovered) {
      hovered = zone;
      const lit = (x) => zone && (x.zone === zone || (x.gdef && [x.gdef.s1, x.gdef.s2, ...(x.gdef.s1 === 'stripe1' ? ['yoke', 'yokeTrim'] : [])].includes(zone)));
      parts.forEach((x) => x.mesh.material.emissive.setHex(lit(x) ? 0x2a2f38 : 0x000000));
      renderer.domElement.style.cursor = zone ? 'pointer' : 'grab';
    }
    if (!tip) return;
    if (!zone) { tip.hidden = true; return; }
    const z = UB.ZONES.find((x) => x.id === zone), r = host.getBoundingClientRect();
    tip.innerHTML = `<b>${z ? z.label : zone}</b><span>${p.object.replace(/_/g, ' ')} · ${p.mesh.material.name.replace(/_/g, ' ')}</span>`;
    tip.style.left = e.clientX - r.left + 14 + 'px'; tip.style.top = e.clientY - r.top + 14 + 'px';
    tip.hidden = false;
  }

  function paint(state, kit) {
    if (!root) return;
    const key = JSON.stringify([state.team.palette, kit.colors, kit.swap, kit.template, kit.jersey.hem, kit.jersey.sleeve, kit.socks, kit.pants, kit.jersey.yoke, kit.jersey.yokeDepth, kit.jersey.yokeTrim]);
    if (key === lastPaint) return;
    lastPaint = key;
    const c = new THREE.Color();
    paintYoke(state, kit);
    garments.forEach((G) => stripeGarment(G, state, kit));
    stripePants(state, kit);
    for (const p of parts) {
      if (!p.zone || p.garment) continue;
      c.set(UB.color(state, kit, p.zone));
      c.convertSRGBToLinear();
      p.mesh.material.color.copy(c);
    }
  }

  UB.viewer3d = {
    zones: () => [...new Set(TRACE.map((t) => t[2]))],
    trace: () => parts.map((p) => ({ object: p.object, material: p.mesh.material.name, zone: p.zone })),
    /* Shows the model inside `el`; resolves once it is loaded. */
    open(el) {
      if (!ready) ready = setup(el).catch((err) => { ready = null; throw err; });
      return ready;
    },
    /* The colour zone under a click on the 3D canvas, or null for a drag or an empty spot. */
    zoneAt(e) {
      if (!root || !ray.click || e.target !== renderer.domElement) return null;
      ray.click = false;
      const p = pick(e);
      return p ? p.zone : null;
    },
    paint, frame: (v) => root && frame(v), zoom: (f) => root && zoom(f),
    snapshot: () => renderer && renderer.domElement.toDataURL('image/png'),
    get loaded() { return !!root; },
  };
})();
