import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  playerUrlFor, healthUrlFor, probeServer, loadServerUrl, saveServerUrl,
  DEFAULT_SERVER_URL, STORAGE_KEY,
} from './serverAddress.ts';

const store = (initial) => {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    values,
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
  };
};

test('the player is loaded from the server that serves it', () => {
  // It fetches with relative URLs, so the origin it is loaded from is the
  // server it talks to. Getting this wrong pairs the TV with nothing.
  assert.equal(playerUrlFor("192.168.4.138"), "http://192.168.4.138/player?kiosk");
  assert.equal(healthUrlFor("192.168.4.138"), "http://192.168.4.138/health");
});

test('an address nobody has set falls back to the local name', async () => {
  assert.equal(await loadServerUrl(store()), DEFAULT_SERVER_URL);
});

test('a saved address comes back normalized', async () => {
  const s = store();
  await saveServerUrl(s, "  HTTP://LessonCue.Local:80/  ");
  assert.equal(s.values.get(STORAGE_KEY), "http://lessoncue.local");
  assert.equal(await loadServerUrl(s), "http://lessoncue.local");
});

test('a stored address that policy now refuses does not strand the television', async () => {
  // Written by an older version, or edited by hand. Falling back beats
  // loading a player over plain HTTP from somewhere public.
  assert.equal(await loadServerUrl(store({ [STORAGE_KEY]: "http://example.org" })), DEFAULT_SERVER_URL);
});

test('saving something that is not an address is refused rather than stored', async () => {
  const s = store();
  await assert.rejects(() => saveServerUrl(s, "http://example.org"), /HTTPS/);
  assert.equal(s.values.get(STORAGE_KEY), undefined);
});

test('a server that answers is reachable', async () => {
  const seen = [];
  const result = await probeServer("10.0.0.5", async url => { seen.push(url); return { ok: true }; });
  assert.deepEqual(result, { reachable: true });
  assert.deepEqual(seen, ["http://10.0.0.5/health"]);
});

test('a server that is slow gives up quickly and says so', async () => {
  const never = (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => {
      const error = new Error("aborted");
      error.name = "AbortError";
      reject(error);
    });
  });
  const started = Date.now();
  const result = await probeServer("10.0.0.5", never, 120);
  assert.equal(result.reachable, false);
  assert.match(result.detail, /did not answer in time/);
  // The point of the short patience: a blank screen for eight seconds is what
  // people report as the app being broken.
  assert.ok(Date.now() - started < 1_000, "the probe waited far longer than it was told to");
});

test('an error status is not reachable', async () => {
  const result = await probeServer("10.0.0.5", async () => ({ ok: false, status: 503 }));
  assert.equal(result.reachable, false);
  assert.match(result.detail, /503/);
});

test('an address that is not an address is reported, not thrown', async () => {
  const result = await probeServer("http://example.org");
  assert.equal(result.reachable, false);
  assert.match(result.detail, /HTTPS/);
});
