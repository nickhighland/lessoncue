import React, { useState } from 'react';
import type { ActivityHostView } from './types';
import { ActivityApi } from './api';
import { ActivityQr, readableJoinAddress } from './ActivityJoin';
import { inkOnPlayerColor } from './activityIdentity';
import { hostStepFor, useAutoAdvanceCountdown } from './ActivityHostFlow';

/**
 * What the host needs while a round is actually live.
 *
 * The console previously showed none of this: no join code once setup was
 * closed, no way to see who had joined, and no idea how many had answered — so
 * the only way to know whether to close the window was to ask the room out
 * loud.
 */

const textOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;

export const ActivityLiveHostPanel: React.FC<{
  hostView: ActivityHostView;
  onRefresh: () => void;
}> = ({ hostView, onRefresh }) => {
  const [busy, setBusy] = useState('');
  const state = (hostView.state.state || {}) as Record<string, unknown>;
  const phase = textOf(state.phase, 'lobby');
  const roundId = textOf(state.currentRoundId) || undefined;

  const players = hostView.participants.filter(player => player.status !== 'removed');
  const activePlayers = players.filter(player => player.status === 'active');
  // A class can be forty phones. Past a couple of dozen, picking one person out
  // of the roster by eye stops working, which matters most when the reason you
  // are looking is that they need removing.
  const [rosterFilter, setRosterFilter] = useState('');
  const FILTER_FROM = 12;
  const needle = rosterFilter.trim().toLowerCase();
  const shownPlayers = needle
    ? players.filter(player => player.displayName.toLowerCase().includes(needle))
    : players;
  // A player counts as in once they have submitted or voted this round.
  const answeredIds = new Set<string>([
    ...hostView.submissions.filter(item => !roundId || item.roundId === roundId).map(item => item.participantId),
    ...hostView.votes.filter(item => !roundId || item.roundId === roundId).map(item => item.voterParticipantId),
  ]);
  const answered = activePlayers.filter(player => answeredIds.has(player.id)).length;
  const collecting = phase === 'acceptingResponses' || phase === 'voting' || phase === 'prompt';

  const joinCode = hostView.joinCode || '';
  const joinUrl = hostView.joinUrl || '';
  const address = joinUrl ? readableJoinAddress(joinUrl, joinCode) : '';

  // Engines where a head count is meaningful; mirrors SupportsAutoAdvance.
  const autoAdvanceEngines = ['trivia', 'rapidFire', 'poll', 'prediction', 'punchline', 'fakeOut', 'drawing', 'ordering', 'matchPlayer'];
  const supportsAutoAdvance = autoAdvanceEngines.includes(hostView.state.type);
  const autoAdvance = state.autoAdvanceEnabled === true;

  // Anonymous work waiting on a decision. This is the only thing the host must
  // act on, so it belongs in the live panel rather than behind setup — that
  // gating is why drawings and answers appeared never to reach the host.
  const pending = hostView.submissions.filter(item => item.moderationStatus === 'pending' && !item.hidden);
  const autoPaused = state.autoPaused === true;
  const blockedReason = textOf(state.autoBlockedReason) || undefined;
  const step = hostStepFor(phase, pending.length, autoPaused, blockedReason);
  const countdown = useAutoAdvanceCountdown(state.autoAdvanceAt, autoPaused || pending.length > 0);

  // A lock is reversible, so a teacher can handle a disruptive or shared
  // device without destroying the player's identity and score history.
  const setPlayerLock = async (participantId: string, displayName: string, locked: boolean) => {
    if (locked && !window.confirm(`Lock ${displayName} out of the game?\n\nTheir phone will stop receiving prompts until you unlock them.`)) return;
    const action = locked ? 'lockparticipant' : 'unlockparticipant';
    setBusy(`${action}:${participantId}`);
    try {
      await ActivityApi.executeCommand(hostView.state.runId, { action, payload: { participantId } });
      onRefresh();
    } finally { setBusy(''); }
  };

  const resetPlayers = async () => {
    if (!window.confirm('Reset all players?\n\nEveryone will need to join again with the new code. Scores and the old player tokens will no longer be used for this lobby.')) return;
    setBusy('resetplayers');
    try {
      await ActivityApi.executeCommand(hostView.state.runId, { action: 'resetplayers' });
      onRefresh();
    } finally { setBusy(''); }
  };

  const send = async (action: string, label: string) => {
    setBusy(label);
    try {
      await ActivityApi.executeCommand(hostView.state.runId, { action });
      onRefresh();
    } finally { setBusy(''); }
  };

  const moderate = async (submissionId: string, status: 'approved' | 'rejected') => {
    setBusy(submissionId);
    try {
      await ActivityApi.executeCommand(hostView.state.runId, { action: 'moderate', payload: { submissionId, status } });
      onRefresh();
    } finally { setBusy(''); }
  };

  return <section className="activity-live-host" aria-label="Live game controls">
    {joinCode && <div className="activity-live-host-join">
      {joinUrl && <ActivityQr value={joinUrl} size={92} label={`Scan to join at ${address}`} />}
      <div>
        <span className="controller-eyebrow">PLAYERS JOIN AT</span>
        <strong>{joinCode}</strong>
        {address && <small>{address}</small>}
      </div>
    </div>}

    <div className="activity-live-host-progress">
      <div className="activity-live-host-progress-head">
        <span className="controller-eyebrow">{collecting ? 'ANSWERS IN' : 'PLAYERS'}</span>
        <strong>{collecting ? `${answered} of ${activePlayers.length}` : String(players.length)}</strong>
      </div>
      {collecting && activePlayers.length > 0 && <div
        className="activity-live-host-meter"
        role="progressbar"
        aria-valuenow={answered}
        aria-valuemin={0}
        aria-valuemax={activePlayers.length}
        aria-label="Players who have answered"
      >
        <i style={{ width: `${Math.round(answered / activePlayers.length * 100)}%` }} />
      </div>}
      {players.length === 0
        ? <p className="muted">No phones have joined yet.</p>
        : <>
          {players.length >= FILTER_FROM && <input
            type="search"
            className="activity-live-host-filter"
            value={rosterFilter}
            placeholder={`Find someone in ${players.length}…`}
            aria-label="Find a player in the roster"
            onChange={event => setRosterFilter(event.target.value)}
          />}
          {needle && shownPlayers.length === 0 && <p className="activity-live-host-empty">Nobody here matches “{rosterFilter.trim()}”.</p>}
          <ul className="activity-live-host-roster">
            {shownPlayers.map(player => {
              const isIn = answeredIds.has(player.id);
              return <li key={player.id} className={isIn ? 'answered' : ''}>
                <span
                  className="activity-live-host-avatar"
                  style={{ background: player.color || '#f6c531', color: inkOnPlayerColor(player.color || '#f6c531') }}
                  aria-hidden="true"
                >{player.avatar || '🙂'}</span>
                <b>{player.displayName}</b>
                {player.status === 'locked'
                  ? <span className="activity-live-host-locked" role="status">Locked</span>
                  : collecting && <span className="activity-live-host-tick" aria-label={isIn ? 'Answered' : 'Still answering'}>{isIn ? '✓' : '…'}</span>}
                <button
                  type="button"
                  className="activity-live-host-lock"
                  aria-label={`${player.status === 'locked' ? 'Unlock' : 'Lock'} ${player.displayName}`}
                  title={player.status === 'locked' ? 'Unlock player' : 'Lock player out'}
                  disabled={busy !== ''}
                  onClick={() => void setPlayerLock(player.id, player.displayName, player.status !== 'locked')}
                >{player.status === 'locked' ? '🔓' : '🔒'}</button>
              </li>;
            })}
          </ul>
        </>}
    </div>

    <div className="activity-live-host-step">
      <div>
        <span className="controller-eyebrow">{step.needsHost ? 'YOUR MOVE' : 'RUNNING ITSELF'}</span>
        <strong>{step.label}</strong>
        <small>{step.detail}</small>
      </div>
      {step.action
        ? <button
            type="button"
            className="button primary"
            disabled={busy !== ''}
            onClick={() => void send(step.action!, 'step')}
          >{busy === 'step' ? 'Working…' : step.label}</button>
        : countdown !== null
          ? <span className="activity-live-host-countdown" role="status" aria-live="off">
              Next in {countdown}s
            </span>
          : null}
    </div>

    {pending.length > 0 && <div className="activity-live-host-moderation">
      {pending.map(item => {
        const payload = item.payload as Record<string, unknown>;
        const preview = typeof payload.text === 'string' ? payload.text
          : Array.isArray(payload.words) ? (payload.words as string[]).join(', ')
          : Array.isArray(payload.strokes) ? 'Drawing'
          : 'Response';
        return <div key={item.id} className="activity-live-host-moderation-item">
          <span>{preview}</span>
          <button type="button" className="button" disabled={busy !== ''} onClick={() => void moderate(item.id, 'approved')}>Approve</button>
          <button type="button" className="button danger" disabled={busy !== ''} onClick={() => void moderate(item.id, 'rejected')}>Hide</button>
        </div>;
      })}
    </div>}

    <div className="activity-live-host-actions">
      <button
        type="button"
        className="button"
        disabled={busy !== '' || !players.length}
        onClick={() => void send('showleaderboard', 'standings')}
      >{busy === 'standings' ? 'Showing…' : '🏁 Show standings'}</button>

      {phase !== 'lobby' && phase !== 'setup' && <button
        type="button"
        className="button"
        disabled={busy !== ''}
        aria-pressed={autoPaused}
        onClick={() => void send(autoPaused ? 'resume' : 'hold', 'hold')}
      >{autoPaused ? '▶ Resume' : '⏸ Hold'}</button>}

      <button
        type="button"
        className="button danger"
        disabled={busy !== ''}
        onClick={() => void send('resetscores', 'reset')}
      >{busy === 'reset' ? 'Clearing…' : 'Clear scores'}</button>

      <button
        type="button"
        className="button danger"
        disabled={busy !== '' || !players.length}
        onClick={() => void resetPlayers()}
      >{busy === 'resetplayers' ? 'Resetting…' : 'Reset players'}</button>

      {supportsAutoAdvance && <label className="activity-live-host-auto">
        <input
          type="checkbox"
          checked={autoAdvance}
          disabled={busy !== ''}
          onChange={async event => {
            const enabled = event.target.checked;
            setBusy('auto');
            try {
              await ActivityApi.executeCommand(hostView.state.runId, { action: 'autoadvance', payload: { enabled } });
              onRefresh();
            } finally { setBusy(''); }
          }}
        />
        <span>Close the window automatically once everyone has answered</span>
      </label>}
    </div>
  </section>;
};
