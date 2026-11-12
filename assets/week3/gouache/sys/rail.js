// The rail: the extension's panel, built the same way on every screen (sys/system.css has its look).
// Needs ../wc/wc.js, ../wc/kit.js and ../v2/ask.js (design words) first.
//
// const r = rail.mount(aside, {home, shut, onopen})   two words at the top (Dashboard, Close), a body for agents, the ask field
//   { agents: ['claude', ...] } makes the ask field real and has it name its agent with @ (r.field; see target() below)
//   r.ask, r.front                            the ask field's wrap and its text
//   r.open(on)                                open the rail, or close it to the puck in the corner until it's needed.
//                                             Esc closes, Option Space opens or closes. On a page with a sample site
//                                             (.page) the rail makes its own puck, and the space round the rail takes
//                                             your page's color (Noah, Nov 11, on screen 3 v10: "the space under the
//                                             desktop native rail should be the same color as whatever we are working
//                                             on, making our extension seem seamless")
//   The top was a four-dot icon (Noah, Nov 11, on screen 2 v8: "not sure what the usage of this 4 dot button is. Does
//   it open the dashboard? Could we have a more coherent way of showing how to open the dashboard? And maybe an
//   equally coherent way of closing the rail until needed"). It became two small words, each with a pencil mark, and
//   then the marks alone (Noah, Nov 11, on screen 1 v8: "i dont think we even need the captions for the buttons -
//   lose them"): arrows opening outward for the dashboard, a cross to close. The words are still in their titles.
// const h = r.hello(text)                     before you ask: our droplet, centered and bigger, over one friendly line
//   h.show()  h.hide()  h.snap(who)  h.say(t) (Noah, Nov 11, on screen 2 v8: "before we ask, the blob can be centred
//                                             and bigger. Maybe a very simple caption welcomes the user?")
// const g = r.agent(who, {name, say, meta, shut})    one agent: droplet, name, what it's telling you, its helpers
//   g.snap(who)  g.name(t)  g.say(t)  g.meta(t)  g.set(state)  g.fold(shut)  g.away(on)  g.fresh(who)
// const l = g.line(hue, state, thing)         one helper: a droplet in one hue of its agent's family, and what it says.
//                                             With `thing`, it says two short things: what it's on (thing), then what's
//                                             happening to it (say). The line before no longer steps back above it
//                                             (Noah, Nov 11: "Yes, two lines"; "a very clear and concise way of showing
//                                             what each agent is doing")
//   l.say(html, {wait, fresh})                a new line comes in; the one before steps back above it, smaller
//   l.settle(html)                            what it ends on: one line, nothing above it
//   l.set(state, part)  l.acts([{label, on, hidden}])  l.hide()
//   A helper's droplet is painted in when its line comes in and lifts when it goes. The row itself never fades: a
//   faded row showed the droplet's own small sheet as a box for a moment (Noah, Nov 11, on screen 3 v10: "whenever our
//   blobs drop in/load in, they seem to have a box outlining them for a little before it disappears").
// Graphite: every helper's droplet has its own pencil ring, drawn as far as its work has gone (part, 0 to 1; by
// default a short stroke while it waits, most of a ring while it works, closed once it's done). The agent's droplet
// has one too: how far its helpers have got, taken together. Nothing joins one helper to the next (Noah, Nov 11:
// "the joined lines makes it seem like it's an operation that's happening linearly"), there's no loop round an agent
// ("seems a little bit redundant. The color already kind of deciphers them") and no count ("the task list, 1 of 3 ...
// Maybe they dry out and have a full circle around them").
// rail.ring(slot, r, seed).set(part)          the same ring, for anything else that shows a droplet in a slot
// rail.puck(button)                           closed, in the corner: our droplet, centered, slowly alive
// rail.heavy(node)                            a slightly heavier scroll for anything you read down (the rail's body has it)
window.topo = window.topo || { still: matchMedia('(prefers-reduced-motion: reduce)').matches };
window.rail = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const NAME = { claude: 'Claude', codex: 'Codex', gemini: 'Gemini', cursor: 'Cursor', own: '' };
  // ---- the palette: each agent's family of colors, in one place for every screen. Noah, Nov 11: "Maybe we could have
  // a little bit more variment between the hues of each agent ... make sure the hues are a little more varying so
  // that's extremely clear which agent is working on what." So each agent keeps to its own band of hue, well clear of
  // the others', and within it its three hues differ in lightness, light, middle and deep, so its helpers can be told
  // apart too. Before, Codex's third hue was lilac, the same as Gouache's own purple; Gemini's mint sat next to
  // Cursor's teals; Cursor's three were one teal; Claude's vermilion and coral were one hue. Now, at the soft look:
  //   Claude   orange 29° light, vermilion 17° middle, crimson 354° deep      (reds and oranges)
  //   Codex    cobalt 213° light, ultramarine 224° middle, indigo 228° deep     (blues)
  //   Gemini   moss 91° light, sage 127° middle, pine 137° deep                (greens)
  //   Cursor   aqua 176° light, teal 174° middle, petrol 187° deep              (teals)
  //   Gouache  lilac 261°, mauve 294°, violet 260°                              (our purples; periwinkle was too blue)
  // TINT is each one as a flat color, for marks drawn in CSS (dots on your page in the corner, and the like)
  Object.assign(wc.PIG, { sage: [1.05, 0.38, 0.95], moss: [0.8, 0.42, 1.25], pine: [1.9, 0.8, 1.5], teal: [1.35, 0.42, 0.5], aqua: [1.05, 0.26, 0.3], petrol: [1.99, 0.89, 0.8], cobalt: [1.29, 0.71, 0.19], indigo: [1.9, 1.6, 0.6], mint: [1.2, 0.28, 0.6], spruce: [1.15, 0.55, 0.62] });
  const HUES = { claude: ['vermilion', 'orange', 'crimson'], codex: ['ultramarine', 'cobalt', 'indigo'], gemini: ['sage', 'moss', 'pine'], cursor: ['teal', 'aqua', 'petrol'], own: ['lilac', 'mauve', 'violet'] };
  const TINT = { vermilion: '#e4815b', orange: '#f0a057', crimson: '#d05c68', ultramarine: '#637fcc', cobalt: '#76a7e4', indigo: '#5265b0', sage: '#88cb90', moss: '#9ec678', pine: '#529e68', teal: '#71c6bd', aqua: '#88dad5', petrol: '#4d959e', lilac: '#b299e2', mauve: '#c699cb', violet: '#9578cd' };
  for (const k in HUES) { wc.FAMILY[k] = HUES[k]; wc.FAMILY_SOFT[k] = HUES[k]; }      // an agent's own droplet mixes its three, in patches
  Object.assign(wc.DEEP, { gemini: '#2f7a55', cursor: '#1f7482' });
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  // ---- graphite rings. Each ring is a whole circle, drawn a little unevenly, that's shown only as far as `part`
  const PART = { ready: 0.28, loading: 0.28, working: 0.62, waiting: 0.1, done: 1, lit: 1 };
  function ring(slot, r, seed = 0) {
    const N = 48, pts = [], box = r + 8, svg = document.createElementNS(NS, 'svg'), path = document.createElementNS(NS, 'path');
    for (let i = 0; i <= N; i++) {      // from the top, clockwise, a little uneven; closed, it overlaps itself a touch
      const f = i / N, th = -Math.PI / 2 - 0.25 + seed * 0.4 + f * (Math.PI * 2 + 0.3), rr = r * (1 + 0.05 * Math.sin(3 * th + seed) + 0.03 * Math.sin(5 * th + seed * 2.3)) + f * 1.5;
      pts.push((Math.cos(th) * rr).toFixed(1) + ' ' + (Math.sin(th) * rr).toFixed(1));
    }
    svg.setAttribute('class', 'ring'); svg.setAttribute('viewBox', `${-box} ${-box} ${box * 2} ${box * 2}`); svg.setAttribute('aria-hidden', 'true');
    Object.assign(svg.style, { width: box * 2 + 'px', height: box * 2 + 'px', margin: `${-box}px 0 0 ${-box}px`, opacity: 0 });
    const attrs = { d: 'M' + pts.join('L'), pathLength: 1, fill: 'none', stroke: '#2b2723', 'stroke-width': 0.9, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.5 };      // the unevenness is in the path itself: a warp filter moved a part-drawn ring to the wrong side
    for (const k in attrs) path.setAttribute(k, attrs[k]);
    path.style.strokeDasharray = '0 2';
    svg.appendChild(path); slot.appendChild(svg);
    const api = { part: 0, set(p) { api.part = p; path.style.strokeDasharray = `${Math.max(0, Math.min(1, p)).toFixed(3)} 2`; svg.style.opacity = p > 0 ? 1 : 0; return api; } };
    return api;
  }

  // ---- a slightly heavier scroll, for anything you read down: the rail, the dashboard's technical view (Noah, Nov 11,
  // in chat: "can we make the scroll of the technical view and any chats slightly heavier? I hope to have an elevated
  // feel with it - very subtle, to the point where its almost unnoticeable"). The wheel doesn't move the list itself;
  // it moves where the list is going, a touch less far than asked (GAIN), and the list eases there (EASE, the time in
  // ms to cover about two thirds of what's left). Keys, the scrollbar and touch are left alone. Off with reduced motion
  const GAIN = 0.9, EASE = 85;
  function heavy(node) {
    if (!node || node.heavy || topo.still) return node;
    node.heavy = true;
    let to = node.scrollTop, at = to, raf = 0, last = 0;      // `at` is kept here as a fraction: a list's own scrollTop may round to whole pixels
    const max = () => node.scrollHeight - node.clientHeight;
    const step = (now) => {
      const dt = Math.min(48, now - last || 16); last = now;
      const left = to - at;
      if (Math.abs(left) < 0.5) { node.scrollTop = at = to; raf = 0; return; }
      at += left * (1 - Math.exp(-dt / EASE)); node.scrollTop = at;
      raf = requestAnimationFrame(step);
    };
    node.addEventListener('wheel', (e) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const d = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? node.clientHeight : 1), m = max();
      if (m <= 0 || (d < 0 && node.scrollTop <= 0 && to <= 0) || (d > 0 && node.scrollTop >= m - 1 && to >= m)) return;      // nothing to scroll here: let the page have it
      e.preventDefault();
      if (!raf) to = at = node.scrollTop;
      to = Math.max(0, Math.min(m, to + d * GAIN));
      if (!raf) { last = 0; raf = requestAnimationFrame(step); }
    }, { passive: false });
    return node;
  }

  const swap = (node, html, ms = 300) => { node.style.opacity = 0; setTimeout(() => { node.innerHTML = html; node.style.opacity = ''; }, topo.still ? 0 : ms); };

  const MARK = {      // pencil marks for the two words at the top
    // two arrows, each its own group so it can turn about its middle: outward opens the dashboard, inward (.in) comes back
    home: '<svg class="mark-size" viewBox="0 0 12 12" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><g><path d="M6.6 5.4 10.4 1.6M7.2 1.6h3.2v3.2"/></g><g><path d="M5.4 6.6 1.6 10.4M4.8 10.4H1.6V7.2"/></g></svg>',
    shut: '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"/></svg>',
  };
  function mount(host, o = {}) {
    host.classList.add('rail', 'k-paper');
    host.innerHTML = `<div class="rail-top"><button class="rail-btn rail-home" aria-label="Open the dashboard" title="Open the dashboard">${MARK.home}</button><button class="rail-btn rail-shut" aria-label="Close until you need it" title="Close until you need it (Esc)">${MARK.shut}</button></div>
      <div class="rail-body"></div>
      <div class="ask-wrap on"><div class="ask"><button class="mp" aria-label="Meta-prompting" title="Meta-prompting"></button><div class="front"><span class="ph">${o.placeholder || 'Ask anything'}</span></div></div></div>`;
    const body = host.querySelector('.rail-body'), ask = host.querySelector('.ask-wrap'), front = host.querySelector('.front');
    const r = { el: host, body, ask, front, agents: [] };
    heavy(body);
    // to the dashboard: the mark's arrows turn inward first, so it becomes the dashboard's way back (the same mark, in
    // the same corner, arrows in). Noah, Nov 11, on Dashboard v18: "If the prior was a zoom in, why not a matching zoom
    // out button? ... I'm interested in how icons that are consistent in both the rail and here could be morphed into
    // eachother during the transition"
    const homeBtn = host.querySelector('.rail-home');
    homeBtn.onclick = typeof o.home === 'string' ? () => { homeBtn.firstElementChild.classList.add('in'); setTimeout(() => { location.href = o.home; }, topo.still ? 0 : 340); } : o.home || null;
    addEventListener('pageshow', () => homeBtn.firstElementChild.classList.remove('in'));
    if (o.agents) {      // a real field that names its agent; without o.agents the field is a played scene, as before
      // what you send becomes a pile you pull up (sys/pile.js), when that file and sys/note.js are on the page
      if (window.pile && window.note) r.pile = pile.mount(ask, Object.assign({ on: o.onask }, o.agents.length === 1 ? { pig: (HUES[o.agents[0]] || [])[1], c: `var(--c-${o.agents[0]})` } : {}));      // o.onask(what, x) hears each step of each ask
      r.field = target(ask, o.agents, { send: (t, who) => { if (r.pile) r.pile.add(t, who); if (o.send) o.send(t, who); } });
    }
    r.agent = (who, opts = {}) => { const g = agent(r, who, opts); r.agents.push(g); return g; };
    r.hello = (text, who = 'own') => hello(r, text, who);

    // open, or closed to the puck in the corner. The space round the rail is your page's own color
    const page = document.querySelector('.page'), site = page && page.querySelector('main');
    if (page) {
      const bg = [site, page].map((n) => n && getComputedStyle(n).backgroundColor).find((c) => c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent');
      if (bg) document.body.style.backgroundColor = bg;
    }
    let launch = document.querySelector('.launch');
    const mine = page && !launch;      // a screen that brought its own puck looks after it itself
    r.open = (on) => {
      document.body.classList.toggle('open', on); host.classList.toggle('shut', !on); host.setAttribute('aria-hidden', !on);
      if (page) page.classList.toggle('k-beside', on);
      if (o.onopen) o.onopen(on);
      return r;
    };
    host.querySelector('.rail-shut').onclick = () => r.open(false);
    if (mine) {
      launch = el('div', 'launch', '<button aria-label="Open the extension"></button><div class="launch-key">⌥ Space</div>');
      document.body.appendChild(launch);
      puck(launch.firstChild); launch.firstChild.onclick = () => r.open(true);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') r.open(false);
        else if (e.altKey && e.code === 'Space') { e.preventDefault(); r.open(host.classList.contains('shut')); }
      });
      if (o.shut) {      // it starts closed, without the rail showing for a moment first
        host.style.transition = page.style.transition = 'none'; r.open(false);
        requestAnimationFrame(() => requestAnimationFrame(() => { host.style.transition = page.style.transition = ''; }));
      } else r.open(true);
    } else if (!page) host.querySelector('.rail-shut').onclick = null;      // on a sheet (no page beside it) there's nothing to close to
    return r;
  }

  // before you ask: our droplet, centered and bigger, over one friendly line. Only the words fade; the paint comes
  // and goes as paint does
  function hello(r, text, who) {
    const box = el('div', 'rail-hello', '<span class="hello-drop"></span><p class="hello-say"></p>'), say = box.querySelector('.hello-say'), slot = box.querySelector('.hello-drop');
    r.body.prepend(box);
    const h = { el: box, who, text };
    // The big droplet changes color by a quick cross-fade of two sheets (lifting that much paint and laying more is
    // slow and muddy), and goes the same way. It's painted in each time the welcome is shown
    const make = (w, hidden) => { const d = kit.drop(slot, w, 84, 'ready', { hidden }); d.sheet = d.el.querySelector('canvas'); d.sheet.style.transition = 'opacity .45s ease'; return d; };
    const drop = (d) => { d.stage.remove(); d.el.remove(); };
    const out = (d, gone) => { d.sheet.style.opacity = 0; if (gone) setTimeout(() => drop(d), topo.still ? 0 : 480); };
    const fresh = () => { if (h.drop) drop(h.drop); h.drop = make(who, true); box.style.setProperty('--c', `var(--c-${who})`); };
    h.say = (t, now) => { if (now || !say.textContent) say.innerHTML = t; else swap(say, t); return h; };
    h.snap = (w) => {
      if (h.drop.who === w) return h;
      const was = h.drop, d = (h.drop = make(w, false));
      d.sheet.style.opacity = 0; requestAnimationFrame(() => requestAnimationFrame(() => { d.sheet.style.opacity = 1; }));
      out(was, true); box.style.setProperty('--c', `var(--c-${w})`);
      return h;
    };
    h.show = () => { fresh(); h.say(h.text, true); h.drop.spread(); requestAnimationFrame(() => box.classList.add('in')); return h; };
    h.hide = () => { box.classList.remove('in'); if (h.drop) out(h.drop); return h; };
    fresh();
    return h;
  }

  function agent(r, who, o) {
    const g = { who, lines: [] }, box = (g.el = el('section', 'who' + (o.shut ? ' shut' : '')));
    box.style.setProperty('--c', `var(--c-${who})`);
    box.innerHTML = `<button class="who-head"><span class="who-drop"></span><span class="who-text"><span class="who-top"><span class="who-name"></span><span class="who-meta"></span></span><span class="who-say" aria-live="polite"></span></span></button><div class="who-lines"></div>`;
    r.body.appendChild(box);
    const q = (c) => box.querySelector(c), head = q('.who-head'), linesEl = q('.who-lines');
    g.drop = kit.drop(q('.who-drop'), who, 24, o.state || 'ready');
    g.ring = ring(q('.who-drop'), 19, 2);
    // the agent's ring: how far its helpers have got, taken together. Closed when every one of them is done
    const sum = () => { const on = g.lines.filter((l) => l.el.classList.contains('in')); g.ring.set(on.length ? on.reduce((n, l) => n + l.ring.part, 0) / on.length : 0); };
    g.name = (t) => { q('.who-name').textContent = t; return g; };
    g.meta = (t) => { q('.who-meta').textContent = t; return g; };
    g.say = (t, now) => { if (now || !q('.who-say').textContent) q('.who-say').innerHTML = t; else swap(q('.who-say'), t); return g; };
    g.set = (s) => { g.drop.set(s); return g; };
    g.snap = (w) => { g.who = w; g.drop = kit.snap(g.drop, w); box.style.setProperty('--c', `var(--c-${w})`); return g; };
    // with more agents than fit, an agent folds to its one line; click its name to open it
    g.fold = (shut) => { box.classList.toggle('shut', shut); head.setAttribute('aria-expanded', !shut); return g; };
    // a clean droplet in another agent's color, not yet painted (for an agent that's out of view; g.away(false) paints it)
    g.fresh = (w) => { const slot = q('.who-drop'), st = g.drop.state; g.drop.stage.remove(); g.drop.el.remove(); g.who = w; g.drop = kit.drop(slot, w, 24, st, { hidden: true }); slot.prepend(g.drop.el); box.style.setProperty('--c', `var(--c-${w})`); return g; };
    g.away = (on) => { box.classList.toggle('away', on); if (!on) g.drop.spread(); return g; };      // out of the way while the welcome is up
    g.folds = () => { box.classList.add('folds'); head.setAttribute('aria-expanded', !box.classList.contains('shut')); head.onclick = () => g.fold(!box.classList.contains('shut')); return g; };
    g.name(o.name ?? NAME[who] ?? ''); if (o.say) g.say(o.say, true); if (o.meta) g.meta(o.meta);

    const loop = sum;      // (v1 drew one loop round all of an agent's helpers here; now each has its own ring)
    g.loop = loop;

    g.line = (hue, state = 'ready', thing = '') => {
      const pig = typeof hue === 'number' ? (HUES[g.who] || HUES.own)[hue % 3] : hue;
      const l = { pig }, row = (l.el = el('div', 'line', `<span class="line-drop"></span><div class="line-body"><span class="line-thing"></span><span class="line-old"></span><span class="line-now"></span><div class="line-acts"></div></div>`));
      row.querySelector('.line-thing').textContent = thing;
      linesEl.appendChild(row);
      const now = row.querySelector('.line-now'), old = row.querySelector('.line-old'), acts = row.querySelector('.line-acts');
      l.drop = kit.drop(row.querySelector('.line-drop'), pig, 13, state, { hidden: true });
      const come = () => { if (row.classList.contains('in')) return false; row.classList.add('in'); l.drop.spread(); return true; };
      l.ring = ring(row.querySelector('.line-drop'), 12, g.lines.length + 1);
      l.set = (s, part) => { l.drop.set(s); row.classList.toggle('wait', s === 'waiting'); l.ring.set(part ?? PART[s] ?? 0); sum(); return l; };
      l.ring.set(PART[state] ?? 0);
      l.say = (html, so = {}) => {
        const was = so.fresh || thing ? '' : now.textContent;
        if (come()) { now.innerHTML = html; old.textContent = ''; loop(); return l; }
        now.style.opacity = 0; if (!was) old.style.opacity = 0;
        setTimeout(() => { old.textContent = was; old.style.opacity = ''; now.innerHTML = html; now.style.opacity = ''; loop(); }, topo.still ? 0 : 300);
        return l;
      };
      l.settle = (html, at) => { if (come() || at) { now.innerHTML = html; old.textContent = ''; loop(); return l; }
        now.style.opacity = 0; old.style.opacity = 0; setTimeout(() => { old.textContent = ''; old.style.opacity = ''; now.innerHTML = html; now.style.opacity = ''; loop(); }, topo.still ? 0 : 300); return l; };
      l.acts = (list) => { acts.innerHTML = ''; l.btn = {}; list.forEach((a) => { const b = el('button', '', a.label); b.hidden = !!a.hidden; b.onclick = a.on; acts.appendChild(b); l.btn[a.key || a.label] = b; }); loop(); return l; };
      l.hide = () => { if (row.classList.contains('in')) l.drop.leave(); row.classList.remove('in', 'undone', 'wait'); now.textContent = ''; old.textContent = ''; l.ring.set(0); loop(); return l; };
      g.lines.push(l);
      return l;
    };
    return g;
  }

  // closed, in the corner: one sheet the size of the puck, so the droplet sits dead center and nothing shows square
  function puck(btn, who = 'own') {
    btn.classList.add('puck', 'k-paper');
    const st = wc.stage(btn, { soft: true, res: 2, width: 56, height: 56 });
    return st.add(who, { size: 30, x: 28, y: 28, state: 'working' });      // working: it's slowly alive
  }

  // ---- the ask field names its agent with @ (Noah, Nov 11, in chat: "when you're chatting, we know exactly which LLM
  // to target ... if you're working with Claude alone, you could do @Claude and then you would start typing. And
  // @Claude is not like something you can take away because it's baked in. But as soon as you have 2 or more, when you
  // click onto the chat box, the placeholder Gets removed ... once you add an LLM, it just locks onto that until you
  // want to change it ... when you click into the chat, it should already start with an @"; then, on the prototype,
  // sys/ask-target.html: "The asking feature works really well. I think we can just push this onto our main build.")
  // rail.target(wrap, ['claude', 'codex'], { rest, send(text, who) }) makes a real field of an .ask-wrap. The played
  // .front stays in the page, hidden, for scenes that still write to it. Returns { input, who(), lock(who), say(text) }
  function target(wrap, keys, o = {}) {
    const agents = keys.map((k) => [k, NAME[k] || k]), one = agents.length === 1, box = wrap.querySelector('.ask'), make = (tag, cls, html = '') => { const n = document.createElement(tag); n.className = cls; n.innerHTML = html; return n; };
    box.classList.add('tgt');
    const row = make('div', 'tgt-row', `${one ? '<span class="tgt-who"></span>' : '<button class="tgt-who" type="button" hidden></button>'}<span class="tgt-in"><span class="tgt-ghost" aria-hidden="true"></span><input type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Ask"></span>`), list = make('div', 'tgt-list');
    box.appendChild(row); box.appendChild(list);
    const who = row.querySelector('.tgt-who'), input = row.querySelector('input'), ghost = row.querySelector('.tgt-ghost');
    let locked = one ? agents[0] : null, before = null, choosing = false, at = -1;      // at: which agent the typed letters point to
    const color = (a) => `var(--c-${a[0]})`;
    const names = agents.map((a) => { const b = make('button', '', a[1]); b.type = 'button'; b.style.setProperty('--c', color(a)); b.onmousedown = (e) => { e.preventDefault(); lock(a); }; list.appendChild(b); return b; });
    function draw() {
      who.hidden = !locked || choosing;
      if (locked) { who.textContent = '@' + locked[1]; who.style.setProperty('--c', color(locked)); }
      input.placeholder = choosing ? '' : locked ? 'Ask anything' : o.rest || '@agent  Ask anything';
      list.classList.toggle('in', choosing);
      names.forEach((b, i) => b.classList.toggle('on', i === at));
      const typed = input.value, name = at >= 0 ? '@' + agents[at][1] : '';
      ghost.innerHTML = choosing && name && name.length > typed.length ? `<i>${typed}</i>${name.slice(typed.length)}` : '';
    }
    function match() {      // the letters after the @ point to the first agent whose name starts with them, and take its capitals
      const t = input.value.slice(1).toLowerCase();
      at = t ? agents.findIndex((a) => a[1].toLowerCase().startsWith(t)) : -1;
      if (at >= 0) { const p = input.selectionStart; input.value = '@' + agents[at][1].slice(0, t.length); input.setSelectionRange(p, p); }
    }
    function choose(text, select) { choosing = true; input.value = text; match(); draw(); input.setSelectionRange(select ? 1 : text.length, text.length); }
    function lock(a) { locked = a; before = null; choosing = false; at = -1; input.value = ''; draw(); input.focus(); }
    function unlock() { if (one || !locked) return; before = locked; const t = '@' + locked[1]; locked = null; input.focus(); choose(t, true); }
    input.onfocus = () => { wrap.classList.add('press'); if (!locked && !choosing) choose('@'); };      // the @ is already typed, the way an address bar fills in https://
    input.onblur = () => { wrap.classList.remove('press'); if (!choosing) return; choosing = false; at = -1; input.value = ''; if (before) { locked = before; before = null; } draw(); };
    input.oninput = () => {
      if (!choosing) return;
      if (input.value[0] !== '@') input.value = '@' + input.value.replace(/@/g, '');
      const m = input.value.match(/^@(\S*)\s+([\s\S]*)$/);      // a space after the letters takes the agent they point to; what follows is the ask (so a paste works)
      if (m) { const i = m[1] ? agents.findIndex((x) => x[1].toLowerCase().startsWith(m[1].toLowerCase())) : -1; if (i >= 0) { lock(agents[i]); input.value = m[2]; return; } input.value = '@' + m[1]; }
      match(); draw();
    };
    input.onkeydown = (e) => {
      e.stopPropagation();
      if (choosing) {
        if ((e.key === 'Tab' || e.key === 'Enter' || (e.key === 'ArrowRight' && input.selectionStart === input.value.length)) && at >= 0) { e.preventDefault(); return lock(agents[at]); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); at = at < 0 ? (e.key === 'ArrowDown' ? 0 : agents.length - 1) : (at + (e.key === 'ArrowDown' ? 1 : agents.length - 1)) % agents.length; input.value = '@'; draw(); return; }
        if (e.key === 'Backspace' && input.value === '@' && input.selectionStart === input.selectionEnd) e.preventDefault();      // the @ stays while you choose
        if (e.key === 'Escape') input.blur();
        return;
      }
      if (e.key === 'Escape') return input.blur();
      if (e.key === 'Backspace' && !input.value && locked && !one) { e.preventDefault(); return unlock(); }
      if (e.key === 'Enter' && input.value.trim() && locked) { const t = input.value.trim(); input.value = ''; draw(); if (o.send) o.send(t, locked[0]); }
    };
    if (!one) who.onclick = unlock;
    box.addEventListener('mousedown', (e) => { if (e.target === input || e.target.closest('.tgt-who, .mp, .tgt-list')) return; e.preventDefault(); input.focus(); });
    draw();
    return { input, who: () => locked && locked[0], lock: (k) => { const a = agents.find((x) => x[0] === k); if (a) lock(a); }, say(text) { if (!locked) lock(agents[0]); input.value = text; input.focus(); input.setSelectionRange(text.length, text.length); } };
  }

  return { mount, puck, ring, heavy, target, MARK, PART, NAME, HUES, TINT };
})();
