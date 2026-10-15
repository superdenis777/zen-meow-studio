// End-to-end: the real page in Chromium, talking to the real Worker over a
// real (cross-origin) connection. Only Google's API is faked.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { startStack, loadBrowserScript } from "./helpers.mjs";

const P = loadBrowserScript("personas.js").MEOW_PERSONAS;
const live = text => () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] } }] } });

let stack, browser, page, errors;
before(async () => {
  stack = await startStack();
  browser = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "en-US" });
  errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(stack.siteUrl);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await waitForCatLines(3); // the three greetings
});
after(async () => { await browser?.close(); await stack?.close(); });

const catLines = () => page.evaluate(() =>
  [...document.querySelectorAll("#log .msg")].filter(m => !m.classList.contains("you") && !m.classList.contains("sys")).map(m => m.textContent));
async function waitForCatLines(n) {
  await page.waitForFunction(n => [...document.querySelectorAll("#log .msg")]
    .filter(m => !m.classList.contains("you") && !m.classList.contains("sys")).length >= n, n, { timeout: 20_000 });
}
async function send(cat, text) {
  const before = (await catLines()).length;
  await page.click(`.chip:nth-of-type(${["mochi", "nox", "kiki"].indexOf(cat) + 1})`);
  await page.fill("#input", text);
  await page.press("#input", "Enter");
  await waitForCatLines(before + 1);
  return (await catLines()).at(-1);
}
const lastSys = () => page.evaluate(() => [...document.querySelectorAll("#log .msg.sys")].at(-1)?.textContent || "");
const resetLive = async () => { await page.click("#liveBtn"); await page.click("#liveBtn"); }; // clears the cooldown

test("live Gemini replies render, with no CORS preflight", async () => {
  stack.control.gemini = live("GEMINI-LIVE hello there");
  stack.control.methods = [];
  const line = await send("mochi", "hello mochi");
  assert.match(line, /<MOCHI> GEMINI-LIVE hello there/);
  assert.equal(await page.getAttribute("#liveBtn", "data-state"), "live");
  assert.ok(!stack.control.methods.includes("OPTIONS"), "simple request, no preflight");
  const sent = stack.control.calls.at(-1).body;
  assert.match(sent.contents.at(-1).parts[0].text, /hello mochi/);
});

test("crisis messages stay local and show real help", async () => {
  const n = stack.control.calls.length;
  await send("nox", "i want to die");
  assert.equal(stack.control.calls.length, n, "never sent to Gemini");
  assert.ok((await page.$$(".msg.care")).length >= 1);
});

test("busy main model → backup model still answers", async () => {
  stack.control.gemini = url => url.includes("gemini-3.8-flash")
    ? { status: 503, body: { error: { message: "high demand" } } }
    : live("BACKUP-LITE reply")();
  assert.match(await send("kiki", "hey kiki"), /BACKUP-LITE reply/);
});

test("Gemini errors fall back to the local cats and say why", async () => {
  stack.control.gemini = () => ({ status: 404, body: { error: { message: "model retired" } } });
  await resetLive();
  const line = await send("mochi", "anyone there");
  assert.doesNotMatch(line, /GEMINI|BACKUP/);
  assert.match(await lastSys(), /live cats unreachable \(HTTP 502: .*Gemini 404, model retired\)/);
  assert.equal(await page.getAttribute("#liveBtn", "data-state"), "fallback");
});

test("local mode: 'what?' gets a listening reply, not a technique", async () => {
  await page.click("#liveBtn"); // LIVE → LOCAL
  assert.equal(await page.textContent("#liveLabel"), "LOCAL");
  const n = stack.control.calls.length;
  const line = await send("mochi", "what?");
  assert.equal(stack.control.calls.length, n, "local mode sends nothing");
  const mochi = P.CATS.find(c => c.id === "mochi");
  assert.ok(Array.from(mochi.listen.en).some(l => line.endsWith(l)), line);
  await page.click("#liveBtn"); // back to LIVE
});

test("notebook saves a cat line and a fortune, and remembers them", async () => {
  await page.click("#log .msg:not(.you):not(.sys) .star");
  await page.click("#releaseBtn");
  await page.click("#cardStar");
  await page.click("#cardStay");
  assert.equal(await page.textContent("#nbCount"), "2");
  await page.reload();
  assert.equal(await page.textContent("#nbCount"), "2");
});

test("Dissolve Thought burns the text and keeps nothing", async () => {
  await page.click("#dissolveBtn");
  await page.fill("#thought", "what if everyone thinks I'm a fraud");
  await page.click("#dissolveGo");
  await page.waitForSelector(".mochi-note", { timeout: 6000 });
  assert.equal(await page.inputValue("#thought"), "");
  assert.ok(!(await page.evaluate(() => JSON.stringify(localStorage))).includes("fraud"));
  await page.click("#dissolveX");
});

test("Release → step away → come back", async () => {
  await page.click("#releaseBtn");
  await page.click("#cardGo");
  assert.ok(await page.isVisible("#away"));
  assert.equal(await page.evaluate(() => document.getElementById("app").inert), true);
  await page.click("#awayBack");
  assert.equal(await page.evaluate(() => document.getElementById("app").inert), false);
});

test("theme, language and Meowbeats settings stick", async () => {
  await page.selectOption("#theme", "matcha");
  await page.click('[data-lang="zh"]');
  await page.click("#soundBtn");
  await page.click('.tog[data-ch="music"]');
  await page.waitForFunction(() => !document.getElementById("nowPlaying").hidden);
  assert.match(await page.textContent("#nowPlaying"), /♪ 正在播放：?|♪ 正在播放/);
  await page.reload();
  assert.equal(await page.getAttribute("html", "data-theme"), "matcha");
  assert.equal(await page.getAttribute("html", "lang"), "zh-Hant");
  assert.equal(await page.evaluate(() => window.MeowAudio.state.music), true);
});

test("phone layout: no sideways scrolling", async () => {
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await phone.goto(stack.siteUrl);
  assert.equal(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await phone.close();
});

test("no JavaScript errors along the way", () => {
  assert.deepEqual(errors, []);
});
