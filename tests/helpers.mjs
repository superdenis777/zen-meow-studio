// Shared test helpers: load the browser scripts in Node, load the Worker
// (plus its private prompt data), and run the real Worker + site locally.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";
import http from "node:http";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));
export const PROD_API = "https://zen-meow-api.popadenisro.workers.dev";

/** Run a browser script (personas.js, i18n.js…) and return what it put on window. */
export function loadBrowserScript(file) {
  const window = {};
  vm.runInNewContext(readFileSync(join(ROOT, file), "utf8"), { window, console });
  return window;
}

/** Import worker/worker.js, also exposing its internal FRAMEWORK and CATS. */
export async function loadWorker() {
  const src = readFileSync(join(ROOT, "worker/worker.js"), "utf8");
  const dir = mkdtempSync(join(tmpdir(), "meow-worker-"));
  const file = join(dir, "worker.mjs");
  writeFileSync(file, src + "\nexport const __internals = { FRAMEWORK, CATS, DEFAULT_MODEL };\n");
  return import(pathToFileURL(file).href);
}

/**
 * Run the real Worker on a local port with Google's API stubbed, and serve the
 * site with API_URL pointed at it. `control.gemini(url, body)` decides each
 * fake Gemini response; `control.calls` records them.
 */
export async function startStack() {
  const { default: worker } = await loadWorker();
  const control = {
    calls: [],
    methods: [],
    origins: null,
    gemini: () => ({ status: 200, body: { candidates: [{ content: { parts: [{ text: "GEMINI-LIVE reply" }] } }] } }),
  };
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith("https://generativelanguage.googleapis.com/")) return realFetch(url, init);
    const body = JSON.parse(init.body);
    control.calls.push({ url: String(url), body });
    const r = await control.gemini(String(url), body);
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "content-type": "application/json" } });
  };

  const listen = server => new Promise(res => server.listen(0, "127.0.0.1", () => res(server.address().port)));
  let siteOrigin = "";
  const workerServer = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    control.methods.push(req.method);
    const request = new Request("http://worker.local" + req.url, {
      method: req.method,
      headers: req.headers,
      body: ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : Buffer.concat(chunks),
    });
    const out = await worker.fetch(request, { GEMINI_API_KEY: "test-key", ALLOWED_ORIGINS: control.origins ?? siteOrigin });
    res.writeHead(out.status, Object.fromEntries(out.headers));
    res.end(Buffer.from(await out.arrayBuffer()));
  });
  const workerPort = await listen(workerServer);
  const workerUrl = `http://127.0.0.1:${workerPort}`;

  const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
  const siteServer = http.createServer((req, res) => {
    const path = decodeURIComponent(req.url.split("?")[0]);
    const file = path === "/" ? "index.html" : path.slice(1);
    if (file.includes("..")) { res.writeHead(400); return res.end(); }
    try {
      let body = readFileSync(join(ROOT, file));
      if (file === "index.html") body = body.toString().replace(PROD_API, workerUrl);
      res.writeHead(200, { "content-type": TYPES[file.slice(file.lastIndexOf("."))] || "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end();
    }
  });
  const sitePort = await listen(siteServer);
  siteOrigin = `http://127.0.0.1:${sitePort}`;

  return {
    control,
    siteUrl: siteOrigin + "/",
    workerUrl,
    async close() {
      globalThis.fetch = realFetch;
      await Promise.all([workerServer, siteServer].map(s => new Promise(r => s.close(r))));
    },
  };
}
