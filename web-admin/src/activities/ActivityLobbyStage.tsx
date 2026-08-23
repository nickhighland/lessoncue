import React, { useEffect, useRef, useState } from 'react';
import { ActivityJoinBanner } from './ActivityJoin';
import { inkOnPlayerColor } from './activityIdentity';
import { playGameSfx } from './audio/gameAudio';

/**
 * The lobby the room looks at while players arrive.
 *
 * The join code and QR dominate, because reading and scanning them is the only
 * thing anyone needs to do here. Players appear one at a time as they join,
 * which is both the confirmation a player wants ("I'm on the screen") and the
 * cue the teacher needs to know when to start.
 */

export interface LobbyPlayer {
  id: string;
  name: string;
  avatar: string;
  color: string;
}

const textOf = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;

export function readRoster(value: unknown): LobbyPlayer[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === 'object')
    .map(entry => ({
      id: textOf(entry.id),
      name: textOf(entry.name, 'Player'),
      avatar: textOf(entry.avatar, '🙂'),
      color: textOf(entry.color, '#f6c531'),
    }))
    .filter(player => player.id);
}

/** Fire the join cue for players who were not on screen a moment ago. */
function useArrivalCue(players: LobbyPlayer[], chain?: string[]): Set<string> {
  const seen = useRef<Set<string>>(new Set());
  const [arriving, setArriving] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fresh = players.filter(player => !seen.current.has(player.id)).map(player => player.id);
    if (!fresh.length) return;
    const first = seen.current.size === 0;
    for (const id of fresh) seen.current.add(id);
    setArriving(new Set(fresh));
    // Silent on the first paint: a display reconnecting mid-lobby should not
    // replay a join sound for everyone already in the room.
    if (!first) playGameSfx('uiButtonLockIn', { chain, pitchJitter: true, volume: 0.7 });
    const timer = window.setTimeout(() => setArriving(new Set()), 900);
    return () => window.clearTimeout(timer);
  }, [chain, players]);

  return arriving;
}

/**
 * How tightly to pack the lobby roster.
 *
 * The pills were a fixed size inside a clipped box, so past roughly two dozen
 * players the room simply stopped seeing the newest names -- and a student who
 * cannot find their name on the screen concludes they failed to join. Shrink
 * with the crowd instead of hiding it.
 */
const rosterSize = (count: number): 'roomy' | 'medium' | 'tight' | 'packed' =>
  count <= 12 ? 'roomy' : count <= 24 ? 'medium' : count <= 40 ? 'tight' : 'packed';

export const ActivityLobbyStage: React.FC<{
  title: string;
  kicker?: string;
  joinCode?: unknown;
  joinUrl?: unknown;
  participantCount?: unknown;
  roster?: unknown;
  /** Shown when nobody has joined yet. */
  hint?: string;
  chain?: string[];
}> = ({ title, kicker, joinCode, joinUrl, participantCount, roster, hint, chain }) => {
  const players = readRoster(roster);
  const arriving = useArrivalCue(players, chain);

  return <section className="activity-lobby-stage" aria-label="Waiting for players">
    <div className="activity-lobby-heading">
      {kicker && <span className="stage-kicker">{kicker}</span>}
      <h1 className="activity-title">{title}</h1>
    </div>

    <ActivityJoinBanner
      joinCode={joinCode}
      joinUrl={joinUrl}
      participantCount={participantCount}
      variant="prominent"
    />

    {players.length === 0
      ? <p className="activity-lobby-empty">{hint || 'Waiting for the first player…'}</p>
      : <ul className="activity-lobby-roster" data-size={rosterSize(players.length)}>
          {players.map(player => <li
            key={player.id}
            className={arriving.has(player.id) ? 'arriving' : ''}
            style={{ ['--lc-player-color' as string]: player.color }}
          >
            <span className="activity-lobby-avatar" style={{ background: player.color, color: inkOnPlayerColor(player.color) }} aria-hidden="true">{player.avatar}</span>
            <b>{player.name}</b>
          </li>)}
        </ul>}
  </section>;
};
