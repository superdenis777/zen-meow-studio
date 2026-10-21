# Kitty Café — plan (handoff from brainstorm)

## Vision
Overhaul MeowChat into a **kitty café**: the cats (Mochi, Nox, Kiki) work the space.
Each has its own personality and its own *job*, but they do whatever is necessary
based on what happens in the room. Max **4 humans**, at **one table of 4**.
The rules of engagement are deliberately **a little weird and awkward**, like a real café.

## Order of work
1. **Local simulation first**, no real users. Run the café on **Ollama** (free, local)
   to prove the architecture: events, cat jobs, reactions, turn-taking, awkwardness rules.
2. Tune the **personas** against Gemini later, in short deliberate sessions.
3. Go online last (shared room for 4 humans; Cloudflare Durable Objects + WebSockets fits).

## Architecture decisions so far
- **Body / voice split.** Cat behaviour (needs, job, mood, position) is local rules,
  free, runs forever. The model only *speaks*, and only at moments that matter.
  Same invariant as today: local engine decides, the model supplies words.
- **One model interface, swappable backends:** `ollama` (localhost:11434), `gemini`
  (the Worker), `fake` (canned replies for tests/CI). Café code never knows which.
- Prefer **Gemma** on Ollama: closest open cousin of Gemini, so personas transfer better.
- **Seeded, replayable runs**, so a weird afternoon can be replayed exactly.
- **Readable café log** (`14:02 Kiki knocks a spoon off the table`) explaining *why*.
- **Scripted fake customers** (shy, chatty, rude, just-wants-coffee) fill the 4 seats.
- Fast-forward scripted time; slow down only when a cat speaks (local models are slow).
- Keep the existing invariants from CLAUDE.md (crisis replies never leave the browser,
  `textContent` only, Worker owns prompts).

## Budget
Gemini credit is below NT$150 and draining because people are using the live site.
To do soon: make live mode opt-in and/or add a per-visitor daily cap on the current site.

## Open questions for Denis
- Which machine runs Ollama (decides model size: ~8 GB RAM for an 8B model)?
- Concrete examples of the "awkward" moments he pictures.
- Does the current 1:1 chat get replaced, or become one corner of the café?
- Each cat's job.
