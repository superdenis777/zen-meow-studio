// Worker unit tests: real worker/worker.js, Google's API stubbed.
import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { loadWorker } from "./helpers.mjs";

const { default: worker } = await loadWorker();
const ORIGIN = "https://superdenis777.github.io";
const ENV = { GEMINI_API_KEY: "test-key" };

const realFetch = globalThis.fetch;
let calls, respond;
const reply = (text, extra = {}) => ({ status: 200, body: { candidates: [{ content: { parts: [{ text }] } }], ...extra } });
beforeEach(() => {
  calls = [];
  respond = () => reply("**mm...** drink some water.");
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), init, body });
    const r = await respond(String(url), body, init);
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status });
  };
});
after(() => { globalThis.fetch = realFetch; });

const req = (body, { origin = ORIGIN, method = "POST", type = "text/plain;charset=UTF-8" } = {}) =>
  new Request("https://w.example/", {
    method,
    headers: { Origin: origin, "Content-Type": type, "CF-Connecting-IP": "1.2.3.4" },
    body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
  });
async function call(r, env = ENV) {
  const res = await worker.fetch(r, env);
  return { status: res.status, acao: res.headers.get("Access-Control-Allow-Origin"), body: res.status === 204 ? null : await res.json() };
}
const last = () => calls.at(-1);
const sys = () => last().body.systemInstruction.parts[0].text;

test("CORS preflight and origin checks", async () => {
  let r = await call(req(null, { method: "OPTIONS" }));
  assert.equal(r.status, 204); assert.equal(r.acao, ORIGIN);
  r = await call(req({ prompt: "hi", cat: "mochi" }, { origin: "https://evil.example" }));
  assert.equal(r.status, 403); assert.equal(r.acao, null);
  r = await call(req({ prompt: "hi", cat: "mochi" }, { origin: "https://SuperDenis777.github.io" }), { ...ENV, ALLOWED_ORIGINS: " https://superdenis777.github.io/ " });
  assert.equal(r.status, 200, "origin normalised (case, slash, spaces)");
});

test("health check reports config without secrets", async () => {
  const r = await call(req(null, { method: "GET" }));
  assert.equal(r.status, 200);
  assert.equal(r.body.model, "gemini-3.8-flash");
  assert.equal(r.body.keyConfigured, true);
  assert.ok(!JSON.stringify(r.body).includes("test-key"));
});

test("rejects bad input", async () => {
  assert.equal((await call(req({ prompt: "hi", cat: "garfield" }))).status, 400);
  assert.equal((await call(req({ prompt: "   ", cat: "nox" }))).status, 400);
  assert.equal((await call(req("not json"))).status, 400);
  assert.equal((await call(req({ prompt: "hi", cat: "nox" }), {})).status, 503, "no key → 503");
  assert.equal(calls.length, 0, "never reached Gemini");
});

test("builds the prompt and calls Gemini safely", async () => {
  const r = await call(req({
    prompt: "I always fail", cat: "nox", lang: "zh", layer: 2,
    history: [{ role: "model", text: "greeting" }, { role: "user", text: "a" }, { role: "user", text: "b" }, { role: "model", text: "reply" }, { role: "hacker", text: "x" }],
  }));
  assert.equal(r.status, 200);
  assert.equal(r.body.reply, "mm... drink some water.", "markdown stripped");
  assert.equal(last().init.headers["x-goog-api-key"], "test-key");
  assert.ok(!last().url.includes("test-key"), "key not in URL");
  assert.match(last().url, /models\/gemini-3\.8-flash:generateContent$/);
  assert.match(sys(), /你是 Nox/);
  assert.match(sys(), /第 2 層（迴圈降溫）/);
  assert.match(sys(), /對話優先/);
  assert.deepEqual(last().body.contents.map(c => c.role), ["user", "model", "user"], "starts and ends with user, merged");
  assert.equal(last().body.contents[0].parts[0].text, "a\nb");
});

test("conversation-first rules; layer hint is soft and optional", async () => {
  await call(req({ prompt: "what?", cat: "mochi", layer: null }));
  assert.match(sys(), /Conversation first/);
  assert.doesNotMatch(sys(), /lean toward Layer/);
  await call(req({ prompt: "hi", cat: "mochi", layer: 1 }));
  assert.match(sys(), /If it fits naturally, let this turn lean toward Layer 1/);
  await call(req({ prompt: "x".repeat(5000), cat: "kiki", layer: 99 }));
  assert.equal(last().body.contents.at(-1).parts[0].text.length, 500, "prompt clipped");
  assert.doesNotMatch(sys(), /lean toward Layer/, "invalid layer ignored");
});

test("model-specific generation config", async () => {
  await call(req({ prompt: "hi", cat: "mochi" }));
  assert.deepEqual(last().body.generationConfig, { maxOutputTokens: 1024, thinkingConfig: { thinkingLevel: "low" } });
  await call(req({ prompt: "hi", cat: "mochi" }), { ...ENV, GEMINI_MODEL: "gemini-2.5-flash" });
  assert.equal(last().body.generationConfig.thinkingConfig.thinkingBudget, 0);
});

test("400 on thinking settings → retried without them; thoughts hidden", async () => {
  respond = (url, body) => body.generationConfig.thinkingConfig
    ? { status: 400, body: { error: { message: "Unknown name thinkingLevel" } } }
    : { status: 200, body: { candidates: [{ content: { parts: [{ text: "secret plan", thought: true }, { text: "hey, i'm here." }] } }] } };
  const r = await call(req({ prompt: "hi", cat: "mochi" }));
  assert.equal(calls.length, 2);
  assert.equal(r.body.reply, "hey, i'm here.");
});

test("busy primary → backup model answers; both busy → retryable 502", async () => {
  respond = url => url.includes("gemini-3.8-flash") ? { status: 503, body: { error: { message: "high demand" } } } : reply("lite here.");
  let r = await call(req({ prompt: "hi", cat: "mochi" }));
  assert.equal(r.body.reply, "lite here.");
  assert.match(calls[1].url, /gemini-3\.5-flash-lite/);

  calls = [];
  respond = url => ({ status: 503, body: { error: { message: url.includes("lite") ? "lite err" : "high demand" } } });
  r = await call(req({ prompt: "hi", cat: "mochi" }));
  assert.equal(r.status, 502); assert.equal(r.body.retryable, true); assert.equal(r.body.detail, "high demand");

  calls = [];
  await call(req({ prompt: "hi", cat: "mochi" }), { ...ENV, GEMINI_FALLBACK_MODEL: "none" });
  assert.equal(calls.length, 1, "backup can be disabled");
});

test("a hung model is cut off and handed to the backup", async () => {
  respond = (url, body, init) => url.includes("gemini-3.8-flash")
    ? new Promise((_, rej) => init.signal.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" }))))
    : reply("lite saves the day.");
  const t0 = Date.now();
  const r = await call(req({ prompt: "hi", cat: "mochi" }));
  assert.equal(r.body.reply, "lite saves the day.");
  assert.ok(Date.now() - t0 < 9500, "within the page's timeout");
});

test("errors pass through with detail; 404 / 429 / safety blocks", async () => {
  respond = () => ({ status: 404, body: { error: { message: "model gone" } } });
  let r = await call(req({ prompt: "hi", cat: "mochi" }));
  assert.equal(r.status, 502); assert.equal(r.body.retryable, false); assert.equal(calls.length, 1, "404 not handed to backup");
  respond = () => ({ status: 429, body: { error: { message: "quota" } } });
  r = await call(req({ prompt: "hi", cat: "mochi" }));
  assert.equal(r.status, 429);
  respond = () => ({ status: 200, body: { promptFeedback: { blockReason: "SAFETY" } } });
  r = await call(req({ prompt: "hi", cat: "mochi" }));
  assert.equal(r.status, 422); assert.equal(r.body.detail, "SAFETY");
});

test("optional rate limiter", async () => {
  const r = await call(req({ prompt: "hi", cat: "kiki" }), { ...ENV, RATE_LIMITER: { limit: async () => ({ success: false }) } });
  assert.equal(r.status, 429);
});
