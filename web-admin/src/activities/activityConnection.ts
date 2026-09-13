import type { ActivityStateEnvelope } from './types';

export type ActivityConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type StateUpdateCallback = (envelope: ActivityStateEnvelope) => void;

// A small transport boundary also lets the reconnect races be tested without
// opening real sockets or waiting through SignalR's retry schedule.
export interface ActivityTransport {
  readonly state: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  invoke(method: string, runId: string): Promise<unknown>;
  on(method: string, callback: StateUpdateCallback): void;
  onreconnecting(callback: () => void): void;
  onreconnected(callback: () => void): void;
  onclose(callback: () => void): void;
}

type Subscription = { callbacks: Set<StateUpdateCallback>; revision: number; serverTime: number };

export function latestActivityEnvelope(previous: ActivityStateEnvelope | null, incoming: ActivityStateEnvelope): ActivityStateEnvelope {
  if (previous?.runId !== incoming.runId) return incoming;
  if (previous.revision > incoming.revision || previous.revision === incoming.revision &&
      Date.parse(previous.serverTime) > Date.parse(incoming.serverTime)) return previous;
  return incoming;
}

export class ActivityHubClient {
  private runs = new Map<string, Subscription>();
  private joined = new Set<string>();
  private statusListeners = new Set<(state: ActivityConnectionState) => void>();
  private status: ActivityConnectionState = 'disconnected';
  private connecting?: Promise<void>;
  private stopping?: Promise<void>;
  private retry?: ReturnType<typeof setTimeout>;
  private idle?: ReturnType<typeof setTimeout>;
  private transport: ActivityTransport;
  private snapshot: (runId: string) => Promise<ActivityStateEnvelope>;

  constructor(transport: ActivityTransport, snapshot: (runId: string) => Promise<ActivityStateEnvelope>) {
    this.transport = transport;
    this.snapshot = snapshot;
    const receive = (value: ActivityStateEnvelope) => this.publish(value);
    transport.on('ReceiveState', receive);
    transport.on('ActivityStateUpdated', receive);
    transport.onreconnecting(() => {
      this.joined.clear();
      this.setStatus('reconnecting');
    });
    transport.onreconnected(() => {
      this.joined.clear();
      this.setStatus('connected');
      void this.connect();
    });
    transport.onclose(() => {
      this.joined.clear();
      this.setStatus('disconnected');
      this.scheduleRetry();
    });
  }

  private setStatus(state: ActivityConnectionState) {
    this.status = state;
    for (const callback of this.statusListeners) callback(state);
  }

  subscribeConnectionStatus(callback: (state: ActivityConnectionState) => void): () => void {
    this.statusListeners.add(callback);
    callback(this.status);
    return () => { this.statusListeners.delete(callback); };
  }

  private publish(envelope: ActivityStateEnvelope) {
    const run = this.runs.get(envelope.runId);
    if (!run || envelope.revision < run.revision) return;
    const timestamp = Date.parse(envelope.serverTime) || 0;
    if (envelope.revision === run.revision && timestamp < run.serverTime) return;
    run.revision = envelope.revision;
    run.serverTime = timestamp;
    for (const callback of run.callbacks) {
      try { callback(envelope); } catch { /* one consumer cannot stop another */ }
    }
  }

  private scheduleRetry() {
    if (this.retry || this.runs.size === 0) return;
    this.retry = setTimeout(() => {
      this.retry = undefined;
      void this.connect();
    }, 5000);
  }

  private async join(runId: string, subscription: Subscription) {
    if (!this.joined.has(runId)) {
      await this.transport.invoke('JoinRun', runId);
      if (this.runs.get(runId) !== subscription) return;
      this.joined.add(runId);
    }
    // Catch the gap between the first GET and group membership, including
    // reconnects. The revision check prevents a slow GET undoing a newer push.
    try {
      const value = await this.snapshot(runId);
      if (this.runs.get(runId) === subscription) this.publish(value);
    } catch { /* the surfaces also have bounded polling fallbacks */ }
  }

  private async connect(): Promise<void> {
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      try {
        await this.stopping;
        if (!this.runs.size) return;
        if (this.transport.state === 'Disconnected') {
          this.setStatus('connecting');
          await this.transport.start();
        }
        if (this.transport.state !== 'Connected') return;
        this.setStatus('connected');
        for (const [id, subscription] of this.runs) await this.join(id, subscription);
      } catch {
        this.setStatus('disconnected');
        this.scheduleRetry();
      }
    })();
    try { await this.connecting; }
    finally { this.connecting = undefined; }
  }

  // Cleanup is returned immediately, even when starting the connection fails
  // or stalls. Unmounting can never strand a subscriber behind an awaited GET.
  subscribeRun(runId: string, callback: StateUpdateCallback): () => void {
    clearTimeout(this.idle);
    let subscription = this.runs.get(runId);
    if (!subscription) {
      subscription = { callbacks: new Set(), revision: -1, serverTime: 0 };
      this.runs.set(runId, subscription);
    }
    subscription.callbacks.add(callback);
    void this.connect().then(() => {
      if (this.runs.get(runId) === subscription && !this.joined.has(runId) && this.transport.state === 'Connected')
        void this.connect();
    });
    return () => {
      subscription.callbacks.delete(callback);
      if (subscription.callbacks.size || this.runs.get(runId) !== subscription) return;
      this.runs.delete(runId);
      this.joined.delete(runId);
      if (this.transport.state === 'Connected') void this.transport.invoke('LeaveRun', runId).catch(() => {});
      if (!this.runs.size) {
        clearTimeout(this.retry);
        this.retry = undefined;
        this.idle = setTimeout(() => { if (!this.runs.size) void this.stop(); }, 1000);
      }
    };
  }

  async stop(): Promise<void> {
    clearTimeout(this.retry);
    clearTimeout(this.idle);
    this.retry = undefined;
    this.joined.clear();
    this.stopping = this.transport.stop().catch(() => {});
    await this.stopping;
    this.stopping = undefined;
  }
}
