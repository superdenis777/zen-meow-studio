// The Hotel Dada presence Worker, run in Node with an in-memory stand-in for Durable Objects.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker, { Room } from "../presence/worker.js";

export function fakeEnv() {
  const rooms = new Map();
  return {
    ROOMS: {
      idFromName: name => name,
      get: id => {
        if (!rooms.has(id)) rooms.set(id, new Room());
        const room = rooms.get(id);
        return { fetch: (url, init) => room.fetch(new Request(url, init)) };
      },
    },
  };
}
const ROOM = "0123456789abcdef0123456789abcdef";
const post = (env, body) => worker.fetch(new Request("https://p/", { method: "POST", body: JSON.stringify(body) }), env);

test("health check answers GET", async () => {
  const r = await worker.fetch(new Request("https://p/"), fakeEnv());
  assert.equal(r.status, 200);
  assert.equal((await r.json()).ok, true);
});

test("each side sees the other once both have checked in", async () => {
  const env = fakeEnv();
  assert.deepEqual(await (await post(env, { room: ROOM, side: "a" })).json(), { a: true, b: false });
  assert.deepEqual(await (await post(env, { room: ROOM, side: "b" })).json(), { a: true, b: true });
});

test("leaving clears a side at once", async () => {
  const env = fakeEnv();
  await post(env, { room: ROOM, side: "a" });
  await post(env, { room: ROOM, side: "b", leave: true });
  assert.deepEqual(await (await post(env, { room: ROOM, side: "a" })).json(), { a: true, b: false });
});

test("rooms are separate", async () => {
  const env = fakeEnv();
  await post(env, { room: ROOM, side: "a" });
  assert.deepEqual(await (await post(env, { room: "f".repeat(32), side: "b" })).json(), { a: false, b: true });
});

test("rejects bad input and allows any origin", async () => {
  const env = fakeEnv();
  for (const body of [{ room: "nope", side: "a" }, { room: ROOM, side: "c" }, { room: ROOM }])
    assert.equal((await post(env, body)).status, 400);
  const r = await worker.fetch(new Request("https://p/", { method: "POST", body: "{" }), env);
  assert.equal(r.status, 400);
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  assert.equal((await post(env, { room: ROOM, side: "a", pad: "x".repeat(600) })).status, 413);
});
