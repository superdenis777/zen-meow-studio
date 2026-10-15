# zen-meow-studio

**MeowChat 2003**: a tiny retro chat room where you talk to three cats.
It's styled like an early-2000s net cafe crossed with Habbo Hotel: pixel fonts, beveled windows, a marquee, and cats that bob at their laptops while they "type."

Live: https://superdenis777.github.io/zen-meow-studio/

## Run it

Open `index.html` in a browser. There's no build step.
Without the Worker (below), the cats use their built-in scripted replies, so the page always works offline.

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Layout, themes, sprites, chat, Release card, Dissolve box, Notebook, live/local routing |
| `personas.js` | The 6-layer framework, each cat's system instructions, signals, and all scripted lines (EN + 繁中) |
| `i18n.js` | UI strings, fortunes, rituals, and Mochi's dissolve notes (EN + 繁中) |
| `audio.js` | Procedural Web Audio: 8-bit SFX, rain, vinyl, and purr. No audio files. |
| `worker/worker.js` | Cloudflare Worker that turns chat turns into Gemini calls |
| `worker/wrangler.toml` | Worker config |

## The cats

| Cat | Archetype | Home layer | Voice |
| --- | --- | --- | --- |
| **MOCHI** | Somatic Sage | 0–1 | Slow, soft, body-first. Types slowly on purpose. |
| **NOX** | Structural Detective | 2 | Dry, noir. Cross-examines thoughts, never people. |
| **KIKI** | Subversive Wizard | 3 | Theatrical, paradoxical, reframes everything. |

## How a reply is made

1. **The local engine always runs first.** It picks this turn's layer from the cat's arc (0 Unconditioned Baseline → 1 Somatic Ground → 2 Loop De-escalation → 3 Creative Subversion → 4 Sovereign Choice → 5 Real-Life Release). Signals in your message can jump to a layer: body words go to 1, rumination to 2, feeling stuck to 3, decisions to 4, and goodbyes to 5.
2. **In LIVE mode**, the page sends `{ prompt, cat, history, lang, layer }` to the Worker. The Worker builds the system prompt from the framework, that cat's persona, and a hint for this turn's layer, then calls `gemini-3.8-flash` (change it with the `GEMINI_MODEL` variable).
3. **If the Worker is down, slow (9 s), rate-limited, or returns nothing**, the scripted line from step 1 is used. The page then waits 1–2 minutes before trying the Worker again. The taskbar light shows the state: green = live, amber = falling back, grey = local only.
4. **Safety:** messages about self-harm are **never sent** to the Worker. They get a fixed, sincere reply and crisis lines (Taiwan 1925 / 1995 / 1980, findahelpline.com elsewhere).

Clicking **LIVE / LOCAL** in the taskbar switches modes. In local mode nothing leaves the browser.

## Live cats (Cloudflare Worker + Gemini)

```bash
cd worker
npx wrangler login
npx wrangler secret put GEMINI_API_KEY      # paste a key from Google AI Studio
npx wrangler deploy                          # → https://zen-meow-api.<your-subdomain>.workers.dev
```

- If your workers.dev URL differs, update `API_URL` near the top of the script in `index.html`.
- The key only ever lives in the Worker secret. It is never in this repo or the page.
- Only `https://superdenis777.github.io` may call the Worker from a browser. Change `ALLOWED_ORIGINS` in `wrangler.toml` to add origins (add `null` to test from a file opened on disk).
- The client only names a cat, and the Worker owns the prompts, so the endpoint can't be used as a general-purpose Gemini proxy.
- **Recommended:** turn on the per-IP rate limit in `wrangler.toml`. An origin check stops other websites, not scripts.
- `FRAMEWORK` and the cat personas are duplicated in `worker/worker.js` and `personas.js`. Keep them in sync.

### Troubleshooting live cats

If the taskbar light turns amber, the chat log prints the reason once, the light's tooltip shows it, and the browser console logs it too.

1. Open the Worker URL in a browser. It should show `{"ok":true, "model":"gemini-3.8-flash", "keyConfigured":true, "allowedOrigins":["https://superdenis777.github.io"]}`.
   - `keyConfigured: false`: run `npx wrangler secret put GEMINI_API_KEY`.
   - `allowedOrigins` doesn't list the site: fix `ALLOWED_ORIGINS`.
   - A wrong model, or no JSON at all: the deployed code isn't this repo's `worker/worker.js`. Redeploy with `npx wrangler deploy`.
2. Here's what the reasons mean:
   - `network or CORS blocked`: the Worker didn't answer, or the origin isn't allowed.
   - `HTTP 502 … Gemini 404 … not found` or `no longer available to new users`: the model is retired. Google's message names the replacement, so set `GEMINI_MODEL` to it. (`gemini-1.5-*` is gone, and `gemini-2.5-flash` is closed to new keys.)
   - `HTTP 429`: you're over your Gemini quota.
   - `Gemini 503 … high demand`: Google is overloaded. The Worker already retried twice, and the page tries live again after 8 seconds. Setting `GEMINI_FALLBACK_MODEL` gives it a second model to try.
   - `HTTP 503`: no key is configured.
3. `npx wrangler tail` streams the Worker's logs, including Gemini's error messages.

## Top bar

- **EN / 繁中**: switches the whole UI and the cats' language. Cats also reply in whatever language you type.
- **Theme**: Midnight Dial-Up, Sunset CRT (with scanlines), Cyber Matcha, or Rose Quartz.
- **Dissolve Thought**: type a looping worry, press *Release / Dissolve*, and watch it burn into pixel light. Then Mochi says one grounding line. Nothing you type there is saved, logged, or sent.
- **Sound**: the ambience panel, with a volume slider plus toggles for clicks & chimes, soft rain, vinyl hiss & crackle, and cat purr. All of it is synthesized live with Web Audio. It pauses while you've stepped away.
- **Release / Ground Me**: a pixel fortune card with a grounding note, a three-step ritual, and a lucky object. "I'm going" dims the room until you return.

## Zen Notebook

Tap the ☆ on any cat reply or fortune card to save it. Saved cards appear in the **Zen Notebook** window (the taskbar **Notebook** button jumps to it). They're stored in this browser's `localStorage` only.

Settings (language, theme, sound, live/local) are also remembered in `localStorage`.
