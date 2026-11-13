// Stamps index.html's links to styles.css and main.js with a fingerprint of each file, so a browser holding an older
// copy (GitHub Pages lets them keep one for ten minutes) fetches the new one with the new page instead of mixing them.
//   node stamp.mjs        (run before committing a change to either file)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (file) => fileURLToPath(new URL(file, import.meta.url));
const print = (file) => createHash("sha1").update(readFileSync(here(file))).digest("hex").slice(0, 8);

let page = readFileSync(here("index.html"), "utf8");
for (const file of ["styles.css", "main.js"]) {
  const pattern = new RegExp(`(["'])${file.replace(".", "\\.")}(\\?v=[0-9a-f]+)?\\1`, "g");
  page = page.replace(pattern, `$1${file}?v=${print(file)}$1`);
}
writeFileSync(here("index.html"), page);
console.log("stamped", ["styles.css", "main.js"].map((f) => `${f}?v=${print(f)}`).join(", "));
