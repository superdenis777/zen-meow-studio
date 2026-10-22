// Hotel Dada presence: is anyone at the table right now?
//
// POST {room, side, leave?} as text/plain JSON (a simple request, no preflight)
//   → {a: bool, b: bool}: whether each side has checked in during the last FRESH ms.
// GET → health check.
//
// Nothing is stored. Each room is a Durable Object that keeps two timestamps in memory and
// forgets them when Cloudflare puts it to sleep. The room id is a hash made by the page; the
// Worker never sees names or places.
const ROOM = /^[0-9a-f]{32}$/;
const FRESH = 40_000;
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "content-type": "application/json" } });

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    if (request.method === "GET") return json({ ok: true, service: "hotel-dada-presence" });
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);
    const text = await request.text();
    if (text.length > 512) return json({ error: "too large" }, 413);
    let msg;
    try { msg = JSON.parse(text); } catch { return json({ error: "bad json" }, 400); }
    const { room, side, leave } = msg || {};
    if (typeof room !== "string" || !ROOM.test(room) || (side !== "a" && side !== "b")) return json({ error: "bad request" }, 400);
    const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
    const r = await stub.fetch("https://room/", { method: "POST", body: JSON.stringify({ side, leave: !!leave }) });
    return json(await r.json(), r.status);
  },
};

export class Room {
  constructor() { this.seen = { a: 0, b: 0 }; }
  async fetch(request) {
    const { side, leave } = await request.json();
    const now = Date.now();
    this.seen[side] = leave ? 0 : now;
    return Response.json({ a: now - this.seen.a < FRESH, b: now - this.seen.b < FRESH });
  }
}
