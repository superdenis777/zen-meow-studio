// Fast checks on the app's content and wiring. No browser, no installs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, loadBrowserScript, loadWorker } from "./helpers.mjs";
import { stamped } from "../scripts/stamp.mjs";

const P = loadBrowserScript("personas.js").MEOW_PERSONAS;
const I18N = loadBrowserScript("i18n.js").MEOW_I18N;
const LANGS = ["en", "zh"];

test("every cat has lines for all 6 layers in both languages", () => {
  assert.equal(P.LAYERS.length, 6);
  for (const cat of P.CATS) {
    assert.equal(cat.lines.length, 6, `${cat.id}: 6 layers`);
    for (const lang of LANGS) {
      cat.lines.forEach((layer, i) => assert.ok(layer[lang]?.length > 0, `${cat.id} layer ${i} ${lang}`));
      for (const pool of ["greet", "back", "listen"]) assert.ok(cat[pool]?.[lang]?.length > 0, `${cat.id}.${pool}.${lang}`);
      assert.ok(cat.bio[lang] && cat.system[lang], `${cat.id} bio/system ${lang}`);
    }
    assert.ok(cat.arc.every(l => Number.isInteger(l) && l >= 0 && l <= 5), `${cat.id} arc layers valid`);
  }
});

test("{word} only appears in English lines", () => {
  for (const cat of P.CATS) {
    for (const layer of cat.lines) for (const line of layer.zh) assert.ok(!line.includes("{word}"), `${cat.id}: ${line}`);
  }
});

test("messages route to the right signal", () => {
  const route = m => (P.SIGNALS.find(s => s.re.test(m)) || { layer: "arc" }).layer;
  const cases = {
    "i want to die": "safety", "我不想活了": "safety", "thinking about self-harm": "safety",
    "what?": "listen", "listen to me": "listen", "you're ignoring me": "listen", "你有在聽嗎": "listen", "蛤？": "listen",
    "thanks, bye": 5, "晚安": 5,
    "should I quit my job?": 4, "要不要分手": 4,
    "I'm stuck on my project": 3, "好無聊": 3,
    "I always mess up": 2, "我一直想太多": 2,
    "I'm so tired": 1, "肩膀好緊": 1,
    "hello": "arc", "i fell in love with a girl": "arc",
  };
  for (const [msg, want] of Object.entries(cases)) assert.equal(route(msg), want, JSON.stringify(msg));
});

test("UI strings exist in both languages with the same keys", () => {
  assert.deepEqual(Object.keys(I18N.en).sort(), Object.keys(I18N.zh).sort());
  for (const lang of LANGS) {
    for (const [k, v] of Object.entries(I18N[lang])) {
      if (Array.isArray(v)) assert.ok(v.length > 0, `${lang}.${k} empty`);
      else if (typeof v === "string") assert.ok(v.trim(), `${lang}.${k} empty`);
    }
  }
});

test("every data-i18n key in index.html exists", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  const keys = [...html.matchAll(/data-i18n="(\w+)"/g)].map(m => m[1]);
  assert.ok(keys.length > 20);
  for (const k of keys) for (const lang of LANGS) assert.ok(k in I18N[lang], `${lang}.${k} missing`);
});

test("persona prompts in personas.js and worker/worker.js match", async () => {
  const { __internals: W } = await loadWorker();
  for (const lang of LANGS) assert.equal(P.FRAMEWORK[lang], W.FRAMEWORK[lang], `FRAMEWORK.${lang} differs`);
  for (const cat of P.CATS) {
    for (const lang of LANGS) assert.equal(cat.system[lang], W.CATS[cat.id]?.[lang], `${cat.id}.system.${lang} differs`);
  }
  assert.deepEqual(Object.keys(W.CATS).sort(), Array.from(P.CATS, c => c.id).sort());
});

test("index.html script cache-busting stamps are current (run `npm run stamp`)", () => {
  const html = readFileSync(join(ROOT, "index.html"), "utf8");
  assert.equal(stamped(html), html);
});
