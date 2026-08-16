import React, { useEffect, useState } from 'react';
import type { ActivityHostView, ActivityStateEnvelope } from './types';
import { ActivityApi, activityHub } from './api';
import { getActivityDescriptor } from './activityRegistry';
import { QrCode } from '../admin/ui';
import { getAudioVolume, isAudioMuted, setAudioMuted, setAudioVolume } from './effects';
import './activity.css';

export interface ActivityControllerProps {
  runId?: string;
  definitionId?: string;
  initialEnvelope?: ActivityStateEnvelope;
  lessonId?: string;
  lessonItemId?: string;
}

export const ActivityController: React.FC<ActivityControllerProps> = ({
  runId: propRunId,
  definitionId,
  initialEnvelope,
  lessonId,
  lessonItemId
}) => {
  const [envelope, setEnvelope] = useState<ActivityStateEnvelope | null>(initialEnvelope || null);
  const [loading, setLoading] = useState(!initialEnvelope);
  const [error, setError] = useState<string | null>(null);
  const [hostView, setHostView] = useState<ActivityHostView | null>(null);

  const interactiveTypes = ['trivia', 'rapidFire', 'poll', 'prediction', 'surveyBoard', 'buzzer', 'punchline', 'fakeOut', 'drawing', 'ordering', 'word', 'matchPlayer', 'imageReveal', 'stageChallenge', 'bracket', 'physicalRoom', 'utility'];
  const isInteractive = Boolean(envelope && interactiveTypes.includes(envelope.type));

  const fetchRun = async () => {
    try {
      let activeRun: ActivityStateEnvelope | undefined;
      const currentRunId = propRunId || envelope?.runId;
      if (currentRunId) {
        activeRun = await ActivityApi.getRun(currentRunId);
      } else if (definitionId) {
        activeRun = await ActivityApi.getOrCreateRun({
          activityDefinitionId: definitionId,
          lessonId,
          lessonItemId
        });
      }
      if (activeRun) {
        setEnvelope(activeRun);
        setLoading(false);
      }
    } catch (err) {
      console.error('Failed to get activity run for controller:', err);
      setError((err as Error).message);
      setLoading(false);
    }
  };

  const fetchHostView = async (runId: string) => {
    if (!interactiveTypes.includes(envelope?.type || '')) return;
    try {
      setHostView(await ActivityApi.getHostState(runId));
    } catch (err) {
      // Legacy activities and a just-created run may not have a session row yet.
      console.debug('Activity host state is not available yet', err);
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isCancelled = false;

    const connect = async () => {
      try {
        let activeRun = envelope;
        if (!activeRun) {
          if (propRunId) {
            activeRun = await ActivityApi.getRun(propRunId);
          } else if (definitionId) {
            activeRun = await ActivityApi.getOrCreateRun({
              activityDefinitionId: definitionId,
              lessonId,
              lessonItemId
            });
          }
        }

        if (isCancelled || !activeRun) return;
        setEnvelope(activeRun);
        setLoading(false);
        if (interactiveTypes.includes(activeRun.type)) {
          try { setHostView(await ActivityApi.getHostState(activeRun.runId)); } catch (err) { console.debug('Host state pending', err); }
        }

        unsubscribe = await activityHub.subscribeRun(activeRun.runId, updated => {
          if (!isCancelled) {
            setEnvelope(updated);
          }
        });
      } catch (err) {
        if (!isCancelled) {
          setError((err as Error).message);
          setLoading(false);
        }
      }
    };

    connect();

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [propRunId, definitionId, lessonId, lessonItemId]);

  useEffect(() => {
    if (!envelope || !isInteractive) return;
    const timer = window.setInterval(() => { void fetchHostView(envelope.runId); }, 2000);
    return () => window.clearInterval(timer);
  }, [envelope?.runId, envelope?.type, isInteractive]);

  if (loading) {
    return (
      <div style={{ color: '#9ca3af', padding: '1.5rem', textAlign: 'center' }}>
        Connecting to Activity Remote...
      </div>
    );
  }

  if (error || !envelope) {
    return (
      <div style={{ color: '#ef4444', padding: '1.5rem', textAlign: 'center' }}>
        ⚠️ {error || 'Could not connect to activity'}
      </div>
    );
  }

  const descriptor = getActivityDescriptor(envelope.type);
  const ControllerComponent = descriptor.controllerComponent;
  const controllerEnvelope = hostView?.state || envelope;

  return (
    <div style={{ background: 'var(--mint)', border: '1px solid var(--line)', borderRadius: '16px', padding: '0.75rem', width: '100%', boxSizing: 'border-box' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.5rem 0.75rem 0.75rem',
          borderBottom: '1px solid var(--line)',
          marginBottom: '0.75rem'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.4rem' }}>{descriptor.icon}</span>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--ink)' }}>
            {envelope.name || descriptor.name}
          </span>
        </div>
        <div className="activity-controller-header-tools">
          <span
            style={{
              fontSize: '0.75rem',
              padding: '0.2rem 0.6rem',
              borderRadius: '999px',
              background: envelope.status === 'live' ? 'var(--green)' : '#9ca3af',
              color: '#fff',
              fontWeight: 700
            }}
          >
            {envelope.status.toUpperCase()}
          </span>
          <ActivitySoundControls />
        </div>
      </div>

      {isInteractive && hostView && <ActivityHostSessionPanel hostView={hostView} onRefresh={() => fetchHostView(envelope.runId)} />}

      <ControllerComponent
        envelope={controllerEnvelope}
        hostView={hostView}
        onCommandSent={async () => { await fetchRun(); await fetchHostView(envelope.runId); }}
      />
    </div>
  );
};

const ActivitySoundControls: React.FC = () => {
  const [muted, setMuted] = useState(() => isAudioMuted());
  const [volume, setVolume] = useState(() => getAudioVolume());
  const updateMuted = (value: boolean) => {
    setMuted(value);
    setAudioMuted(value);
    try { localStorage.setItem('lessoncue.activityMuted', String(value)); } catch { /* private browsing */ }
  };
  const updateVolume = (value: number) => {
    setVolume(value);
    setAudioVolume(value);
    try { localStorage.setItem('lessoncue.activityVolume', String(value)); } catch { /* private browsing */ }
  };
  useEffect(() => {
    try {
      const storedMuted = localStorage.getItem('lessoncue.activityMuted');
      const storedVolume = Number(localStorage.getItem('lessoncue.activityVolume'));
      if (storedMuted !== null) { const nextMuted = storedMuted === 'true'; setMuted(nextMuted); setAudioMuted(nextMuted); }
      if (Number.isFinite(storedVolume)) { setVolume(storedVolume); setAudioVolume(storedVolume); }
    } catch { /* private browsing */ }
  }, []);
  return <div className="activity-sound-controls" aria-label="Activity sound controls">
    <label><span>Sound</span><input type="range" min="0" max="1" step="0.05" value={muted ? 0 : volume} aria-label="Game sound volume" onChange={event => updateVolume(Number(event.target.value))} /></label>
    <button type="button" className="button" onClick={() => updateMuted(!muted)} aria-pressed={muted}>{muted ? 'Unmute' : 'Mute'}</button>
  </div>;
};

const ActivityHostSessionPanel: React.FC<{ hostView: ActivityHostView; onRefresh: () => void }> = ({ hostView, onRefresh }) => {
  const [busyId, setBusyId] = useState('');
  const [teamBusy, setTeamBusy] = useState(false);
  const [targetBusy, setTargetBusy] = useState(false);
  const pending = hostView.submissions.filter(item => item.moderationStatus === 'pending' && !item.hidden);
  const joinUrl = hostView.joinCode ? `${location.origin}/play/${hostView.joinCode}` : '';
  const currentTargetId = hostView.state.type === 'matchPlayer' && hostView.state.state && typeof hostView.state.state === 'object' ? String((hostView.state.state as Record<string, unknown>).targetParticipantId || '') : '';
  const currentContestantId = hostView.state.type === 'stageChallenge' && hostView.state.state && typeof hostView.state.state === 'object' ? String((hostView.state.state as Record<string, unknown>).selectedParticipantId || '') : '';
  const moderate = async (submissionId: string, status: 'approved' | 'rejected') => {
    setBusyId(submissionId);
    try {
      await ActivityApi.executeCommand(hostView.state.runId, { action: 'moderate', payload: { submissionId, status } });
      onRefresh();
    } finally { setBusyId(''); }
  };
  const createTeams = async (count: number) => {
    setTeamBusy(true);
    try {
      await ActivityApi.setTeams(hostView.state.runId, Array.from({ length: count }, (_, index) => ({ name: `Team ${index + 1}` })));
      onRefresh();
    } finally { setTeamBusy(false); }
  };
  const assignTeam = async (participantId: string, teamId: string) => {
    setTeamBusy(true);
    try { await ActivityApi.assignParticipantTeam(hostView.state.runId, participantId, teamId || null); onRefresh(); }
    finally { setTeamBusy(false); }
  };
  const renameTeam = async (teamId: string, name: string) => {
    const normalized = name.trim();
    if (!normalized) return;
    setTeamBusy(true);
    try { await ActivityApi.renameTeam(hostView.state.runId, teamId, normalized); onRefresh(); }
    finally { setTeamBusy(false); }
  };
  const removeParticipant = async (participantId: string) => {
    setBusyId(`participant:${participantId}`);
    try {
      await ActivityApi.executeCommand(hostView.state.runId, { action: 'removeparticipant', payload: { participantId } });
      onRefresh();
    } finally { setBusyId(''); }
  };
  const renameParticipant = async (participantId: string, displayName: string) => {
    const normalized = displayName.trim();
    if (!normalized) return;
    setBusyId(`participant:${participantId}`);
    try {
      await ActivityApi.executeCommand(hostView.state.runId, { action: 'renameparticipant', payload: { participantId, displayName: normalized } });
      onRefresh();
    } finally { setBusyId(''); }
  };
  const setTarget = async (participantId: string) => {
    if (!participantId) return;
    setTargetBusy(true);
    try { await ActivityApi.executeCommand(hostView.state.runId, { action: 'selecttarget', payload: { participantId } }); onRefresh(); }
    finally { setTargetBusy(false); }
  };
  const setContestant = async (participantId: string) => {
    if (!participantId) return;
    setTargetBusy(true);
    try { await ActivityApi.executeCommand(hostView.state.runId, { action: 'selectcontestant', payload: { participantId } }); onRefresh(); }
    finally { setTargetBusy(false); }
  };
  return (
    <section className="activity-session-panel" aria-label="Game lobby and participants">
      <div className="activity-session-join">
        <div>
          <span className="controller-eyebrow">PHONE LOBBY</span>
          <strong>{hostView.joinCode || 'Preparing code…'}</strong>
          <small>{joinUrl || 'Create a live session to invite players.'}</small>
        </div>
        {joinUrl && <QrCode value={joinUrl} />}
      </div>
      <div className="activity-session-people">
        <div><span className="controller-eyebrow">PLAYERS</span><strong>{hostView.participants.length}</strong></div>
        <div className="activity-session-player-list">{hostView.participants.map(player => <div className="activity-session-player" key={`${player.id}-${player.displayName}`}><label><span>{player.teamId ? `${player.displayName} · team` : player.displayName}</span><input key={`${player.id}-${player.displayName}`} aria-label={`Rename ${player.displayName}`} defaultValue={player.displayName} disabled={busyId === `participant:${player.id}`} onBlur={event => void renameParticipant(player.id, event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} /></label><button type="button" className="button danger" disabled={busyId === `participant:${player.id}`} onClick={() => void removeParticipant(player.id)}>Remove</button></div>)}{!hostView.participants.length && <span className="muted">Waiting for players to join…</span>}</div>
        <div className="activity-team-tools"><strong>Teams</strong>{hostView.teams.length === 0 ? <><button className="button" disabled={teamBusy} onClick={() => createTeams(2)}>2 teams</button><button className="button" disabled={teamBusy} onClick={() => createTeams(3)}>3 teams</button></> : <><div className="activity-team-name-list">{hostView.teams.map(team => <label key={`${team.id}-${team.name}`}><span>{team.icon} Rename {team.name}</span><input key={`${team.id}-${team.name}`} aria-label={`Rename ${team.name}`} defaultValue={team.name} disabled={teamBusy} onBlur={event => void renameTeam(team.id, event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} /></label>)}</div>{hostView.participants.map(player => <label key={player.id}><span>{player.displayName}</span><select disabled={teamBusy} value={player.teamId || ''} onChange={event => assignTeam(player.id, event.target.value)}><option value="">No team</option>{hostView.teams.map(team => <option key={team.id} value={team.id}>{team.icon} {team.name}</option>)}</select></label>)}</>}</div>
        {hostView.state.type === 'matchPlayer' && <div className="activity-match-target-tools"><strong>Match Minds target</strong><div><select aria-label="Target player" disabled={targetBusy || !hostView.participants.length} value={currentTargetId} onChange={event => void setTarget(event.target.value)}><option value="">Choose a player…</option>{hostView.participants.map(player => <option key={player.id} value={player.id}>{player.displayName}</option>)}</select>{currentTargetId && <span className="muted">Target selected for this round.</span>}</div></div>}
        {hostView.state.type === 'stageChallenge' && <div className="activity-match-target-tools"><strong>Beat the Clock contestant</strong><div><select aria-label="Contestant" disabled={targetBusy || !hostView.participants.length} value={currentContestantId} onChange={event => void setContestant(event.target.value)}><option value="">Choose a contestant…</option>{hostView.participants.map(player => <option key={player.id} value={player.id}>{player.displayName}</option>)}</select>{currentContestantId && <span className="muted">Contestant selected for this challenge.</span>}</div></div>}
      </div>
      {pending.length > 0 && <div className="activity-moderation-strip"><strong>{pending.length} response{pending.length === 1 ? '' : 's'} waiting for approval</strong>{pending.slice(0, 3).map(item => { const preview = typeof item.payload.text === 'string' ? item.payload.text : Array.isArray(item.payload.words) ? item.payload.words.join(', ') : Array.isArray(item.payload.strokes) ? 'Drawing submission' : 'Response'; return <div key={item.id} className="activity-moderation-item"><span>{preview}</span><button className="button" disabled={busyId === item.id} onClick={() => moderate(item.id, 'approved')}>Approve</button><button className="button danger" disabled={busyId === item.id} onClick={() => moderate(item.id, 'rejected')}>Hide</button></div>; })}</div>}
    </section>
  );
};
