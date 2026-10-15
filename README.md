# zen-meow-studio

**MeowChat 2003**: a tiny retro chat room where you talk to three cats.
It's styled like an early-2000s net cafe crossed with Habbo Hotel: pixel fonts, beveled windows, a marquee, and cats that bob at their laptops while they "type."

## Run it

Open `index.html` in a browser. There's no build step, no server, and no API calls.
(Pixel fonts load from Google Fonts. If you're offline, it falls back to monospace and still works.)

## The cats

| Cat | Vibe |
| --- | --- |
| **BYTE.EXE** | Paranoid hacker on dial-up. Trusts no red dot. |
| **LADY MEOWINGTON** | Lobby diva with a bow, pearls and 40 rare furnis. |
| **ZEN GARY** | Sleepy office philosopher with a sprout on his head. |

Click a cat in the Lobby (or a **To:** chip), type, and press Enter. The cat "types" for a moment, bobbing, and then replies in the log and in a speech bubble.

## How replies work

All of this lives in the `CATS` array inside `index.html`:

- `lines`: the cat's general pool, drawn from a shuffle bag so lines don't repeat back to back.
- `triggers`: `{ re, lines }` keyword pools (greetings, food, dogs, questions…). When one matches, it's used about 70% of the time.
- `{word}` in any line is replaced with a random word from your message.

To add a line, append a string. To add a topic, add a trigger. To add a cat, copy an entry and give it a `sprite` patch and a palette.

## Sprites

Cats are text grids (`BASE_CAT`) that get rendered to SVG `<rect>`s. Each character is a palette color and `.` is transparent.
Each cat patches a few rows of the base: Byte gets shades, Lady gets a bow, lashes and pearls, and Gary gets a sprout and closed eyes.
