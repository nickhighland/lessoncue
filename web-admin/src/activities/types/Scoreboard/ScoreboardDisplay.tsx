import React, { useEffect, useRef, useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { playPopSound, launchConfetti, playFanfareSound } from '../../effects';

interface TeamConfig {
  id: string;
  name: string;
  color: string;
  icon?: string;
  initialScore?: number;
}

interface TeamState {
  id: string;
  score: number;
}

interface ScoreboardState {
  teams?: TeamState[];
  winningTeamId?: string | null;
  updateNonce?: number;
}

export const ScoreboardDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const state: ScoreboardState = (envelope.state as ScoreboardState) || {};
  const config = (envelope as unknown as { config?: { teams?: TeamConfig[]; title?: string } }).config || {};
  const teamConfigs: TeamConfig[] = config.teams || [
    { id: '1', name: 'Team Gold', color: '#f59e0b', icon: '🦁' },
    { id: '2', name: 'Team Green', color: '#10b981', icon: '🦅' }
  ];

  const teamScores = state.teams || teamConfigs.map(t => ({ id: t.id, score: t.initialScore || 0 }));
  const maxScore = Math.max(...teamScores.map(t => t.score), 10);
  const highestScore = Math.max(...teamScores.map(t => t.score));

  const lastScoresRef = useRef<Record<string, number>>({});
  const [floatingDeltas, setFloatingDeltas] = useState<Array<{ id: string; teamId: string; delta: number }>>([]);
  const lastNonceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.updateNonce !== undefined && state.updateNonce !== lastNonceRef.current) {
      lastNonceRef.current = state.updateNonce;
      playPopSound(true);

      // Check for score deltas to float on screen
      const newDeltas: Array<{ id: string; teamId: string; delta: number }> = [];
      teamScores.forEach(t => {
        const prev = lastScoresRef.current[t.id] ?? t.score;
        const diff = t.score - prev;
        if (diff !== 0) {
          newDeltas.push({
            id: `${t.id}-${Date.now()}`,
            teamId: t.id,
            delta: diff
          });
        }
        lastScoresRef.current[t.id] = t.score;
      });

      if (newDeltas.length > 0) {
        setFloatingDeltas(prev => [...prev, ...newDeltas]);
        setTimeout(() => {
          setFloatingDeltas(prev => prev.filter(d => !newDeltas.some(nd => nd.id === d.id)));
        }, 1200);
      }
    }
  }, [state.updateNonce, teamScores]);

  useEffect(() => {
    if (state.winningTeamId) {
      playFanfareSound();
      launchConfetti(containerRef.current, 150);
    }
  }, [state.winningTeamId]);

  return (
    <div ref={containerRef} className="activity-stage">
      <div className="activity-stage-content">
        <div className="activity-header">
          <div className="stage-kicker">🏆 LIVE SCOREBOARD · {teamScores.length} TEAMS</div>
          <h1 className="activity-title">{config.title || envelope.name || 'Scoreboard Showdown'}</h1>
          <div className="activity-subtitle">First team to the top takes the crown</div>
        </div>

        <div className="scoreboard-stage">
          <div className="scoreboard-grid">
            {teamConfigs.map(team => {
              const current = teamScores.find(t => t.id === team.id);
              const score = current ? current.score : 0;
              const isLeader = score === highestScore && score > 0;
              const percent = Math.min(100, Math.max(0, (score / maxScore) * 100));
              const teamDeltas = floatingDeltas.filter(d => d.teamId === team.id);

              return (
                <div
                  key={team.id}
                  className={`team-card ${isLeader ? 'leader' : ''}`}
                  style={{
                    position: 'relative',
                    borderColor: isLeader ? '#ffe600' : (team.color || '#3b82f6'),
                    boxShadow: isLeader ? '0 0 35px rgba(255, 230, 0, 0.6)' : `0 0 20px ${(team.color || '#3b82f6')}44`,
                    transform: isLeader ? 'scale(1.03)' : 'scale(1)',
                    transition: 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.3s ease'
                  }}
                >
                  {/* Floating Point Indicators */}
                  {teamDeltas.map(d => (
                    <div
                      key={d.id}
                      className="floating-point-pill"
                      style={{
                        top: '15%',
                        right: '15%',
                        color: d.delta > 0 ? '#10b981' : '#ef4444'
                      }}
                    >
                      {d.delta > 0 ? `+${d.delta}` : d.delta}
                    </div>
                  ))}

                  {isLeader && (
                    <div style={{ position: 'absolute', top: '-22px', fontSize: '2.2rem', filter: 'drop-shadow(0 0 10px #ffe600)' }}>
                      👑
                    </div>
                  )}

                  <div className="team-icon">{team.icon || '🏆'}</div>
                  <div className="team-name" style={{ color: team.color || '#fff' }}>
                    {team.name}
                  </div>
                  <div className="team-score" style={{ color: isLeader ? '#ffe600' : (team.color || '#fff') }}>
                    {score}
                  </div>
                  <div className="team-score-bar-bg">
                    <div
                      className="team-score-bar-fill"
                      style={{
                        width: `${percent}%`,
                        backgroundColor: team.color || '#3b82f6',
                        boxShadow: `0 0 12px ${team.color || '#3b82f6'}`
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
