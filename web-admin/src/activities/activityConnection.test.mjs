import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ActivityHubClient, latestActivityEnvelope } from './activityConnection.ts';
import { createRefreshLoop } from './refreshLoop.ts';

const flush = () => new Promise(resolve => setImmediate(resolve));
const state = (runId, revision) => ({ runId, revision, serverTime: new Date().toISOString() });
test('a slow polling snapshot cannot undo a newer pushed revision', () => {
  const current = state('game', 3);
  assert.equal(latestActivityEnvelope(current, state('game', 2)), current);
  assert.equal(latestActivityEnvelope(current, state('next-game', 1)).runId, 'next-game');
});
class Transport {
  state = 'Disconnected';
  starts = 0;
  stops = 0;
  calls = [];
  events = {};
  failStart = false;
  async start() {
    this.starts++;
    if (this.failStart) { this.failStart = false; throw new Error('Wi-Fi unavailable'); }
    this.state = 'Connected';
  }
  async stop() { this.stops++; this.state = 'Disconnected'; this.closed?.(); }
  async invoke(method, id) { this.calls.push([method, id]); }
  on(name, callback) { this.events[name] = callback; }
  onreconnecting(callback) { this.reconnecting = callback; }
  onreconnected(callback) { this.reconnected = callback; }
  onclose(callback) { this.closed = callback; }
}

test('phones retry initial connection failures and exhausted reconnects', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new Transport();
  transport.failStart = true;
  let revision = 1;
  const received = [];
  const hub = new ActivityHubClient(transport, async id => state(id, revision));
  const unsubscribe = hub.subscribeRun('game', value => received.push(value.revision));
  await flush();
  assert.equal(transport.starts, 1);
  t.mock.timers.tick(5000);
  await flush();
  assert.deepEqual(received, [1]);
  revision = 4;
  transport.state = 'Disconnected';
  transport.closed();
  t.mock.timers.tick(5000);
  await flush();
  assert.deepEqual(received, [1, 4]);
  unsubscribe();
  t.mock.timers.tick(1000);
  await flush();
  assert.equal(transport.stops, 1);
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(transport.starts, 3, 'an unused hub must stop retrying');
});

test('subscriptions are isolated by run and reconnect reconciles missed changes', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new Transport();
  let revision = 1;
  const hub = new ActivityHubClient(transport, async id => state(id, revision));
  const first = [], second = [];
  const stopFirst = hub.subscribeRun('first', value => first.push(value.revision));
  const stopSecond = hub.subscribeRun('second', value => second.push(value.revision));
  await flush();
  transport.events.ReceiveState(state('first', 3));
  transport.events.ReceiveState(state('first', 2));
  assert.deepEqual(first, [1, 3]);
  assert.deepEqual(second, [1]);
  revision = 5;
  transport.reconnecting();
  transport.reconnected();
  await flush();
  assert.deepEqual(first, [1, 3, 5]);
  assert.deepEqual(second, [1, 5]);
  stopFirst(); stopSecond();
  await hub.stop();
});

test('unmounting during a snapshot never leaves a callback behind', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const transport = new Transport();
  let finish;
  const hub = new ActivityHubClient(transport, () => new Promise(resolve => { finish = resolve; }));
  const received = [];
  const stop = hub.subscribeRun('game', value => received.push(value));
  await flush();
  stop();
  finish(state('game', 1));
  await flush();
  transport.events.ReceiveState(state('game', 2));
  assert.deepEqual(received, []);
  await hub.stop();
});

test('slow refreshes are coalesced and stopping aborts the pending request', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const requests = [];
  const loop = createRefreshLoop(signal => new Promise(resolve => { requests.push({ signal, resolve }); }), () => 2000);
  const pending = loop.refresh();
  await flush();
  for (let i = 0; i < 30; i++) void loop.refresh();
  assert.equal(requests.length, 1);
  requests[0].resolve();
  await flush();
  assert.equal(requests.length, 2);
  loop.stop();
  assert.equal(requests[1].signal.aborted, true);
  requests[1].resolve();
  await pending;
  t.mock.timers.tick(60000);
  await flush();
  assert.equal(requests.length, 2);
});
