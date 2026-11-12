// Shared by the v2 sketches.
// defs(root): a design term (.term, with data-def) shows its meaning only while you hover it. No captions otherwise
// (Noah, Nov 9: "Remove the send button or any of the captions underneath anything").
window.defs = function (root) {
  const def = document.createElement('div');
  def.className = 'def';
  document.body.appendChild(def);
  root.addEventListener('mouseover', (e) => {
    const t = e.target.closest('.term');
    if (!t) return;
    def.innerHTML = `<b>${t.textContent}</b>${t.dataset.def}`;
    const r = t.getBoundingClientRect();
    Object.assign(def.style, { left: Math.max(12, r.left) + 'px', top: r.top - def.offsetHeight - 10 + 'px', opacity: 1 });
  });
  root.addEventListener('mouseout', (e) => { if (e.target.closest('.term')) def.style.opacity = 0; });
};

// ask(wrap, {typed, parts}): the chat field. With meta-prompting on, the fuller prompt comes up behind what you type,
// in real time (Noah, Nov 9: "When you write it, the correction should be coming up right behind your writing. This
// should, this is also toggleable"). The switch in the corner turns it off and on.
window.ask = function (wrap, opts = {}) {
  const typed = opts.typed || '';
  const parts = opts.parts || [];
  const out = wrap.querySelector('.typed'), rw = wrap.querySelector('.behind2');
  wrap.querySelector('.mp').addEventListener('click', () => wrap.classList.toggle('on'));
  defs(wrap);

  function show(n) {
    const t = typed.slice(0, n);
    out.innerHTML = t ? t + '<span class="caret"></span>' : `<span class="ph">${opts.placeholder || 'Ask Claude'}</span>`;
    rw.innerHTML = parts.filter(([k]) => t.length >= k.length).map(([, v]) => v).join('');
    wrap.classList.toggle('typing', n > 0);
  }
  if (!typed) return show(0);
  if (topo.still) return show(typed.length);
  let n = 0;
  (function tick() {
    show(n);
    if (n < typed.length) { n++; setTimeout(tick, 85 + Math.random() * 70); }
    else setTimeout(() => { n = 0; tick(); }, opts.hold || 7000);
  })();
};

// The terms a beginner meets, in plain words.
window.TERMS = {
  'button label': 'The words on a button. A clear one says what happens next.',
  'warmer copy': 'Friendlier, more personal words. “Copy” is the text in a product.',
  'corner radius': 'How round the corners are. Bigger feels softer and friendlier.',
  'accent color': 'The one bold color a product uses to point at what matters.',
  'layout': 'Where everything sits on the page.',
  'spacing': 'The room between things.',
  'label': 'The words on a button or field.',
};
window.term = (w, shown) => `<span class="term" data-def="${TERMS[w]}">${shown || w}</span>`;
