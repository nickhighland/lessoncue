import React from 'react';

interface CountdownConfig {
  title?: string;
  durationSeconds?: number;
}

export const CountdownEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const cdConfig = (config as CountdownConfig) || {};
  const duration = cdConfig.durationSeconds ?? 60;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
          Activity Title
        </label>
        <input
          type="text"
          value={cdConfig.title || ''}
          onChange={e => onChange({ ...cdConfig, title: e.target.value })}
          placeholder="e.g. 60-Second Challenge"
          style={{ width: '100%', padding: '0.5rem', borderRadius: '6px', background: '#1f2937', color: '#fff', border: '1px solid #4b5563' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem' }}>
          Duration (Seconds)
        </label>
        <input
          type="number"
          min={5}
          max={3600}
          value={duration}
          onChange={e => onChange({ ...cdConfig, durationSeconds: parseInt(e.target.value, 10) || 60 })}
          style={{ width: '120px', padding: '0.5rem', borderRadius: '6px', background: '#1f2937', color: '#fff', border: '1px solid #4b5563' }}
        />
      </div>
    </div>
  );
};
