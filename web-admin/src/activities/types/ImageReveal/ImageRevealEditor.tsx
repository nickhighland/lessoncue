import React from 'react';

interface ImageRevealConfig {
  title?: string;
  imageUrl?: string;
  totalStages?: number;
  stages?: number;
  style?: string;
  prompt?: string;
  answer?: string;
}

export const ImageRevealEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const irConfig = (config as ImageRevealConfig) || {};

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Activity Title
        </label>
        <input
          type="text"
          value={irConfig.title || ''}
          onChange={e => onChange({ ...irConfig, title: e.target.value })}
          placeholder="e.g. Mystery Object Reveal"
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Image URL or Media Link
        </label>
        <input
          type="text"
          value={irConfig.imageUrl || ''}
          onChange={e => onChange({ ...irConfig, imageUrl: e.target.value })}
          placeholder="https://... or /api/v1/media/..."
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Number of Reveal Stages
        </label>
        <input
          type="number"
          min={2}
          max={12}
          value={irConfig.totalStages || irConfig.stages || 5}
          onChange={e => onChange({ ...irConfig, totalStages: parseInt(e.target.value, 10) || 5 })}
          style={{ width: '100px', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Audience prompt
        </label>
        <input
          type="text"
          value={irConfig.prompt || ''}
          onChange={e => onChange({ ...irConfig, prompt: e.target.value })}
          placeholder="Can you guess what it is?"
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
      </div>

      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Answer (shown when revealed)
        </label>
        <input
          type="text"
          value={irConfig.answer || ''}
          onChange={e => onChange({ ...irConfig, answer: e.target.value })}
          placeholder="The answer or reveal text"
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
      </div>
    </div>
  );
};
