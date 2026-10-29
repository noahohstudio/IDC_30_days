// Interactive zine: a WebGL book lit by one light, off screen to the upper left.
// Click or tap a page, swipe, or press ← →. Clicks can come as fast as you like: each one sends the
// next page over straight away, so a run of clicks riffles through the book. With a mouse, hovering a
// page lifts it off the stack, corner first toward the pointer. Without a cover the book never ends:
// past the last spread the first comes round again, in either direction.
//
// noaoh.com: the paper grain is turned well down from the frozen copy (Noah, Oct 24): it was too
// apparent on the dark pages. The four values marked "noaoh.com" below are the only changes.
//
// Credit: Paper (paper.design) came up with all of this for the magazine on the Paper Mono site,
// https://paper.design/mono. This is an independent implementation of their ideas; keep a visible
// credit wherever the book ships. What it takes from them:
//  - A turning sheet rolls into a circular arc that is deepest mid-turn. The paper by the spine leads,
//    so a turn starts at the binding and rolls out to the fore-edge.
//  - Where you press tilts the fold, so a page taken near a corner turns corner-first.
//  - The light does all the shading: the falloff across the roll, the dip into the gutter, and a soft
//    shadow from a lifted page onto the pages beneath and onto the table.
//  - The stock isn't flat or smooth: a slow warp catches the light, a fine grain gives it tooth (the
//    light picks it out, and paper shows through solid ink in specks), fibres roughen it, ink is a
//    little glossier than bare paper, and the other side of each sheet shows through faintly.
//  - Clicks don't wait for the page before: fast clicking riffles through the book.
//
//   import { createZineBook } from "./zine-book.js";
//   createZineBook(el, { spreads: ["p01-02.png", "p03-04.png", …] });            // opens on the first spread
//   createZineBook(el, { cover: "cover.png", spreads: ["s1.png", "s2.png"] });   // starts closed on a cover
//
// Spreads are whole two-page images in reading order. `cover` (optional) is a wraparound cover:
// left half = back, right half = front. Needs three.js (import map or bundler).
import * as THREE from "three";

const SEG_X = 72, SEG_Y = 48;
const TURN_MS = 1300;                            // a full turn; a partial or reversed one takes its share
const CURL = 0.82;                               // how far a sheet rolls mid-turn, × π, before jitter
const MAX_CURVE = 2.3;                           // the tightest roll allowed, per page width
const LEAD = 0.5;                                // how far the spine runs ahead of the rest of the sheet
const MAX_TILT = THREE.MathUtils.degToRad(34);   // fold tilt for a page taken right at its corner
const HOVER_LIFT = 0.035;                        // a hovered page rises this far into a turn
const RISE = 0.62;                               // the highest a turning page comes off the book
const STEP = 0.02;                               // uv step used to take normals of the bent sheet
const LIGHT_AT = new THREE.Vector3(-3.4, 1.4, 4.2);   // up and to the left, in front of the page

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = p => p * p * (3 - 2 * p);
const approach = (v, goal, dt, tau) => v + (goal - v) * (1 - Math.exp(-dt / tau));

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("Couldn't load " + src)); i.src = src; });
}

// One face: half of a spread. Back faces are flipped in the shader, so every texture reads normally.
function halfTexture(renderer, img, half) {
  const w = Math.round(img.width / 2), h = img.height;
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d").drawImage(img, half === "right" ? w : 0, 0, w, h, 0, 0, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// Paper fibres: light strokes on black, tiling. The shader reads them as roughness and a faint tint.
function fibreTexture(renderer) {
  const S = 512, c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d");
  x.fillStyle = "#000"; x.fillRect(0, 0, S, S);
  let seed = 11; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  x.lineCap = "round";
  for (let i = 0; i < 2600; i++) {
    const px = rnd() * S, py = rnd() * S, len = 3 + rnd() * 11, a = rnd() * Math.PI * 2, b = (rnd() - 0.5) * 1.4;
    const v = Math.round(120 + rnd() * 135);
    x.strokeStyle = `rgba(${v},${v},${v},${0.3 + rnd() * 0.5})`;
    x.lineWidth = 0.4 + rnd() * 0.7;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {      // drawn wrapped, so the tile repeats cleanly
      x.beginPath(); x.moveTo(px + ox, py + oy);
      x.quadraticCurveTo(px + ox + Math.cos(a + b) * len * 0.5, py + oy + Math.sin(a + b) * len * 0.5, px + ox + Math.cos(a) * len, py + oy + Math.sin(a) * len);
      x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// Paper grain: a fine, even noise. It's the paper's tooth: the light catches it as bumps, solid ink
// takes it as a fine grit where the paper shows through, and it mottles the shading.
function grainTexture(renderer) {
  const S = 1024, c = document.createElement("canvas"); c.width = c.height = S;
  const x = c.getContext("2d"), img = x.createImageData(S, S);
  let seed = 23; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = 128 + (rnd() + rnd() + rnd() - 1.5) * 80;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

// The paper's slow warp: smooth value noise, normalised to 0–1.
function warpNoise() {
  const hash = (i, j) => { const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return s - Math.floor(s); };
  const value = (x, y) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  return (x, y) => { let s = 0, amp = 0.5; x += 17.3; y += 9.1; for (let o = 0; o < 3; o++) { s += amp * value(x, y); amp *= 0.5; x *= 2; y *= 2; } return s / 0.875; };
}

// One sheet's mesh, shared by every sheet: the shader places each vertex from its uv, so the
// geometry only carries the grid and the warp, sampled at the vertex and one step along u and v.
function sheetGeometry(PH) {
  const geo = new THREE.PlaneGeometry(1, PH, SEG_X, SEG_Y);
  const uv = geo.attributes.uv, n = uv.count, warp = new Float32Array(n * 3), noise = warpNoise();
  const at = (u, v) => noise(u / 0.85, (v - 0.5) * PH / 0.85);
  for (let i = 0; i < n; i++) {
    const u = uv.getX(i), v = uv.getY(i);
    warp[i * 3] = at(u, v); warp[i * 3 + 1] = at(u + STEP, v); warp[i * 3 + 2] = at(u, v + STEP);
  }
  geo.setAttribute("aWarp", new THREE.BufferAttribute(warp, 3));
  return geo;
}

// The sheet's shape, shared by the page material and the shadow pass. x runs from the spine (0)
// to the fore-edge (1); y across the page.
const sheetShape = PH => /* glsl */ `
  uniform float uDir;     // +1 turning forward, -1 back; eased through 0 when a turn reverses
  uniform float uBend;    // arc angle of the roll
  uniform vec2 uTilt;     // direction across the fold line (cos, sin)
  uniform vec2 uSpan;     // where the roll starts across the fold, and how long it is
  uniform vec2 uTurn;     // rotation about the spine (cos, sin)
  uniform float uLift;    // place in the stack: 0 bottom ... 1 top
  attribute vec3 aWarp;
  varying vec2 vSheetUv;
  const float PAGE_H = ${PH.toFixed(5)};
  const float STEP = ${STEP.toFixed(3)};

  // lying open: up out of the gutter, a long shallow sag, a slight fall to the fore-edge
  float restHeight(float x) {
    float rise = sin(clamp(x / 0.16, 0.0, 1.0) * 1.5707963);
    float sag = 0.12 * sin(clamp((x - 0.16) / 0.84, 0.0, 1.0) * 3.1415927);
    float fall = 0.2 * smoothstep(0.72, 1.0, x);
    return 0.004 + 0.028 * (rise - sag - fall);
  }

  vec3 sheetPoint(vec2 uv, float warp) {
    vec2 p = vec2(uv.x, (uv.y - 0.5) * PAGE_H);
    vec2 along = vec2(-uTilt.y, uTilt.x);
    float u = dot(p, uTilt), v = dot(p, along);
    float s = max(0.0, u - uSpan.x);                    // distance past the fold line
    float k = uBend / uSpan.y;                          // curvature of the roll
    float rolled = u, z = 0.0;
    if (k > 1e-4) { rolled = u - s + sin(s * k) / k; z = -uDir * (1.0 - cos(s * k)) / k; }
    z += uLift * 0.1 * (warp - 0.5) * smoothstep(0.0, 0.3, uv.x);
    vec2 q = rolled * uTilt + v * along;
    vec3 r = vec3(q.x * uTurn.x - z * uTurn.y, q.y, q.x * uTurn.y + z * uTurn.x);
    r.z += uLift * restHeight(uv.x);
    return r;
  }
`;

// The page material (front in `map`, back in `uniforms.uBackMap`) and the matching shadow pass.
// The grain is the bump map, so the light finds the paper's tooth wherever it rakes across a page.
function sheetMaterials(PH, uniforms, front, fibre, grain) {
  const shape = sheetShape(PH);
  const mat = new THREE.MeshStandardMaterial({ map: front, side: THREE.DoubleSide, roughness: 0.78, metalness: 0, bumpMap: grain, bumpScale: 0.15 });   // noaoh.com: was 0.6
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms, { uFibre: { value: fibre } });
    sh.vertexShader = shape + sh.vertexShader
      .replace("#include <beginnormal_vertex>", `
        vec3 sheetPos = sheetPoint(uv, aWarp.x);
        vec3 objectNormal = normalize(cross(sheetPoint(uv + vec2(STEP, 0.0), aWarp.y) - sheetPos,
                                            sheetPoint(uv + vec2(0.0, STEP), aWarp.z) - sheetPos));
        vSheetUv = uv;`)
      .replace("#include <begin_vertex>", "vec3 transformed = sheetPos;");
    sh.fragmentShader = "uniform sampler2D uBackMap;\nuniform sampler2D uFibre;\nvarying vec2 vSheetUv;\n" + sh.fragmentShader
      .replace("#include <map_fragment>", `
        float fibre = texture2D(uFibre, vSheetUv * vec2(2.2, ${(2.2 * PH).toFixed(4)})).r;
        fibre *= fibre;
        float grain = texture2D(bumpMap, vBumpMapUv).r;
        float ink = 0.0;
        #ifdef USE_MAP
          vec4 frontInk = texture2D(map, vMapUv);
          vec4 backInk = texture2D(uBackMap, vec2(1.0 - vMapUv.x, vMapUv.y));
          vec4 face = gl_FrontFacing ? frontInk : backInk;
          face.rgb *= mix(vec3(1.0), gl_FrontFacing ? backInk.rgb : frontInk.rgb, 0.035);   // the other side, faintly
          ink = 1.0 - dot(face.rgb, vec3(0.299, 0.587, 0.114));
          face.rgb = mix(face.rgb, vec3(0.93, 0.92, 0.9), ink * smoothstep(0.56, 0.9, grain) * 0.015);   // paper showing through solid ink (noaoh.com: was 0.11)
          diffuseColor *= face;
        #endif
        diffuseColor.rgb *= (1.0 - 0.025 * fibre) * mix(0.95, 1.0, smoothstep(0.0, 0.025, vSheetUv.x));`)
      .replace("#include <roughnessmap_fragment>", `
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor - 0.18 * ink + 0.2 * fibre + 0.05 * (grain - 0.5), 0.05, 1.0);`)   // noaoh.com: grain's shine was 0.3
      .replace("#include <opaque_fragment>", `
        #include <opaque_fragment>
        gl_FragColor.rgb *= 1.0 + (grain - 0.5) * 0.03;   // mottle, the same gentle amount on light and dark pages (noaoh.com: was 0.12, strongest in shade)`);
  };
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  depth.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = shape + sh.vertexShader.replace("#include <begin_vertex>", "vec3 transformed = sheetPoint(uv, aWarp.x);");
  };
  return { mat, depth };
}

// noaoh.com: `bleed` ({ x, y }, a share of the book's box on each side) is room the canvas runs past that box, so a turning
// page and its shadow are never cut; the book is framed in the box at the size it had without it
export async function createZineBook(container, { cover = null, spreads, preserveDrawingBuffer = false, background = null, bleed = { x: 0, y: 0 } } = {}) {
  const imgs = await Promise.all([...(cover ? [cover] : []), ...spreads].map(loadImage));
  const PW = 1, PH = PW / (imgs[0].width / 2 / imgs[0].height);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  const el = renderer.domElement;
  container.append(el);
  Object.assign(el.style, { display: "block", width: "100%", height: "100%", touchAction: "pan-y", userSelect: "none", webkitUserSelect: "none", webkitTouchCallout: "none" });

  const scene = new THREE.Scene();
  if (background) scene.background = new THREE.Color(background);
  const FOV = 28;
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.3, 30);

  // the light: open sky toward the viewer, and one sun, up and to the left, that casts every shadow
  const sky = new THREE.HemisphereLight(0xffffff, 0x8f9498, 1.7);
  sky.position.set(0, 0.4, 1);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.copy(LIGHT_AT);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -1.7, right: 1.7, top: 1.3, bottom: -1.3, near: 1, far: 12 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.001;          // depth bias only: a normal offset would push back faces into their own shadow
  sun.shadow.radius = 4;
  scene.add(sun, sun.target);

  // the table: invisible except for the shadow the book throws on it
  const table = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.ShadowMaterial({ color: 0x241c14, opacity: 0.17 }));
  table.position.z = -0.002;
  table.receiveShadow = true;
  scene.add(table);

  const book = new THREE.Group();
  scene.add(book);
  const geo = sheetGeometry(PH);
  const fibre = fibreTexture(renderer), grain = grainTexture(renderer);
  grain.repeat.set(0.75, 0.75 * PH);                       // about a pixel and a half per grain on a large screen

  // Faces: each image (the cover first, if there is one) split into its two pages. The sheet in slot j
  // carries the right page of face j on its front and the left page of face j+1 on its back, so turning
  // it moves the book on by one spread. Without a cover the faces repeat and the slots run on forever:
  // only the sheets near the open spread exist, recycled from the bottom of one stack to the bottom of
  // the other, where it can't be seen. With a cover the book has a real start and end.
  const faces = imgs.map(img => ({ left: halfTexture(renderer, img, "left"), right: halfTexture(renderer, img, "right") }));
  const M = faces.length, loop = !cover;
  const face = j => faces[((j % M) + M) % M];
  const DEPTH = 5;                                         // resting sheets kept on each side of the open spread
  let target = 0;                                          // where the book is headed: slots below it lie left
  const live = new Map(), spare = [];

  // a sheet sits a little lower the further it is from the top of its stack
  const liftAt = j => 0.3 + 0.7 * Math.pow(0.82, j >= target ? j - target : target - 1 - j);
  const atRest = s => !s.flight && s.p === (s.j < target ? 1 : 0);

  function place(j) {
    let s = spare.pop();
    if (!s) {
      const u = { uDir: { value: 1 }, uBend: { value: 0 }, uTilt: { value: new THREE.Vector2(1, 0) }, uSpan: { value: new THREE.Vector2(0, 1) }, uTurn: { value: new THREE.Vector2(1, 0) }, uLift: { value: 1 }, uBackMap: { value: null } };
      const { mat, depth } = sheetMaterials(PH, u, faces[0].right, fibre, grain);
      const mesh = new THREE.Mesh(geo, mat);
      Object.assign(mesh, { customDepthMaterial: depth, castShadow: true, receiveShadow: true, frustumCulled: false });
      book.add(mesh);
      s = { mesh, u };
    }
    const d = j < target ? -1 : 1;
    Object.assign(s, { j, p: j < target ? 1 : 0, dir: d, dirS: d, curl: CURL, curlT: CURL, tilt: 0, tiltT: 0, lift: liftAt(j), flight: null });
    s.mesh.material.map = face(j).right;
    s.u.uBackMap.value = face(j + 1).left;
    s.mesh.visible = true;
    live.set(j, s);
    shape(s);
    return s;
  }
  function retire(s) { s.mesh.visible = false; live.delete(s.j); spare.push(s); }

  // keep DEPTH resting sheets on each side of the open spread and two under anything in the air;
  // let the rest go once they've settled
  function fill() {
    if (!loop) return;
    let lo = target - DEPTH, hi = target + DEPTH - 1;
    for (const s of live.values()) if (!atRest(s)) { lo = Math.min(lo, s.j - 2); hi = Math.max(hi, s.j + 2); }
    for (const s of [...live.values()]) if ((s.j < lo || s.j > hi) && atRest(s)) retire(s);
    for (let j = lo; j <= hi; j++) if (!live.has(j)) place(j);
  }

  // a sheet's state → its shape uniforms. The roll peaks mid-turn and is capped so a tilted fold
  // never rolls tighter than a straight one; the spine runs ahead by part of the roll.
  function shape(s) {
    const c = Math.cos(s.tilt), sn = Math.sin(s.tilt);
    const len = Math.max(0.25, c * PW);
    const bend = Math.sin(Math.PI * s.p) * Math.min(Math.PI * s.curl, MAX_CURVE * len);
    const lead = bend > 1e-4 ? LEAD * c * (1 - Math.cos(bend)) / bend : 0;
    const angle = Math.PI * s.p + s.dirS * lead;
    const u = s.u;
    u.uDir.value = s.dirS;
    u.uBend.value = bend;
    u.uTilt.value.set(c, sn);
    u.uSpan.value.set((PH / 2) * Math.abs(sn), len);
    u.uTurn.value.set(Math.cos(angle), Math.sin(angle));
    u.uLift.value = s.lift;
  }

  // with a cover, keep the book centered: a closed book shows one page, an open one shows two
  function center() {
    if (loop) return;
    let f = 0;
    for (const s of live.values()) f += s.p;
    book.position.x = f <= 1 ? -PW / 2 * (1 - smooth(clamp(f, 0, 1))) : f >= M - 1 ? PW / 2 * smooth(clamp(f - (M - 1), 0, 1)) : 0;
  }

  if (loop) fill(); else for (let j = 0; j < M; j++) place(j);
  const hover = { side: 0, pt: null };
  const tiltAt = pt => pt ? clamp(-(pt.y / (PH / 2)) * Math.min(1, Math.abs(pt.x) / PW), -1, 1) * MAX_TILT : 0;

  // Every turn starts at once, even while earlier pages are still in the air, so quick clicks riffle.
  function turn(dir, pt = null) {
    const j = dir > 0 ? target : target - 1;
    if (!loop && (j < 0 || j >= M)) return;
    target += dir;
    fill();                                                // the sheet in slot j stays: it's on its way
    const s = live.get(j), to = dir > 0 ? 1 : 0;
    s.flight = { from: s.p, to, start: performance.now(), dur: TURN_MS * Math.max(0.25, Math.abs(to - s.p)) };
    s.dir = dir;
    s.curlT = CURL * (1 - 0.16 * Math.random());            // no two pages roll quite alike
    s.tiltT = tiltAt(pt) + (Math.random() - 0.5) * 0.1;
    wake();
  }

  // advance every sheet; true while anything is still moving
  function update(now, dt) {
    let busy = false;
    for (const s of live.values()) {
      if (s.flight) {
        const f = s.flight, t = clamp((now - f.start) / f.dur, 0, 1);
        s.p = f.from + (f.to - f.from) * (0.5 - 0.5 * Math.cos(Math.PI * t));
        if (t >= 1) s.flight = null;
        busy = true;
      } else {
        let goal = s.j < target ? 1 : 0;
        if ((hover.side > 0 && s.j === target) || (hover.side < 0 && s.j === target - 1)) {
          goal = goal ? 1 - HOVER_LIFT : HOVER_LIFT;
          s.tiltT = tiltAt(hover.pt); s.curlT = CURL;
        }
        s.dir = goal > 0.5 ? -1 : 1;                        // lifting off the left stack curls like a turn back
        if (Math.abs(goal - s.p) > 1e-4) { s.p = approach(s.p, goal, dt, 0.28); busy = true; } else s.p = goal;
      }
      const ease = (key, goal, tau) => { if (Math.abs(goal - s[key]) > 1e-4) { s[key] = approach(s[key], goal, dt, tau); busy = true; } else s[key] = goal; };
      ease("dirS", s.dir, 0.12); ease("curl", s.curlT, 0.1); ease("tilt", s.tiltT, 0.1); ease("lift", liftAt(s.j), 0.2);
      shape(s);
    }
    fill();
    center();
    return busy;
  }

  let raf = 0, last = 0, dirty = true, manual = false;
  function frame(now) {
    raf = 0;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
    last = now;
    const busy = manual ? false : update(now, dt);
    if (busy || dirty) { renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); dirty = false; }
    if (busy) raf = requestAnimationFrame(frame); else last = 0;
  }
  function wake() { dirty = true; if (!raf) raf = requestAnimationFrame(frame); }

  // Frame the open spread with room for a turning page, which rises toward the camera.
  function resize() {
    const w = container.clientWidth || 800, h = container.clientHeight || 500;
    renderer.setSize(w, h, false);
    // noaoh.com: framed in the box inside the bleed, then the view widened to the whole canvas at that distance
    const wi = w / (1 + 2 * bleed.x), hi = h / (1 + 2 * bleed.y), aspect = wi / hi;
    const t = Math.tan(THREE.MathUtils.degToRad(FOV) / 2), narrow = wi < 720;   // phones: let the spread use the width
    const halfW = PW * (narrow ? 1.04 : 1.14), halfH = (PH / 2) * (narrow ? 1.12 : 1.24);
    const dist = Math.max(halfH / t, halfW / (t * aspect), RISE + (PH / 2) / (0.94 * t));
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan((t * h) / hi));
    camera.aspect = w / h;
    camera.position.set(0, 0, dist);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    wake();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  // pointer → point on the book plane, in book space
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
  function bookPoint(e) {
    const r = el.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (!ray.ray.intersectPlane(plane, hit)) return null;
    return { x: hit.x - book.position.x, y: hit.y };
  }
  const onBook = p => p && Math.abs(p.y) <= (PH / 2) * 1.08 && Math.abs(p.x) <= PW * 1.04;
  const canTurn = p => onBook(p) && (loop || (p.x >= 0 ? target < M : target > 0));

  // tap or click a page to turn it; swipe left or right anywhere on the book. Vertical swipes scroll.
  let down = null;
  el.addEventListener("pointerdown", e => { if (e.button === 0) down = { x: e.clientX, y: e.clientY, p: bookPoint(e) }; });
  el.addEventListener("pointermove", e => {
    if (e.pointerType !== "mouse" || down) return;
    const p = bookPoint(e), on = onBook(p);
    hover.side = on ? (p.x >= 0 ? 1 : -1) : 0;
    hover.pt = on ? p : null;
    el.style.cursor = canTurn(p) ? "pointer" : "default";
    wake();
  });
  el.addEventListener("pointerup", e => {
    if (!down) return;
    const dx = e.clientX - down.x, dy = e.clientY - down.y, r = el.getBoundingClientRect();
    if (Math.abs(dx) > Math.max(36, r.width * 0.05) && Math.abs(dx) > Math.abs(dy) * 1.2) turn(dx < 0 ? 1 : -1, down.p);
    else if (Math.hypot(dx, dy) < 10 && onBook(down.p)) turn(down.p.x >= 0 ? 1 : -1, down.p);
    down = null;
  });
  el.addEventListener("pointercancel", () => { down = null; });
  el.addEventListener("pointerleave", () => { if (!down) { hover.side = 0; hover.pt = null; wake(); } });
  const onKey = e => { if (e.key === "ArrowRight") turn(1); else if (e.key === "ArrowLeft") turn(-1); };
  window.addEventListener("keydown", onKey);

  return {
    canvas: el,
    next: () => turn(1),
    prev: () => turn(-1),
    // the open spread (0 … spreads − 1); with a cover, how many sheets are turned
    get page() { return loop ? ((target % M) + M) % M : target; },
    // scripted frames for recordings and checks: rest at slot k, with any sheets (by slot) held
    // mid-turn, e.g. pose({ k: 2, flips: [{ sheet: 2, progress: 0.4, tilt: -0.3 }] })
    pose({ k = 0, flips = [] } = {}) {
      manual = true;
      target = k;
      hover.side = 0;
      for (const s of live.values()) {
        const d = s.j < k ? -1 : 1;
        Object.assign(s, { flight: null, p: s.j < k ? 1 : 0, dir: d, dirS: d, curl: CURL, curlT: CURL, tilt: 0, tiltT: 0, lift: liftAt(s.j) });
      }
      fill();
      for (const f of flips) {
        const s = live.get(f.sheet) || place(f.sheet), d = f.dir ?? 1, tilt = f.tilt ?? 0, curl = f.curl ?? CURL;
        Object.assign(s, { p: f.progress, dir: d, dirS: d, tilt, tiltT: tilt, curl, curlT: curl });
      }
      for (const s of live.values()) shape(s);
      center();
      renderer.shadowMap.needsUpdate = true;
      renderer.render(scene, camera);
    },
    release() { manual = false; wake(); },
    sheets: M,
    destroy() {
      cancelAnimationFrame(raf); ro.disconnect(); window.removeEventListener("keydown", onKey);
      for (const s of [...live.values(), ...spare]) { s.mesh.material.dispose(); s.mesh.customDepthMaterial.dispose(); }
      for (const f of faces) { f.left.dispose(); f.right.dispose(); }
      geo.dispose(); fibre.dispose(); grain.dispose(); renderer.dispose(); el.remove();
    },
  };
}
