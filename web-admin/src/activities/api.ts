import * as signalR from '@microsoft/signalr';
import { api } from '../admin/api';
import type {
  ActivityDefinition,
  ActivityStateEnvelope,
  ActivityCommandEnvelope,
  ActivityCommandResult,
  ActivityRunCreateInput,
  ActivitySessionPublicView,
  ActivityParticipantView,
  ActivityHostView,
  ActivityDefinitionPage
} from './types';

export class ActivityApi {
  static async listActivities(type?: string, search?: string, includeArchived?: boolean): Promise<ActivityDefinition[]> {
    const params = new URLSearchParams();
    if (type) params.set('type', type);
    if (search) params.set('search', search);
    if (includeArchived) params.set('includeArchived', 'true');
    return api<ActivityDefinition[]>(`/api/v1/activities?${params.toString()}`);
  }

  static async listActivityPage(type?: string, search?: string, includeArchived?: boolean, page = 1, pageSize = 100): Promise<ActivityDefinitionPage> {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (type) params.set('type', type);
    if (search) params.set('search', search);
    if (includeArchived) params.set('includeArchived', 'true');
    return api<ActivityDefinitionPage>(`/api/v1/activities/library?${params.toString()}`);
  }

  static async getActivity(id: string): Promise<ActivityDefinition> {
    return api<ActivityDefinition>(`/api/v1/activities/${id}`);
  }

  static async createActivity(input: Partial<ActivityDefinition>): Promise<ActivityDefinition> {
    return api<ActivityDefinition>('/api/v1/activities', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  static async updateActivity(id: string, input: Partial<ActivityDefinition>): Promise<ActivityDefinition> {
    return api<ActivityDefinition>(`/api/v1/activities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    });
  }

  static async deleteActivity(id: string): Promise<void> {
    return api<void>(`/api/v1/activities/${id}`, { method: 'DELETE' });
  }

  static async bulkDeleteActivities(ids: string[]): Promise<{ deletedIds: string[]; archivedIds: string[]; missingIds: string[] }> {
    return api<{ deletedIds: string[]; archivedIds: string[]; missingIds: string[] }>('/api/v1/activities/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
  }

  static async bulkArchiveActivities(ids: string[]): Promise<{ deletedIds: string[]; archivedIds: string[]; missingIds: string[] }> {
    return api<{ deletedIds: string[]; archivedIds: string[]; missingIds: string[] }>('/api/v1/activities/bulk-archive', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
  }

  static async bulkRestoreActivities(ids: string[]): Promise<{ restoredIds: string[]; missingIds: string[] }> {
    return api<{ restoredIds: string[]; missingIds: string[] }>('/api/v1/activities/bulk-restore', {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
  }

  static async bulkDuplicateActivities(ids: string[], nameSuffix = ' (Copy)'): Promise<ActivityDefinition[]> {
    return api<ActivityDefinition[]>('/api/v1/activities/bulk-duplicate', {
      method: 'POST',
      body: JSON.stringify({ ids, nameSuffix })
    });
  }

  static async restoreActivity(id: string): Promise<void> {
    return api<void>(`/api/v1/activities/${id}/restore`, { method: 'POST', body: '{}' });
  }

  static async reorderActivities(ids: string[]): Promise<void> {
    return api<void>('/api/v1/activities/library-order', {
      method: 'PUT',
      body: JSON.stringify({ ids })
    });
  }

  static async duplicateActivity(id: string, name?: string): Promise<ActivityDefinition> {
    return api<ActivityDefinition>(`/api/v1/activities/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name })
    });
  }

  static async getOrCreateRun(input: ActivityRunCreateInput): Promise<ActivityStateEnvelope> {
    return api<ActivityStateEnvelope>('/api/v1/activity-runs', {
      method: 'POST',
      body: JSON.stringify(input)
    });
  }

  static async getRun(runId: string): Promise<ActivityStateEnvelope> {
    return api<ActivityStateEnvelope>(`/api/v1/activity-runs/${runId}`);
  }

  static async executeCommand(runId: string, command: ActivityCommandEnvelope): Promise<ActivityCommandResult> {
    const action = command.action.trim();
    try {
      const result = await api<ActivityCommandResult>(`/api/v1/activity-runs/${runId}/command`, {
        method: 'POST',
        body: JSON.stringify(command)
      });
      notifyActivityCommandLifecycle({
        runId,
        action,
        outcome: result.success === false ? 'failed' : 'succeeded',
        revision: result.revision,
        message: result.error || undefined
      });
      return result;
    } catch (error) {
      notifyActivityCommandLifecycle({
        runId,
        action,
        outcome: 'failed',
        message: error instanceof Error ? error.message : 'The command could not be completed.'
      });
      throw error;
    }
  }

  static async resetRun(runId: string): Promise<ActivityStateEnvelope> {
    return api<ActivityStateEnvelope>(`/api/v1/activity-runs/${runId}/reset`, { method: 'POST', body: '{}' });
  }

  static async endRun(runId: string): Promise<ActivityStateEnvelope> {
    return api<ActivityStateEnvelope>(`/api/v1/activity-runs/${runId}/end`, { method: 'POST', body: '{}' });
  }

  static async getPublicSession(code: string): Promise<ActivitySessionPublicView> {
    return api<ActivitySessionPublicView>(`/api/v1/activity-sessions/join/${encodeURIComponent(code)}`);
  }

  static async joinSession(code: string, participantToken?: string, displayName?: string): Promise<{ token: string; participant: ActivityParticipantView }> {
    return api<{ token: string; participant: ActivityParticipantView }>(`/api/v1/activity-sessions/join/${encodeURIComponent(code)}`, {
      method: 'POST',
      body: JSON.stringify({ participantToken: participantToken || null, displayName: displayName || null })
    });
  }

  static async getParticipantState(runId: string, participantToken: string): Promise<ActivityParticipantView> {
    return api<ActivityParticipantView>(`/api/v1/activity-sessions/${runId}/participant-state?participantToken=${encodeURIComponent(participantToken)}`);
  }

  static async participantAction(runId: string, participantToken: string, action: string, payload?: Record<string, unknown>): Promise<ActivityCommandResult> {
    return api<ActivityCommandResult>(`/api/v1/activity-sessions/${runId}/participant-action`, {
      method: 'POST',
      body: JSON.stringify({ participantToken, action, payload: payload || null })
    });
  }

  static async getHostState(runId: string): Promise<ActivityHostView> {
    return api<ActivityHostView>(`/api/v1/activity-sessions/${runId}/host-state`);
  }

  static async setTeams(runId: string, teams: Array<{ name: string; color?: string; icon?: string }>): Promise<void> {
    return api<void>(`/api/v1/activity-sessions/${runId}/teams`, { method: 'PUT', body: JSON.stringify(teams) });
  }

  static async renameTeam(runId: string, teamId: string, name: string): Promise<void> {
    return api<void>(`/api/v1/activity-sessions/${runId}/teams/${teamId}`, { method: 'PUT', body: JSON.stringify({ name }) });
  }

  static async assignParticipantTeam(runId: string, participantId: string, teamId?: string | null): Promise<void> {
    return api<void>(`/api/v1/activity-sessions/${runId}/participants/team`, { method: 'POST', body: JSON.stringify({ participantId, teamId: teamId || null }) });
  }

  static async importBracketFinalists(runId: string, sourceRunId: string, limit?: number): Promise<{ imported: number; sourceRunId: string }> {
    return api<{ imported: number; sourceRunId: string }>(`/api/v1/activity-sessions/${runId}/bracket-finalists`, {
      method: 'POST',
      body: JSON.stringify({ sourceRunId, limit: limit || null })
    });
  }
}

export type ActivityCommandLifecycle = {
  runId: string;
  action: string;
  outcome: 'succeeded' | 'failed';
  revision?: number;
  message?: string;
};

type ActivityCommandLifecycleCallback = (event: ActivityCommandLifecycle) => void;
const activityCommandLifecycleSubscribers = new Set<ActivityCommandLifecycleCallback>();

export const subscribeActivityCommandLifecycle = (callback: ActivityCommandLifecycleCallback): (() => void) => {
  activityCommandLifecycleSubscribers.add(callback);
  return () => activityCommandLifecycleSubscribers.delete(callback);
};

const notifyActivityCommandLifecycle = (event: ActivityCommandLifecycle) => {
  activityCommandLifecycleSubscribers.forEach(callback => {
    try { callback(event); } catch (error) { void error; }
  });
};

export type StateUpdateCallback = (envelope: ActivityStateEnvelope) => void;

export type ActivityConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
type ActivityConnectionCallback = (state: ActivityConnectionState) => void;

export class ActivityHubClient {
  private connection: signalR.HubConnection | null = null;
  private currentRunId: string | null = null;
  private subscribers = new Set<StateUpdateCallback>();
  private connectionSubscribers = new Set<ActivityConnectionCallback>();
  private isConnecting = false;
  private connectionState: ActivityConnectionState = 'disconnected';

  constructor() {
    this.initConnection();
  }

  private initConnection() {
    this.connection = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/activities')
      .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    const handleStateUpdate = (envelope: ActivityStateEnvelope) => {
      this.notifySubscribers(envelope);
    };

    // ActivityService broadcasts ReceiveState. Keep the older event name as a
    // compatibility listener for already-running servers during upgrades.
    this.connection.on('ReceiveState', handleStateUpdate);
    this.connection.on('ActivityStateUpdated', handleStateUpdate);

    this.connection.onreconnecting(() => {
      this.setConnectionState('reconnecting');
    });

    this.connection.onreconnected(() => {
      this.setConnectionState('connected');
      if (this.currentRunId && this.connection?.state === signalR.HubConnectionState.Connected) {
        this.connection.invoke('JoinRun', this.currentRunId).catch(() => {});
      }
    });

    this.connection.onclose(() => {
      this.setConnectionState('disconnected');
    });
  }

  private setConnectionState(state: ActivityConnectionState) {
    this.connectionState = state;
    this.connectionSubscribers.forEach(callback => {
      try { callback(state); } catch (error) { void error; }
    });
  }

  subscribeConnectionStatus(callback: ActivityConnectionCallback): () => void {
    this.connectionSubscribers.add(callback);
    callback(this.connectionState);
    return () => this.connectionSubscribers.delete(callback);
  }

  private notifySubscribers(envelope: ActivityStateEnvelope) {
    this.subscribers.forEach(cb => {
      try { cb(envelope); } catch (err) { void err; }
    });
  }

  async subscribeRun(runId: string, callback: StateUpdateCallback): Promise<() => void> {
    this.subscribers.add(callback);

    if (this.currentRunId !== runId) {
      if (this.currentRunId && this.connection?.state === signalR.HubConnectionState.Connected) {
        try { await this.connection.invoke('LeaveRun', this.currentRunId); } catch (err) { void err; }
      }
      this.currentRunId = runId;
    }

    if (this.connection?.state === signalR.HubConnectionState.Disconnected && !this.isConnecting) {
      this.isConnecting = true;
      this.setConnectionState('connecting');
      try {
        await this.connection.start();
        this.setConnectionState('connected');
        if (this.currentRunId) {
          await this.connection.invoke('JoinRun', this.currentRunId);
        }
      } catch (err) {
        console.warn('SignalR activity connection failed, fallback to polling:', err);
        this.setConnectionState('disconnected');
      } finally {
        this.isConnecting = false;
      }
    } else if (this.connection?.state === signalR.HubConnectionState.Connected && this.currentRunId) {
      try {
        await this.connection.invoke('JoinRun', this.currentRunId);
      } catch (err) { void err; }
    }

    return () => {
      this.subscribers.delete(callback);
      if (this.subscribers.size === 0 && this.currentRunId && this.connection?.state === signalR.HubConnectionState.Connected) {
        this.connection.invoke('LeaveRun', this.currentRunId).catch(() => {});
        this.currentRunId = null;
      }
    };
  }

  async stop(): Promise<void> {
    if (this.connection) {
      try {
        await this.connection.stop();
      } catch (err) { void err; }
    }
  }
}

export const activityHub = new ActivityHubClient();
