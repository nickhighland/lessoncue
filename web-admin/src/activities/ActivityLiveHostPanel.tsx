import React, { useState } from 'react';
import type { ActivityHostView } from './types';
import { ActivityApi } from './api';
import { ActivityQr, readableJoinAddress } from './ActivityJoin';
import { inkOnPlayerColor } from './activityIdentity';

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
  // A player counts as in once they have submitted or voted this round.
  const answeredIds = new Set<string>([
    ...hostView.submissions.filter(item => !roundId || item.roundId === roundId).map(item => item.participantId),
    ...hostView.votes.filter(item => !roundId || item.roundId === roundId).map(item => item.voterParticipantId),
  ]);
  const answered = players.filter(player => answeredIds.has(player.id)).length;
  const collecting = phase === 'acceptingResponses' || phase === 'voting' || phase === 'prompt';

  const joinCode = hostView.joinCode || '';
  const joinUrl = hostView.joinUrl || '';
  const address = joinUrl ? readableJoinAddress(joinUrl, joinCode) : '';

  const send = async (action: string, label: string) => {
    setBusy(label);
    try {
      await ActivityApi.executeCommand(hostView.state.runId, { action });
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
        <strong>{collecting ? `${answered} of ${players.length}` : String(players.length)}</strong>
      </div>
      {collecting && players.length > 0 && <div
        className="activity-live-host-meter"
        role="progressbar"
        aria-valuenow={answered}
        aria-valuemin={0}
        aria-valuemax={players.length}
        aria-label="Players who have answered"
      >
        <i style={{ width: `${Math.round(answered / players.length * 100)}%` }} />
      </div>}
      {players.length === 0
        ? <p className="muted">No phones have joined yet.</p>
        : <ul className="activity-live-host-roster">
            {players.map(player => {
              const isIn = answeredIds.has(player.id);
              return <li key={player.id} className={isIn ? 'answered' : ''}>
                <span
                  className="activity-live-host-avatar"
                  style={{ background: player.color || '#f6c531', color: inkOnPlayerColor(player.color || '#f6c531') }}
                  aria-hidden="true"
                >{player.avatar || '🙂'}</span>
                <b>{player.displayName}</b>
                {collecting && <span className="activity-live-host-tick" aria-label={isIn ? 'Answered' : 'Still answering'}>{isIn ? '✓' : '…'}</span>}
              </li>;
            })}
          </ul>}
    </div>

    <div className="activity-live-host-actions">
      <button
        type="button"
        className="button"
        disabled={busy !== '' || !players.length}
        onClick={() => void send('showleaderboard', 'standings')}
      >{busy === 'standings' ? 'Showing…' : '🏁 Show standings'}</button>
    </div>
  </section>;
};
