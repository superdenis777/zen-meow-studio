# zen-meow-studio

**MeowChat 2003**: a tiny retro chat room where you talk to three cats.
It's styled like an early-2000s net cafe crossed with Habbo Hotel: pixel fonts, beveled windows, a marquee, and cats that bob at their laptops while they "type."

Live: https://superdenis777.github.io/zen-meow-studio/

## Run it

Open `index.html` in a browser. There's no build step, no server, and no API calls.
(Pixel fonts load from Google Fonts. Offline, it falls back to system fonts and still works.)

## Files

| File | What's in it |
| --- | --- |
| `index.html` | Layout, styles, sprites, the reply engine, the Release card, and audio |
| `personas.js` | The 6-layer framework, each cat's system instructions, signals, and all reply lines (EN + 繁中) |
| `i18n.js` | UI strings, fortunes, grounding rituals, and lucky objects (EN + 繁中) |

## The cats

| Cat | Archetype | Home layer | Voice |
| --- | --- | --- | --- |
| **MOCHI** | Somatic Sage | 0–1 | Slow, soft, body-first. Types slowly on purpose. |
| **NOX** | Structural Detective | 2 | Dry, noir. Cross-examines thoughts, never people. |
| **KIKI** | Subversive Wizard | 3 | Theatrical, paradoxical, reframes everything. |

## How replies work

V2 is still fully scripted. `FRAMEWORK` and each cat's `system` text in `personas.js` are the brief every line was written to, and they're ready to use as a system prompt if a model-backed version comes later.

- Each cat walks its own **arc** through the six layers (0 Unconditioned Baseline → 1 Somatic Ground → 2 Loop De-escalation → 3 Creative Subversion → 4 Sovereign Choice → 5 Real-Life Release). The six lamps under each nameplate show where that cat is on its arc.
- **Signals** in your message jump straight to a layer for that turn: body words go to 1, rumination ("always", "what if", 焦慮…) to 2, feeling stuck to 3, decisions to 4, and goodbyes or thanks to 5.
- When a cat reaches Layer 5, it points you at the **Release** button.
- Replies follow the language you write in: Chinese characters get 繁中 replies, and anything else uses the toggle.
- `{word}` in English lines echoes a word from your message.
- **Safety:** messages about self-harm skip the jokes. The cat answers sincerely and the log shows crisis lines (Taiwan 1925 / 1995 / 1980, findahelpline.com elsewhere).

## Top bar

- **EN / 繁中** switches the whole UI and the cats' language. Your choice is remembered.
- **Sound** is off by default. When on, it plays soft 8-bit key clicks, typing ticks, and a per-cat chime when a reply lands. Everything is synthesized with Web Audio, so there are no audio files.
- **Release / Ground Me** opens a pixel fortune card: a grounding note, a three-step ritual, and a lucky object. "I'm going" dims the room until you come back.
- After 12 minutes, Mochi suggests a break once.
