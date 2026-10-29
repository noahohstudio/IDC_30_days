// BoomLoom Display, glyph viewer. After the Glyphs section of paper.design/mono: a window on the left
// shows one letter large; a picker on the right holds all 26. "Outline" is the working view: the
// construction it was drawn on (as in the brand guidelines: the o's rings wherever a curve turns,
// stripes for the straight strokes), the outline, its handles and points. Over a point the cursor
// becomes a pen: pull the point and it stretches, let go and it springs back. "Fill" shows the letter.
// In the corner, the letter's counts of points, handles and circles; hovering one names it.
// The face doesn't keep regular metrics, so there are no metric lines: each letter simply sits centered,
// every one at the same scale. The viewer's few words take the page's own font.
//
//   import { createGlyphViewer } from "./glyph-viewer.js";
//   createGlyphViewer(el, { font: "/assets/foundation/BoomLoomDisplay-Regular.otf" });
//
// Reads the real font file with opentype.js (1.3.4), imported as "opentype.js".
//
// noaoh.com: this is the frozen copy from the BoomLoom handoff with one addition, the `construction`
// option (a second font to find the rings and stripes in). Its look is restyled from the site's CSS.

import { parse } from "opentype.js";

const LETTERS = "abcdefghijklmnopqrstuvwxyz";
const PULL = 0.1;                                 // pulls past about this share of the em meet more and more resistance
const SPRING = { ratio: 0.67, freq: 46 };         // the snap back: a little overshoot, settled in about a fifth of a second
const C = { paper: "#F3F1EC", ink: "#222222", blue: "#4C6BDB", red: "#FF3130", muted: "#8C8A85", rule: "rgba(34,34,34,0.2)" };
const NS = "http://www.w3.org/2000/svg";
const PEN = (() => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="1.1" stroke-linejoin="round">
    <path d="M2.5 2.5l10 3.6 5.2 5.2-6.4 6.4-5.2-5.2z" fill="#fff"/><path d="M2.5 2.5l6.3 6.3"/><circle cx="10" cy="10" r="1.5" fill="#fff"/>
    <path d="M15.6 13.4l4.6 4.6-2.2 2.2-4.6-4.6" fill="#fff"/></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 2, pointer`;
})();

const same = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.5;

// A cubic that traces a circular arc → that circle: the normals at both ends meet at its center.
function arcOf(p0, c1, c2, p3) {
  let ax = c1.x - p0.x, ay = c1.y - p0.y; if (Math.hypot(ax, ay) < 1e-6) { ax = c2.x - p0.x; ay = c2.y - p0.y; }
  let bx = p3.x - c2.x, by = p3.y - c2.y; if (Math.hypot(bx, by) < 1e-6) { bx = p3.x - c1.x; by = p3.y - c1.y; }
  const n0x = -ay, n0y = ax, n1x = -by, n1y = bx, det = n1x * n0y - n0x * n1y;
  if (Math.abs(det) < 1e-9) return null;
  const a = (n1x * (p3.y - p0.y) - (p3.x - p0.x) * n1y) / det;
  const cx = p0.x + a * n0x, cy = p0.y + a * n0y, r = Math.hypot(p0.x - cx, p0.y - cy);
  const mx = (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8, my = (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8;
  if (Math.abs(Math.hypot(p3.x - cx, p3.y - cy) - r) > 0.03 * r || Math.abs(Math.hypot(mx - cx, my - cy) - r) > 0.03 * r) return null;
  return { x: cx, y: cy, r };
}

// One letter as an editor sees it, in font units (y down, baseline 0): points that are corners,
// smooth points or handles; the commands that draw it; which handles hang off which point; and on
// smooth points, which two handles must stay in line.
function outlineModel(font, ch) {
  const upm = font.unitsPerEm, g = font.charToGlyph(ch);
  const contours = [];
  let cur = null;
  for (const c of g.getPath(0, 0, upm).commands) {
    const last = () => (cur.segs.length ? cur.segs[cur.segs.length - 1].to : cur.start);
    if (c.type === "M") { cur = { start: { x: c.x, y: c.y }, segs: [] }; contours.push(cur); }
    else if (c.type === "L") cur.segs.push({ to: { x: c.x, y: c.y } });
    else if (c.type === "C") cur.segs.push({ c1: { x: c.x1, y: c.y1 }, c2: { x: c.x2, y: c.y2 }, to: { x: c.x, y: c.y } });
    else if (c.type === "Q") {
      const p0 = last(), q = { x: c.x1, y: c.y1 }, to = { x: c.x, y: c.y };
      cur.segs.push({ c1: { x: p0.x + (q.x - p0.x) * 2 / 3, y: p0.y + (q.y - p0.y) * 2 / 3 }, c2: { x: to.x + (q.x - to.x) * 2 / 3, y: to.y + (q.y - to.y) * 2 / 3 }, to });
    }
  }
  const points = [], commands = [], handles = [], attached = {}, mirrored = {}, arcs = [], lines = [];
  const add = (p, kind) => points.push({ x: p.x, y: p.y, kind }) - 1;
  const line = (a, b) => lines.push({ x1: points[a].x, y1: points[a].y, x2: points[b].x, y2: points[b].y });
  for (const k of contours) {
    let segs = k.segs;
    if (segs.length && !segs[segs.length - 1].c1 && same(segs[segs.length - 1].to, k.start)) segs = segs.slice(0, -1);
    const closes = segs.length && same(segs[segs.length - 1].to, k.start);
    const start = add(k.start, "corner"), runs = [];
    commands.push({ type: "M", ids: [start] });
    let from = start;
    segs.forEach((s, i) => {
      const to = i === segs.length - 1 && closes ? start : add(s.to, "corner");
      if (s.c1) {
        const a = add(s.c1, "control"), b = add(s.c2, "control");
        commands.push({ type: "C", ids: [a, b, to] });
        handles.push([from, a], [to, b]);
        (attached[from] ??= []).push(a); (attached[to] ??= []).push(b);
        runs.push({ from, a, b, to });
        const arc = arcOf(points[from], s.c1, s.c2, points[to]);
        if (arc && arc.r > upm * 0.04 && arc.r < upm * 0.6) arcs.push(arc);
      } else { commands.push({ type: "L", ids: [to] }); runs.push({ from, to }); line(from, to); }
      from = to;
    });
    if (!closes) { runs.push({ from, to: start }); line(from, start); }  // the line Z draws back to the start
    commands.push({ type: "Z", ids: [] });
    // a point is smooth when the way in and the way out line up through it
    runs.forEach((r, i) => {
      const prev = runs[(i - 1 + runs.length) % runs.length], p = points[r.from];
      const into = prev.b != null && !same(points[prev.b], p) ? points[prev.b] : prev.a != null && !same(points[prev.a], p) ? points[prev.a] : points[prev.from];
      const out = r.a != null && !same(points[r.a], p) ? points[r.a] : r.b != null && !same(points[r.b], p) ? points[r.b] : points[r.to];
      const ax = p.x - into.x, ay = p.y - into.y, bx = out.x - p.x, by = out.y - p.y, la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
      if (la > 0 && lb > 0 && Math.abs(ax * by - ay * bx) / (la * lb) < 0.03 && ax * bx + ay * by > 0) p.kind = "smooth";
    });
  }
  for (const [id, hs] of Object.entries(attached)) {
    if (points[id].kind !== "smooth" || hs.length !== 2) continue;
    mirrored[hs[0]] = { anchor: Number(id), opposite: hs[1] };
    mirrored[hs[1]] = { anchor: Number(id), opposite: hs[0] };
  }
  const bb = g.getBoundingBox();
  return { ch, x1: bb.x1, x2: bb.x2, top: -bb.y2, bottom: -bb.y1, points, commands, handles, attached, mirrored, arcs, lines };
}

const at = (m, offs, id) => { const p = m.points[id], o = offs[id]; return o ? { x: p.x + o.x, y: p.y + o.y } : p; };
const pathOf = (m, offs) => m.commands.map(({ type, ids }) => type + ids.map(id => { const p = at(m, offs, id); return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`; }).join(" ")).join("");

// The construction, as drawn in the brand guidelines: every curve in the face comes from one unit, the
// o's four rings, set down wherever a curve turns; straight strokes are stripes one stroke wide.
// The unit's radii come from the o itself.
function unitRadii(o, upm) {
  const rs = [];
  for (const a of o.arcs) if (!rs.some(r => Math.abs(r - a.r) < upm * 0.006)) rs.push(a.r);
  return rs.sort((a, b) => b - a);
}

// Where a letter sets the unit down: the centers its true arcs turn about. Curves that only blend one
// shape into the next don't sit on the unit's rings, so they're left out. A dot like the i's uses the
// inner rings only.
function unitsOf(m, unit, upm) {
  const found = [];
  for (const a of m.arcs) {
    const k = unit.findIndex(R => Math.abs(a.r - R) <= upm * 0.006);
    if (k < 0) continue;
    let c = found.find(c => Math.hypot(c.x - a.x, c.y - a.y) < upm * 0.016);
    if (!c) found.push(c = { x: a.x, y: a.y, members: [], rings: new Set() });
    c.members.push({ x: a.x, y: a.y, off: Math.abs(a.r - unit[k]) }); c.rings.add(k);
  }
  return found.filter(c => c.rings.size >= 2).map(c => {
    const best = c.members.filter(a => a.off <= upm * 0.003), use = best.length ? best : c.members;
    return {
      x: use.reduce((s, a) => s + a.x, 0) / use.length, y: use.reduce((s, a) => s + a.y, 0) / use.length,
      radii: c.rings.has(0) || c.rings.has(1) ? unit : unit.slice(2),
    };
  });
}

// Straight strokes: two parallel edges a stroke apart with ink between them make a stripe, and the
// construction draws its rectangle (a square where the stripe is only a stroke long).
function stripesOf(m, stroke) {
  const ink = new Path2D(pathOf(m, {})), probe = document.createElement("canvas").getContext("2d");
  const vert = [], hori = [], rects = [];
  for (const l of m.lines) {
    const dx = Math.abs(l.x2 - l.x1), dy = Math.abs(l.y2 - l.y1);
    if (dx < 1 && dy > stroke * 0.25) vert.push({ at: l.x1, a: Math.min(l.y1, l.y2), b: Math.max(l.y1, l.y2) });
    if (dy < 1 && dx > stroke * 0.25) hori.push({ at: l.y1, a: Math.min(l.x1, l.x2), b: Math.max(l.x1, l.x2) });
  }
  const pair = (list, make) => list.forEach((p, i) => list.slice(i + 1).forEach(q => {
    const d = Math.abs(p.at - q.at), a = Math.max(p.a, q.a), b = Math.min(p.b, q.b);
    if (Math.abs(d - stroke) > stroke * 0.12 || b - a < stroke * 0.25) return;
    const r = make(Math.min(p.at, q.at), d, a, b - a);
    if (!probe.isPointInPath(ink, r.x + r.w / 2, r.y + r.h / 2)) return;
    if (!rects.some(o => Math.abs(o.x - r.x) < 2 && Math.abs(o.y - r.y) < 2 && Math.abs(o.w - r.w) < 2 && Math.abs(o.h - r.h) < 2)) rects.push(r);
  }));
  pair(vert, (x, d, y, h) => ({ x, y, w: d, h }));
  pair(hori, (y, d, x, w) => ({ x, y, w, h: d }));
  return rects;
}

// Pull one point by d: its handles come with it, and if it's a handle on a smooth point, the handle
// opposite turns and stretches the same way so the curve stays smooth.
function pull(m, id, d) {
  const offs = { [id]: d };
  for (const h of m.attached[id] ?? []) offs[h] = d;
  const mir = m.mirrored[id];
  if (mir) {
    const A = m.points[mir.anchor], P = m.points[id], O = m.points[mir.opposite];
    const v = { x: P.x - A.x, y: P.y - A.y }, w = { x: v.x + d.x, y: v.y + d.y }, vv = v.x * v.x + v.y * v.y;
    if (vv > 0) {
      const re = (v.x * w.x + v.y * w.y) / vv, im = (v.x * w.y - v.y * w.x) / vv, u = { x: O.x - A.x, y: O.y - A.y };
      offs[mir.opposite] = { x: u.x * (re - 1) - u.y * im, y: u.x * im + u.y * (re - 1) };
    }
  }
  return offs;
}

// rubber band: the further the pull, the less each extra unit moves the point
const band = (d, r) => { const n = Math.hypot(d.x, d.y); if (!n) return d; const k = (r * Math.log1p(n / r)) / n; return { x: d.x * k, y: d.y * k }; };

let styled = false;
function addStyles() {
  if (styled) return; styled = true;
  const st = document.createElement("style");
  st.textContent = `
  .bl-gv { position: relative; width: 100%; box-sizing: border-box; display: grid; grid-template-columns: 1.2fr 1fr;
    border: 1px dashed ${C.rule}; background: ${C.paper}; color: ${C.ink}; font-size: 12px; font-weight: 500; line-height: 1; -webkit-user-select: none; user-select: none; }
  .bl-gv button { font: inherit; }
  .bl-gv.narrow { grid-template-columns: 1fr; grid-template-rows: auto auto; }
  .bl-gv .win { position: relative; min-width: 0; min-height: 0; border-right: 1px dashed ${C.rule}; }
  .bl-gv.narrow .win { height: var(--win); border-right: 0; border-bottom: 1px dashed ${C.rule}; }
  .bl-gv .toggle { position: absolute; top: 12px; left: 12px; z-index: 2; display: inline-flex; gap: 2px; padding: 3px; border-radius: 8px; background: rgba(0,0,0,0.05); }
  .bl-gv .toggle button { padding: 7px 11px; border: 0; border-radius: 6px; background: transparent; color: rgba(0,0,0,0.5); cursor: pointer; transition: background .15s, color .15s, box-shadow .15s; }
  .bl-gv .toggle button[aria-pressed="true"], .bl-gv .stat::after { background: rgba(250,251,255,0.8); color: rgba(0,0,0,0.82); -webkit-backdrop-filter: blur(8px) saturate(1.4); backdrop-filter: blur(8px) saturate(1.4);
    box-shadow: inset 0 1px 0 rgba(255,255,255,0.75), inset 0 0 0 1px rgba(255,255,255,0.6), 0 0 1px rgba(0,0,0,0.2), 0 1px 3px -1px rgba(0,0,0,0.14); }
  .bl-gv .stats { position: absolute; left: 14px; bottom: 10px; z-index: 2; display: flex; align-items: baseline; gap: 3px; color: ${C.muted}; font-variant-numeric: tabular-nums; }
  .bl-gv .stat { position: relative; padding: 4px 2px; cursor: default; outline: none; transition: color .15s; }
  .bl-gv .stat:hover, .bl-gv .stat:focus-visible { color: ${C.ink}; }
  .bl-gv .stat::after { content: attr(data-label); position: absolute; left: -7px; bottom: calc(100% + 4px); transform: translateY(3px); padding: 6px 9px; border-radius: 6px;
    white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity .15s, transform .15s; }
  .bl-gv .stat:hover::after, .bl-gv .stat:focus-visible::after { opacity: 1; transform: none; }
  .bl-gv .stage { position: absolute; inset: 0; overflow: hidden; }
  .bl-gv .stage svg { position: absolute; inset: 0; width: 100%; height: 100%; }
  .bl-gv .stage .glyph { transition: fill-opacity .2s; }
  .bl-gv .working { transition: opacity .2s; }
  .bl-gv.fill .working { opacity: 0; }
  .bl-gv .points { position: absolute; inset: 0; pointer-events: none; transition: opacity .2s; }
  .bl-gv.fill .points { opacity: 0; visibility: hidden; }
  .bl-gv .pt { position: absolute; width: 20px; height: 20px; margin: -10px 0 0 -10px; display: flex; align-items: center; justify-content: center; touch-action: none; }
  @media (pointer: fine) and (hover: hover) { .bl-gv .pt { pointer-events: auto; cursor: ${PEN}; } }
  .bl-gv .pt i { display: block; flex: none; box-sizing: border-box; }
  .bl-gv .pt.corner i { width: 5px; height: 5px; background: ${C.ink}; }
  .bl-gv .pt.smooth i { width: 5px; height: 5px; background: ${C.blue}; transform: rotate(45deg); }
  .bl-gv .pt.control i { width: 5px; height: 5px; border-radius: 50%; border: 0.5px solid ${C.ink}; background: ${C.paper}; transition: border-color .15s, border-width .15s; }
  .bl-gv .pt.control:hover i, .bl-gv .pt.control.held i { border: 1px solid ${C.blue}; }
  .bl-gv .pick { min-width: 0; min-height: 0; }
  .bl-gv .grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-rows: var(--cell, 80px); min-height: 0; }
  .bl-gv.narrow .grid { grid-template-columns: repeat(9, minmax(0, 1fr)); }
  .bl-gv .grid > * { border: 0; border-right: 1px dashed ${C.rule}; border-bottom: 1px dashed ${C.rule}; background: transparent; padding: 0; margin: 0; min-width: 0; min-height: 0; }
  .bl-gv .grid button { display: flex; align-items: center; justify-content: center; font: 400 var(--letter, 28px)/1 "BoomLoom Display"; color: ${C.ink}; cursor: pointer; transition: background .12s; }
  .bl-gv .grid button[aria-current="true"] { background: rgba(34,34,34,0.07); }
  `;
  document.head.append(st);
}

export async function createGlyphViewer(container, { font: url = "/assets/foundation/BoomLoomDisplay-Regular.otf", construction = null } = {}) {
  // one download serves both: the outlines for the window, the face for the picker
  const load = async u => {
    const res = await fetch(u);
    if (!res.ok) throw new Error(`glyph viewer: couldn't load ${u} (${res.status})`);
    return res.arrayBuffer();
  };
  const bytes = await load(url), font = parse(bytes);
  document.fonts.add(await new FontFace("BoomLoom Display", bytes).load());
  const upm = font.unitsPerEm;
  const models = Object.fromEntries([...LETTERS].map(ch => [ch, outlineModel(font, ch)]));
  const all = Object.values(models);
  // noaoh.com addition: the construction can come from another cut of the font, the letters as
  // first drawn, so simplifying the outlines never loses a ring a letter was built on
  const bases = construction
    ? (base => Object.fromEntries([...LETTERS].map(ch => [ch, outlineModel(base, ch)])))(parse(await load(construction)))
    : models;
  const unit = unitRadii(bases.o, upm), stroke = unit[0] - unit[1];
  for (const ch of LETTERS) { models[ch].units = unitsOf(bases[ch], unit, upm); models[ch].rects = stripesOf(bases[ch], stroke); }
  // one frame, centered on the origin and big enough for the largest letter, so all show at one scale
  const big = Math.max(...all.map(m => m.x2 - m.x1)), tall = Math.max(...all.map(m => m.bottom - m.top));
  const vb = { w: big + upm * 0.3, h: tall + upm * 0.3 };
  vb.x = -vb.w / 2; vb.y = -vb.h / 2;

  addStyles();
  const root = document.createElement("div");
  root.className = "bl-gv";
  root.innerHTML = `
    <div class="win">
      <div class="stage">
        <svg viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <g class="working guides" fill="none" stroke="${C.red}" stroke-opacity="0.32"></g>
          <g class="letter"><path class="glyph" fill="${C.ink}" stroke="${C.ink}" stroke-width="1" vector-effect="non-scaling-stroke"/>
            <g class="working handles" stroke="${C.ink}" stroke-opacity="0.4"></g></g>
        </svg>
        <div class="points"></div>
        <div class="toggle" role="group" aria-label="View"><button type="button" data-mode="outline">Outline</button><button type="button" data-mode="fill">Fill</button></div>
        <div class="stats"><span class="stat" tabindex="0" data-label="points"></span>.<span class="stat" tabindex="0" data-label="handles"></span>.<span class="stat" tabindex="0" data-label="circles"></span></div>
      </div>
    </div>
    <div class="pick"><div class="grid"></div></div>`;
  container.append(root);
  const $ = s => root.querySelector(s);
  const svg = $("svg"), path = $(".glyph"), letterG = $(".letter"), handlesG = $(".handles"), guidesG = $(".guides"), pointsEl = $(".points");
  const stats = [...root.querySelectorAll(".stat")];

  // the picker: every letter, then empty cells to finish the last row
  const grid = $(".grid"), cells = [];
  for (const ch of LETTERS) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = ch; b.setAttribute("aria-label", `Show ${ch}`);
    grid.append(b); cells.push(b);
  }
  const fillers = [];
  const pad = () => {
    fillers.forEach(f => f.remove()); fillers.length = 0;
    const cols = root.classList.contains("narrow") ? 9 : 6;
    for (let i = 0; i < (cols - (LETTERS.length % cols)) % cols; i++) { const f = document.createElement("div"); grid.append(f); fillers.push(f); }
  };

  let m = null, mode = "outline", offs = {}, held = null, spring = null, raf = 0, pts = [];

  // map font units to pixels in the stage, as the svg's viewBox does
  let map = { s: 1, ox: 0, oy: 0 };
  function measure() {
    const r = svg.getBoundingClientRect(), s = Math.min(r.width / vb.w, r.height / vb.h);
    map = { s, ox: (r.width - vb.w * s) / 2 - vb.x * s, oy: (r.height - vb.h * s) / 2 - vb.y * s };
  }

  function draw() {
    path.setAttribute("d", pathOf(m, offs));
    m.handles.forEach(([a, b], i) => {
      const l = handlesG.children[i], p = at(m, offs, a), q = at(m, offs, b);
      l.setAttribute("x1", p.x); l.setAttribute("y1", p.y); l.setAttribute("x2", q.x); l.setAttribute("y2", q.y);
    });
    pts.forEach((el, id) => { const p = at(m, offs, id); el.style.left = `${map.ox + p.x * map.s}px`; el.style.top = `${map.oy + p.y * map.s}px`; });
  }

  function show(ch) {
    m = models[ch]; offs = {}; held = null; spring = null;
    shift = { x: -(m.x1 + m.x2) / 2, y: -(m.top + m.bottom) / 2 };          // center the letter itself
    letterG.setAttribute("transform", `translate(${shift.x} ${shift.y})`);
    guidesG.setAttribute("transform", `translate(${shift.x} ${shift.y})`);
    const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); Object.entries({ ...attrs, "vector-effect": "non-scaling-stroke", "stroke-width": 0.8 }).forEach(([a, v]) => e.setAttribute(a, v)); return e; };
    const k = upm * 0.012;
    guidesG.replaceChildren(
      ...m.units.flatMap(u => [...u.radii.map(r => el("circle", { cx: u.x, cy: u.y, r })), el("path", { d: `M${u.x - k} ${u.y}H${u.x + k}M${u.x} ${u.y - k}V${u.y + k}` })]),
      ...m.rects.map(r => el("rect", { x: r.x, y: r.y, width: r.w, height: r.h })),
    );
    handlesG.replaceChildren(...m.handles.map(() => { const l = document.createElementNS(NS, "line"); l.setAttribute("vector-effect", "non-scaling-stroke"); l.setAttribute("stroke-width", 0.6); return l; }));
    pts = m.points.map((p, id) => {
      const el = document.createElement("span");
      el.className = `pt ${p.kind}`; el.append(document.createElement("i")); el.dataset.id = id;
      return el;
    });
    pointsEl.replaceChildren(...pts);
    placeAll();
    // the counts, bare; hovering one names it. A circle is one placing of the o's rings.
    const anchors = m.points.filter(p => p.kind !== "control").length;
    [anchors, m.points.length - anchors, m.units.length].forEach((n, i) => { const w = stats[i].dataset.label; stats[i].textContent = n; stats[i].setAttribute("aria-label", `${n} ${n === 1 ? w.slice(0, -1) : w}`); });
    cells.forEach(b => b.setAttribute("aria-current", String(b.textContent === ch)));
  }
  let shift = { x: 0, y: 0 };
  const placeAll = () => { measure(); map.ox += shift.x * map.s; map.oy += shift.y * map.s; draw(); };

  function setMode(next) {
    mode = next;
    root.classList.toggle("fill", mode === "fill");
    path.setAttribute("fill-opacity", mode === "fill" ? 1 : 0.06);
    path.setAttribute("stroke-opacity", mode === "fill" ? 0 : 1);
    root.querySelectorAll(".toggle button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  }
  root.querySelectorAll(".toggle button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));

  // choosing a letter: click, or rest the pointer on it a moment (so passing over cells doesn't flip the window)
  let intent = 0;
  cells.forEach(b => {
    b.addEventListener("click", () => show(b.textContent));
    b.addEventListener("pointerenter", e => { if (e.pointerType !== "mouse") return; clearTimeout(intent); intent = setTimeout(() => show(b.textContent), 90); });
    b.addEventListener("pointerleave", () => clearTimeout(intent));
  });

  // pulling a point with the pen
  const toUnits = (e, grab) => ({ x: (e.clientX - grab.cx) / map.s, y: (e.clientY - grab.cy) / map.s });
  pointsEl.addEventListener("pointerdown", e => {
    const el = e.target.closest(".pt");
    if (!el || mode !== "outline" || e.pointerType === "touch" || (e.pointerType === "mouse" && e.button !== 0)) return;
    e.preventDefault();
    spring = null; offs = {};
    const id = Number(el.dataset.id);
    held = { id, el, pointer: e.pointerId, grab: { cx: e.clientX, cy: e.clientY }, d: { x: 0, y: 0 }, v: { x: 0, y: 0 }, t: performance.now() };
    el.classList.add("held");
    try { el.setPointerCapture(e.pointerId); } catch {}
    draw();
  });
  pointsEl.addEventListener("pointermove", e => {
    if (!held || e.pointerId !== held.pointer) return;
    const now = performance.now(), dt = Math.max(8, now - held.t) / 1000;
    const d = band(toUnits(e, held.grab), upm * PULL);
    held.v = { x: (d.x - held.d.x) / dt, y: (d.y - held.d.y) / dt };
    held.d = d; held.t = now;
    offs = pull(m, held.id, d);
    draw();
  });
  const letGo = e => {
    if (!held || e.pointerId !== held.pointer) return;
    held.el.classList.remove("held");
    try { held.el.releasePointerCapture(e.pointerId); } catch {}
    const v = Math.hypot(held.v.x, held.v.y), cap = Math.min(1, (upm * 3) / (v || 1)) * 0.5;   // carry some of the pull's speed, never a fling
    spring = { id: held.id, x: held.d.x, y: held.d.y, vx: held.v.x * cap, vy: held.v.y * cap, last: performance.now() };
    held = null;
    if (!raf) raf = requestAnimationFrame(settle);
  };
  pointsEl.addEventListener("pointerup", letGo);
  pointsEl.addEventListener("pointercancel", letGo);

  // the snap back: a damped spring on the pulled point, its handles following as when it was pulled
  function settle(now) {
    raf = 0;
    if (!spring) return;
    const k = SPRING.freq * SPRING.freq, c = 2 * SPRING.ratio * SPRING.freq;
    let dt = Math.min(0.05, (now - spring.last) / 1000); spring.last = now;
    for (const h = 1 / 240; dt > 0; dt -= h) {
      const step = Math.min(h, dt);
      spring.vx += (-k * spring.x - c * spring.vx) * step; spring.x += spring.vx * step;
      spring.vy += (-k * spring.y - c * spring.vy) * step; spring.y += spring.vy * step;
    }
    const done = Math.hypot(spring.x, spring.y) < 0.05 && Math.hypot(spring.vx, spring.vy) < 1;
    offs = done ? {} : pull(m, spring.id, { x: spring.x, y: spring.y });
    draw();
    if (done) spring = null; else raf = requestAnimationFrame(settle);
  }

  // The viewer sizes itself from its width: square letter cells, and the window as tall as the picker
  // (on phones, the window sits on top of the picker).
  let lastW = 0;
  const ro = new ResizeObserver(() => {
    const W = root.getBoundingClientRect().width;
    if (Math.abs(W - lastW) > 0.5) {
      lastW = W;
      const narrow = W < 720;
      if (narrow !== root.classList.contains("narrow")) { root.classList.toggle("narrow", narrow); pad(); }
      const cols = narrow ? 9 : 6, rows = Math.ceil(LETTERS.length / cols), cell = (narrow ? W : W / 2.2) / cols;
      root.style.setProperty("--cell", `${cell}px`);
      root.style.setProperty("--letter", `${Math.max(14, cell * 0.5)}px`);
      root.style.setProperty("--win", `${Math.round(W * 0.78)}px`);
      root.style.height = `${(narrow ? W * 0.78 : 0) + rows * cell + 2}px`;
    }
    placeAll();
  });
  pad();
  show("a");
  setMode("outline");
  ro.observe(root);

  return {
    show, setMode,
    get letter() { return m.ch; },
    destroy() { cancelAnimationFrame(raf); clearTimeout(intent); ro.disconnect(); root.remove(); },
  };
}
