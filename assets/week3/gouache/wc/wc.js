// Watercolor: the icons as paint that's simulated, not drawn. After Noah's notes on Workshop: Ricky's notes v2 (Nov 10):
//   "it looks like a jelly bean right now. I want it to look more like a, like a splotch almost"
//   "It doesn't look like a watercolor yet. It really needs to though"
//   "Dot spreading right now does not look very realistic"
//   "the snail trail almost and the blob itself are 2 separate entities ... I want it to be more so the same"
//   "What if the shape changes and dries out from the middle to the edges?"
//   "I'm not really enjoying how much of the white noise I can actually see ... make it reactive to the splotch"
//   "I'm almost even wondering if agents could have or own like a whole hue to themselves. For example, Claude could
//    be oranges and reds, and they interact when an agent interacts with other agents"
// and his reference, github.com/msurguy/watercolor-playground: paint flows only where the paper is wet, colors mix by
// absorbance (like glazes), and a drying wash leaves a dark tide line.
//
// The paper is a grid. Every cell holds how wet it is, and for each pigment how much is afloat in the water and how
// much has settled into the paper. Each step:
//   - pigment afloat is carried by slow currents and spreads between wet neighbors. It never enters dry paper, so it
//     piles up at the edge of a wash: that's the tide line, and it's made, not drawn
//   - water evaporates; when a cell dries, what was afloat settles, a little more of it in the paper's hollows (the
//     grain: only where paint is, and only as much as the paint)
//   - paper nobody owns any more dries, then its paint lifts away
// Color is what the pigments absorb, summed: two agents' paints mix the way real washes do.
//
// An agent owns a family of hues (Claude: vermilion, orange, crimson. Codex: ultramarine, cerulean, violet), laid in
// uneven patches, so no two splotches are the same. Its outline is a coastline, not a smooth shape, and it's worked
// out from the paper, so a splotch that forms somewhere else has a different outline.
//
// const st = wc.stage(host, {res})                    a canvas the size of its host
// const s = st.add(who, {size, x, y, state, hidden})  a splotch (or {rect:[x,y,w,h]} / {frame:[x,y,w,h], band}: a wash)
//   s.set(state)      ready | loading | working | waiting | done | lit
//   s.spread(dur)     touches the paper and bleeds out          s.leave()   dries from the middle out, then lifts
//   s.go(x, y)        one brush stroke: wet at the head, drying behind it, gone after
//   s.put(x, y)
// st.on((t) => {})  st.cue(period, at)  st.remove()
// Stages off screen don't run. Reduced motion gets one still frame.
window.wc = (function () {
  'use strict';
  const TAU = Math.PI * 2, TS = 16, EPS = 0.02, RATE = 30, DT = 1 / RATE, CFL = 0.32;
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (p, a, b) => clamp((p - a) / (b - a), 0, 1);
  const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const out = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

  // pigments: how much red, green and blue light one full-strength layer absorbs
  const PIG = {
    vermilion: [0.19, 1.14, 1.71], orange: [0.1, 0.78, 1.8], crimson: [0.34, 1.7, 1.5],
    ultramarine: [1.57, 1.16, 0.37], cerulean: [1.42, 0.56, 0.26], violet: [0.9, 1.25, 0.36],
    graphite: [1.1, 1.1, 1.05],
    coral: [0.07, 0.62, 0.95], lilac: [0.6, 0.85, 0.2], mauve: [0.42, 0.85, 0.38], periwinkle: [0.85, 0.7, 0.18],
  };
  // 'own' is the tool's own color, before it's working with anyone's agent (Noah, Nov 10: "a really nice pastel purple
  // for our water color. But when you're using tools such as Claude and Codex, maybe it kind of snaps onto their colors")
  const FAMILY = { claude: ['vermilion', 'orange', 'crimson'], codex: ['ultramarine', 'cerulean', 'violet'], own: ['lilac', 'mauve', 'periwinkle'], graphite: ['graphite'] };
  // the soft look (wc.stage(host, {soft: true})), after Noah's notes on Workshop v3 (Nov 10): "way too pungent and
  // way too strong ... a little bit more pastel and a little lighter just to match our vibe with the graphite ... It
  // looks like blood ... a lot simpler to look at and a lot more understandable and friendly because it's now almost
  // too realistic"; in chat: "more representational than it is realistic". Soft is thinner paint in kinder hues, a
  // smooth outline with no flung drops, no dark drops landing while it works (a slow pulse instead), and an even,
  // quiet way of appearing. The default look is unchanged, so Workshop v3 still shows as it was.
  const FAMILY_SOFT = { claude: ['vermilion', 'orange', 'coral'], codex: ['ultramarine', 'cerulean', 'lilac'] };
  const DEEP = { claude: '#b5432b', codex: '#2a4192', own: '#6b56a8' };
  const LUT = new Uint8ClampedArray(2048);
  for (let i = 0; i < 2048; i++) LUT[i] = Math.round(255 * Math.exp(-i / 256));

  // smooth noise, the same at the same place every time: the paper
  function h2(ix, iy, s) {
    let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(s, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  function vn(x, y, s) {
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = h2(ix, iy, s), b = h2(ix + 1, iy, s), c = h2(ix, iy + 1, s), d = h2(ix + 1, iy + 1, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  const sdRound = (px, py, hw, hh, r) => {
    const qx = Math.abs(px) - hw + r, qy = Math.abs(py) - hh + r;
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - r;
  };

  // what each state does to the paint. Per second: ev evaporation, settle, lift (settled paint going afloat again),
  // lam (how hard paint is drawn to the edge); wet is the wetness it holds; swirl is how fast the currents move (px/s)
  const STATE = {
    ready: { ev: 0, wet: 0.4, settle: 1.0, lift: 0, swirl: 0, lam: 0 },
    loading: { ev: 0, wet: 1, settle: 0.05, lift: 1.0, swirl: 3, lam: 0 },
    working: { ev: 0, wet: 1, settle: 0.05, lift: 1.2, swirl: 5.5, lam: 0 },
    waiting: { ev: 0, wet: 0.7, settle: 0.15, lift: 0.5, swirl: 0, lam: 0.014 },
    done: { ev: 0.3, wet: -1, settle: 0.3, lift: 0, swirl: 0, lam: 0.07 },
    lit: { ev: 0, wet: 1, settle: 0, lift: 2.2, swirl: 2.5, lam: 0 },
  };
  // soft look only, after Noah's note on Workshop v5 (Nov 10): "Could our initial idle phase or waiting on you or any of
  // the phases be a little bit drier? Done is very dry, which is good, but when they're wet, I want them to be still,
  // you know, visibly kind of having watermarks on the edges. A little drier is good." Per state: [how much paler the
  // middle is, how much darker the edge is]. Done keeps the tide line it dries with. Only how it's drawn; no paint moves
  // Then on v6: "this looks bad - lets fix it. Contrast is way too high, and would like it to reflect a subtler prior
  // version". So it's only a hint now, about a quarter of what v6 had: v5's look with a faintly drier edge.
  const WATERMARK = { ready: [0.05, 0.17], loading: [0.03, 0.1], working: [0.035, 0.12], waiting: [0.07, 0.22], done: [0, 0], lit: [0.02, 0.08] };
  // soft look only, how a droplet comes up (Noah on v6: "dropped in should be more subtle, and should ease out with grow.
  // Like a drop of watercolor - in is fast, last moments of growing out are eased"): it starts this much paler and takes
  // its color as it grows
  const BORN = 0.5;
  const GR = 0.34, DRYLOOK = 0.72;   // grain, as a share of the paint that settles; dry paint looks this much lighter

  // ------------------------------------------------------------------ a splotch, or a wash
  function Stain(st, who, o) {
    const s = this;
    s.st = st; s.id = st.stains.length; st.stains.push(s);
    s.who = who; s.fam = ((st.soft && FAMILY_SOFT[who]) || FAMILY[who] || [who]).map((n) => st.pig(n));
    s.kind = o.rect ? 'rect' : o.frame ? 'frame' : 'round';
    s.box = o.rect || o.frame; s.band = o.band || 22; s.rad = o.radius ?? 10; s.from = o.from || null;
    s.x = o.x ?? (s.box ? s.box[0] + s.box[2] / 2 : st.W / 2); s.y = o.y ?? (s.box ? s.box[1] + s.box[3] / 2 : st.H / 2);
    s.R = s.box ? Math.min(s.box[2], s.box[3]) / 2 : (o.size || 48) / 2;
    s.amount = o.amount ?? (st.soft ? 0.44 : 0.86); s.seed = (o.seed | 0) * 7 + s.id * 13 + st.salt;
    s.state = o.state || 'ready'; s.t0 = st.t; s.alive = false; s.pulses = []; s.hue = s.id; s.nextDrop = 0; s.nextPulse = 0;
    st.param(s);
    if (!o.hidden) s.lay();
  }
  Stain.prototype = {
    // its outline and the order the paper gets wet in
    build() {
      const s = this, st = s.st, res = st.res, w = st.w, h = st.h, round = s.kind === 'round', soft = st.soft;
      const cx = s.x * res, cy = s.y * res, Rc = s.R * res;
      let x0, y0, x1, y1;
      if (round) { const p = Rc * 1.9 + 5 * res; x0 = cx - p; y0 = cy - p; x1 = cx + p; y1 = cy + p; }
      else { const p = 8 * res; x0 = s.box[0] * res - p; y0 = s.box[1] * res - p; x1 = (s.box[0] + s.box[2]) * res + p; y1 = (s.box[1] + s.box[3]) * res + p; }
      x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0)); x1 = Math.min(w, Math.ceil(x1)); y1 = Math.min(h, Math.ceil(y1));
      const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0), M = new Float32Array(bw * bh), Q = new Float32Array(bw * bh);
      Object.assign(s, { x0, y0, bw, bh, M, cx, cy, Rc });
      const sd = s.seed + (Math.round(s.x) * 31 + Math.round(s.y) * 17);       // a new place, a new outline
      const lob = [2, 3, 4, 5, 6].map((k, i) => [k, [0.1, 0.085, 0.06, 0.045, 0.03][i] * (soft ? 0.42 : 1) * (0.6 + 0.8 * h2(k, sd, 5)), h2(k, sd, 9) * TAU]);
      const c1 = 6.5 * res, c2 = 2.6 * res, c0 = 13 * res, small = clamp(s.R / 14, 0.45, 1);
      let n = 0;
      for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
        const gx = x + x0, gy = y + y0, li = x + y * bw;
        const coast = soft ? (vn(gx / c0, gy / c0, sd + 2) - 0.5) * 0.09 * small
          : (vn(gx / c0, gy / c0, sd + 2) - 0.5) * 0.22 * small + (vn(gx / c1, gy / c1, sd) - 0.5) * 0.24 * small + (vn(gx / c2, gy / c2, sd + 3) - 0.5) * 0.05 * small;
        let m, q;
        if (round) {
          const dx = gx + 0.5 - cx, dy = gy + 0.5 - cy, r = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
          let l = 1; for (const [k, a, p] of lob) l += a * small * Math.cos(k * th + p);
          m = r / (Rc * l * 1.1) + coast * (0.3 + 0.7 * Math.min(1, r / Rc));
          q = soft ? m * 0.96 : m * (0.78 + 0.4 * vn(gx / (7 * res), gy / (7 * res), sd + 5));
        } else {
          const bx = s.box[0] * res, by = s.box[1] * res, hw = s.box[2] * res / 2, hh = s.box[3] * res / 2;
          let d = sdRound(gx + 0.5 - bx - hw, gy + 0.5 - by - hh, hw, hh, s.rad * res), F = 9 * res;
          if (s.kind === 'frame') { const b = s.band * res; q = -d / b; d = Math.max(d, -d - b); F = b / 2; }
          m = Math.max(0, 1 + (d + coast * 14 * res) / F);
          if (s.kind === 'rect') {
            const ox = (s.from ? s.from[0] : s.x) * res, oy = (s.from ? s.from[1] : s.y) * res;
            q = Math.hypot(gx - ox, gy - oy) / (Math.hypot(hw * 2, hh * 2) * (s.from ? 1 : 0.5));
          }
          q *= 0.82 + 0.36 * vn(gx / (9 * res), gy / (9 * res), sd + 5);
        }
        M[li] = m; Q[li] = q;
        if (m < 1) n++;
      }
      // a few drops flung off beside it
      if (round && s.R >= 9 && !soft) {
        const k = 2 + Math.floor(h2(sd, 3, 1) * 3);
        for (let j = 0; j < k; j++) {
          const a = h2(sd, j, 2) * TAU, dist = Rc * (1.16 + 0.34 * h2(sd, j, 3)), rr = Math.max(0.9 * res, Rc * (0.035 + 0.05 * h2(sd, j, 4)));
          const px = cx + Math.cos(a) * dist - x0, py = cy + Math.sin(a) * dist - y0;
          for (let y = Math.max(0, Math.floor(py - rr)); y <= Math.min(bh - 1, Math.ceil(py + rr)); y++) for (let x = Math.max(0, Math.floor(px - rr)); x <= Math.min(bw - 1, Math.ceil(px + rr)); x++) {
            const li = x + y * bw;
            if (M[li] >= 1 && Math.hypot(x + 0.5 - px, y + 0.5 - py) <= rr) { M[li] = 0.62; Q[li] = 0.35 + 0.4 * h2(sd, j, 6); n++; }
          }
        }
      }
      // which way is out, for the pull to the edge
      const NX = new Float32Array(bw * bh), NY = new Float32Array(bw * bh);
      for (let y = 1; y < bh - 1; y++) for (let x = 1; x < bw - 1; x++) {
        const li = x + y * bw; if (M[li] >= 1) continue;
        const gx = Math.min(M[li + 1], 1.4) - Math.min(M[li - 1], 1.4), gy = Math.min(M[li + bw], 1.4) - Math.min(M[li - bw], 1.4), g = Math.hypot(gx, gy) || 1;
        NX[li] = gx / g; NY[li] = gy / g;
      }
      const keys = new Uint32Array(n); let j = 0;
      for (let li = 0; li < bw * bh; li++) if (M[li] < 1) keys[j++] = ((Math.min(4095, (clamp(Q[li], 0, 0.999) * 4096) | 0) << 20) | li) >>> 0;
      keys.sort();
      s.NX = NX; s.NY = NY; s.keys = keys; s.count = n;
    },

    // paint for one cell: mostly the family's first hue, with patches of the others
    weights(gx, gy) {
      const s = this, res = s.st.res, L = Math.max(9 * res, s.Rc * 0.95), sd = s.seed;
      const a = smooth(vn(gx / L + 3.1, gy / L, sd + 11) * 1.7 - 0.35), b = smooth(vn(gx / L - 7.3, gy / L + 5.7, sd + 12) * 1.7 - 0.35);
      const sf = s.st.soft ? 0.62 : 1, w1 = 0.42 * a * sf, w2 = 0.46 * b * (1 - 0.6 * a) * sf, v = 0.8 + 0.4 * vn(gx / (3 * res), gy / (3 * res), sd + 13);
      return [(1 - 0.7 * w1 - 0.7 * w2) * v, w1 * v, w2 * v];
    },
    cell(gi, gx, gy, water, pig, li = -1) {
      const s = this, st = s.st, wasWet = st.wet[gi] > EPS;
      if (water) {
        if (st.wet[gi] < 1) st.wet[gi] = 1;
        if (st.soft) { const o = st.own[gi]; st.under[gi] = o && o !== s.id && wasWet ? o : 0; }      // whose wet paper this was
        st.own[gi] = s.id;
        if (!st.hgt[gi]) st.hgt[gi] = 0.05 + 0.6 * vn(gx / (1.7 * st.res), gy / (1.7 * st.res), 77) + 0.35 * vn(gx / (4.2 * st.res), gy / (4.2 * st.res), 78);
      }
      if (pig) {
        let have = 0, other = 0;
        for (let k = 0; k < st.G.length; k++) { const a = st.G[k][gi] + st.D[k][gi]; if (s.fam.includes(k)) have += a; else other += a; }
        // the edge cell gets less, so the outline isn't stair-stepped; paper another agent has painted takes less
        // Soft, wet meets wet (Noah on Workshop v6: "fix the mixtures - shouldnt be able to tell where on blob ends and
        // the other starts - full mix"). Where this one lands on another's wet paper, each gives way to the other by how
        // deep into itself the spot is: at this one's outline it's all the other's paint, at the other's outline it's
        // all this one's, and in between they run together. Neither outline shows inside the other
        let mine = -1, mixed = false;
        if (st.soft && li >= 0 && other > 0.02 && wasWet) {
          const q = st.stains[st.under[gi]];
          if (q && q.alive && q.M) {
            const qx = gx - q.x0, qy = gy - q.y0, a = clamp(1 - s.M[li], 0, 1), b = qx >= 0 && qy >= 0 && qx < q.bw && qy < q.bh ? clamp(1 - q.M[qx + qy * q.bw], 0, 1) : 0;
            mine = a + b > 1e-4 ? smooth(a / (a + b)) : 0.5; mixed = true;
            for (let k = 0; k < st.G.length; k++) if (!s.fam.includes(k)) { st.G[k][gi] *= 1 - mine; st.D[k][gi] *= 1 - mine; }
          }
        }
        if (mine < 0 && other > 0.15 && wasWet) for (let k = 0; k < st.G.length; k++) if (!s.fam.includes(k)) { st.G[k][gi] *= 0.55; st.D[k][gi] *= 0.55; }   // new water pushes some of the other paint aside
        const amt = s.amount * (mine >= 0 ? mine : other > 0.15 && wasWet ? (st.soft ? 0.55 : 0.4) : 1) * (mixed ? 1 : li < 0 ? 1 : clamp((1 - s.M[li]) * s.Rc * (st.soft ? 0.34 : 0.7), st.soft ? 0.12 : 0.25, 1));
        if (have < amt * 0.5) { const wt = s.weights(gx, gy); s.fam.forEach((k, i) => { st.G[k][gi] += amt * (wt[i] || 0); }); }
        if (st.soft && li >= 0) { const rw = s.kind === 'round' ? Math.min(0.5, 3.4 / s.R) : 0.3, e = smooth((s.M[li] - (1 - rw)) / rw); st.rim[gi] = mixed ? Math.min(st.rim[gi], e) : e; }
      }
    },
    // there at once, in whatever state it's in
    lay() {
      const s = this, st = s.st;
      s.build(); s.alive = true; s.sp = null;
      const { keys, bw, x0, y0 } = s, dry = s.state === 'done', rw = s.kind === 'round' ? Math.min(0.5, 2.3 / s.R) : 0.26;
      for (let j = 0; j < keys.length; j++) {
        const li = keys[j] & 0xfffff, x = li % bw, y = (li - x) / bw, gx = x + x0, gy = y + y0, gi = gx + gy * st.w;
        s.cell(gi, gx, gy, true, true, li);
        st.wet[gi] = dry ? 0 : Math.max(0.2, STATE[s.state].wet);
        const rim = dry ? (0.62 - 0.12 * (st.tide - 1)) * (1 + 2.3 * st.tide * smooth((s.M[li] - (1 - rw)) / rw)) * (1 + (st.soft ? 0.08 : GR) * (0.5 - st.hgt[gi])) : 1;
        for (const k of s.fam) { if (dry || s.state === 'ready') { st.D[k][gi] += st.G[k][gi] * rim; st.G[k][gi] = 0; } }
      }
      st.wake(s.x0, s.y0, s.x0 + s.bw, s.y0 + s.bh);
      return s;
    },
    // called: water touches the paper and runs out to the coastline, and the paint follows just behind it
    spread(dur) {
      const s = this; dur = dur || 2.1;
      if (s.alive) s.release(false);
      s.build(); s.alive = true; s.sp = { t0: s.st.t, dur, pw: 0, pp: 0 };
      if (s.st.soft) { s.st.WM[s.id * 2] = Math.max(s.st.WM[s.id * 2], BORN); s.st.WM[s.id * 2 + 1] = 0; }      // it comes up pale and takes its color as it grows
      s.st.flowDirty = true;
      return s;
    },
    set(state) {
      const s = this, st = s.st;
      if (s.state === state) return s;
      const wasDry = s.state === 'done';
      s.state = state; s.t0 = st.t; st.param(s);
      if (wasDry && s.alive) s.each((gi) => { if (st.wet[gi] < 0.3) st.wet[gi] = 0.3; });      // dry paint takes water again
      s.nextDrop = st.t + 0.5; s.nextPulse = st.t + 1.1;
      if (s.alive) { if (state === 'done') { s.float(0.85); s.each((gi) => { if (st.wet[gi] > 0.5) st.wet[gi] = 0.5; }); } else if (state === 'waiting') s.float(0.4); st.wake(s.x0, s.y0, s.x0 + s.bw, s.y0 + s.bh); }
      st.flowDirty = true;
      return s;
    },
    put(x, y) { this.x = x; this.y = y; return this; },
    each(fn) { const s = this, st = s.st, { keys, bw, x0, y0 } = s; for (let j = 0; j < keys.length; j++) { const li = keys[j] & 0xfffff, x = li % bw, gi = x + x0 + ((li - x) / bw + y0) * st.w; if (st.own[gi] === s.id) fn(gi, li); } },
    // settled paint goes afloat again, so it can move
    float(f) { const s = this, st = s.st; s.each((gi) => { for (const k of s.fam) { const m = st.D[k][gi] * f; st.G[k][gi] += m; st.D[k][gi] -= m; } }); },
    // lets go of its paper. Left alone, the paint is drawn to the edge as it dries, then lifts away
    release(ghost = true) {
      const s = this, st = s.st;
      if (!s.alive) return s;
      if (ghost) s.float(0.8);
      s.each((gi) => { st.own[gi] = 0; });
      if (ghost) st.ghosts.push({ M: s.M, NX: s.NX, NY: s.NY, x0: s.x0, y0: s.y0, bw: s.bw, bh: s.bh, Rc: s.Rc, lam: 0.06, until: st.t + 1.5 });
      st.wake(s.x0, s.y0, s.x0 + s.bw, s.y0 + s.bh);
      s.alive = false; s.sp = null; s.pulses.length = 0; st.flowDirty = true;
      return s;
    },
    leave() { return this.release(true); },
    // one brush stroke to somewhere else. The stroke is the splotch: same paint, same strength, wet at the head
    go(x, y, o = {}) {
      const s = this;
      if (!s.alive) { s.put(x, y); return s.spread(); }
      const d = Math.hypot(x - s.x, y - s.y);
      if (d < 1) return s;
      s.release(true);
      s.tw = { x0: s.x, y0: s.y, x1: x, y1: y, t0: s.st.t, dur: o.dur || clamp(d / 30, 1.5, 3.4), discs: [], lx: -1e9, ly: 0 };
      return s;
    },
    stamp(px, py, rb) {
      const s = this, st = s.st, res = st.res, w = st.w, h = st.h, sd = s.seed + 7;
      const xa = Math.max(0, Math.floor(px - rb * 1.2)), xb = Math.min(w - 1, Math.ceil(px + rb * 1.2)), ya = Math.max(0, Math.floor(py - rb * 1.2)), yb = Math.min(h - 1, Math.ceil(py + rb * 1.2));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
        if (Math.hypot(x + 0.5 - px, y + 0.5 - py) > rb * (0.84 + 0.32 * vn(x / (4.5 * res), y / (4.5 * res), sd))) continue;
        const gi = x + y * w, o = st.own[gi];
        if (o && o !== s.id) continue;
        s.cell(gi, x, y, true, true);
      }
      st.wake(xa, ya, xb + 1, yb + 1);
    },
    unstamp(d, hx, hy, rb) {
      const s = this, st = s.st, w = st.w, h = st.h;
      const xa = Math.max(0, Math.floor(d[0] - rb * 1.2)), xb = Math.min(w - 1, Math.ceil(d[0] + rb * 1.2)), ya = Math.max(0, Math.floor(d[1] - rb * 1.2)), yb = Math.min(h - 1, Math.ceil(d[1] + rb * 1.2));
      for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) { const gi = x + y * w; if (st.own[gi] === s.id && Math.hypot(x - hx, y - hy) > rb) st.own[gi] = 0; }
    },

    update(t) {
      const s = this, st = s.st, res = st.res;
      if (s.tw) {
        const tw = s.tw, f = clamp((t - tw.t0) / tw.dur, 0, 1), e = inOut(f), rb = s.R * res * 0.8;
        s.x = lerp(tw.x0, tw.x1, e); s.y = lerp(tw.y0, tw.y1, e);
        const px = s.x * res, py = s.y * res;
        if (Math.hypot(px - tw.lx, py - tw.ly) > rb * 0.22) { s.stamp(px, py, rb); tw.discs.push([px, py]); tw.lx = px; tw.ly = py; }
        while (tw.discs.length && (f >= 1 || Math.hypot(tw.discs[0][0] - px, tw.discs[0][1] - py) > rb * 1.5)) s.unstamp(tw.discs.shift(), f >= 1 ? 1e9 : px, f >= 1 ? 0 : py, rb);
        if (f >= 1) { s.tw = null; s.spread(1.1); }
        return;
      }
      if (!s.alive) return;
      if (s.sp) {      // the wet front runs a little ahead of the paint
        const sp = s.sp, u = clamp((t - sp.t0) / sp.dur, 0, 1), p = st.soft ? 1 - Math.pow(1 - u, 4) : out(u), kp = (p * 4096) | 0, kw = (Math.min(1, p + (st.soft ? 0 : 0.07)) * 4096) | 0, { keys, bw, x0, y0 } = s;
        while (sp.pw < keys.length && (keys[sp.pw] >>> 20) <= kw) { const li = keys[sp.pw++] & 0xfffff, x = li % bw, gx = x + x0, gy = (li - x) / bw + y0; s.cell(gx + gy * st.w, gx, gy, true, false); }
        while (sp.pp < keys.length && (keys[sp.pp] >>> 20) <= kp) { const li = keys[sp.pp++] & 0xfffff, x = li % bw, gx = x + x0, gy = (li - x) / bw + y0; s.cell(gx + gy * st.w, gx, gy, false, true, li); }
        st.wake(s.x0, s.y0, s.x0 + s.bw, s.y0 + s.bh);
        if (t - sp.t0 >= sp.dur && sp.pp >= keys.length) { s.sp = null; st.flowDirty = true; }
      }
      // soft: no drops landing. It pulses; slower and fainter while it waits. Working moves more than it did (Noah on
      // Workshop v6: "the movement within can be more noticeable for working"): color lands more often and a little
      // stronger, and the currents inside run twice as fast
      if (st.soft) {
        if (s.state === 'working' && t >= s.nextPulse) { s.charge(t); s.nextPulse = t + (1.5 + h2(s.id, (t * 10) | 0, 1) * 0.9) / st.lively; }
        else if (s.state === 'waiting' && t >= s.nextPulse) { s.pulse(t, 0.3, 0.7, 2.6, 0.2); s.nextPulse = t + 5.6; }
      } else if (s.state === 'working' && t >= s.nextDrop) { s.charge(t); s.nextDrop = t + 1.5 + h2(s.id, (t * 10) | 0, 1) * 1.2; }
      else if (s.state === 'waiting' && t >= s.nextPulse) { s.pulse(t, 0.32, 0.62, 1.9, 0.5); s.nextPulse = t + 4.6; }
      else if (s.state === 'loading' && t >= s.nextPulse) { s.pulse(t, 0.25, 1.05, 2.4, 0); s.nextPulse = t + 3.2; }
      if (st.n % 12 === s.id % 12 && (s.state === 'working' || s.state === 'loading')) s.level();
    },
    // working: fresh color keeps landing in the wet wash, a different hue of its family each time, and blooms
    charge(t) {
      const s = this, st = s.st, res = st.res, { keys, bw, x0, y0 } = s;
      if (!keys.length) return;
      let li = 0;
      for (let tries = 0; tries < 8; tries++) { li = keys[(h2(s.id, (t * 30) | 0, tries) * keys.length) | 0] & 0xfffff; if (s.M[li] < 0.55) break; }
      const soft = st.soft, x = li % bw, px = x + x0, py = (li - x) / bw + y0, rd = Math.max(2.4 * res, s.Rc * (soft ? 0.4 : 0.27)), k = s.fam[++s.hue % s.fam.length];
      for (let y = Math.max(0, Math.floor(py - rd)); y <= Math.min(st.h - 1, Math.ceil(py + rd)); y++) for (let xx = Math.max(0, Math.floor(px - rd)); xx <= Math.min(st.w - 1, Math.ceil(px + rd)); xx++) {
        const gi = xx + y * st.w, r = Math.hypot(xx - px, y - py) / rd;
        if (r < 1 && st.own[gi] === s.id && st.wet[gi] > EPS) st.G[k][gi] += s.amount * (soft ? 0.5 * (1 + (st.lively - 1) * 0.5) : 0.9) * (1 - r * r);
      }
      s.pulses.push(soft ? { x: px, y: py, r0: rd, reach: s.Rc * 0.8, S: Math.min(0.28 * st.lively, 1.7 * st.lively * res / RATE), t0: t, dur: 2.2 } : { x: px, y: py, r0: rd, reach: Math.max(rd * 2.6, s.Rc * 0.62), S: Math.min(0.36, 7 * res / RATE), t0: t, dur: 1.5 });
    },
    // a drop of clear water: it pushes the paint out into a ring, and leaves a paler patch. A bloom
    pulse(t, r0, reach, dur, water) {
      const s = this, st = s.st, res = st.res, rd = s.Rc * r0;
      let px = s.cx, py = s.cy;
      if (s.kind !== 'round' || st.soft) { let li = 0; for (let i = 0; i < 8; i++) { li = s.keys[(h2(s.id, (t * 30) | 0, 3 + i) * s.keys.length) | 0] & 0xfffff; if (s.M[li] < 0.5) break; } const x = li % s.bw; px = x + s.x0; py = (li - x) / s.bw + s.y0; }
      if (water) for (let y = Math.max(0, Math.floor(py - rd)); y <= Math.min(st.h - 1, Math.ceil(py + rd)); y++) for (let x = Math.max(0, Math.floor(px - rd)); x <= Math.min(st.w - 1, Math.ceil(px + rd)); x++) {
        const gi = x + y * st.w; if (st.own[gi] === s.id && Math.hypot(x - px, y - py) < rd) st.wet[gi] = Math.min(1.3, st.wet[gi] + water);
      }
      s.pulses.push({ x: px, y: py, r0: rd, reach: Math.max(rd * 1.6, s.Rc * reach), S: Math.min(0.34, (st.soft ? 1.5 : 6) * res / RATE), t0: t, dur });
    },
    // keeps the amount of paint about what it started with
    level() {
      // (soft: all the paint on its paper counts, whoever's it is, so two washes that have run together can't keep building up)
      const s = this, st = s.st, K = st.G.length, all = st.soft; let tot = 0, n = 0;
      if (all) s.each((gi) => { n++; for (let k = 0; k < K; k++) tot += st.G[k][gi] + st.D[k][gi]; });
      else s.each((gi) => { n++; for (const k of s.fam) tot += st.G[k][gi] + st.D[k][gi]; });
      const want = n * s.amount * 1.02;
      if (tot > want * 1.06) {
        const f = lerp(1, want / tot, 0.35);
        if (all) s.each((gi) => { for (let k = 0; k < K; k++) { st.G[k][gi] *= f; st.D[k][gi] *= f; } });
        else s.each((gi) => { for (const k of s.fam) { st.G[k][gi] *= f; st.D[k][gi] *= f; } });
      }
    },
  };

  // ------------------------------------------------------------------ the paper
  let sheets = 0;
  function Stage(host, o) {
    const st = this;
    st.host = host; st.W = o.width || host.clientWidth; st.H = o.height || host.clientHeight; st.salt = ++sheets * 101; st.soft = !!o.soft;
    // two knobs a sheet can turn (1 = as everywhere else). lively: how often and how strongly color lands while working.
    // tide: how marked dried paint is, a paler middle and a darker edge (Noah, Nov 11, on Dashboard v18: "the working
    // animation within the dashboard could be a little more noticeable"; "the dried up, complete state could also be
    // slightly more noticeable")
    st.lively = o.lively || 1; st.tide = o.tide || 1;
    st.res = o.res || (st.W * st.H <= 50000 ? 2 : st.W * st.H <= 110000 ? 1.5 : 1);
    const w = (st.w = Math.round(st.W * st.res)), h = (st.h = Math.round(st.H * st.res)), n = w * h;
    const c = (st.canvas = document.createElement('canvas'));
    c.width = w; c.height = h; c.className = 'wc'; c.setAttribute('aria-hidden', 'true');
    host.appendChild(c);
    st.ctx = c.getContext('2d', { willReadFrequently: true }); st.img = st.ctx.createImageData(w, h);
    st.wet = new Float32Array(n); st.own = new Uint8Array(n); st.hgt = new Float32Array(n);
    st.VX = new Float32Array(n); st.VY = new Float32Array(n); st.PSI = new Float32Array((w + 1) * (h + 1));
    st.names = []; st.G = []; st.D = []; st.DG = []; st.A = [];
    st.tw = Math.ceil(w / TS); st.th = Math.ceil(h / TS); st.act = new Uint8Array(st.tw * st.th); st.run = new Uint8Array(st.tw * st.th);
    st.stains = [null]; st.ghosts = []; st.boxes = []; st.fns = [];
    st.EV = new Float32Array(256); st.TG = new Float32Array(256); st.SE = new Float32Array(256); st.LI = new Float32Array(256);
    st.rim = new Float32Array(n); st.under = new Uint8Array(n); st.WM = new Float32Array(512); st.WT = new Float32Array(512);      // soft: how near its edge a cell is; each stain's [pale, edge] now and where they're heading
    st.EV[0] = 0.85 * DT; st.TG[0] = -1; st.SE[0] = 0.5 * DT; st.LI[0] = 0;
    st.t = 0; st.pt = 0; st.n = 0; st.last = 0; st.visible = true; st.flowDirty = false;
    st.KD = Math.min(0.12, 2.5 * st.res * st.res / RATE);
  }
  Stage.prototype = {
    pig(name) {
      const st = this; let k = st.names.indexOf(name);
      if (k < 0) { k = st.names.length; st.names.push(name); const n = st.w * st.h; st.G.push(new Float32Array(n)); st.D.push(new Float32Array(n)); st.DG.push(new Float32Array(n)); st.A.push(PIG[name] || PIG.graphite); }
      return k;
    },
    param(s) {
      const st = this, P = STATE[s.state] || STATE.ready; st.EV[s.id] = P.ev * DT; st.TG[s.id] = P.wet; st.SE[s.id] = P.settle * DT; st.LI[s.id] = P.lift * DT;
      if (st.soft && st.WT) { const m = WATERMARK[s.state] || WATERMARK.ready, i = s.id * 2; st.WT[i] = m[0]; st.WT[i + 1] = m[1]; if (!s.alive) { st.WM[i] = m[0]; st.WM[i + 1] = m[1]; } }
    },
    add(who, o = {}) { return new Stain(this, who, o); },
    on(fn) { this.fns.push(fn); return this; },
    cue(period, at) { const a = this.pt % period, b = this.t % period; return b >= a ? at > a && at <= b : at > a || at <= b; },
    wake(x0, y0, x1, y1) {
      const st = this, ta = Math.max(0, (x0 / TS) | 0), tb = Math.min(st.tw - 1, ((x1 - 1) / TS) | 0), tc = Math.max(0, (y0 / TS) | 0), td = Math.min(st.th - 1, ((y1 - 1) / TS) | 0);
      for (let ty = tc; ty <= td; ty++) for (let tx = ta; tx <= tb; tx++) st.act[tx + ty * st.tw] = 1;
    },

    // the currents: slow eddies inside a working wash, a push outward from each drop, a pull to the edge as it dries
    flows() {
      const st = this, { w, h, VX, VY, PSI, res } = st, w1 = w + 1;
      for (const b of st.boxes) for (let y = b[1]; y <= b[3]; y++) { const a = b[0] + y * w; if (y < h) { VX.fill(0, a, Math.min(b[2], w) + y * w); VY.fill(0, a, Math.min(b[2], w) + y * w); } PSI.fill(0, b[0] + y * w1, b[2] + 1 + y * w1); }
      st.boxes.length = 0; st.flowDirty = false;
      const edge = (g, lam) => {
        const c = lam * g.Rc / RATE;
        for (let y = 0; y < g.bh; y++) for (let x = 0; x < g.bw; x++) { const li = x + y * g.bw, m = g.M[li]; if (m < 1) { const gi = x + g.x0 + (y + g.y0) * w; VX[gi] += c * m * g.NX[li]; VY[gi] += c * m * g.NY[li]; } }
        st.boxes.push([g.x0, g.y0, g.x0 + g.bw, g.y0 + g.bh]);
      };
      for (let i = st.ghosts.length - 1; i >= 0; i--) { const g = st.ghosts[i]; if (st.t > g.until) st.ghosts.splice(i, 1); else edge(g, g.lam); }
      for (let i = 1; i < st.stains.length; i++) {
        const s = st.stains[i]; if (!s.alive) continue;
        const P = STATE[s.state], swirl = (s.sp ? Math.max(P.swirl, 3) : P.swirl) * (st.soft ? (s.state === 'working' && !s.sp ? 1 : 0.5) : 1), lam = (s.sp ? (st.soft ? 0 : Math.max(P.lam, 0.025)) : s.state === 'done' && st.t - s.t0 > 4 ? 0 : P.lam) * (st.soft && s.state !== 'done' ? 0.35 : 1);
        if (lam > 0) edge(s, lam);
        if (swirl > 0) {
          const L = Math.max(8 * res, s.Rc * 0.9), amp = swirl * res / RATE * L * 0.65, t = st.t, sd = s.seed;
          for (let y = 0; y <= s.bh; y++) for (let x = 0; x <= s.bw; x++) {
            const m = s.M[Math.min(x, s.bw - 1) + Math.min(y, s.bh - 1) * s.bw]; if (m >= 1) continue;
            const gx = x + s.x0, gy = y + s.y0, env = smooth((1 - m) / 0.35);
            PSI[gx + gy * w1] += amp * env * (vn(gx / L + t * 0.06, gy / L - t * 0.045, sd) + 0.5 * vn(gx / (L * 0.5) - t * 0.08, gy / (L * 0.5) + 9.3, sd + 1) - 0.75);
          }
          st.boxes.push([s.x0, s.y0, s.x0 + s.bw, s.y0 + s.bh]);
        }
        for (let j = s.pulses.length - 1; j >= 0; j--) {
          const p = s.pulses[j], u = (st.t - p.t0) / p.dur;
          if (u >= 1) { s.pulses.splice(j, 1); st.flowDirty = true; continue; }
          const S = p.S * Math.sin(Math.PI * u), xa = Math.max(0, Math.floor(p.x - p.reach)), xb = Math.min(w - 1, Math.ceil(p.x + p.reach)), ya = Math.max(0, Math.floor(p.y - p.reach)), yb = Math.min(h - 1, Math.ceil(p.y + p.reach));
          for (let y = ya; y <= yb; y++) for (let x = xa; x <= xb; x++) {
            const dx = x + 0.5 - p.x, dy = y + 0.5 - p.y, r = Math.hypot(dx, dy); if (r >= p.reach || r < 0.01) continue;
            const f = S * (r < p.r0 ? r / p.r0 : 1 - (r - p.r0) / (p.reach - p.r0)) / r, gi = x + y * w;
            VX[gi] += f * dx; VY[gi] += f * dy;
          }
          st.boxes.push([xa, ya, xb + 1, yb + 1]);
        }
      }
    },

    step() {
      const st = this, { w, h, tw, th, wet, own, hgt, G, D, DG, A, VX, VY, PSI, EV, TG, SE, LI, act, run, KD } = st, K = G.length, w1 = w + 1, soft = st.soft, CAP = soft ? 1.15 : 2.3, GRV = soft ? 0.08 : GR;
      st.pt = st.t; st.t += DT; st.n++;
      for (const fn of st.fns) fn(st.t, DT);
      for (let i = 1; i < st.stains.length; i++) st.stains[i].update(st.t);
      if (st.soft) for (let i = 1; i < st.stains.length; i++) {
        const a = i * 2, d0 = st.WT[a] - st.WM[a], d1 = st.WT[a + 1] - st.WM[a + 1];
        if (d0 > 0.004 || d0 < -0.004 || d1 > 0.004 || d1 < -0.004) { st.WM[a] += d0 * 0.05; st.WM[a + 1] += d1 * 0.05; const s = st.stains[i]; if (s.alive) st.wake(s.x0, s.y0, s.x0 + s.bw, s.y0 + s.bh); }
      }
      run.fill(0); let any = false;
      for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) if (act[tx + ty * tw]) {
        any = true;
        for (let b = Math.max(0, ty - 1); b <= Math.min(th - 1, ty + 1); b++) for (let a = Math.max(0, tx - 1); a <= Math.min(tw - 1, tx + 1); a++) run[a + b * tw] = 1;
      }
      if (!any) return false;
      if (st.n % 3 === 0 || st.flowDirty) st.flows();

      // paint afloat moves: carried by the currents, and spreading between wet neighbors. Never into dry paper
      for (let t = 0; t < tw * th; t++) {
        if (!act[t]) continue;
        const tx = t % tw, ty = (t - tx) / tw, xa = tx * TS, xb = Math.min(w, xa + TS), ya = ty * TS, yb = Math.min(h, ya + TS);
        for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
          const i = x + y * w; if (wet[i] <= EPS) continue;
          const c = x + 1 + (y + 1) * w1;
          if (x < w - 1 && wet[i + 1] > EPS) {
            const j = i + 1; let u = 0.5 * (VX[i] + VX[j]) + PSI[c] - PSI[c - w1];
            u = u > CFL ? CFL : u < -CFL ? -CFL : u;
            for (let k = 0; k < K; k++) { const gi = G[k][i], gj = G[k][j]; if (gi + gj < 1e-5) continue; const m = (u > 0 ? gi : gj) * u + KD * (gi - gj); DG[k][i] -= m; DG[k][j] += m; }
          }
          if (y < h - 1 && wet[i + w] > EPS) {
            const j = i + w; let v = 0.5 * (VY[i] + VY[j]) - PSI[c] + PSI[c - 1];
            v = v > CFL ? CFL : v < -CFL ? -CFL : v;
            for (let k = 0; k < K; k++) { const gi = G[k][i], gj = G[k][j]; if (gi + gj < 1e-5) continue; const m = (v > 0 ? gi : gj) * v + KD * (gi - gj); DG[k][i] -= m; DG[k][j] += m; }
          }
        }
      }

      // water and settling, then the picture
      const img = st.img, px = img.data;
      let dx0 = w, dy0 = h, dx1 = 0, dy1 = 0;
      for (let t = 0; t < tw * th; t++) {
        if (!run[t]) continue;
        const tx = t % tw, ty = (t - tx) / tw, xa = tx * TS, xb = Math.min(w, xa + TS), ya = ty * TS, yb = Math.min(h, ya + TS);
        let awake = 0;
        for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) {
          const i = x + y * w, o = own[i]; let wv = wet[i], dr = 0, dg = 0, db = 0;
          const was = wv > EPS;
          if (was) {
            if (EV[o] > 0) { wv -= EV[o]; awake = 1; } else if (TG[o] >= 0) { const e = TG[o] - wv; if (e > 0.02 || e < -0.02) { wv += e * 0.06; awake = 1; } }
            if (wv <= EPS) wv = 0;
            wet[i] = wv;
          }
          const gr = 1 + GRV * (0.5 - hgt[i]), e = soft && o ? st.rim[i] : 0, look = soft && o ? 1 - st.WM[o * 2] * (1 - e) + st.WM[o * 2 + 1] * e : 1;
          for (let k = 0; k < K; k++) {
            let g = G[k][i] + DG[k][i], d = D[k][i]; DG[k][i] = 0;
            if (g < 1e-5) g = 0; else if (g > CAP) g = CAP + (g - CAP) * 0.6;
            if (d < 1e-5) d = 0;
            if (g + d === 0) { G[k][i] = 0; D[k][i] = 0; continue; }
            if (was && wv === 0) { d += g * gr; g = 0; awake = 1; }               // it dries: everything afloat settles
            else if (wv > 0) {
              let m = g * SE[o]; if (g < 0.002 && SE[o] > 0) m = g;
              d += m * gr; g -= m;
              if (LI[o] > 0) { const l = d * LI[o]; g += l; d -= l; }
              if (g > 0.002) awake = 1;
            } else { g = 0; if (!o) { d *= 0.94; if (d < 0.004) d = 0; else awake = 1; } }   // dry paper nobody owns: the paint lifts away
            G[k][i] = g; D[k][i] = d;
            const a = (g + d * DRYLOOK) * look, ab = A[k];
            dr += a * ab[0]; dg += a * ab[1]; db += a * ab[2];
          }
          const dn = wv > 1 ? 9 : wv * 9, p = i * 4;      // wet paper is a touch darker
          px[p] = LUT[Math.min(2047, (dr * 256 + dn) | 0)]; px[p + 1] = LUT[Math.min(2047, (dg * 256 + dn) | 0)]; px[p + 2] = LUT[Math.min(2047, (db * 256 + dn) | 0)]; px[p + 3] = 255;
        }
        act[t] = awake;
        if (xa < dx0) dx0 = xa; if (ya < dy0) dy0 = ya; if (xb > dx1) dx1 = xb; if (yb > dy1) dy1 = yb;
      }
      st.ctx.putImageData(img, 0, 0, dx0, dy0, dx1 - dx0, dy1 - dy0);
      return true;
    },
    remove() { stages.delete(this); seen && seen.unobserve(this.host); this.canvas.remove(); },
  };

  // ------------------------------------------------------------------ running them: a few at a time, never past a frame's budget
  const stages = new Set();
  let running = false, turn = 0;
  function frame(now) {
    const list = [...stages], t0 = performance.now();
    for (let i = 0; i < list.length; i++) {
      const st = list[(turn + i) % list.length];
      if (!st.visible || now - st.last < 1000 / RATE - 2) continue;
      st.last = now; st.step();
      if (performance.now() - t0 > 11) { turn = (turn + i + 1) % list.length; break; }
    }
    requestAnimationFrame(frame);
  }
  const seen = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver((es) => es.forEach((e) => { if (e.target.__wc) e.target.__wc.visible = e.isIntersecting; }), { rootMargin: '80px' }) : null;

  function stage(host, o = {}) {
    const st = new Stage(host, o);
    host.__wc = st;
    if (still()) setTimeout(() => { for (let i = 0; i < (o.stillAt || 4) * RATE; i++) st.step(); }, 0);
    else { stages.add(st); if (seen) { st.visible = false; seen.observe(host); } if (!running) { running = true; requestAnimationFrame(frame); } }
    return st;
  }

  return { stage, still, clamp, lerp, seg, inOut, out, PIG, FAMILY, FAMILY_SOFT, DEEP, STATE };      // FAMILY_SOFT is shared so one palette (sys/rail.js) can set it
})();
