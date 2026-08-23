import React, { useEffect, useRef, useState } from 'react';
import { inkOnPlayerColor } from './activityIdentity';
import { useCountUp } from './useCountUp';

/**
 * Between-round standings as a race.
 *
 * A ranked list tells the room who is winning; a race shows it. Each player is
 * their own avatar and colour moving along a lane, so gaining points is a
 * visible surge rather than a number quietly changing, and "who is ahead" reads
 * from across the room without anyone parsing a table.
 */

type JsonRecord = Record<string, unknown>;

const listOf = (value: unknown): JsonRecord[] => Array.isArray(value)
  ? value.filter(item => item && typeof item === 'object') as JsonRecord[]
  : [];
const textOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;

export interface RacerEntry {
  id: string;
  name: string;
  score: number;
  rank: number;
  avatar: string;
  color: string;
  streak: number;
}

export function readRacers(value: unknown): RacerEntry[] {
  return listOf(value).map((entry, index) => ({
    id: textOf(entry.id, `racer-${index}`),
    name: textOf(entry.name, 'Player'),
    score: numberOf(entry.score),
    rank: numberOf(entry.rank, index + 1),
    avatar: textOf(entry.avatar, '🙂'),
    color: textOf(entry.color, '#f6c531'),
    streak: numberOf(entry.streak),
  }));
}

/** Flag racers whose score just went up, so their lane can celebrate. */
function useGainers(racers: RacerEntry[]): Set<string> {
  const previous = useRef<Map<string, number>>(new Map());
  const [gainers, setGainers] = useState<Set<string>>(new Set());

  useEffect(() => {
    const before = previous.current;
    const next = new Map(racers.map(racer => [racer.id, racer.score]));
    // First paint is not a gain — a display joining mid-game should not act as
    // though everyone just scored.
    const fresh = before.size === 0
      ? []
      : racers.filter(racer => racer.score > (before.get(racer.id) ?? racer.score)).map(racer => racer.id);
    previous.current = next;
    if (!fresh.length) return;
    setGainers(new Set(fresh));
    const timer = window.setTimeout(() => setGainers(new Set()), 1100);
    return () => window.clearTimeout(timer);
  }, [racers]);

  return gainers;
}

const Lane: React.FC<{ racer: RacerEntry; topScore: number; gained: boolean }> = ({ racer, topScore, gained }) => {
  const score = useCountUp(racer.score);
  // Everyone starts at the line; the leader reaches the far end.
  const progress = topScore > 0 ? Math.max(0, Math.min(1, racer.score / topScore)) : 0;

  return <li
    className={`activity-race-lane ${racer.rank === 1 && racer.score > 0 ? 'leading' : ''} ${gained ? 'gained' : ''}`}
    style={{ ['--lc-racer-color' as string]: racer.color }}
  >
    <span className="activity-race-rank" aria-hidden="true">{racer.rank}</span>
    <div className="activity-race-track">
      <div className="activity-race-runner" style={{ ['--lc-progress' as string]: progress }}>
        <span className="activity-race-avatar" style={{ background: racer.color, color: inkOnPlayerColor(racer.color) }} aria-hidden="true">{racer.avatar}</span>
        <b className="activity-race-score">{score.toLocaleString()}</b>
      </div>
    </div>
    <span className="activity-race-name">
      {racer.name}
      {racer.streak >= 2 && <b className="activity-race-streak" title={`${racer.streak} in a row`}>🔥{racer.streak}</b>}
    </span>
  </li>;
};

export const ActivityScoreRace: React.FC<{
  state: JsonRecord;
  limit?: number;
  title?: string;
}> = ({ state, limit, title = 'STANDINGS' }) => {
  const everyone = readRacers(state.leaderboard);
  // Lanes have to stay readable from the back of a room, so a full class cannot
  // all race at once. Show as many as still read at a glance, and say plainly
  // how many are not on screen -- every player sees their own rank on their
  // phone, but the wall should never imply it is showing the whole room.
  const shown = Math.max(1, limit ?? (everyone.length <= 10 ? everyone.length : everyone.length <= 16 ? 12 : 10));
  const racers = everyone.slice(0, shown);
  const remaining = everyone.length - racers.length;
  const gainers = useGainers(racers);
  if (!racers.length) return null;
  const topScore = Math.max(...racers.map(racer => racer.score), 0);

  return <section className="activity-score-race" aria-label="Standings" data-lanes={racers.length}>
    <span className="activity-race-kicker">{title}</span>
    <ol className="activity-race-lanes">
      {racers.map(racer => <Lane key={racer.id} racer={racer} topScore={topScore} gained={gainers.has(racer.id)} />)}
    </ol>
    {remaining > 0 && <p className="activity-race-rest">
      +{remaining} more {remaining === 1 ? 'player' : 'players'} · everyone can see their own place on their phone
    </p>}
  </section>;
};
