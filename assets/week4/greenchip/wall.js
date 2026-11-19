/* Greenchip sign-up site. One engine for both versions; each page sets window.GC.

   Every page is a green sheet. Reading it, you're standing close: the sheet fills the window
   and nothing moves. The hairline circle at the top steps you back into the library, where
   every page is a card, and you choose where to go next. Picking a card steps you into it.

   Version A (decorated): the cards hang on the Figma's dark image wall among the community's
   blurred art and Kyle's ethos; the columns stagger like the Figma wall; the card you point at
   lifts and the rest of the wall dims; the ethos arrives line by line.
   Version B (restrained): four cards in a straight row on one blurred artwork, a different one
   each time; nothing lifts or dims; the label underlines, as every link does in the Figma.

   Nothing moves on scroll or while idle. A click or Escape during a move skips to the end.
   Reduced motion swaps with a short fade. Nothing is sent anywhere. */
(function () {
  'use strict';

  var CFG = Object.assign({
    base: '',           // path from the page to the shared files
    wall: true,         // the art hangs all around the pages
    stagger: true,      // columns staggered like the Figma wall
    ground: false,      // one blurred artwork behind the library, a different one each time
    lift: true,         // the card you point at lifts; the rest of the wall dims
    pan: true,          // page-to-page moves travel along the wall (else they pass through the library)
    ethosArrives: true, // Kyle's ethos arrives line by line on the lander
    leave: 'fade',      // how the other pages get out of the way as you step in: fade (A) or slide (B)
    open: 900,          // stepping back into the library (ms)
    close: 900,         // stepping into a page (ms)
    out: 520, in: 560   // page to page: step back, step in (ms)
  }, window.GC || {});

  // ---- Material ---------------------------------------------------------------
  var ART = ['rOiSxn0koaiBsorFkvlfmUJDY', 'TAiKUNlmTDebByZevUBkQIhHo', 'mI4NxYdmBpideDmZtg8EP9twY', 'yk0L3oKV9292CZKXrWsIXWtY',
    'bgLpsamhhqn7sxFOkPxEJs08E', 'ICIFBA4tKQBE9UI5NFDsemhZFc', 'G4aK25hXnfar9TAnSc34mAbBFg', 'JE7ckRu2zflNCCW2rIUGIH4gk',
    'aGr7Yl9LrGcqryaOdyzKvg80', 'EbdRBtvyMLJLTtkV7TepMteIVaE', 'zC2Y1eSl2G1C0BthBVzCuDEClo', 'eTr4xZCmPgOa9QrKXCyynjBifGM',
    'QSGvhq3V4mqNfjYctjvhwT1l3BE', '3qDof6pAhVC45E3LDfjupnmQxzw', 'xdE3Dwo9jKVscFxzowyIeuH07g', '4npLYdjzjWTskJS1hNb0uHUTEs',
    'sCN7yyKPkXUKUGCNQ1ocM9A1x4', 'PGBO5IuHutTFFbMCuDGuKuWpItg', 'nb3YuN9agimUi7z5ikSoeXH2p9Y', 'IGwKFP2jSst4Wy2P6qcHPTUiFnQ',
    'Eg6Nv1IVs0w2gpijn2HtHecc5Vw', 'i8tXHmOFoxHyAwkEOKGrSLWTY', 'kiNwGj1whuduTgE6FAz7QG3L0GQ', '6cuU0rWvioVFV8QNsh76i5PNU'];
  function art(i) { return CFG.base + 'art/' + ART[((i % ART.length) + ART.length) % ART.length] + '.jpg'; }

  // Kyle's ethos, word for word (notes/2026-11-12-kyle-ethos.md).
  var ETHOS = [['WELCOME'], ['WE', 'ENJOY', 'LISTENING', 'CONNECTING', 'OBSERVING', 'MAKING', 'EXCHANGING']];

  // The pages, in library order. The lander isn't called "About"; Terms and Privacy are gone (Noah, Nov 13).
  var ORDER = ['', 'join', 'contact', 'feedback'];
  var LABELS = { '': 'Welcome', join: 'Wait list', contact: 'Contact', feedback: 'Send feedback' };
  var TITLES = { '': 'greenchip', join: 'Join the wait list · greenchip', contact: 'Contact · greenchip', feedback: 'Send feedback · greenchip' };
  var ALIAS = { about: '' };

  // Where the pages hang. Wide windows: one row of four, in the Figma wall's staggered columns.
  // Tall windows: two by two. The ethos and Kyle's photo hang just above and below.
  var SHELF = { cells: [[0, 0], [1, 0], [2, 0], [3, 0]], ethos: [1, -1], photo: [2, 1], cols: [-6, 9], rows: [-3, 3] };
  var GRID = { cells: [[0, 0], [1, 0], [0, 1], [1, 1]], ethos: [1, -1], photo: [0, 2], cols: [-4, 5], rows: [-4, 5] };

  // The Figma wall staggers its six columns; these are its offsets, in 303-tall units.
  var STAGGER = [-80, -172, -48, -80, -182, -10];
  var STAGGER_MEAN = STAGGER.reduce(function (a, b) { return a + b; }, 0) / STAGGER.length;

  // ---- Motion -----------------------------------------------------------------
  var EASE = 'cubic-bezier(0.5, 0, 0.1, 1)'; // one curve for every move: a gathering start, a long soft landing
  var PAN_BASE = 200, PAN_PER_COL = 70, PAN_MIN = 320, PAN_MAX = 700;
  var reduceQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var forceReduce = /[?&]motion=reduce/.test(location.search); // for review: ?motion=reduce
  var reduce = { get matches() { return forceReduce || reduceQuery.matches; } };

  // ---- Elements ---------------------------------------------------------------
  var stage = document.querySelector('.stage');
  var world = document.getElementById('world');
  var veil = document.getElementById('veil');
  var ring = document.getElementById('ring');
  var index = document.getElementById('index');
  var groundImg = document.querySelector('.ground img');
  var pages = {};
  document.querySelectorAll('.page').forEach(function (p) { pages[p.getAttribute('data-page')] = p; });

  var footT = document.getElementById('footer');
  document.querySelectorAll('[data-footer]').forEach(function (n) { n.replaceWith(footT.content.cloneNode(true)); });

  // ---- Geometry ---------------------------------------------------------------
  var vw, vh, cw, ch, gap, sx, sy, LAY = null, HANG = {}, LIB = { c: { x: 0, y: 0 }, z: 0.3 };
  function measure() {
    vw = window.innerWidth; vh = window.innerHeight;
    ch = vh;                                       // a card is as tall as the window
    cw = Math.min(Math.round(vh * 222 / 303), vw); // and 222:303 wide, or the window's width on a phone
    gap = Math.round(cw * 20 / 222);               // the Figma's 20px gap, at this scale
    sx = cw + gap; sy = ch + gap;
    var next = vw >= vh ? SHELF : GRID, changed = next !== LAY;
    LAY = next;
    ORDER.forEach(function (k, i) { HANG[k] = { col: LAY.cells[i][0], row: LAY.cells[i][1] }; });
    return changed;
  }
  function stagger(col) { if (!CFG.stagger) return 0; var i = ((col % 6) + 6) % 6; return (STAGGER[i] - STAGGER_MEAN) / 303 * ch; }
  function slot(col, row) { return { x: col * sx, y: row * sy + stagger(col) }; }
  function cardOf(k) { return slot(HANG[k].col, HANG[k].row); }
  function centerOf(k) { var s = cardOf(k); return { x: s.x + cw / 2, y: s.y + ch / 2 }; }
  function cam(c, z) { return 'translate(' + vw / 2 + 'px,' + vh / 2 + 'px) scale(' + z + ') translate(' + (-c.x) + 'px,' + (-c.y) + 'px)'; }
  function cut() { var x = Math.max(0, (vw - cw) / 2); return 'inset(0px ' + x + 'px 0px ' + x + 'px)'; }

  // The library camera: every card in view, with room for the circle above and the labels below.
  function fitLibrary() {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ORDER.forEach(function (k) {
      var s = cardOf(k);
      x0 = Math.min(x0, s.x); y0 = Math.min(y0, s.y); x1 = Math.max(x1, s.x + cw); y1 = Math.max(y1, s.y + ch);
    });
    var padX = Math.max(24, vw * 0.04), padY = Math.max(80, vh * 0.12);
    LIB.c = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    LIB.z = Math.min((vw - 2 * padX) / (x1 - x0), (vh - 2 * padY) / (y1 - y0));
  }

  // ---- The wall (A) -----------------------------------------------------------
  var slots = [];
  function buildWall() {
    slots.forEach(function (s) { s.el.remove(); });
    slots = [];
    if (!CFG.wall) return;
    var taken = {};
    ORDER.forEach(function (k) { taken[HANG[k].col + ',' + HANG[k].row] = true; });
    var ethosAt = LAY.ethos.join(','), photoAt = LAY.photo.join(',');
    for (var c = LAY.cols[0]; c <= LAY.cols[1]; c++) {
      for (var r = LAY.rows[0]; r <= LAY.rows[1]; r++) {
        var key = c + ',' + r;
        if (taken[key]) continue;
        var el = document.createElement('div');
        el.className = 'slot';
        el.setAttribute('aria-hidden', 'true');
        if (key === ethosAt) {
          el.className += ' slot--ethos';
          el.innerHTML = ETHOS.map(function (g) { return '<p>' + g.join('<br>') + '</p>'; }).join('') +
            '<span class="slot__note">Typeset stand-in for Kyle’s handwriting</span>';
        } else if (key === photoAt) {
          el.className += ' slot--placeholder';
          el.innerHTML = '<span class="slot__note">Kyle’s photo goes here, blurred like the art</span>';
        } else {
          el.innerHTML = '<img src="' + art(c * 7 + r * 11) + '" alt="" decoding="async">'; // neighbors never repeat
        }
        world.insertBefore(el, world.firstChild);
        slots.push({ el: el, col: c, row: r });
      }
    }
  }

  // ---- The library's cards: links laid over the cards while stepped back -------
  var hits = {};
  ORDER.forEach(function (k) {
    var a = document.createElement('a');
    a.className = 'card';
    a.href = '#/' + k;
    a.setAttribute('data-key', k);
    a.innerHTML = '<span class="card__label">' + LABELS[k] + '</span>';
    index.appendChild(a);
    hits[k] = a;
  });
  function placeHits() {
    ORDER.forEach(function (k) {
      var s = cardOf(k), a = hits[k];
      a.style.left = (vw / 2 + LIB.z * (s.x - LIB.c.x)) + 'px';
      a.style.top = (vh / 2 + LIB.z * (s.y - LIB.c.y)) + 'px';
      a.style.width = (LIB.z * cw) + 'px';
      a.style.height = (LIB.z * ch) + 'px';
    });
  }

  // ---- Layout -----------------------------------------------------------------
  var mode = 'page';          // 'page' or 'library'
  var current = routeKey();

  function layout() {
    if (measure()) buildWall();
    fitLibrary();
    document.documentElement.style.setProperty('--vh', vh + 'px');
    slots.forEach(function (s) {
      var p = slot(s.col, s.row);
      s.el.style.left = p.x + 'px'; s.el.style.top = p.y + 'px';
      s.el.style.width = cw + 'px'; s.el.style.height = ch + 'px';
      s.el.style.setProperty('--ethos-size', Math.round(ch * 0.04) + 'px');
      s.el.style.setProperty('--note-size', Math.round(ch * 0.026) + 'px');
    });
    Object.keys(pages).forEach(function (k) {
      var p = cardOf(k), el = pages[k];
      el.style.left = (p.x + cw / 2 - vw / 2) + 'px';
      el.style.top = p.y + 'px';
      el.style.width = vw + 'px';
      el.style.height = vh + 'px';
      el.style.clipPath = mode === 'page' && k === current ? 'none' : cut();
    });
    showPages(mode === 'library' ? null : current);
    placeHits();
    fitWordmarks();
  }

  function fitWordmarks() {
    document.querySelectorAll('.wordmark').forEach(function (w) {
      var span = w.firstElementChild;
      if (!span) { span = document.createElement('span'); span.textContent = w.textContent; w.textContent = ''; w.appendChild(span); }
      w.style.fontSize = '100px';
      var cs = getComputedStyle(w.parentElement);
      var target = w.parentElement.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      w.style.fontSize = (100 * target / span.offsetWidth) + 'px';
    });
  }

  // ---- Pages ------------------------------------------------------------------
  function routeKey() {
    var h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
    if (Object.prototype.hasOwnProperty.call(ALIAS, h)) h = ALIAS[h];
    return ORDER.indexOf(h) >= 0 ? h : '';
  }
  // key null: stepped back, so no page answers the pointer.
  function setActive(key) {
    Object.keys(pages).forEach(function (k) {
      var on = k === key;
      pages[k].classList.toggle('is-active', on);
      pages[k].style.zIndex = on ? 3 : 1;
      if (on) pages[k].removeAttribute('inert'); else pages[k].setAttribute('inert', '');
    });
    if (key !== null) document.title = TITLES[key];
  }

  // ---- Moving -----------------------------------------------------------------
  var moving = null, holding = false;

  function finishNow() {
    if (!moving) return;
    var m = moving;
    m.anims.forEach(function (a) { try { a.finish(); } catch (e) {} });
    m.done();
  }

  // Run a camera move plus any other animations; end() commits the final state.
  function run(frames, total, others, end) {
    world.classList.add('is-moving');
    veil.classList.add('is-on');
    var anims = [world.animate(frames, { duration: total, fill: 'forwards' })].concat(others);
    var finished = false;
    function done() {
      if (finished) return;
      finished = true;
      end();
      anims.forEach(function (a) { a.cancel(); });
      world.classList.remove('is-moving');
      if (!holding) veil.classList.remove('is-on'); // a click that skipped the move mustn't land on what's under it
      moving = null;
    }
    moving = { anims: anims, done: done };
    anims[0].onfinish = done;
  }

  function clipAnim(el, from, to, opts) {
    return el.animate([{ clipPath: from }, { clipPath: to }], Object.assign({ easing: EASE, fill: 'forwards' }, opts));
  }
  var FULL = 'inset(0px 0px 0px 0px)';

  // Close up, only the page you're in shows; the other pages show only when you've stepped back.
  // Side by side they're one green, so a page opening up would otherwise run into its neighbors
  // as you step in or out (Noah, Nov 13: "some of the pages blend together as we zoom into them").
  function showPages(key) { // null: stepped back, every page shows
    Object.keys(pages).forEach(function (k) { pages[k].style.opacity = key === null || k === key ? '' : '0'; });
  }
  // Opacity over a move, as [offset, opacity] pairs.
  function fadeAnim(el, points, total) {
    return el.animate(points.map(function (p) { return { opacity: p[1], offset: p[0], easing: 'ease-in-out' }; }),
      { duration: total, fill: 'forwards' });
  }
  function others(keys) { return Object.keys(pages).filter(function (k) { return keys.indexOf(k) < 0; }); }

  // B: instead of fading, the other pages slide aside on the camera's curve as the page you're in
  // opens up, and slide back as you step out (Noah, Nov 13). Each moves away from that page by
  // enough to keep the gap the whole way and to clear the window by the end.
  function away(k, from) {
    var dc = HANG[k].col - HANG[from].col, dr = HANG[k].row - HANG[from].row;
    var dx = Math.sign(dc) * ((vw - cw) / 2 + gap + cw * 0.15);
    var dy = Math.sign(dr) * gap * 2;
    return 'translate(' + dx + 'px,' + dy + 'px)';
  }
  // Position over a move, as [offset, transform] pairs, shown the whole way.
  function slideAnim(el, points, total) {
    return el.animate(points.map(function (p) { return { transform: p[1], opacity: 1, offset: p[0], easing: EASE }; }),
      { duration: total, fill: 'forwards' });
  }
  var SLIDE = CFG.leave === 'slide';

  // Kyle's ethos arrives a line at a time as you land on the lander (A).
  function ethosIn(delay) {
    if (!CFG.ethosArrives || reduce.matches) return;
    pages[''].querySelectorAll('.ethos span').forEach(function (s, i) {
      s.animate([{ opacity: 0, transform: 'translateY(0.4em)' }, { opacity: 1, transform: 'none' }],
        { duration: 700, delay: delay + i * 90, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'backwards' });
    });
  }

  function pickGround() {
    if (!CFG.ground || !groundImg) return;
    groundIndex = (groundIndex + 7) % ART.length; // seven apart, so all 24 come round before one repeats
    groundImg.src = art(groundIndex);
  }
  var groundIndex = Math.floor(Math.random() * ART.length);

  function setRing(open) {
    document.body.classList.toggle('is-library', open);
    ring.setAttribute('aria-expanded', open ? 'true' : 'false');
    ring.setAttribute('aria-label', open ? 'Back to the page' : 'All pages');
  }

  // Step back into the library.
  function openLibrary() {
    finishNow();
    if (mode === 'library') return;
    mode = 'library';
    var P = pages[current], c0 = centerOf(current);
    setActive(null);
    P.style.zIndex = 2;
    setRing(true);
    pickGround();
    function end() {
      world.style.transform = cam(LIB.c, LIB.z);
      P.style.clipPath = cut();
      P.style.zIndex = 1;
      showPages(null);
      showIndex();
    }
    if (reduce.matches) { end(); return; }
    // The other pages come in once this one has mostly closed down to its card (A),
    // or slide back in beside it as it closes (B).
    run([{ transform: cam(c0, 1), easing: EASE }, { transform: cam(LIB.c, LIB.z) }], CFG.open,
      [clipAnim(P, FULL, cut(), { duration: CFG.open })].concat(others([current]).map(function (k) {
        return SLIDE ? slideAnim(pages[k], [[0, away(k, current)], [1, 'none']], CFG.open)
          : fadeAnim(pages[k], [[0, 0], [0.35, 0], [1, 1]], CFG.open);
      })), end);
  }

  // Step from the library into a page: the one you came from, or the one you picked.
  function closeLibrary(to) {
    finishNow();
    if (mode !== 'library') return;
    var prev = current;
    mode = 'page';
    current = to;
    hideIndex();
    setRing(false);
    var B = pages[to], c1 = centerOf(to), focusTarget = B.querySelector('[data-focus]');
    if (to !== prev) B.scrollTop = 0;
    setActive(to);
    function end() {
      world.style.transform = cam(c1, 1);
      B.style.clipPath = 'none';
      showPages(to);
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }
    if (reduce.matches) { end(); B.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' }); return; }
    if (to === '') ethosIn(CFG.close * 0.55);
    // The other pages leave before this one opens up past its card (A), or slide aside as it opens (B).
    run([{ transform: cam(LIB.c, LIB.z), easing: EASE }, { transform: cam(c1, 1) }], CFG.close,
      [clipAnim(B, cut(), FULL, { duration: CFG.close })].concat(others([to]).map(function (k) {
        return SLIDE ? slideAnim(pages[k], [[0, 'none'], [1, away(k, to)]], CFG.close)
          : fadeAnim(pages[k], [[0, 1], [0.5, 0], [1, 0]], CFG.close);
      })), end);
  }

  // Page to page, from a link inside a page (the footer, a back arrow) or the browser's back button.
  function go(to) {
    if (mode === 'library') { closeLibrary(to); return; }
    finishNow();
    if (to === current) {
      pages[to].scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
      return;
    }
    var from = current, A = pages[from], B = pages[to];
    current = to;
    B.scrollTop = 0;
    setActive(to);
    A.style.zIndex = 2;
    var ca = centerOf(from), cb = centerOf(to), z = LIB.z;
    var focusTarget = B.querySelector('[data-focus]');
    function end() {
      world.style.transform = cam(cb, 1);
      A.style.clipPath = cut();
      B.style.clipPath = 'none';
      A.style.zIndex = 1;
      showPages(to);
      if (focusTarget) focusTarget.focus({ preventScroll: true });
    }
    if (reduce.matches) { end(); B.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease' }); return; }

    var frames, pan, total;
    if (CFG.pan) {
      // A: step back, walk along the wall, step in.
      var d = Math.hypot(HANG[to].col - HANG[from].col, HANG[to].row - HANG[from].row);
      pan = Math.max(PAN_MIN, Math.min(PAN_MAX, PAN_BASE + PAN_PER_COL * d));
      total = CFG.out + pan + CFG.in;
      frames = [
        { transform: cam(ca, 1), offset: 0, easing: EASE },
        { transform: cam(ca, z), offset: CFG.out / total, easing: EASE },
        { transform: cam(cb, z), offset: (CFG.out + pan) / total, easing: EASE },
        { transform: cam(cb, 1), offset: 1 }
      ];
    } else {
      // B: step back into the library and in again, without lingering.
      pan = 0;
      total = CFG.out + CFG.in;
      frames = [
        { transform: cam(ca, 1), offset: 0, easing: EASE },
        { transform: cam(LIB.c, z), offset: CFG.out / total, easing: EASE },
        { transform: cam(cb, 1), offset: 1 }
      ];
      pickGround();
    }
    if (to === '') ethosIn(total - CFG.in * 0.45);
    // Stepped back, the other pages show; close up, only the one you're in.
    var o = CFG.out / total, i = (CFG.out + pan) / total, gone = (CFG.out + pan + CFG.in * 0.5) / total;
    var leave = SLIDE ? [
      slideAnim(A, [[0, 'none'], [i, 'none'], [1, away(from, to)]], total),
      slideAnim(B, [[0, away(to, from)], [o, 'none'], [1, 'none']], total)
    ].concat(others([from, to]).map(function (k) {
      return slideAnim(pages[k], [[0, away(k, from)], [o, 'none'], [i, 'none'], [1, away(k, to)]], total);
    })) : [
      fadeAnim(A, [[0, 1], [i, 1], [gone, 0], [1, 0]], total),
      fadeAnim(B, [[0, 0], [o * 0.35, 0], [o, 1], [1, 1]], total)
    ].concat(others([from, to]).map(function (k) {
      return fadeAnim(pages[k], [[0, 0], [o * 0.35, 0], [o, 1], [i, 1], [gone, 0], [1, 0]], total);
    }));
    run(frames, total, [
      clipAnim(A, FULL, cut(), { duration: CFG.out }),
      clipAnim(B, cut(), FULL, { delay: CFG.out + pan, duration: CFG.in, fill: 'both' })
    ].concat(leave), end);
  }

  // ---- The library's cards ----------------------------------------------------
  function showIndex() {
    placeHits();
    index.hidden = false;
    void index.offsetWidth;
    index.classList.add('is-open');
    hits[current].focus({ preventScroll: true });
  }
  function hideIndex() {
    index.classList.remove('is-open');
    index.hidden = true;
    lift(null);
  }
  // A: the card you point at lifts and the rest of the wall dims.
  function lift(k) {
    if (!CFG.lift) return;
    stage.classList.toggle('is-dim', k !== null);
    ORDER.forEach(function (key) { pages[key].classList.toggle('is-lifted', key === k); });
  }
  ORDER.forEach(function (k) {
    var a = hits[k];
    a.addEventListener('pointerenter', function () { lift(k); });
    a.addEventListener('pointerleave', function () { lift(null); });
    a.addEventListener('focus', function () { if (a.matches(':focus-visible')) lift(k); });
    a.addEventListener('blur', function () { lift(null); });
    a.addEventListener('click', function (e) {
      e.preventDefault();
      if (mode !== 'library') return;
      var was = routeKey();
      closeLibrary(k);
      // 30 days copy: in the page's frame, moves replace the address, so the parent's back button isn't filled with them
      if (k !== was) history.replaceState(null, '', '#/' + k);
    });
  });

  // ---- Wiring -----------------------------------------------------------------
  ring.addEventListener('click', function () {
    if (moving) { finishNow(); return; }
    if (mode === 'page') openLibrary(); else closeLibrary(current);
  });
  window.addEventListener('hashchange', function () { go(routeKey()); });
  document.addEventListener('click', function (e) {
    var a = e.target.closest('.page a[href^="#/"]');
    if (!a) return;
    var h = a.getAttribute('href').replace(/^#\/?/, '');
    if (Object.prototype.hasOwnProperty.call(ALIAS, h)) h = ALIAS[h];
    if (h === current) { e.preventDefault(); go(current); return; } // a link to this page goes back to its top
    // 30 days copy: any other page is reached by replacing the address too, not by adding to the history
    e.preventDefault(); history.replaceState(null, '', a.getAttribute('href')); go(routeKey());
  });
  veil.addEventListener('pointerdown', function () { holding = true; finishNow(); });
  ['click', 'pointercancel'].forEach(function (t) {
    veil.addEventListener(t, function () { holding = false; if (!moving) veil.classList.remove('is-on'); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (moving) finishNow();
    else if (mode === 'library') closeLibrary(current);
  });

  document.querySelectorAll('[data-scroll="next"]').forEach(function (b) {
    b.addEventListener('click', function () {
      var screen = b.closest('.screen'), page = b.closest('.page');
      var next = screen.nextElementSibling;
      if (next) page.scrollTo({ top: next.offsetTop, behavior: reduce.matches ? 'auto' : 'smooth' });
    });
  });

  // Forms: checked here, sent nowhere. The form dissolves into the confirmation.
  document.querySelectorAll('[data-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var first = null;
      form.querySelectorAll('[data-required]').forEach(function (f) {
        var input = f.querySelector('input, textarea'), v = input.value.trim(), kind = f.getAttribute('data-required');
        var ok = kind === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) : v.length > 0;
        f.classList.toggle('is-invalid', !ok);
        if (!ok && !first) first = input;
      });
      if (first) { first.focus(); return; }
      form.closest('[data-swap]').classList.add('is-sent');
    });
    form.addEventListener('input', function (e) {
      var f = e.target.closest('.field'); if (f) f.classList.remove('is-invalid');
      if (e.target.hasAttribute('data-grow')) { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }
    });
  });

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      finishNow();
      layout();
      world.style.transform = mode === 'library' ? cam(LIB.c, LIB.z) : cam(centerOf(current), 1);
    }, 120);
  });

  // ---- Start ------------------------------------------------------------------
  setActive(current);
  layout();
  world.style.transform = cam(centerOf(current), 1);
  if (current === '') ethosIn(250);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitWordmarks);

  // For review: wall.library(), wall.go('join'), wall.slow(4) to watch a move at a quarter speed.
  window.wall = {
    go: function (k) { location.replace('#/' + k); },
    library: openLibrary,
    slow: function (f) { ['open', 'close', 'out', 'in'].forEach(function (n) { CFG[n] *= f; }); PAN_BASE *= f; PAN_PER_COL *= f; PAN_MIN *= f; PAN_MAX *= f; }
  };
})();
