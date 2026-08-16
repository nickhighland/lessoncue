import React, { useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';

interface TeamConfig {
  id: string;
  name: string;
  color: string;
  icon?: string;
}

interface TeamState {
  id: string;
  score: number;
}

export const ScoreboardController: React.FC<{
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
}> = ({ envelope, onCommandSent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const [customPoints, setCustomPoints] = useState<Record<string, string>>({});

  const state = (envelope.state as { teams?: TeamState[]; history?: Array<{ teamId: string; delta: number }> }) || {};
  const config = (envelope as unknown as { config?: { teams?: TeamConfig[]; increment?: number; decrement?: number } }).config || {};

  const fallbackTeams: TeamConfig[] = [
    { id: 'gold', name: 'Gold Team', color: 'var(--gold)', icon: '🦁' },
    { id: 'green', name: 'Green Team', color: 'var(--green)', icon: '🦅' }
  ];

  const teamConfigs: TeamConfig[] = (config.teams && config.teams.length > 0)
    ? config.teams
    : (state.teams && state.teams.length > 0)
      ? state.teams.map((t, idx) => ({ id: t.id, name: `Team ${idx + 1}`, color: ['#d88c1e', '#2a6e4a', '#2563eb', '#dc2626'][idx % 4], icon: '🏆' }))
      : fallbackTeams;

  const teamScores = state.teams || [];

  const handleScore = async (teamId: string, amount: number) => {
    if (isBusy || amount === 0) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action: amount >= 0 ? 'incrementscore' : 'decrementscore',
        payload: { teamId, amount, points: amount }
      });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to change score:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleCustomScore = (teamId: string, isAdd: boolean) => {
    const raw = customPoints[teamId];
    const val = parseInt(raw, 10);
    if (!isNaN(val) && val > 0) {
      handleScore(teamId, isAdd ? val : -val);
      setCustomPoints({ ...customPoints, [teamId]: '' });
    }
  };

  const handleUndo = async () => {
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action: 'undoscore',
      });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to undo score:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset all team scores to 0?')) return;
    setIsBusy(true);
    try {
      await ActivityApi.resetRun(envelope.runId);
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to reset run:', err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="act-ctrl-container">
      {/* Team Score Control Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {teamConfigs.map(team => {
          const current = teamScores.find(t => t.id === team.id);
          const score = current ? current.score : 0;
          const currentCustom = customPoints[team.id] || '';

          return (
            <div
              key={team.id}
              className="act-ctrl-card"
              style={{ borderLeft: `6px solid ${team.color || 'var(--gold)'}` }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '1.2rem', fontWeight: 800 }}>
                  {team.icon || '🏆'} {team.name}
                </span>
                <span style={{ fontSize: '1.8rem', fontWeight: 900, color: team.color || 'var(--gold)' }}>
                  {score}
                </span>
              </div>

              {/* Quick Increment/Decrement Buttons */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.4rem', marginBottom: '0.75rem' }}>
                <button
                  type="button"
                  className="act-btn act-btn-danger"
                  style={{ padding: '0.6rem 0' }}
                  onClick={() => handleScore(team.id, -5)}
                  disabled={isBusy}
                >
                  -5
                </button>
                <button
                  type="button"
                  className="act-btn act-btn-danger"
                  style={{ padding: '0.6rem 0' }}
                  onClick={() => handleScore(team.id, -1)}
                  disabled={isBusy}
                >
                  -1
                </button>
                <button
                  type="button"
                  className="act-btn act-btn-primary"
                  style={{ padding: '0.6rem 0' }}
                  onClick={() => handleScore(team.id, 1)}
                  disabled={isBusy}
                >
                  +1
                </button>
                <button
                  type="button"
                  className="act-btn act-btn-gold"
                  style={{ padding: '0.6rem 0' }}
                  onClick={() => handleScore(team.id, 5)}
                  disabled={isBusy}
                >
                  +5
                </button>
                <button
                  type="button"
                  className="act-btn act-btn-gold"
                  style={{ padding: '0.6rem 0' }}
                  onClick={() => handleScore(team.id, 10)}
                  disabled={isBusy}
                >
                  +10
                </button>
              </div>

              {/* Custom Points Input */}
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <input
                  type="number"
                  placeholder="Custom pts"
                  value={currentCustom}
                  onChange={e => setCustomPoints({ ...customPoints, [team.id]: e.target.value })}
                  style={{
                    flex: 1,
                    padding: '0.4rem 0.6rem',
                    background: '#fff',
                    color: 'var(--ink)',
                    border: '1px solid var(--line)',
                    borderRadius: '6px'
                  }}
                />
                <button
                  type="button"
                  className="act-btn act-btn-primary"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                  disabled={!currentCustom || isBusy}
                  onClick={() => handleCustomScore(team.id, true)}
                >
                  + Add
                </button>
                <button
                  type="button"
                  className="act-btn act-btn-danger"
                  style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
                  disabled={!currentCustom || isBusy}
                  onClick={() => handleCustomScore(team.id, false)}
                >
                  - Sub
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Undo Last Score Change */}
      {(state.history || []).length > 0 && (
        <button
          type="button"
          className="act-btn act-btn-secondary"
          onClick={handleUndo}
          disabled={isBusy}
        >
          ↩️ Undo Last Score Change
        </button>
      )}

      {/* Reset */}
      <button
        type="button"
        className="act-btn act-btn-secondary"
        style={{ opacity: 0.7 }}
        onClick={handleReset}
        disabled={isBusy}
      >
        🔄 Reset Scoreboard
      </button>
    </div>
  );
};
