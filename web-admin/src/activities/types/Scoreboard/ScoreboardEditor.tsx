import React from 'react';

interface TeamConfig {
  id: string;
  name: string;
  color: string;
  icon?: string;
  initialScore?: number;
}

interface ScoreboardConfig {
  title?: string;
  teams?: TeamConfig[];
  increment?: number;
  decrement?: number;
}

const TEAM_PRESET_COLORS = ['#d88c1e', '#2a6e4a', '#2563eb', '#dc2626', '#7c3aed', '#0f766e', '#f59e0b'];
const TEAM_PRESET_ICONS = ['⭐', '🌲', '⚡', '🔥', '🦁', '🚀', '👑', '💎', '🎯'];

export const ScoreboardEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const sbConfig = (config as ScoreboardConfig) || {};
  const teams: TeamConfig[] = sbConfig.teams || [
    { id: '1', name: 'Team Gold', color: '#d88c1e', icon: '⭐', initialScore: 0 },
    { id: '2', name: 'Team Green', color: '#2a6e4a', icon: '🌲', initialScore: 0 }
  ];

  const updateTeams = (newTeams: TeamConfig[]) => {
    onChange({ ...sbConfig, teams: newTeams });
  };

  const handleAddTeam = () => {
    const nextIdx = teams.length;
    const newTeam: TeamConfig = {
      id: Math.random().toString(36).substring(2, 9),
      name: `Team ${nextIdx + 1}`,
      color: TEAM_PRESET_COLORS[nextIdx % TEAM_PRESET_COLORS.length],
      icon: TEAM_PRESET_ICONS[nextIdx % TEAM_PRESET_ICONS.length],
      initialScore: 0
    };
    updateTeams([...teams, newTeam]);
  };

  const handleRemoveTeam = (index: number) => {
    updateTeams(teams.filter((_, idx) => idx !== index));
  };

  const handleTeamChange = (index: number, field: keyof TeamConfig, val: unknown) => {
    const next = [...teams];
    next[index] = { ...next[index], [field]: val };
    updateTeams(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
          Activity Title
        </label>
        <input
          type="text"
          value={sbConfig.title || ''}
          onChange={e => onChange({ ...sbConfig, title: e.target.value })}
          placeholder="e.g. Game Show Scoreboard"
          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: '#1f2937', color: '#fff', border: '1px solid #4b5563' }}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label style={{ fontWeight: 600 }}>Teams ({teams.length})</label>
          <button
            type="button"
            onClick={handleAddTeam}
            disabled={teams.length >= 30}
            style={{ fontSize: '0.85rem', padding: '0.25rem 0.6rem', borderRadius: '4px', background: '#0284c7', color: '#fff', border: 'none' }}
          >
            + Add Team
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {teams.map((team, idx) => (
            <div
              key={team.id || idx}
              style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                background: '#111827',
                padding: '0.5rem',
                borderRadius: '8px',
                borderLeft: `4px solid ${team.color}`
              }}
            >
              <input
                type="text"
                value={team.icon || '🏆'}
                onChange={e => handleTeamChange(idx, 'icon', e.target.value)}
                style={{ width: '45px', textAlign: 'center', fontSize: '1.2rem', padding: '0.3rem', borderRadius: '4px', background: '#1f2937', color: '#fff', border: '1px solid #4b5563' }}
              />
              <input
                type="text"
                value={team.name}
                onChange={e => handleTeamChange(idx, 'name', e.target.value)}
                style={{ flex: 1, padding: '0.4rem', borderRadius: '4px', background: '#1f2937', color: '#fff', border: '1px solid #4b5563' }}
              />
              <input
                type="color"
                value={team.color}
                onChange={e => handleTeamChange(idx, 'color', e.target.value)}
                style={{ width: '40px', height: '36px', padding: 0, border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              />
              <button
                type="button"
                onClick={() => handleRemoveTeam(idx)}
                disabled={teams.length <= 1}
                style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.2rem', padding: '0 0.5rem' }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
