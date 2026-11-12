// sys/note.js: the overlay, as a note in pencil (see note.css for Noah's words). It needs nothing else.
// const n = note.make(host, { at: [left, top], w, c, from: [x, y], small, halo: false })
//   n.say(html, now)      the one line of words. A design word in it (.term) opens its meaning when you point at it
//                         (a click keeps it open); { terms: false } in make() leaves the words to you
//   n.acts([{ mark: 'yes' | 'no' | 'undo' | 'edit' | 'fold', label, on, ring: 'you' }])   pencil marks under the words. No
//                         ring is drawn round a mark any more; ring: 'you' draws that mark in the amber
//                         (flip: true mirrors a mark, so undo reads as redo)
//   n.open(on)            the pencil line draws itself round, what's behind blurs and pales, the words come up
//   n.mean(termNode)      a smaller note grown out of that word; n.mean() puts it away
//   n.remove()            closes it and takes it off the page
// note.veil(host)         the whole field behind an open note, blurred and paled: v.on(true | false)
// note.MARK               the pencil marks, as svg
window.note = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const ICO = (d) => `<svg class="ico" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  const MARK = {
    yes: ICO('M3.4 9.9C4.9 11.1 6.1 12.6 7.1 14.3 8.9 9.9 11.5 6.3 14.9 3.6'),
    no: ICO('M4.1 4.3C7.3 7.2 10.5 10.5 13.9 14M14 4.1C10.7 7.2 7.5 10.4 4.2 14'),
    undo: ICO('M3.8 7.4C6.2 7.2 8.4 7.2 10.7 7.3 15.6 7.6 15.5 14.6 10.6 14.7 9.5 14.8 8.5 14.8 7.4 14.7M6.9 4.2C5.8 5.2 4.8 6.3 3.8 7.4 4.9 8.4 5.9 9.5 7 10.5'),
    fold: ICO('M4.1 6.9C5.8 8.4 7.4 10 9 11.7 10.6 10 12.2 8.4 13.9 6.8'),      // put it away, keep it
    edit: ICO('M11.9 3.5C12.8 4.3 13.7 5.2 14.5 6.1 11.9 8.8 9.3 11.4 6.6 14 5.5 14.3 4.4 14.5 3.3 14.7 3.5 13.6 3.7 12.5 4 11.4 6.6 8.7 9.2 6.1 11.9 3.5ZM10.4 5.1C11.3 5.9 12.1 6.8 12.9 7.6'),
  };
  function need() {      // one warp for every pencil line in a note: the outline (2.4) and the small marks (0.9)
    if (document.getElementById('note-warp')) return;
    const d = document.createElementNS(NS, 'svg'); d.setAttribute('width', 0); d.setAttribute('height', 0); d.setAttribute('aria-hidden', 'true'); d.style.position = 'absolute';
    d.innerHTML = '<filter id="note-warp" filterUnits="userSpaceOnUse" x="-80" y="-80" width="2400" height="2400"><feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="8" result="w"/><feDisplacementMap in="SourceGraphic" in2="w" scale="2.4" xChannelSelector="R" yChannelSelector="G"/></filter>'
      + '<filter id="note-warp-s" x="-20%" y="-20%" width="140%" height="140%"><feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="2" seed="3" result="w"/><feDisplacementMap in="SourceGraphic" in2="w" scale="0.9" xChannelSelector="R" yChannelSelector="G"/></filter>';
    document.body.appendChild(d);
  }
  function mark(a, i = 0) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'note-mark' + (a.ring === 'you' ? ' you' : '') + (a.flip ? ' flip' : '');
    b.setAttribute('aria-label', a.label); b.title = a.label; b.innerHTML = MARK[a.mark];
    b.onclick = (e) => { e.stopPropagation(); a.on && a.on(e); };
    return b;
  }
  function make(host, o = {}) {
    need();
    const el = document.createElement('div'); el.className = 'note' + (o.small ? ' small' : '') + (o.halo === false ? ' no-halo' : '');
    el.innerHTML = '<span class="note-halo"></span><span class="note-glass"></span><svg class="note-box" aria-hidden="true"><rect x="1" y="1" pathLength="1"/></svg><div class="note-body"><p class="note-say"></p><div class="note-acts" hidden></div></div>';
    if (o.c) el.style.setProperty('--c', o.c);
    if (o.w) el.style.width = o.w + 'px';
    if (o.at) { el.style.left = o.at[0] + 'px'; el.style.top = o.at[1] + 'px'; }
    let lead = null;
    if (o.from) {      // a short pencil stroke from the paint to the note
      lead = document.createElementNS(NS, 'svg'); lead.setAttribute('class', 'note-lead'); lead.setAttribute('aria-hidden', 'true');
      lead.innerHTML = '<path pathLength="1"/>';
    }
    host.appendChild(el);
    if (lead) host.appendChild(lead);      // after the note, so the note's own blur doesn't smear it
    const say = el.querySelector('.note-say'), acts = el.querySelector('.note-acts'), rect = el.querySelector('rect');
    const fit = () => {
      rect.setAttribute('width', Math.max(0, el.offsetWidth - 2)); rect.setAttribute('height', Math.max(0, el.offsetHeight - 2)); rect.setAttribute('rx', o.small ? 12 : 15);
      // the lead lands on the note's top edge, as near under the paint as it can
      if (lead) { const [fx, fy] = o.from, tx = Math.max(el.offsetLeft + 22, Math.min(fx, el.offsetLeft + el.offsetWidth - 22)), ty = el.offsetTop + 1; lead.firstChild.setAttribute('d', `M${fx} ${fy}C${fx + 2} ${(fy + ty) / 2} ${tx + 2} ${(fy + ty) / 2} ${tx} ${ty}`); }
    };
    const seen = window.ResizeObserver ? new ResizeObserver(fit) : null; if (seen) seen.observe(el);
    let kid = null, swap = 0, hold = 0, pinned = false;
    const shut = () => { clearTimeout(hold); hold = setTimeout(() => { if (!pinned) api.mean(); }, 280); };
    const api = {
      el, isOpen: false,
      say(html, now) {
        clearTimeout(swap); api.mean();
        if (now || !api.isOpen) { say.innerHTML = html; say.classList.remove('out'); fit(); return api; }
        say.classList.add('out'); swap = setTimeout(() => { say.innerHTML = html; say.classList.remove('out'); fit(); }, 180);
        return api;
      },
      acts(list = [], now) {
        const put = () => { acts.innerHTML = ''; list.forEach((a, i) => acts.appendChild(mark(a, i))); acts.hidden = !list.length; acts.classList.remove('out'); fit(); };
        if (now || !api.isOpen) put(); else { acts.classList.add('out'); setTimeout(put, 180); }
        return api;
      },
      remove() { api.open(false); setTimeout(() => { if (seen) seen.disconnect(); el.remove(); if (lead) lead.remove(); }, 600); },      // put away for good
      open(on = true) { api.isOpen = on; fit(); el.classList.toggle('open', on); if (lead) lead.classList.toggle('open', on); if (!on) api.mean(); return api; },
      // a word's meaning: the same note, smaller, grown out of the word and laid over this one
      mean(t) {
        clearTimeout(hold); el.classList.remove('under'); el.querySelectorAll('.term.on').forEach((x) => x.classList.remove('on'));
        if (kid) { const k = kid; kid = null; k.remove(); }
        if (!t) { pinned = false; return api; }
        const h = host.getBoundingClientRect(), r = t.getBoundingClientRect(), x = r.left - h.left, y = r.bottom - h.top;
        kid = make(host, { small: true, at: [Math.max(4, Math.min(x - 6, host.clientWidth - 222)), y + 14], from: [x + 12, y + 2] });
        kid.say(t.dataset.def, true).open(); kid.term = t; el.classList.add('under'); t.classList.add('on');      // the explanation alone; the word you're on stays sharp in the note above
        kid.el.addEventListener('mouseenter', () => clearTimeout(hold)); kid.el.addEventListener('mouseleave', shut);
        return api;
      },
    };
    if (!o.small && o.terms !== false) {      // point at a design word and its meaning comes up; a click keeps it up
      el.addEventListener('mouseover', (e) => { const t = e.target.closest('.term'); if (!t) return; clearTimeout(hold); if (!kid || kid.term !== t) { api.mean(t); pinned = false; } });
      el.addEventListener('mouseout', (e) => { if (e.target.closest('.term')) shut(); });
      el.addEventListener('click', (e) => { const t = e.target.closest('.term'); if (!t) return; e.stopPropagation(); if (kid && kid.term === t && pinned) return api.mean(); if (!kid || kid.term !== t) api.mean(t); pinned = true; });
    }
    fit();
    return api;
  }
  // the whole field behind an open note, blurred and paled. Add it to the host before the paint that should stay
  // sharp and before the note; v.on(true | false)
  function veil(host) { const v = document.createElement('span'); v.className = 'note-veil'; host.appendChild(v); return { el: v, on(on = true) { v.classList.toggle('on', on); } }; }
  return { make, mark, veil, MARK };
})();
