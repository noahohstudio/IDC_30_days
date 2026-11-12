// 30 days: the page's behavior, ported from noaoh.com's components (Flip, Loop, TurnDot, IndexRail, EasterEggs, Footer).
const root = document.documentElement;
root.dataset.ready = "";
const calm = matchMedia("(prefers-reduced-motion: reduce)");
const GLASS = { blue: "#5b77e8", red: "#e8604f", yellow: "#f2c94c" };
const run = (name, fn) => {
  try {
    fn();
  } catch (error) {
    console.error(name, error);
  }
};

/* ---------- Mirrored letters (Flip.tsx, lib/mirror.ts) ---------- */

const queue = new Set();
const cache = new Map();
let pending = false;
let ctx = null;

function measure(glyph) {
  queue.add(glyph);
  if (pending) return;
  pending = true;
  (document.fonts?.ready ?? Promise.resolve()).then(() => requestAnimationFrame(settle));
}

// Each letter mirrors through the middle of its own ink, so it turns over in place
function settle() {
  pending = false;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return;
  const found = [];
  for (const el of queue) {
    if (!el.isConnected) continue;
    const style = getComputedStyle(el);
    const char = el.textContent;
    const size = parseFloat(style.fontSize);
    const line = style.lineHeight === "normal" ? null : parseFloat(style.lineHeight) / size;
    const font = `${style.fontStyle} ${style.fontWeight} 1000px ${style.fontFamily}`;
    const key = `${font}|${line}|${char}`;
    let ink = cache.get(key);
    if (!ink) {
      ctx.font = font;
      const m = ctx.measureText(char);
      const ascent = m.fontBoundingBoxAscent / 1000;
      const descent = m.fontBoundingBoxDescent / 1000;
      const baseline = ((line ?? ascent + descent) - ascent - descent) / 2 + ascent;
      const above = m.actualBoundingBoxAscent / 1000;
      const below = m.actualBoundingBoxDescent / 1000;
      ink = { axis: baseline - (above - below) / 2, top: baseline - above - 0.03, height: above + below + 0.06 };
      cache.set(key, ink);
    }
    found.push([el, ink]);
  }
  queue.clear();
  for (const [el, ink] of found) {
    el.style.setProperty("--axis", `${ink.axis.toFixed(4)}em`);
    el.style.setProperty("--ink-top", `${ink.top.toFixed(4)}em`);
    el.style.setProperty("--ink-height", `${ink.height.toFixed(4)}em`);
  }
}

function letters(text) {
  const frag = document.createDocumentFragment();
  for (const chunk of text.split(/(\s+)/)) {
    if (!chunk) continue;
    if (/^\s+$/.test(chunk)) {
      frag.append(chunk);
      continue;
    }
    const word = document.createElement("span");
    word.className = "word";
    for (const ch of Array.from(chunk)) {
      const c = document.createElement("span");
      c.className = "char";
      const g = document.createElement("span");
      g.className = "glyph";
      g.dataset.glyph = "";
      g.textContent = ch;
      c.append(g);
      word.append(c);
      measure(g);
    }
    frag.append(word);
  }
  return frag;
}

// Screen readers get the plain words; the letters are drawn beside them
function setFlip(el, text) {
  if (el.closest('[aria-hidden="true"]')) return el.replaceChildren(letters(text));
  const plain = document.createElement("span");
  plain.className = "visually-hidden";
  plain.textContent = text;
  const shown = document.createElement("span");
  shown.setAttribute("aria-hidden", "true");
  shown.append(letters(text));
  el.replaceChildren(plain, shown);
}

// A letter that changes turns over for a beat
function turn(el) {
  el.removeAttribute("data-turn");
  void el.offsetWidth;
  el.setAttribute("data-turn", "");
}

run("flip", () => document.querySelectorAll("[data-flip]").forEach((el) => setFlip(el, el.textContent.trim())));

/* ---------- Fitting big type edge to edge (Count.tsx) ---------- */

function fit(el, room) {
  let width = 0;
  const go = () => {
    const w = room.clientWidth;
    if (!w || w === width) return;
    width = w;
    el.style.fontSize = "";
    const style = getComputedStyle(el);
    const size = parseFloat(style.fontSize);
    const used = el.getBoundingClientRect().width - (parseFloat(style.letterSpacing) || 0);
    el.style.fontSize = `${(size * w) / used}px`;
  };
  go();
  document.fonts?.ready.then(() => {
    width = 0;
    go();
  });
  new ResizeObserver(go).observe(room);
}

run("fit", () => {
  const name = document.querySelector("[data-fit]");
  if (name) fit(name, name.parentElement);
  const number = document.querySelector("[data-count-number]");
  if (number) {
    // The day of 30: two places, any it hasn't reached barely there
    const digits = "21";
    setFlip(number.querySelector(".zeros"), "0".repeat(2 - digits.length));
    setFlip(number.querySelector("[data-count-digits]"), digits);
    fit(number, number.parentElement);
  }
});

/* ---------- Entrances (Reveal.tsx) ---------- */

run("reveal", () => {
  const observer = new IntersectionObserver(
    (entries) => {
      let i = 0;
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.style.setProperty("--reveal-i", i++);
        entry.target.dataset.shown = "";
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: "0px 0px -8% 0px" },
  );
  document.querySelectorAll("[data-reveal]").forEach((el) => observer.observe(el));
});

/* ---------- Highlights take the glass's colors, the next each time (SelectionColor.tsx) ---------- */

run("selection", () => {
  const colors = ["blue", "red", "yellow"];
  let i = 0;
  let had = false;
  root.dataset.hl = colors[0];
  document.addEventListener("selectionchange", () => {
    const s = document.getSelection();
    const has = Boolean(s && !s.isCollapsed && s.toString().trim());
    if (had && !has) root.dataset.hl = colors[(i = (i + 1) % colors.length)];
    had = has;
  });
});

/* ---------- Where you are: the index and the nav (IndexRail.tsx, Nav.tsx) ---------- */

/* ---------- Week two's side scroll: the page's scroll carries the track sideways, a pixel across for each pixel down ---------- */

const side = { on: false, section: null, max: 0, top: 0 };

run("side scroll", () => {
  const hs = document.querySelector("[data-hs]");
  if (!hs) return;
  const pin = hs.querySelector(".hs-pin");
  const track = hs.querySelector(".hs-track");
  const wide = matchMedia("(min-width: 900px)");
  side.section = hs;
  const held = [...hs.querySelectorAll("[data-hold]")];
  const flyPanel = hs.querySelector("[data-fly-panel]");
  const cards = flyPanel ? [...flyPanel.querySelectorAll(".fly-card")] : [];

  // A held title rides in with its panel until it reaches the middle of the screen, stays there while the panel passes
  // under it, and leaves with the panel's end
  const hold = () => {
    const mid = pin.clientWidth / 2;
    for (const el of held) {
      const box = el.closest(".panel").getBoundingClientRect();
      const w = el.offsetWidth;
      const off = Math.min(Math.max(0, mid - w / 2 - box.left), Math.max(0, box.width - w));
      el.style.transform = `translate3d(${off}px, 0, 0)`;
    }
  };

  // Day 14's slides in two lanes, both quicker than the page, so they fly past the held title and over it: the top lane
  // hangs from near the top, the bottom one stands near the bottom, and the bigger slides reach into the title and its
  // words. `u` is how far the panel has come in from the right edge. Each lane's first slide waits just off the right
  // edge as the panel pins, the bottom lane a little later (`after`, a share of the screen). Sizes and drops are shares of
  // the screen's height, one per slide in the lane, so no two neighbours match.
  const LANES = [
    { edge: "top", at: 0.05, speed: 1.6, gap: 0.22, after: 0.05, sizes: [0.36, 0.22, 0.42, 0.27, 0.33, 0.2, 0.4, 0.26], drops: [0, 0.05, 0.01, 0.08, 0.03, 0.1, 0, 0.05] },
    { edge: "bottom", at: 0.05, speed: 1.25, gap: 0.22, after: 0.3, sizes: [0.22, 0.36, 0.26, 0.4, 0.19, 0.32, 0.24, 0.38], drops: [0.06, 0, 0.09, 0.02, 0.04, 0.01, 0.07, 0] },
  ];
  const layFly = () => {
    if (!flyPanel) return;
    if (!side.on) {
      flyPanel.style.width = flyPanel.style.height = "";
      cards.forEach((c) => c.removeAttribute("style"));
      return;
    }
    const vw = pin.clientWidth;
    const H = pin.clientHeight - (parseFloat(getComputedStyle(pin).paddingTop) || 0);
    const pad = parseFloat(getComputedStyle(track).paddingRight) || 0;
    let reach = 0;
    const next = LANES.map((lane) => lane.speed * (vw - pad) + lane.after * vw); // where each lane's next slide starts
    cards.forEach((card, i) => {
      const l = i % 2;
      const lane = LANES[l];
      const k = Math.floor(i / 2) % lane.sizes.length;
      const h = lane.sizes[k] * H;
      const w = (h * 16) / 9;
      const x = next[l];
      next[l] += w * (1 + lane.gap);
      const y = lane.edge === "top" ? (lane.at + lane.drops[k]) * H : H - (lane.at + lane.drops[k]) * H - h;
      card.dataset.speed = lane.speed;
      card.style.width = `${w}px`;
      card.style.left = `${x}px`;
      card.style.top = `${y}px`;
      card.style.zIndex = Math.round(lane.sizes[k] * 100); // the bigger the slide, the nearer
      reach = Math.max(reach, (x + vw + w) / lane.speed); // when the last of the lane has left on the left
    });
    flyPanel.style.height = `${H}px`;
    flyPanel.style.width = `${Math.round(reach - pad)}px`;
  };
  const fly = () => {
    if (!flyPanel) return;
    const u = pin.clientWidth - flyPanel.getBoundingClientRect().left;
    for (const card of cards) card.style.transform = `translate3d(${-(card.dataset.speed - 1) * u}px, 0, 0)`;
  };

  const update = () => {
    if (!side.on) return;
    const x = Math.min(side.max, Math.max(0, -hs.getBoundingClientRect().top));
    track.style.transform = `translate3d(${-x}px, 0, 0)`;
    hold();
    fly();
  };
  const layout = () => {
    side.on = wide.matches && !calm.matches;
    hs.toggleAttribute("data-on", side.on);
    layFly();
    if (!side.on) {
      hs.style.height = "";
      track.style.transform = "";
      held.forEach((el) => (el.style.transform = ""));
      return;
    }
    // The track's own width; scrollWidth would count the flying cards that reach past it
    side.max = Math.max(0, track.offsetWidth - pin.clientWidth);
    hs.style.height = `${side.max + innerHeight}px`;
    side.top = hs.getBoundingClientRect().top + scrollY;
    update();
  };
  layout();
  addEventListener("scroll", update, { passive: true });
  addEventListener("resize", layout);
  wide.addEventListener("change", layout);
  calm.addEventListener("change", layout);
  new ResizeObserver(layout).observe(track);
});

// Where a day is: in the side scroll, the point down the page that brings its panel in from the left
function goTo(id) {
  const el = document.getElementById(id);
  if (!el) return false;
  if (side.on && side.section.contains(el) && el !== side.section) {
    const track = side.section.querySelector(".hs-track");
    const pad = parseFloat(getComputedStyle(track).paddingLeft) || 0;
    const top = side.section.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + Math.min(side.max, Math.max(0, el.offsetLeft - pad)), behavior: calm.matches ? "auto" : "smooth" });
    return true;
  }
  el.scrollIntoView({ behavior: calm.matches ? "auto" : "smooth", block: "start" });
  return true;
}

run("anchors", () => {
  document.addEventListener("click", (event) => {
    const a = event.target.closest('a[href^="#"]');
    if (!a || a.closest("[data-copy]")) return;
    const id = a.getAttribute("href").slice(1);
    if (!id || id === "main") return;
    if (id === "top") {
      event.preventDefault();
      scrollTo({ top: 0, behavior: calm.matches ? "auto" : "smooth" });
      return;
    }
    if (goTo(id)) event.preventDefault();
  });
});

run("index", () => {
  const days = [...document.querySelectorAll("[data-day]")];
  const links = new Map([...document.querySelectorAll('.side a[href^="#d"]')].map((a) => [a.getAttribute("href").slice(1), a.parentElement]));
  const weeks = [...document.querySelectorAll(".side [data-week]")];
  const starts = weeks.map((li) => document.getElementById(li.dataset.week)).filter(Boolean);
  const at = document.querySelector("[data-nav-at]");
  let current = null;
  let open = null;
  let frame = 0;
  const pick = () => {
    frame = 0;
    const line = innerHeight * 0.4;
    const mid = innerWidth * 0.5;
    // The week you're in opens in the index once its heading passes the reading line; the others close
    let week = null;
    for (const start of starts) if (start.getBoundingClientRect().top <= line) week = start.id;
    if (week !== open) {
      open = week;
      weeks.forEach((li) => li.toggleAttribute("data-path", li.dataset.week === week));
    }
    let here = null;
    for (const day of days) {
      const box = day.getBoundingClientRect();
      if (box.top <= line && box.left <= mid) here = day;
    }
    const id = here?.id ?? null;
    if (id === current) return;
    current = id;
    links.forEach((li, key) => li.toggleAttribute("data-at", key === id));
    if (at) {
      at.textContent = here ? here.dataset.day : "30 days";
      turn(at.parentElement);
    }
  };
  pick();
  addEventListener("scroll", () => (frame ||= requestAnimationFrame(pick)), { passive: true });
  addEventListener("resize", pick);
});

/* ---------- Slides that take turns, the dot sliding under the step that's showing ---------- */

run("sequences", () => {
  document.querySelectorAll("[data-seq]").forEach((seq) => {
    const frames = [...seq.querySelectorAll(".seq-frames img")];
    const steps = [...seq.querySelectorAll(".seq-steps li:not(.seq-dot)")];
    const dot = seq.querySelector(".seq-dot");
    const list = seq.querySelector(".seq-steps");
    const every = Number(seq.dataset.every) || 2000;
    list.style.setProperty("--n", steps.length);
    let i = 0;
    let timer = 0;
    let seen = false;
    const box = seq.querySelector(".seq-frames");
    const show = (n) => {
      i = (n + frames.length) % frames.length;
      seq.dataset.ready = "";
      // A frame marked data-cut comes in at once, with no fade (Day 8's colored wordmarks)
      const cut = frames[i].hasAttribute("data-cut");
      box.toggleAttribute("data-cut", cut);
      frames.forEach((f, k) => f.toggleAttribute("data-on", k === i));
      if (cut) {
        void getComputedStyle(frames[i]).opacity;
        requestAnimationFrame(() => box.removeAttribute("data-cut"));
      }
      const label = Number(frames[i].dataset.label ?? i);
      steps.forEach((s, k) => s.toggleAttribute("data-at", k === label));
      dot?.style.setProperty("--i", label);
    };
    const tick = () => {
      clearTimeout(timer);
      if (!seen || calm.matches) return;
      const hold = Number(frames[i].dataset.hold) || 1;
      timer = setTimeout(() => {
        show(i + 1);
        tick();
      }, every * hold);
    };
    steps.forEach((s, k) =>
      s.addEventListener("click", () => {
        show(frames.findIndex((f) => Number(f.dataset.label ?? -1) === k));
        tick();
      }),
    );
    box.addEventListener("click", () => {
      show(i + 1);
      tick();
    });
    show(0);
    new IntersectionObserver(([entry]) => {
      seen = entry.isIntersecting;
      tick();
    }, { threshold: 0.3 }).observe(seq);
  });
});

/* ---------- Days 15 to 17: photographs the scroll presents ----------
   Each is a tall section with a stage pinned to the screen. `p` runs 0 to 1 as the page scrolls through it. */

run("scrolly", () => {
  const boxes = [...document.querySelectorAll("[data-scrolly]")];
  if (!boxes.length) return;
  const clamp01 = (t) => Math.min(1, Math.max(0, t));
  const smooth = (t) => t * t * (3 - 2 * t);
  const easeInOut = (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
  const STEP = 30; // degrees between the wheel's photos

  // The wheel follows the scroll with a little weight, so it eases into each stop rather than snapping to the page.
  // Each frame it closes part of the gap to where the scroll says it should be, and stops once it's there.
  const turn = (box) => {
    const spokes = [...box.querySelectorAll(".spoke")];
    const draw = () =>
      spokes.forEach((spoke, i) => {
        const d = Math.min(1, Math.abs(i - box.spun));
        spoke.style.transform = `rotate(${(i - box.spun) * STEP}deg)`;
        const img = spoke.firstElementChild;
        img.style.scale = String(1 - 0.12 * d); // the one on top is the nearest
        img.style.opacity = String(1 - 0.3 * d);
      });
    if (box.spun === undefined || calm.matches) {
      box.spun = box.goal;
      return draw();
    }
    if (box.turning) return;
    box.turning = true;
    let then = performance.now();
    const step = (now) => {
      box.spun += (box.goal - box.spun) * (1 - Math.exp(-(now - then) / 160));
      then = now;
      if (Math.abs(box.goal - box.spun) < 0.0008) box.spun = box.goal;
      draw();
      if (box.spun !== box.goal) requestAnimationFrame(step);
      else box.turning = false;
    };
    requestAnimationFrame(step);
  };

  const kinds = {
    // Day 15: the first print is down already; each next one drops in from below, tilting more while it flies and
    // settling at its own slight angle, and every print it lands on sinks back a little
    pile(box, p) {
      const prints = [...box.querySelectorAll(".print")];
      const span = 0.84 / (prints.length - 1);
      const landed = prints.map((_, i) => (i === 0 ? 1 : smooth(clamp01((p - 0.06 - (i - 1) * span) / (span * 0.85)))));
      prints.forEach((img, i) => {
        const t = landed[i];
        const r = parseFloat(img.style.getPropertyValue("--r")) || 0;
        const fall = (1 - t) * (innerHeight / 2 + img.offsetHeight / 2 + 60);
        const sink = 1 - 0.035 * landed.slice(i + 1).reduce((a, b) => a + b, 0);
        img.style.transform = `translate(calc(${t} * var(--x)), ${fall}px) rotate(${r * (4 - 3 * t)}deg) scale(${sink})`;
      });
    },
    // Day 16: the presenters rise as the room falls, side by side at the halfway point
    diptych(box, p) {
      const D = innerHeight * 0.32;
      for (const img of box.querySelectorAll(".dip")) img.style.transform = `translateY(${Number(img.dataset.dir) * (p - 0.5) * 2 * D}px)`;
    },
    // Day 17: the wheel turns from one photo to the next, resting on each for a moment as a prize wheel would
    wheel(box, p) {
      const n = box.querySelectorAll(".spoke").length;
      const q = p * (n - 1);
      const k = Math.min(n - 2, Math.floor(q));
      box.goal = k + easeInOut(clamp01((q - k - 0.12) / 0.76));
      turn(box);
    },
  };

  let frame = 0;
  const update = () => {
    frame = 0;
    for (const box of boxes) {
      if (!box.hasAttribute("data-on")) continue;
      const r = box.getBoundingClientRect();
      if (r.bottom < -innerHeight || r.top > innerHeight * 2) continue;
      kinds[box.dataset.scrolly](box, clamp01(-r.top / Math.max(1, r.height - innerHeight)));
    }
  };
  const layout = () => {
    for (const box of boxes) {
      box.toggleAttribute("data-on", !calm.matches);
      if (calm.matches) for (const el of box.querySelectorAll("img, .spoke")) for (const prop of ["transform", "scale", "opacity"]) el.style.removeProperty(prop);
    }
    update();
  };
  layout();
  addEventListener("scroll", () => (frame ||= requestAnimationFrame(update)), { passive: true });
  addEventListener("resize", update);
  calm.addEventListener("change", layout);
});

/* ---------- Day 19: the features, each film in turn, the dot under the one playing ---------- */

run("features", () => {
  document.querySelectorAll("[data-features]").forEach((box) => {
    const videos = [...box.querySelectorAll("video")];
    const steps = [...box.querySelectorAll(".seq-steps li:not(.seq-dot)")];
    const dot = box.querySelector(".seq-dot");
    box.querySelector(".seq-steps").style.setProperty("--n", steps.length);
    videos.forEach(sources);
    let i = 0;
    let seen = false;
    let chosen = false; // played by a click, so it plays even with reduced motion
    const allowed = () => seen && (!calm.matches || chosen);
    const show = (n, play) => {
      i = (n + videos.length) % videos.length;
      videos.forEach((v, k) => {
        v.toggleAttribute("data-on", k === i);
        if (k !== i) v.pause();
      });
      steps.forEach((s, k) => s.toggleAttribute("data-at", k === i));
      dot?.style.setProperty("--i", i);
      videos[i].currentTime = 0;
      if (play && allowed()) videos[i].play().catch(() => {});
    };
    // When one film ends, the next starts, and after the last, the first again
    videos.forEach((v) => v.addEventListener("ended", () => show(i + 1, true)));
    steps.forEach((s, k) =>
      s.addEventListener("click", () => {
        chosen = true;
        show(k, true);
      }),
    );
    box.querySelector(".feat-frames").addEventListener("click", () => {
      chosen = true;
      const v = videos[i];
      if (v.paused) v.play().catch(() => {});
      else v.pause();
    });
    show(0, false);
    new IntersectionObserver(
      ([entry]) => {
        seen = entry.isIntersecting && entry.intersectionRatio >= 0.5;
        if (allowed()) videos[i].play().catch(() => {});
        else videos[i].pause();
      },
      { threshold: [0, 0.5] },
    ).observe(box);
  });
});

/* ---------- Before and after: drag, or just move across it ---------- */

run("compare", () => {
  document.querySelectorAll("[data-compare]").forEach((box) => {
    const input = box.querySelector("input");
    const set = (v) => box.style.setProperty("--at", `${v}%`);
    input.addEventListener("input", () => set(input.value));
    if (matchMedia("(hover: hover)").matches) {
      box.addEventListener("pointermove", (event) => {
        if (event.buttons) return;
        const r = box.getBoundingClientRect();
        const v = Math.min(100, Math.max(0, ((event.clientX - r.left) / r.width) * 100));
        input.value = v;
        set(v);
      });
    }
  });
});


/* ---------- The Interactive mark (InteractiveMark.tsx) ---------- */

run("marks", () => {
  document.querySelectorAll("[data-mark]").forEach((mark) => {
    mark.innerHTML = `<button type="button" class="mark-icon" aria-label="Interactive: ${mark.dataset.mark}"><svg width="20" height="20" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M5.5 4.5 13 7.4 9.6 8.6 8.4 12z" fill="currentColor"/><path d="M3.4 1.6v1.8M1.6 3.4h1.8M1.9 1.9l1.1 1.1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg></button><span class="mark-card" aria-hidden="true">Interactive</span>`;
  });
});

/* ---------- Day 1: the zine and the glyph viewer, built as they near the screen ---------- */

function whenNear(el, build) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      build().catch((error) => console.error(error));
    },
    { rootMargin: "100% 0px" },
  );
  observer.observe(el);
}

run("zine", () => {
  const el = document.querySelector("[data-zine]");
  if (!el) return;
  const spreads = ["p01-02", "p03-04", "p05-06", "p07-08", "p09-10", "p11-12", "p13-14"].map((s) => `assets/boomloom/zine/${s}.png`);
  whenNear(el, async () => {
    const { createZineBook } = await import("./assets/boomloom/zine-book.js");
    await createZineBook(el, { spreads, bleed: { x: 0.03, y: 0.14 } });
  });
});

run("glyphs", () => {
  const el = document.querySelector("[data-glyphs]");
  if (!el) return;
  whenNear(el, async () => {
    const { createGlyphViewer } = await import("./assets/boomloom/glyph-viewer.js");
    await createGlyphViewer(el, {
      font: "assets/boomloom/BoomLoomDisplay-Regular.otf",
      construction: "assets/boomloom/BoomLoomDisplay-construction.otf",
    });
  });
});

/* ---------- Loops (Loop.tsx): play once half in view, from the start each time; a glass pause and replay ---------- */

const APPLE = navigator.vendor?.startsWith("Apple");
const ICONS = {
  pause: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 1.5h2v7H2zM6 1.5h2v7H6z"/></svg>',
  play: '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.5 1.4v7.2a.4.4 0 0 0 .6.35l6-3.6a.4.4 0 0 0 0-.7l-6-3.6a.4.4 0 0 0-.6.35z"/></svg>',
  replay: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>',
};

// A transparent loop is chosen by engine: Safari gets HEVC with alpha, the rest VP9 with alpha, then a plain MP4
function sources(video) {
  const { mov, webm, mp4 } = video.dataset;
  const list = mov ? [APPLE ? [mov, 'video/mp4; codecs="hvc1"'] : [webm, "video/webm"]] : [];
  if (mp4) list.push([mp4, "video/mp4"]);
  for (const [src, type] of list) {
    const s = document.createElement("source");
    s.src = src;
    s.type = type;
    video.append(s);
  }
  video.muted = true;
}

// One set of controls for a group of loops that play as one
function loops(group, videos, host) {
  videos.forEach(sources);
  let held = false;
  let chosen = false;
  let seen = false;
  let fresh = true;
  const allowed = () => !held && (!calm.matches || chosen);
  const play = () => videos.forEach((v) => v.play().catch(() => {}));
  const pause = () => videos.forEach((v) => v.pause());

  const replay = document.createElement("button");
  replay.type = "button";
  replay.className = "control replay";
  replay.setAttribute("aria-label", "Replay");
  replay.innerHTML = ICONS.replay;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "control";
  const show = () => {
    const playing = !videos[0].paused;
    toggle.innerHTML = playing ? ICONS.pause : ICONS.play;
    toggle.setAttribute("aria-label", playing ? "Pause" : "Play");
  };
  show();
  videos[0].addEventListener("play", show);
  videos[0].addEventListener("pause", show);
  toggle.addEventListener("click", () => {
    if (videos[0].paused) {
      held = false;
      chosen = true;
      play();
    } else {
      held = true;
      pause();
    }
  });
  replay.addEventListener("click", () => {
    held = false;
    chosen = true;
    videos.forEach((v) => (v.currentTime = 0));
    play();
  });
  host.append(replay, toggle);

  new IntersectionObserver(
    ([entry]) => {
      seen = entry.isIntersecting;
      if (!seen && !fresh) {
        fresh = true;
        pause();
        videos.forEach((v) => (v.currentTime = 0));
      }
      const half = entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= (entry.rootBounds?.height ?? innerHeight) * 0.5;
      if (fresh && half && allowed()) {
        fresh = false;
        play();
      }
      if (!seen) pause();
    },
    { threshold: [0, 0.25, 0.5] },
  ).observe(group);
}

// The signature dot slides under the tile whose turn it is, stretching with its speed (TurnDot.tsx)
function turnDot(row, dot, times) {
  const video = row.querySelector("video");
  let at = null;
  setInterval(() => {
    if (!video || (video.paused && video.currentTime === 0)) return;
    const t = video.currentTime + 0.4;
    const next = Math.max(0, times.findIndex(([a, b]) => t >= a && t < b));
    if (next === at) return;
    at = next;
    dot.style.setProperty("--i", at);
    dot.dataset.on = "";
    if (calm.matches) return;
    const center = () => {
      const box = dot.getBoundingClientRect();
      return (box.left + box.right) / 2;
    };
    let x = center();
    let then = performance.now();
    let stretch = 1;
    const until = then + 900;
    const step = (now) => {
      const nx = center();
      const speed = Math.abs(nx - x) / Math.max(now - then, 1);
      [x, then] = [nx, now];
      stretch += (1 + Math.min(speed * 0.4, 1) - stretch) / 2;
      dot.style.transform = `scale(${stretch}, ${1 / Math.sqrt(stretch)})`;
      if (now < until) requestAnimationFrame(step);
      else dot.style.transform = "";
    };
    requestAnimationFrame(step);
  }, 100);
}

run("loops", () => {
  document.querySelectorAll("[data-loop]").forEach((fig) => loops(fig, [fig.querySelector("video")], fig));
  document.querySelectorAll("[data-row]").forEach((row) => {
    loops(row, [...row.querySelectorAll("video")], row);
    const dot = row.querySelector(".turn-dot");
    const times = row.dataset.turns.split(";").map((pair) => pair.split(",").map(Number));
    if (dot) turnDot(row, dot, times);
  });
});

/* ---------- Day 3: point at a part of the format to find it on the desk ---------- */

run("desk", () => {
  const piece = document.querySelector("[data-desk-piece]");
  if (!piece) return;
  const desk = piece.querySelector(".desk");
  const zones = [...desk.querySelectorAll("[data-zone]")];
  const show = (part) => {
    if (!part || part === "look") {
      desk.removeAttribute("data-focus");
      zones.forEach((z) => z.removeAttribute("data-on"));
      return;
    }
    desk.dataset.focus = part;
    zones.forEach((z) => z.toggleAttribute("data-on", z.dataset.zone === part));
  };
  piece.querySelectorAll("[data-part]").forEach((p) => {
    p.addEventListener("pointerenter", () => {
      show(p.dataset.part);
      p.dataset.on = "";
    });
    p.addEventListener("pointerleave", () => {
      show(null);
      p.removeAttribute("data-on");
    });
  });
});

/* ---------- Day 7: every line takes a note ---------- */

run("copy", () => {
  const copy = document.querySelector("[data-copy]");
  if (!copy) return;
  let count = 0;
  const close = (line) => {
    line.querySelector(".note-form")?.remove();
    line.removeAttribute("data-editing");
  };
  const open = (line) => {
    copy.querySelectorAll(".line[data-editing]").forEach((other) => other !== line && close(other));
    if (line.querySelector(".note-form")) return line.querySelector("input").focus();
    line.dataset.editing = "";
    const form = document.createElement("form");
    form.className = "note-form";
    form.innerHTML = '<input type="text" placeholder="Note on this line" aria-label="Note on this line"><button type="submit">Add +</button>';
    const input = form.querySelector("input");
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const text = input.value.trim();
      if (!text) return close(line);
      let notes = line.querySelector(".notes");
      if (!notes) {
        notes = document.createElement("div");
        notes.className = "notes";
        line.append(notes);
      }
      const note = document.createElement("p");
      note.className = "lnote";
      note.innerHTML = `<span class="pin">${++count}</span><span></span><em>Open</em>`;
      note.children[1].textContent = text;
      notes.append(note);
      close(line);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close(line);
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) form.requestSubmit();
    });
    line.append(form);
    input.focus();
  };
  copy.querySelectorAll(".line").forEach((line) => {
    line.addEventListener("click", (event) => {
      if (event.target.closest(".note-form, .notes")) return;
      if (line.hasAttribute("data-editing")) return close(line);
      open(line);
    });
    line.addEventListener("keydown", (event) => {
      if (event.target === line && event.key === "Enter") {
        event.preventDefault();
        open(line);
      }
    });
  });
  // The copy's own index follows the part you're on
  const parts = [...copy.querySelectorAll(".copy-part")];
  const items = [...copy.querySelectorAll(".copy-index li")];
  copy.querySelectorAll(".copy-index a").forEach((a) =>
    a.addEventListener("click", (event) => {
      event.preventDefault();
      copy.querySelector(a.getAttribute("href"))?.scrollIntoView({ behavior: "smooth", block: "center" });
    }),
  );
  addEventListener(
    "scroll",
    () => {
      let here = parts[0];
      for (const p of parts) if (p.getBoundingClientRect().top < innerHeight * 0.5) here = p;
      items.forEach((li) => li.toggleAttribute("data-at", li.querySelector("a")?.getAttribute("href") === `#${here.id}`));
    },
    { passive: true },
  );
});

/* ---------- Day 5: a live page in a frame, scaled to the stage ---------- */

run("frames", () => {
  document.querySelectorAll("[data-frame]").forEach((frame) => {
    const inner = frame.querySelector(".frame-inner");
    const size = () => {
      const cw = frame.clientWidth;
      const [w, h] = cw < 720 ? [390, 760] : [Number(frame.dataset.w), Number(frame.dataset.h)];
      const s = cw / w;
      inner.style.width = `${w}px`;
      inner.style.height = `${h}px`;
      inner.style.transform = `scale(${s})`;
      frame.style.height = `${h * s}px`;
    };
    size();
    new ResizeObserver(size).observe(frame);
  });
});

/* ---------- Day 6: the Konami code (EasterEggs.tsx, Footer.tsx) ---------- */

const KONAMI = ["arrowup", "arrowup", "arrowdown", "arrowdown", "arrowleft", "arrowright", "arrowleft", "arrowright", "b", "a"];
const WAVE = 900;
const SCATTER = 0.35;
const HOLD = 2200;
const PINK = "#ea91bc";
const BLUSH = "#fdf1f5";

run("konami", () => {
  let keys = [];
  let running = false;
  let reset = 0;
  const caps = [...document.querySelectorAll(".konami-keys button, .keys kbd")];
  const fill = (right) => {
    document.querySelectorAll(".konami-keys button").forEach((b, i) => b.toggleAttribute("data-pressed", i < right));
    document.querySelectorAll(".keys kbd").forEach((k, i) => {
      k.style.setProperty("--i", i);
      k.toggleAttribute("data-pressed", i < right);
    });
    clearTimeout(reset);
    if (right === KONAMI.length) reset = setTimeout(() => fill(0), 3600);
  };
  const streak = () => {
    for (let n = Math.min(keys.length, KONAMI.length); n > 0; n--) if (keys.slice(-n).join() === KONAMI.slice(0, n).join()) return n;
    return 0;
  };
  const press = (key) => {
    keys = [...keys, key].slice(-KONAMI.length);
    const right = streak();
    fill(right);
    if (right === KONAMI.length) {
      keys = [];
      konami();
    }
  };
  addEventListener("keydown", (event) => {
    if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]")) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    // The arrow keys are for the code, so they never scroll the page
    if (event.key.startsWith("Arrow") && !event.shiftKey) event.preventDefault();
    press(event.key.toLowerCase());
  });
  document.querySelectorAll(".konami-keys button").forEach((b) => b.addEventListener("click", () => press(b.dataset.key)));
  void caps;

  const konami = () => {
    if (running) return;
    running = true;
    root.dataset.konamiRun = "";
    sweep();
    if (!calm.matches) burst();
    turnOver(() => {
      running = false;
      root.removeAttribute("data-konami-run");
    });
  };

  // The footer's hint turns over into "Try it." with the keys above it
  const hint = document.querySelector(".footer [data-hint]");
  const text = hint?.querySelector("[data-hint-text]");
  if (hint && text) {
    hint.addEventListener("pointerenter", () => {
      hint.dataset.on = "";
      setFlip(text, "Try it.");
      turn(text);
    });
    hint.addEventListener("pointerleave", () => {
      hint.removeAttribute("data-on");
      setFlip(text, "Do you know the Konami code?");
    });
  }
});

// The letters on screen turn over in a loose wave from the top left, then turn back
function turnOver(done) {
  const reach = innerWidth + innerHeight;
  const glyphs = [...document.querySelectorAll("[data-glyph]")].filter((g) => {
    const box = g.getBoundingClientRect();
    const seen = box.bottom > 0 && box.top < innerHeight && box.right > 0 && box.left < innerWidth;
    if (seen) {
      const along = (box.left + box.top) / reach;
      const at = along * (1 - SCATTER) + Math.random() * SCATTER;
      g.style.setProperty("--k-delay", `${Math.round(at * WAVE)}ms`);
    }
    return seen;
  });
  glyphs.forEach((g) => g.setAttribute("data-wave", ""));
  root.setAttribute("data-konami", "");
  setTimeout(() => root.removeAttribute("data-konami"), WAVE + HOLD);
  setTimeout(() => {
    for (const g of glyphs) {
      g.removeAttribute("data-wave");
      g.style.removeProperty("--k-delay");
    }
    done();
  }, WAVE * 2 + HOLD + 100);
}

// Soft bands of color sweep across the screen once, over a faint pink blush. Pictures sit above them.
function sweep() {
  const tile = washTile();
  const nav = document.querySelector("[data-nav]");
  const layers = [lay(document.body, "k-blush"), lay(document.body, "k-bands", tile), ...(nav ? [lay(nav, "k-nav-blush"), lay(nav, "k-nav-bands", tile)] : [])];
  root.setAttribute("data-bands", "");
  setTimeout(() => layers.forEach((l) => l.setAttribute("data-out", "")), WAVE + HOLD);
  setTimeout(() => {
    layers.forEach((l) => l.remove());
    root.removeAttribute("data-bands");
  }, WAVE + HOLD + 600);
}

function lay(parent, className, tile) {
  const layer = document.createElement("div");
  layer.className = className;
  layer.setAttribute("aria-hidden", "true");
  layer.style.setProperty("--blush", BLUSH);
  if (tile !== undefined) {
    if (tile) layer.style.setProperty("--wash", `url(${tile})`);
    const field = document.createElement("div");
    field.className = "k-field";
    const stripes = document.createElement("div");
    stripes.className = "k-stripes";
    field.append(stripes);
    layer.append(field);
  }
  parent.append(layer);
  return layer;
}

// The colors, painted once into a strip: periwinkle, rose, red, then gold, blended around the color wheel
let tileUrl = null;
function washTile() {
  if (tileUrl) return tileUrl;
  const WIDE = 640;
  const TALL = 256;
  const canvas = document.createElement("canvas");
  canvas.width = WIDE;
  canvas.height = TALL;
  const c = canvas.getContext("2d");
  if (!c) return null;
  const [blue, pinkGlass, red, yellowGlass] = [GLASS.blue, PINK, GLASS.red, GLASS.yellow].map((hex) => lch(oklab(hex)));
  const pink = [pinkGlass[0] + 0.01, pinkGlass[1] * 0.8, pinkGlass[2]];
  const yellow = [yellowGlass[0] - 0.01, yellowGlass[1] * 1.15, yellowGlass[2] - 0.05];
  const periwinkle = around(blue, pink, 0.3);
  const colors = [yellow, red, pink, periwinkle];
  const stops = [0.329, 0.495, 0.661, 0.826];
  const bends = [
    [[1, 0.014, 0.4], [2, 0.006, 2.0]],
    [[1, 0.018, 1.3], [3, 0.006, 4.0]],
    [[2, 0.016, 2.6], [1, 0.012, 5.1]],
    [[1, 0.02, 0.9], [2, 0.008, 3.3]],
  ];
  const image = c.createImageData(WIDE, TALL);
  for (let y = 0; y < TALL; y++) {
    const v = y / TALL;
    const lines = bends.map((waves, k) => stops[k] + waves.reduce((sum, [times, far, from]) => sum + far * Math.sin(2 * Math.PI * times * v + from), 0));
    for (let x = 0; x < WIDE; x++) {
      const u = x / WIDE;
      let color = colors[0];
      if (u >= lines[lines.length - 1]) color = colors[colors.length - 1];
      else if (u > lines[0]) {
        const k = lines.findIndex((line, i) => u >= line && u < lines[i + 1]);
        const t = (u - lines[k]) / (lines[k + 1] - lines[k]);
        const eased = k === colors.length - 2 ? t * t * (3 - 2 * t) : t * t * t * (t * (t * 6 - 15) + 10);
        color = around(colors[k], colors[k + 1], eased);
      }
      image.data.set([...srgb(lab(color)), 255], (y * WIDE + x) * 4);
    }
  }
  c.putImageData(image, 0, 0);
  tileUrl = canvas.toDataURL();
  return tileUrl;
}

const lch = ([L, A, B]) => [L, Math.hypot(A, B), Math.atan2(B, A)];
const lab = ([L, C, h]) => [L, C * Math.cos(h), C * Math.sin(h)];
function around(from, to, t) {
  let dh = to[2] - from[2];
  if (dh > Math.PI) dh -= 2 * Math.PI;
  if (dh < -Math.PI) dh += 2 * Math.PI;
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + dh * t];
}
const linear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gamma = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function oklab(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
function srgb([L, A, B]) {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((v) => Math.round(gamma(Math.min(1, Math.max(0, v))) * 255));
}

// Big glass shapes burst up from the bottom of the screen, fly in arcs and fall back out of sight
function burst() {
  const layer = document.createElement("div");
  layer.className = "k-burst";
  layer.setAttribute("aria-hidden", "true");
  document.body.append(layer);
  const width = innerWidth;
  const height = innerHeight;
  const colors = [GLASS.blue, GLASS.red, GLASS.yellow];
  const shapes = ["circle", "square", "triangle"];
  const RISING = 0.45;
  const flights = Array.from({ length: 14 }, (_, i) => {
    const kind = i % 3;
    const size = 70 + Math.random() * 110;
    const rise = height * (0.5 + Math.random() * 0.4) + size;
    const fall = rise * ((1 - RISING) / RISING) ** 2;
    const timing = { duration: 2000 + Math.random() * 700, delay: Math.random() * 450, fill: "both" };
    const toss = document.createElement("span");
    toss.className = "k-toss";
    toss.style.left = `${width * (0.15 + Math.random() * 0.7) - size / 2}px`;
    const chip = document.createElement("span");
    chip.className = "k-chip";
    chip.dataset.shape = shapes[kind];
    chip.style.setProperty("--c", colors[kind]);
    chip.style.width = chip.style.height = `${size}px`;
    toss.append(chip);
    layer.append(toss);
    return [
      toss.animate([{ translate: "0 0" }, { translate: `${(Math.random() - 0.5) * width * 0.5}px 0` }], timing),
      chip.animate(
        [
          { translate: "0 0", easing: "cubic-bezier(0.333, 0.667, 0.667, 1)" },
          { translate: `0 ${-rise}px`, offset: RISING, easing: "cubic-bezier(0.333, 0, 0.667, 0.333)" },
          { translate: `0 ${fall - rise}px` },
        ],
        timing,
      ),
      chip.animate([{ rotate: "0deg" }, { rotate: `${(Math.random() - 0.5) * 540}deg` }], timing),
    ];
  });
  Promise.all(flights.flat().map((f) => f.finished)).finally(() => layer.remove());
}
