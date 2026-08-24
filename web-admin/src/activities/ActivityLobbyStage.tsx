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
 * Shrink the roster until every name fits.
 *
 * The pills were a fixed size inside a clipped box, so past roughly two dozen
 * players the room simply stopped seeing the newest names -- and a student who
 * cannot find their name on the screen concludes they failed to join.
 *
 * Measured rather than guessed from the head count. A count-based guess is
 * really a guess about font metrics and name lengths, and it was wrong the
 * moment either changed: the same thirty-four names that fit on one machine
 * overflowed on another with a different font stack. This asks the browser
 * whether it actually fits, and keeps stepping down until it does.
 */
const useFitRoster = (count: number) => {
  const ref = useRef<HTMLUListElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const roster = ref.current;
    if (!roster) return;

    let cancelled = false;
    let attempt = 1;
    const fit = () => {
      if (cancelled || !ref.current) return;
      const node = ref.current;
      // A floor: below this the names stop being readable from the back of a
      // room, and a scrollbar is a better answer than illegible text.
      if (node.scrollHeight <= node.clientHeight + 1 || attempt >= 14) return;
      attempt += 1;
      setScale(current => Math.max(0.45, current - 0.05));
      requestAnimationFrame(fit);
    };

    // Start from full size on every change, so removing players lets it grow
    // back rather than staying shrunk from a previous crowd.
    setScale(1);
    const frame = requestAnimationFrame(fit);
    return () => { cancelled = true; cancelAnimationFrame(frame); };
  }, [count]);

  // A tuple rather than an object: property access on a wrapper reads to the
  // compiler as touching a ref during render, which this is not.
  return [ref, scale] as const;
};

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
  const [rosterRef, rosterScale] = useFitRoster(players.length);

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
      : <ul
          className="activity-lobby-roster"
          ref={rosterRef}
          style={{ ['--lc-roster-scale' as string]: String(rosterScale) }}
        >
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
