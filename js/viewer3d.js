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
      new THREE.GLTFLoader().load(UB.MODEL_GLB, (gltf) => {
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
          parts.push({ mesh: o, zone, object: name });
        });
        // Stand the player on the floor and face the camera.
        const box = bodyBox();
        root.position.y -= box.min.y;
        root.position.x -= (box.min.x + box.max.x) / 2;
        root.position.z -= (box.min.z + box.max.z) / 2;
        scene.add(root);
        frame('front', false);
        resize();
        loop();
        resolve();
      }, undefined, reject);
    });
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
      return p && p.zone ? p : null;
    }
    return null;
  }
  function hover(e) {
    const p = e ? pick(e) : null;
    const zone = p ? p.zone : null;
    if (zone !== hovered) {
      hovered = zone;
      parts.forEach((x) => x.mesh.material.emissive.setHex(zone && x.zone === zone ? 0x2a2f38 : 0x000000));
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
    const key = JSON.stringify([state.team.palette, kit.colors, kit.swap, kit.template]);
    if (key === lastPaint) return;
    lastPaint = key;
    const c = new THREE.Color();
    for (const p of parts) {
      if (!p.zone) continue;
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
      if (!ready) ready = setup(el);
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
