// Nov 11, late: the small print said "Free for 14 days" while the menu says pricing is coming soon; it now says what a
// beta would (Noah: "nail the impression that this is a functioning app that already exists").
// The sample site the sketches sit on: "Juniper", a made-up habit tracker running on someone's localhost.
// <main class="site" data-state="before|after"> gets filled in. "after" is the page once Claude has made the signup
// friendlier (the request in the "Ask and watch" flow).
// Since Nov 11 it reads as a real app that's being built right now, and a quiet one. Noah: "make it look a little bit
// more like a real app that's in progress right now and that's in building ... I need to be extremely convinced that
// this is a real working product", and then: "intentionally making Juniper feel lo-fi in some areas could be
// interesting ... doesn't have any images or anything that's too loud that may distract from our product. Juniper just
// needs to be kind of a lo-fi work in progress". So: neutral grays, one accent (the signup button), thin borders. The
// headline, the form, the button and the three cards are finished, so an agent's change to them reads; the app preview
// is a gray wireframe, the testimonials are a dashed TODO, and a dev badge sits in the corner.
(function () {
  const copy = {
    before: {
      h1: 'Track habits. Build streaks.',
      sub: 'Juniper logs your daily habits and shows your progress over time.',
      button: 'Create account',
    },
    after: {
      h1: 'Small steps, every day.',
      sub: 'Pick one habit to start. Juniper cheers you on and keeps your streak going.',
      button: 'Start my first habit',
    },
  };
  const svg = (d, box = 20) => `<svg viewBox="0 0 ${box} ${box}" aria-hidden="true">${d}</svg>`;
  const ICON = {
    checkins: svg('<circle cx="10" cy="10" r="7.2"/><path d="M6.9 10.3l2.1 2.1 4.2-4.5"/>'),
    streaks: svg('<path d="M3.5 16.5h13"/><path d="M5.5 13.5v-3M9 13.5v-6M12.5 13.5V9M16 13.5V4.5"/>'),
    reminders: svg('<path d="M5.8 8.6a4.2 4.2 0 0 1 8.4 0v2.9l1.4 2.1H4.4l1.4-2.1z"/><path d="M8.4 15.6a1.7 1.7 0 0 0 3.2 0"/>'),
  };
  // the logo: a streak ring one day short of closing
  const MARK = '<svg class="s-mark" viewBox="0 0 28 28" aria-hidden="true"><rect width="28" height="28" rx="8"/><path d="M14 7.6a6.4 6.4 0 1 1-6.4 6.4"/><circle cx="9.5" cy="9.5" r="1.6"/></svg>';
  const TICK = svg('<path d="M3.2 6.2l1.9 1.9 3.8-4.2"/>', 12);
  // the app preview, still a wireframe: rows of gray bars where the habits will be, and a two-week streak in gray
  const rows = [[1, 112, 64], [1, 86, 78], [1, 128, 52], [0, 98, 70]]
    .map(([done, a, b]) => `<li class="${done ? 'done' : ''}"><i class="s-tick">${done ? TICK : ''}</i><span><u style="width:${a}px"></u><u class="thin" style="width:${b}px"></u></span><u class="s-num"></u></li>`).join('');
  const bars = [38, 52, 0, 44, 61, 70, 58, 66, 74, 69, 80, 77, 86, 48].map((h, i, a) => `<i style="height:${h || 6}%"${i === a.length - 1 ? ' class="today"' : ''}></i>`).join('');

  function render(el) {
    const c = copy[el.dataset.state] || copy.before;
    el.innerHTML = `
      <header class="s-top"><div class="s-wrap s-nav">
        <div class="s-logo">${MARK}Juniper</div>
        <nav class="s-links"><a>Features</a><a>Pricing<span class="s-soon">soon</span></a><a>Stories</a></nav>
        <a class="s-login">Log in</a>
      </div></header>
      <div class="s-wrap s-main">
        <section class="s-hero">
          <div class="s-copy">
            <p class="s-eyebrow">Habit tracker <span>Beta</span></p>
            <h1 data-el="headline">${c.h1}</h1>
            <p class="s-sub" data-el="sub">${c.sub}</p>
            <div class="s-proof"><span class="s-faces" aria-hidden="true"><i>M</i><i>J</i><i>R</i><i>S</i></span><span>1,240 people are building a habit with the beta</span></div>
          </div>
          <form class="s-form" data-el="form" onsubmit="return false">
            <div class="s-form-head"><h2>Create your account</h2><p>Start with one habit. It takes a minute.</p></div>
            <label>Email</label>
            <div class="s-input">you@example.com</div>
            <div class="s-button" data-el="button">${c.button}</div>
            <small>Free while Juniper is in beta.</small>
            <div class="s-form-foot">Already have an account? <a>Log in</a></div>
          </form>
        </section>
        <section class="s-show">
          <div class="s-app" aria-hidden="true">
            <div class="s-app-top"><b>Today</b><span>Wed, Nov 11</span><span class="s-tag">AppPreview · placeholder</span><em class="s-ring"><i></i>3 of 4</em></div>
            <div class="s-app-body">
              <ul class="s-rows">${rows}</ul>
              <div class="s-chart"><span>Streak</span><b>23 days</b><div class="s-bars">${bars}</div></div>
            </div>
          </div>
          <div class="s-features">
            <div class="s-card" data-el="checkins"><span class="s-ico">${ICON.checkins}</span><div><b>Daily check-ins</b><p>Tick off a habit in one tap.</p></div></div>
            <div class="s-card" data-el="streaks"><span class="s-ico">${ICON.streaks}</span><div><b>Streaks</b><p>See how many days in a row.</p></div></div>
            <div class="s-card" data-el="reminders"><span class="s-ico">${ICON.reminders}</span><div><b>Reminders</b><p>A nudge at the time you choose.</p></div></div>
          </div>
        </section>
        <section class="s-todo" aria-label="Testimonials, not written yet">
          <p class="s-todo-tag">Testimonials: TODO</p>
          <div class="s-todo-grid">${'<div><u></u><u></u><u class="short"></u><span><i></i><u class="name"></u></span></div>'.repeat(3)}</div>
        </section>
        <section class="s-todo s-todo-pricing" aria-label="Pricing, coming soon">
          <p class="s-todo-tag">Pricing: coming soon</p>
        </section>
        <footer class="s-foot"><span>© 2026 Juniper</span><u></u><u></u><u></u></footer>
      </div>
      <div class="s-dev" aria-hidden="true"><i>${svg('<path d="M11 2.5L5 11h4l-1 6.5L14 9h-4z"/>')}</i>localhost:3000</div>`;
  }
  document.querySelectorAll('main.site').forEach(render);
  window.juniper = { render };
})();

// Helpers the sketches share: find an element of the site, and draw on the overlay in viewport coordinates.
window.bd = {
  el: (name) => document.querySelector(`[data-el="${name}"]`),
  rect: (node) => node.getBoundingClientRect(),
  still: () => matchMedia('(prefers-reduced-motion: reduce)').matches,
  // put an absolutely positioned box over an element (on the fixed overlay), padded
  over(node, cls, pad = 10) {
    const r = node.getBoundingClientRect();
    const d = document.createElement('div');
    d.className = cls;
    Object.assign(d.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
    document.querySelector('.overlay').appendChild(d);
    return d;
  },
};
