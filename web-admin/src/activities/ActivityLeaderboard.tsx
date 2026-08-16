import React, { useEffect, useMemo, useState } from 'react';

type JsonRecord = Record<string, unknown>;

const listOf = (value: unknown): JsonRecord[] => Array.isArray(value)
  ? value.filter(item => item && typeof item === 'object') as JsonRecord[]
  : [];
const stringOf = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
const numberOf = (value: unknown, fallback = 0) => typeof value === 'number' ? value : fallback;

export type ActivityLeaderboardMode = 'auto' | 'individual' | 'teams';

interface LeaderboardEntry extends JsonRecord {
  id: string;
  name: string;
  rank: number;
  score: number;
}

const normalizeEntries = (value: unknown): LeaderboardEntry[] => listOf(value).map((entry, index) => ({
  ...entry,
  id: stringOf(entry.id, `entry-${index}`),
  name: stringOf(entry.name, 'Player'),
  rank: numberOf(entry.rank, index + 1),
  score: numberOf(entry.score)
}));

const podiumEntries = (entries: LeaderboardEntry[]) => [entries[1], entries[0], entries[2]].filter(Boolean);

export const ActivityPodium: React.FC<{ entries: LeaderboardEntry[]; title?: string }> = ({ entries, title = 'FINAL RESULTS' }) => {
  if (!entries.length) return null;
  return <section className="activity-live-podium" aria-label="Final podium">
    <span className="activity-live-podium-kicker">{title}</span>
    <div className="activity-live-podium-places">
      {podiumEntries(entries.slice(0, 3)).map((entry, index) => {
        const place = numberOf(entry.rank, index + 1);
        const placeClass = place === 1 ? 'first' : place === 2 ? 'second' : 'third';
        return <div className={`activity-live-podium-place ${placeClass}`} key={entry.id}>
          <span>{place}</span>
          <strong>{entry.name}</strong>
          <small>{entry.score.toLocaleString()} pts</small>
        </div>;
      })}
    </div>
  </section>;
};

export const ActivityLeaderboard: React.FC<{
  state: JsonRecord;
  mode?: ActivityLeaderboardMode;
  limit?: number;
  showPodium?: boolean;
}> = ({ state, mode = 'auto', limit = 8, showPodium = false }) => {
  const individual = useMemo(() => normalizeEntries(state.leaderboard), [state.leaderboard]);
  const teams = useMemo(() => normalizeEntries(state.teamLeaderboard), [state.teamLeaderboard]);
  const entries = mode === 'teams' ? teams : mode === 'individual' ? individual : teams.length ? teams : individual;
  const rankSignature = JSON.stringify(entries.map(entry => [entry.id, entry.rank]));
  const [rankHistory, setRankHistory] = useState<{ ranks: Map<string, number>; directions: Map<string, 'up' | 'down' | null> }>({ ranks: new Map(), directions: new Map() });

  useEffect(() => {
    setRankHistory(previous => {
      const nextRanks = new Map<string, number>();
      const nextDirections = new Map<string, 'up' | 'down' | null>();
      const rankEntries = JSON.parse(rankSignature) as Array<[string, number]>;
      rankEntries.forEach(([id, rank]) => {
        const previousRank = previous.ranks.get(id);
        nextRanks.set(id, rank);
        nextDirections.set(id, previousRank === undefined ? null : previousRank > rank ? 'up' : previousRank < rank ? 'down' : null);
      });
      return { ranks: nextRanks, directions: nextDirections };
    });
    const timer = window.setTimeout(() => {
      setRankHistory(current => current.directions.size ? { ...current, directions: new Map() } : current);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [rankSignature]);

  if (!entries.length) return null;
  const visibleEntries = entries.slice(0, Math.max(1, limit));
  return <>
    <section className="interactive-leaderboard activity-shared-leaderboard" aria-label={mode === 'teams' ? 'Team leaderboard' : 'Leaderboard'}>
      <div className="activity-shared-leaderboard-heading"><span className="interactive-round-label">{mode === 'teams' || (mode === 'auto' && teams.length) ? 'TEAM SCOREBOARD' : 'SCOREBOARD'}</span><small>{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</small></div>
      {visibleEntries.map(entry => {
        const direction = rankHistory.directions.get(entry.id);
        return <div className="activity-shared-leaderboard-row" key={entry.id}>
          <b>{entry.rank}</b>
          <span className="activity-leaderboard-name">{entry.name}</span>
          {direction && <span className={`activity-leaderboard-movement ${direction}`} aria-label={direction === 'up' ? 'Moved up' : 'Moved down'}>{direction === 'up' ? '↑' : '↓'}</span>}
          <strong>{entry.score.toLocaleString()} pts</strong>
        </div>;
      })}
    </section>
    {showPodium && <ActivityPodium entries={entries} />}
  </>;
};
