# 30 days

Interactive Design Concepts, Cooper Union. One thing made each day, shown in the language of noaoh.com.

Plain HTML, CSS and JavaScript, no build step. Run it:

```bash
node serve.mjs
```

Then open http://localhost:8030.
After changing `styles.css` or `main.js`, run `node stamp.mjs` before committing: it fingerprints their links in `index.html`, so visitors never get a new page with an old stylesheet.
 (Any static server works; this one sends byte ranges, so Safari plays the loops.)

- `index.html`: the page, one section per day
- `styles.css`: noaoh.com's tokens and pieces
- `main.js`: mirrored letters, loops, the turn dot, the desk and copy pieces, the Konami code
- `assets/`: the BoomLoom zine, typeface and glyph viewer; the Kino loops
- `vendor/`: three.js 0.169 and opentype.js 1.3.4

The zine's page-turn and the glyph viewer are inspired by Paper Mono by Paper (paper.design/mono).
