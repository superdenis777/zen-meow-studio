# MeowChat 2003 (zen-meow-studio)

A retro chat room with three cat mascots (Mochi, Nox, Kiki), built as a static site plus one Cloudflare Worker that calls Gemini.
Live at https://superdenis777.github.io/zen-meow-studio/.
The owner is Denis. He wants changes shipped end to end, explained plainly, with no busywork left for him.

## Layout

| Path | What |
| --- | --- |
| `index.html` | All UI: styles, sprites, chat, reply engine, Release card, Dissolve box, Notebook, themes, live/local routing. One inline script. |
| `personas.js` | `window.MEOW_PERSONAS`: 6-layer framework, signals, safety text, and per-cat `system` prompt, arc and lines (EN + 繁中). |
| `i18n.js` | `window.MEOW_I18N`: every UI string, fortunes and rituals (EN + 繁中). Both languages must have identical keys. |
| `audio.js` | `window.MeowAudio`: procedural Web Audio (SFX, rain, vinyl, purr, Meowbeats music). No audio files. |
| `worker/worker.js` | Cloudflare Worker `zen-meow-api`: `POST {prompt, cat, history, lang, layer}` → `{reply}`; `GET` = health check. |
| `worker/wrangler.toml` | Worker config, including `[placement] region = "gcp:us-central1"` (see gotchas). |
| `presence/` | Cloudflare Worker `hotel-dada-presence` for the separate Hotel Dada room (`superdenis777/the-room`): `POST {room, side, leave?}` → `{a, b}`, who checked in during the last 150 s. A Durable Object per room, memory only. Deployed by `.github/workflows/deploy-presence.yml`. |
| `scripts/stamp.mjs` | Cache-busting `?v=hash` on the `<script>` tags in `index.html`. |
| `tests/` | `content` (fast), `worker` (fast), `e2e` (Playwright). `helpers.mjs` runs the real Worker + site locally with Google faked. |

The browser scripts are classic scripts (no modules, no build step) so the page also works when opened from disk.

## Shipping (all automatic)

- **Site:** push to `main` and GitHub Pages publishes it in about a minute.
- **Worker:** a push to `main` touching `worker/**` makes `.github/workflows/deploy-worker.yml` run the fast tests, then `wrangler@4 deploy`. It uses the repo secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. It can also be triggered manually (workflow_dispatch). The Gemini key is a Worker secret on Cloudflare (`GEMINI_API_KEY`), never in the repo.
- **Tests:** `.github/workflows/test.yml` runs on every push and PR.
- **Habit:** small tweaks go straight to `main`. Big features go on a branch with a PR so CI runs before merge. Check that CI is green after pushing.

## Before every commit

1. `npm run stamp` whenever `personas.js`, `i18n.js` or `audio.js` changed. CI fails on stale stamps.
2. `npm run test:fast`, which takes seconds and needs no installs.
3. `npm test` for UI or flow changes (needs `npm ci` once; Chromium is at `/opt/pw-browsers` in cloud sessions).

## Invariants (tests enforce most of these)

- **Prompts are duplicated:** `FRAMEWORK` and each cat's `system` text exist in both `personas.js` and `worker/worker.js`. Change both. `tests/content.test.mjs` fails if they drift.
- **Crisis messages never leave the browser.** The `safety` signal in `personas.js` gets a fixed reply and crisis lines (Taiwan 1925/1995/1980, findahelpline.com). Never route them to Gemini.
- **The local engine always runs first:** it picks the layer, and its line is the fallback. Gemini only rewrites the words. The page must keep working with the Worker down.
- **The Worker owns the prompts:** the client sends only a cat id. Never accept a system prompt from the client, or the Worker becomes an open Gemini proxy.
- **Never render model output as HTML.** Always use `textContent`.
- **Dissolve Thought text is never stored, logged or sent.**
- **Keep `{word}` out of `zh` lines.** Every cat needs all 6 layers in both languages, plus `greet`, `back` and `listen`.

## Gotchas learned the hard way

- **Gemini models get retired or closed to new keys.** 1.5 is gone, and `gemini-2.5-flash` returns 404 "no longer available to new users". The default is `gemini-3.8-flash`. Google's error message names the replacement. Override without code via the Worker variable `GEMINI_MODEL`.
- **3.x vs 2.5 config:** 3.x models take `thinkingConfig.thinkingLevel`, and 2.5 takes `thinkingBudget`. `generationConfigFor()` handles this, and a 400 retries without thinking settings.
- **Overload (503 "high demand"):** free-tier keys are served last, and re-asking the same model mostly adds delay. The Worker caps each attempt at 8 s and hands the turn to `GEMINI_FALLBACK_MODEL` (default `gemini-3.5-flash-lite`). The page timeout is 22 s.
- **"User location is not supported" (400):** Cloudflare served the Worker from Hong Kong, which Gemini refuses, and visitors in Taiwan often land there. Fixed with the placement hint in `wrangler.toml`, which only applies via wrangler deploys (the CI does this), not dashboard edits. The health check's `colo` shows where requests *arrive* (it will still say HKG).
- **CORS:** the page posts JSON as `text/plain` (a simple request, so no preflight), and the Worker parses `request.text()`. `ALLOWED_ORIGINS` is normalized (case, trailing slash).
- **Billing:** the key is on Tier 1 with a NT$150 prepay and auto-reload off. That's a hard cap: when credits run out, the cats fall back to scripted lines.
- **Debugging live mode:** when the light turns amber, the chat log prints `live cats unreachable (<reason>)` once, and the console and the LIVE tooltip show it too. Also open the Worker URL for the health JSON.
- The cloud sandbox can't reach `*.workers.dev` or Cloudflare APIs. Verify against the local stack in `tests/helpers.mjs`, and ask Denis for screenshots of the real thing.

## Open ideas

- A per-IP rate limit (`RATE_LIMITER` binding; see `wrangler.toml`). The prepay cap makes it optional for now.
- Live mode is on by default for every visitor. Consider local-first with live as an opt-in.
