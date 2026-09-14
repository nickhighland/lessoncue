import * as signalR from '@microsoft/signalr';
import { ActivityHubClient } from './activityConnection';
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

// The public remote already holds these grants for playback. Scope them to
// hosting requests; never attach them to participant or activity-library APIs.
let controllerHeaders: Record<string, string> | undefined;
export function setActivityControllerHeaders(headers: Record<string, string>) {
  controllerHeaders = headers;
  return () => { if (controllerHeaders === headers) controllerHeaders = undefined; };
}

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

  static async getRun(runId: string, signal?: AbortSignal): Promise<ActivityStateEnvelope> {
    return api<ActivityStateEnvelope>(`/api/v1/activity-runs/${runId}`, { signal });
  }

  static async executeCommand(runId: string, command: ActivityCommandEnvelope): Promise<ActivityCommandResult> {
    const action = command.action.trim();
    try {
      const result = await api<ActivityCommandResult>(`/api/v1/activity-runs/${runId}/command`, {
        method: 'POST',
        headers: controllerHeaders,
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
    return api<ActivityStateEnvelope>(`/api/v1/activity-runs/${runId}/reset`, { method: 'POST', headers: controllerHeaders, body: '{}' });
  }

  static async endRun(runId: string): Promise<ActivityStateEnvelope> {
    return api<ActivityStateEnvelope>(`/api/v1/activity-runs/${runId}/end`, { method: 'POST', headers: controllerHeaders, body: '{}' });
  }

  static async getPublicSession(code: string, signal?: AbortSignal): Promise<ActivitySessionPublicView> {
    return api<ActivitySessionPublicView>(`/api/v1/activity-sessions/join/${encodeURIComponent(code)}`, { signal });
  }

  static async joinSession(code: string, participantToken?: string, displayName?: string, identity?: { avatar?: string; color?: string }, signal?: AbortSignal): Promise<{ token: string; participant: ActivityParticipantView }> {
    return api<{ token: string; participant: ActivityParticipantView }>(`/api/v1/activity-sessions/join/${encodeURIComponent(code)}`, {
      method: 'POST',
      signal,
      body: JSON.stringify({
        participantToken: participantToken || null,
        displayName: displayName || null,
        // The server pins these to its own allowed list.
        avatar: identity?.avatar || null,
        color: identity?.color || null
      })
    });
  }

  static async getParticipantState(runId: string, participantToken: string, signal?: AbortSignal): Promise<ActivityParticipantView> {
    return api<ActivityParticipantView>(`/api/v1/activity-sessions/${runId}/participant-state?participantToken=${encodeURIComponent(participantToken)}`, { signal });
  }

  static async participantAction(runId: string, participantToken: string, action: string, payload?: Record<string, unknown>, signal?: AbortSignal): Promise<ActivityCommandResult> {
    return api<ActivityCommandResult>(`/api/v1/activity-sessions/${runId}/participant-action`, {
      method: 'POST',
      signal,
      body: JSON.stringify({ participantToken, action, payload: payload || null })
    });
  }

  static async getHostState(runId: string, signal?: AbortSignal): Promise<ActivityHostView> {
    return api<ActivityHostView>(`/api/v1/activity-sessions/${runId}/host-state`, { headers: controllerHeaders, signal });
  }

  static async setTeams(runId: string, teams: Array<{ name: string; color?: string; icon?: string }>): Promise<void> {
    return api<void>(`/api/v1/activity-sessions/${runId}/teams`, { method: 'PUT', headers: controllerHeaders, body: JSON.stringify(teams) });
  }

  static async renameTeam(runId: string, teamId: string, name: string): Promise<void> {
    return api<void>(`/api/v1/activity-sessions/${runId}/teams/${teamId}`, { method: 'PUT', headers: controllerHeaders, body: JSON.stringify({ name }) });
  }

  static async assignParticipantTeam(runId: string, participantId: string, teamId?: string | null): Promise<void> {
    return api<void>(`/api/v1/activity-sessions/${runId}/participants/team`, { method: 'POST', headers: controllerHeaders, body: JSON.stringify({ participantId, teamId: teamId || null }) });
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

export type { ActivityConnectionState, StateUpdateCallback } from './activityConnection';
export const activityHub = new ActivityHubClient(
  new signalR.HubConnectionBuilder()
    .withUrl('/hubs/activities')
    .withAutomaticReconnect([0, 1000, 2000, 5000, 10000])
    .configureLogging(signalR.LogLevel.Warning)
    .build(),
  runId => ActivityApi.getRun(runId),
);
