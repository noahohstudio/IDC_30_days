// sys/pile.js: what an ask becomes after you send it: a pile you pull up. Noah, Nov 11, on the desk (Dashboard v20 · D):
//   "We want to make it so that it's almost like a notification because our entire thing is fighting against black box
//    LLMs that don't really show you what they're working on, when, and the progress they're making ... we don't have
//    really a middleman to Signify that it's getting worked on, and we want to make it as humanist as possible."
// and in chat, on the workshops: "being able to pull up the notifications and then pull them back down or even X them
//   or reply to them ... our thinking has to be shown as an icon ... Everything has to be able to be pulled up by an
//   icon"; then, on Chat box workshop v2: "the A pile you pull up looks good", and "Yes, build it" for the rail and
//   the dashboard.
// const p = pile.mount(askWrap, { pig, c })  the pile lives on the ask field's wrap, wherever that is (the rail, the
//                                            dashboard). pig, c: the icon's pigment and color (ours, purple, by default;
//                                            the agent's when there is only one)
//   p.add(text, who)                         an ask you just sent to that agent
//   { on(what, x) }                          hears each step of each ask: 'sent', 'work', 'ask', 'done', 'back', 'clear'.
//                                            x: { text, who, state, part (0 to 1), line, answer: 'yes' | 'no' }
//   { reply(text, who, x) }                  what the agent says for this ask: { look, doing, done, q, yes, no, back },
//                                            any of them; asked once the ask is sent (after on('sent')), so the page
//                                            can make it agree with what really changes. The rest come from guess()
// There is no transcript. An ask is a pencil note (sys/note.js) with its own droplet and ring: it lands when it's
// heard, the ring grows while it's worked on, it turns amber if it needs you, and it dries when it's answered. Over
// the field sits one droplet for everything you've asked (the icon) and a small arrow: they pull the pile up and put
// it away. Put away, a note comes up alone when there's news and tucks down after a few seconds. Point at a note for
// its X (a finished ask only) and a line to reply on. The newest three show; older ones wait behind two pencil edges.
// What the agent says follows the ask (guess, below, or the page's own reply): the screens are sketches, and nothing is
// really asked of anyone. Noah, Nov 11: "make sure that all the prototyping placeholder stuff ... is more so ironed out
// and made to look much more realistic. Now we just have to really nail the impression that this is a functioning app
// that already exists." The four lines it said whatever you typed ("Got it. Reading your page." ...) are gone.
// Needs wc/kit.js, sys/rail.js (ring, hues) and sys/note.js. Styles: sys/system.css (.pile-*).
window.pile = (function () {
  // the fallback, when an ask names nothing on the page
  const SAY = { look: 'Looking at your page.', doing: 'Trying it on your page.', done: 'Done. It’s on your page.', q: 'This touches your signup form too. Go ahead?', yes: 'Done, your signup form included.', no: 'Done. I left your signup form as it was.', back: 'Undone. Your page is back as it was.' };
  // what an ask is about, and what it does to it, from its own words (Juniper's parts: the headline, the line under it,
  // the signup form and its email field and button, the three cards, the header). [test, the part, what else it
  // touches]. The first that matches wins
  const PARTS = [
    [/under (the|your) headline|tagline|sub-?head|intro/, 'the line under your headline', 'your headline'],
    [/headline|heading|title|hero/, 'your headline', 'the line under it'],
    [/button|cta|call to action/, 'your signup button', 'your signup form'],
    [/email|field|input/, 'your email field', 'your signup button'],
    [/form|signup|sign-up|corner|radius|round/, 'your signup form', 'the button inside it'],
    [/remind/, 'your Reminders card', 'the other two cards'],
    [/streak/, 'your Streaks card', 'the other two cards'],
    [/check-?in/, 'your Daily check-ins card', 'the other two cards'],
    [/card|feature/, 'your three cards', 'the space under them'],
    [/header|menu|nav|link/, 'the links in your header', 'your Log in button'],
    [/colou?r|contrast|readab|pale|faint/, 'your colors', 'your links'],
    [/space|spacing|gap|tight|padding|room/, 'the spacing on your signup', 'your cards'],
  ];
  // [test, while it works, once it's done: (the part) => what's true now]
  const MOVES = [
    [/contrast|readab|pale|faint|easy to read/, 'Checking every color pair.', () => 'Two pairs were too faint. I darkened them.'],
    [/colou?r|accent/, 'Trying your warm accent on it.', (p) => `${cap(p)} ${be(p)} in your warm accent now.`],
    [/bigger|larger|taller|tall|bump/, 'Making it 44px tall.', (p) => `${cap(p)} ${be(p)} 44px tall now.`],      // 44px: the size the technical view says a thumb needs (the signup button is 36px)
    [/smaller|shorter|tone down|quieter/, 'Bringing it down a size.', (p) => `${cap(p)} ${be(p)} a size smaller now.`],
    [/friendl|warm|nicer|kind|human/, 'Trying warmer words.', (p) => /headline/.test(p) ? 'Your headline now says “Small steps, every day.”' : `${cap(p)} reads warmer now.`],
    [/round|soft|corner|radius/, 'Rounding its corners to 14px.', (p) => `${cap(p)} has 14px corners now.`],
    [/line .*up|align|even/, 'Lining them up on one grid.', (p) => `${cap(p)} line up now.`],
    [/dark/, 'Taking them a step darker.', (p) => `${cap(p)} ${be(p)} a step darker now.`],
    [/stand out|emphasi|highlight|pop/, 'Giving it a warm tint so it stands out.', (p) => `${cap(p)} stands out now.`],
    [/tidy|clean|neat/, 'Tidying its spacing.', (p) => `${cap(p)} ${be(p)} tidier now.`],
    [/tight|closer|less space/, 'Taking the space under it to 16px.', (p) => `${cap(p)} sits 16px closer now.`],
    [/space|room|breath|loose/, 'Giving it 8px more room.', (p) => `${cap(p)} has 8px more room now.`],
    [/rewrite|reword|copy|wording|text|clear/, 'Rewriting it.', (p) => `${cap(p)} ${be(p)} rewritten.`],
  ];
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1), many = (p) => /links|cards|colors/.test(p), be = (p) => (many(p) ? 'are' : 'is'), was = (p) => (many(p) ? 'they were' : 'it was');
  function guess(text) {
    const t = text.toLowerCase(), hit = PARTS.find(([re]) => re.test(t)), mv = MOVES.find(([re]) => re.test(t));
    const add = t.match(/^(?:please )?(?:add|build|create) (?:a |an |the |me a )?(?:new )?([a-z][a-z -]*)$/);
    if (add) { const thing = 'your ' + add[1].trim(); return { look: 'Looking at how your pages are built.', doing: 'Building it the same way.', done: `Done. ${cap(thing)} is in.`, q: 'This adds a link to your header too. Go ahead?', yes: 'Done, with a link in your header.', no: 'Done. I left your header as it was.', back: `Undone. ${cap(thing)} is gone again.` }; }
    if (!hit) return mv ? { doing: mv[1] } : {};
    const [, part, also] = hit, done = mv ? mv[2](part) : `${cap(part)} ${be(part)} updated.`;
    return { look: `Looking at ${part}.`, doing: mv ? mv[1] : 'Working on it.', done: 'Done. ' + done, q: `This touches ${also} too. Go ahead?`,
      yes: `Done, ${also} included.`, no: `Done. I left ${also} as ${was(also)}.`, back: `Undone. ${cap(part)} ${be(part)} back as ${was(part)}.` };
  }
  const el = (tag, cls, html = '') => { const n = document.createElement(tag); n.className = cls; n.innerHTML = html; return n; };
  const esc = (t) => t.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const words = (x) => `<span class="pile-you">${esc(x.text)}</span><span class="pile-it">${x.line}</span>`;
  const hue = (who) => (rail.HUES[who] || [])[1] || who;
  // with reduced motion a stage is drawn once, when it's made, so paint that changes later has to be stepped by hand
  const settle = (d) => { if (wc.still() && d.stage && d.stage.step) for (let i = 0; i < 120; i++) d.stage.step(); };
  function paint(host, pig, hidden) { const j = el('span', 'pile-job'); host.appendChild(j); const d = kit.drop(j, pig, 13, 'ready', { at: [0, 0], hidden }), r = rail.ring(j, 12, 2); return { el: j, d, r, tone(t) { j.className = j.className.replace(/ (mine|needs)/g, '') + (t ? ' ' + t : ''); } }; }
  function look(x, p) {      // how an ask's paint looks at each step
    if (x.state === 'work') { p.tone(''); p.d.set('working'); p.r.set(x.part); }
    if (x.state === 'ask') { p.tone('needs'); p.d.set('waiting'); p.r.set(Math.max(0.5, x.part)); }      // it stops where it got to and its ring turns amber
    if (x.state === 'done') { p.tone('mine'); p.d.set(x.seen ? 'done' : 'lit'); p.r.set(1); }
    if (x.state === 'back') { p.tone(''); p.d.set('ready'); p.r.set(0.2); }
    settle(p.d);
  }
  function mount(wrap, o = {}) {
    if (getComputedStyle(wrap).position === 'static') wrap.style.position = 'relative';
    wrap.classList.add('has-pile');
    const xs = []; let up = false, spread = false, count = 0, was = '', shown = false;
    const toggle = () => { up = !up; spread = false; if (!up) xs.forEach((x) => { x.banner = false; }); lay(); };
    // the icon: one droplet for everything you've asked, and the small arrow that pulls it up or down
    const ic = paint(wrap, o.pig || 'own', true); ic.el.classList.add('pile-ic'); ic.el.style.setProperty('--c', o.c || 'var(--c-own)');
    const pull = note.mark({ mark: 'fold', label: 'Pull your asks up', on: toggle }); pull.classList.add('pile-pull', 'is-down'); pull.hidden = true; wrap.appendChild(pull);
    const hit = el('button', 'pile-hit'); hit.type = 'button'; hit.hidden = true; hit.onclick = (e) => { e.stopPropagation(); toggle(); }; wrap.appendChild(hit);
    const more = el('button', 'pile-more', '<svg viewBox="0 0 240 14" preserveAspectRatio="none" aria-hidden="true"><path d="M16 12C16 7 20 5 26 5H214C220 5 224 7 224 12"/><path d="M34 5C34 2 37 1 42 1H198C203 1 206 2 206 5"/></svg>'); more.type = 'button'; more.title = 'Show the older ones'; more.setAttribute('aria-label', 'Show the older ones'); more.onclick = (e) => { e.stopPropagation(); up = true; spread = true; lay(); }; wrap.appendChild(more);
    function icon() {      // the most pressing thing wins: needs you, then an answer you haven't seen, then work going on
      const l = up ? 'Put your asks away' : 'Pull your asks up'; pull.classList.toggle('is-down', !up); pull.title = l; pull.setAttribute('aria-label', l); hit.setAttribute('aria-label', l);
      pull.hidden = hit.hidden = !xs.length;
      if (!xs.length) { if (shown) { shown = false; was = ''; ic.d.leave(); ic.r.set(0); } return; }
      if (!shown) { shown = true; ic.d.spread(0.9); settle(ic.d); }
      const need = xs.find((x) => x.state === 'ask'), unseen = xs.find((x) => x.state === 'done' && !x.seen), work = xs.filter((x) => x.state === 'work' || x.state === 'sent');
      const key = need ? 'ask' : unseen ? 'lit' : work.length ? 'work' + Math.max(...work.map((x) => x.part)) : 'done';
      if (key === was) return; was = key;
      if (need) { ic.tone('needs'); ic.d.set('waiting'); ic.r.set(Math.max(0.5, need.part)); } else if (unseen) { ic.tone('mine'); ic.d.set('lit'); ic.r.set(1); } else if (work.length) { ic.tone(''); ic.d.set('working'); ic.r.set(Math.max(0.08, ...work.map((x) => x.part))); } else { ic.tone('mine'); ic.d.set('done'); ic.r.set(1); }
      settle(ic.d);
    }
    let raf = 0; const soon = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(lay); };
    function lay() {
      const news = xs.filter((x) => x.banner), vis = up ? xs.slice(spread ? -5 : -3) : news.slice(-3);      // put away, no more than three come up at once; the rest wait behind the pencil edges
      let b = wrap.offsetHeight + 42;
      // only the newest, and any that needs you, is shown whole; the others are one line (your ask and its droplet) until
      // you point at them, so a pile takes less of the paint behind it (Noah, Nov 11: "structure it so that it doesn't
      // really interfere too much with the agents themselves ... the helpers, bottom left")
      vis.forEach((x, i) => x.nt.el.classList.toggle('slim', i < vis.length - 1 && x.state !== 'ask'));
      [...vis].reverse().forEach((x) => { x.nt.el.style.bottom = b + 'px'; if (!x.nt.isOpen) x.nt.open(true); if (!x.seen) { x.seen = true; look(x, x.p); } b += x.nt.el.offsetHeight + 8; });
      xs.forEach((x) => { if (!vis.includes(x) && x.nt.isOpen) x.nt.open(false); });
      more.style.bottom = b - 4 + 'px'; more.classList.toggle('in', up ? xs.length > vis.length : news.length > vis.length);
      icon();
    }
    const can = (x) => x.nt.el.classList.toggle('can-x', x.state === 'done' || x.state === 'back');      // a question can't be cleared, only answered
    const tell = (what, x) => { if (o.on) o.on(what, x); };      // so the page can show the same ask elsewhere (the dashboard paints it into its agent's loop)
    const step = {
      sent(x) { x.state = 'sent'; x.line = ''; x.banner = true; x.nt.say(words(x), true).acts([], true); can(x); lay(); tell('sent', x); },
      heard(x) { x.p.d.spread(0.9); x.p.r.set(0.08); settle(x.p.d); },
      work(x, t, p) { x.state = 'work'; x.line = t; x.part = p; look(x, x.p); x.nt.say(words(x)); can(x); lay(); tell('work', x); },
      ask(x) { x.state = 'ask'; x.line = x.say.q; x.banner = true; look(x, x.p); x.nt.say(words(x)).acts([{ mark: 'yes', label: 'Yes', on: () => { x.answer = 'yes'; step.done(x, x.say.yes); } }, { mark: 'no', label: 'No', on: () => { x.answer = 'no'; step.done(x, x.say.no); } }]); can(x); lay(); tell('ask', x); },
      done(x, t) {
        x.state = 'done'; x.line = t; x.seen = x.nt.isOpen; look(x, x.p); can(x); tell('done', x);
        x.nt.say(words(x)).acts([{ mark: 'undo', label: 'Undo', on: () => { x.state = 'back'; x.line = x.say.back; look(x, x.p); x.nt.say(words(x)).acts([]); tell('back', x); } }]); lay();
        clearTimeout(x.tuck); x.tuck = setTimeout(function tuck() { if (x.nt.el.matches(':hover, :focus-within')) { x.tuck = setTimeout(tuck, 2000); return; } x.banner = false; lay(); }, 5000);      // put away, an answer comes up alone, then tucks down
      },
    };
    function run(x) {      // one ask, played through: heard, worked on, then answered or needing you
      x.timers.forEach(clearTimeout); x.timers = [];
      const T = (ms, fn) => x.timers.push(setTimeout(fn, ms));
      x.answer = null; step.sent(x);
      x.say = Object.assign({}, SAY, guess(x.text), (o.reply && o.reply(x.text, x.who, x)) || {});      // asked after 'sent', so the page has already set the ask's work going
      T(350, () => step.heard(x)); T(1100, () => step.work(x, x.say.look, 0.3)); T(3000, () => step.work(x, x.say.doing, 0.68)); T(5200, () => (x.asks ? step.ask(x) : step.done(x, x.say.done)));
    }
    function add(text, who = 'claude') {
      text = (text || '').trim(); if (!text) return;
      const x = { text, who, line: '', state: 'sent', part: 0, seen: true, asks: count++ % 3 === 1, timers: [] };      // every third ask comes back with a question
      x.nt = note.make(wrap, { w: wrap.clientWidth, c: `var(--c-${who})`, halo: false }); Object.assign(x.nt.el.style, { left: '0px', top: 'auto', bottom: wrap.offsetHeight + 42 + 'px' }); x.nt.el.classList.add('pile-note');
      x.nt.el.style.setProperty('--c', `var(--c-${who})`);
      x.p = paint(x.nt.el, hue(who), true);
      const re = el('input', 'pile-re'); re.type = 'text'; re.placeholder = 'Reply'; re.setAttribute('aria-label', 'Reply'); re.autocomplete = 'off'; x.nt.el.querySelector('.note-body').appendChild(re);
      re.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') re.blur(); if (e.key === 'Enter' && re.value.trim()) { x.text = re.value.trim(); x.asks = false; re.value = ''; re.blur(); x.p.tone(''); run(x); } };
      const xb = note.mark({ mark: 'no', label: 'Clear', on: () => { x.timers.forEach(clearTimeout); clearTimeout(x.tuck); xs.splice(xs.indexOf(x), 1); x.p.d.leave(); x.nt.remove(); lay(); tell('clear', x); } }); xb.classList.add('pile-x'); x.nt.el.appendChild(xb);
      x.nt.el.addEventListener('click', (e) => e.stopPropagation());
      if (window.ResizeObserver) new ResizeObserver(soon).observe(x.nt.el);
      xs.push(x); run(x);
      return x;
    }
    return { add, toggle, isUp: () => up, asks: xs };
  }
  return { mount, SAY, guess };
})();
