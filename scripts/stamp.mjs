// Cache-busting: rewrites <script src="x.js?v=HASH"> in index.html so each
// deploy loads matching copies of personas.js / i18n.js / audio.js.
//   node scripts/stamp.mjs          update the stamps
//   node scripts/stamp.mjs --check  exit 1 if any stamp is stale (CI)
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const SCRIPT = /<script src="([\w.-]+\.js)(?:\?v=[0-9a-f]*)?"><\/script>/g;
const hash = file => createHash("sha256").update(readFileSync(root + file)).digest("hex").slice(0, 10);

export function stamped(html) {
  return html.replace(SCRIPT, (_, file) => `<script src="${file}?v=${hash(file)}"></script>`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const html = readFileSync(root + "index.html", "utf8");
  const next = stamped(html);
  if (process.argv.includes("--check")) {
    if (next !== html) {
      console.error("index.html script stamps are stale: run `npm run stamp` and commit.");
      process.exit(1);
    }
    console.log("script stamps up to date");
  } else {
    writeFileSync(root + "index.html", next);
    console.log(next === html ? "stamps already current" : "stamps updated");
  }
}
