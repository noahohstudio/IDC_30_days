// What the screens share: droplets (wc.js, soft) and pencil lines. Noah's notes on Workshop v4 (Nov 10):
//   "Pencil lines are really good, but I really dislike the dotted lines"; "a little too thick and too noticeable";
//   "The noise on it is also not very high fidelity ... Could we make it a little cleaner?"
// kit.drop(host, who, size, state)        a droplet in its own small canvas, inside host. Returns the stain
// kit.snap(drop, who)                     the same droplet takes another agent's color (ours is 'own', purple)
// kit.lines(host)                         a pencil layer over host; returns line(box, pad, rx) -> a rect, hidden
// kit.thing(host, line, box, pad, rx, who)  a thing being worked on: a pencil line round it, a droplet at its corner
// Gentler since Workshop v6, after Noah's note on v5 (Nov 10): "make the ink droplet that's working on the graphite,
//   you know, circled component a little bit more subtle ... the circling graphite is a little subtler too ... I'm
//   afraid of if many things are being worked on, the graphite will be very distracting. Let's make it a little
//   gentler, a little subtler, and closer to what it's actually working with."
// So the droplet is smaller (14, was 20), the line is thinner and paler, and both sit at about half the asked padding.
window.kit = (function () {
  const NS = 'http://www.w3.org/2000/svg';
  const near = (pad) => Math.max(3, Math.round(pad * 0.5));      // closer to the thing than asked
  function drop(host, who, size, state = 'ready', o = {}) {
    const d = document.createElement('span'), box = Math.round(size * 1.9 + 10);
    d.className = 'wdrop' + (o.at ? ' at' : '');
    Object.assign(d.style, { width: box + 'px', height: box + 'px' }, o.at ? { left: o.at[0] - box / 2 + 'px', top: o.at[1] - box / 2 + 'px' } : { margin: (o.bleed ?? -(box - size) / 2) + 'px' });
    host.appendChild(d);
    const st = wc.stage(d, { soft: true, res: size > 70 ? 1.5 : 2, width: box, height: box });
    const s = st.add(who, { size, state, hidden: !!o.hidden });
    s.stage = st; s.el = d; s.size = size;
    return s;
  }
  // it dries and lifts, and the same droplet comes back in the other color
  function snap(s, who) {
    if (s.who === who) return s;
    s.leave();
    const n = s.stage.add(who, { size: s.size, state: s.state, hidden: true });
    n.stage = s.stage; n.el = s.el; n.size = s.size; n.spread(1.4);
    return n;
  }
  function lines(host) {
    const svg = document.createElementNS(NS, 'svg'), id = 'pn' + Math.random().toString(36).slice(2, 7), w = host.clientWidth || innerWidth, h = host.clientHeight || innerHeight;
    svg.setAttribute('class', 'pen'); svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.innerHTML = `<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${w}" height="${h}"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="8" result="warp"/><feDisplacementMap in="SourceGraphic" in2="warp" scale="2.2" xChannelSelector="R" yChannelSelector="G"/></filter><g filter="url(#${id})" fill="none" stroke="#3a3733" stroke-width="0.7" stroke-linecap="round"></g>`;
    host.appendChild(svg);
    return (box, pad, rx) => { pad = near(pad); rx = Math.max(3, rx - 3); const r = document.createElementNS(NS, 'rect'), a = { x: box[0] - pad, y: box[1] - pad, width: box[2] + pad * 2, height: box[3] + pad * 2, rx, opacity: 0 }; for (const k in a) r.setAttribute(k, a[k]); svg.lastChild.appendChild(r); return r; };
  }
  function thing(host, line, box, pad, rx, who = 'claude') {
    const p = near(pad), s = drop(host, who, 14, 'ready', { at: [box[0] - p, box[1] - p], hidden: true }), r = line(box, pad, rx);
    return {
      s, r, st: s.stage,
      look() { s.set('ready'); s.spread(); r.setAttribute('opacity', 0.2); },
      change() { s.set('working'); r.setAttribute('opacity', 0.34); },
      wait() { s.set('waiting'); },
      done() { s.set('done'); r.setAttribute('opacity', 0); },
      mark() { s.state = 'done'; s.st.param(s); s.lay(); },
      lit(on) { s.set(on ? 'lit' : 'done'); r.setAttribute('opacity', on ? 0.34 : 0); },
      clear() { s.leave(); r.setAttribute('opacity', 0); },
    };
  }
  const rect = (node, host) => { const r = node.getBoundingClientRect(), h = host ? host.getBoundingClientRect() : { left: 0, top: 0 }; return [r.left - h.left, r.top - h.top, r.width, r.height]; };
  return { drop, snap, lines, thing, rect };
})();
