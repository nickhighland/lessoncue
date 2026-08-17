import React from 'react';
import { ActivityPresetPicker } from '../../ActivityPresetPicker';
import { MEDIA_REVEAL_PRESETS } from '../../activityPresetRegistry';

interface ImageRevealConfig {
  title?: string;
  imageUrl?: string;
  mediaId?: string;
  totalStages?: number;
  stages?: number;
  autoIntervalSeconds?: number;
  style?: string;
  prompt?: string;
  answer?: string;
  preset?: string;
  presetLabel?: string;
  mediaMode?: string;
  audioUrl?: string;
  audioMediaId?: string;
  audioDurationSeconds?: number;
  audioTransform?: string;
  memorySeconds?: number;
  memoryCards?: Array<{ id: string; label: string; match?: string }>;
}

export const ImageRevealEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const irConfig = (config as ImageRevealConfig) || {};
  const mediaMode = irConfig.mediaMode || 'image';
  const memoryCards = irConfig.memoryCards || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <ActivityPresetPicker label="Reveal format" value={irConfig.preset || 'mysteryImage'} templates={MEDIA_REVEAL_PRESETS} onPresetChange={preset => onChange({ ...irConfig, preset: preset.id, presetLabel: preset.label.toUpperCase() })} onApply={preset => onChange({ ...irConfig, ...preset.config })} />
      <div>
        <label htmlFor="image-reveal-auto-interval" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
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
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>Media round type</label>
        <select aria-label="Media round type" value={mediaMode} onChange={e => onChange({ ...irConfig, mediaMode: e.target.value })} style={{ width: '220px', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}>
          <option value="image">Progressive image reveal</option>
          <option value="memoryGrid">Memory Grid</option>
          <option value="audio">Audio clue</option>
        </select>
      </div>

      {mediaMode === 'audio' && <div className="activity-editor-card media-editor-card">
        <strong>Audio clue</strong>
        <label>Audio URL<input value={irConfig.audioUrl || ''} onChange={e => onChange({ ...irConfig, audioUrl: e.target.value })} placeholder="/media/animal-call.mp3 or a local URL" /></label>
        <label>Audio media ID<input value={irConfig.audioMediaId || ''} onChange={e => onChange({ ...irConfig, audioMediaId: e.target.value })} placeholder="Existing LessonCue media ID" /></label>
        <div className="activity-editor-row"><label>Seconds shown<input type="number" min={1} max={600} value={irConfig.audioDurationSeconds || 3} onChange={e => onChange({ ...irConfig, audioDurationSeconds: parseInt(e.target.value, 10) || 3 })} /></label><label>Transform<select value={irConfig.audioTransform || 'normal'} onChange={e => onChange({ ...irConfig, audioTransform: e.target.value })}><option value="normal">Normal</option><option value="reverse">Backwards (provide reversed clip)</option></select></label></div>
        <small className="muted">Browsers cannot safely reverse every media format in real time, so Backwards Audio accepts a teacher-provided reversed clip.</small>
      </div>}

      {mediaMode === 'memoryGrid' && <div className="activity-editor-card media-editor-card">
        <div className="activity-editor-card-heading"><strong>Memory cards ({memoryCards.length})</strong><button type="button" className="button" onClick={() => onChange({ ...irConfig, memoryCards: [...memoryCards, { id: `card-${Date.now()}`, label: '🐾', match: `pair-${memoryCards.length + 1}` }] })}>+ Add card</button></div>
        <label>Memorize seconds<input type="number" min={3} max={60} value={irConfig.memorySeconds || 8} onChange={e => onChange({ ...irConfig, memorySeconds: parseInt(e.target.value, 10) || 8 })} /></label>
        {memoryCards.map((card, index) => <div className="activity-editor-row" key={card.id}><input aria-label={`Memory card ${index + 1}`} value={card.label} onChange={e => { const next = [...memoryCards]; next[index] = { ...card, label: e.target.value }; onChange({ ...irConfig, memoryCards: next }); }} placeholder="Symbol or label" /><input aria-label={`Memory card ${index + 1} match`} value={card.match || ''} onChange={e => { const next = [...memoryCards]; next[index] = { ...card, match: e.target.value }; onChange({ ...irConfig, memoryCards: next }); }} placeholder="Pair ID" /><button type="button" className="button danger" disabled={memoryCards.length <= 2} onClick={() => onChange({ ...irConfig, memoryCards: memoryCards.filter((_, itemIndex) => itemIndex !== index) })}>Remove</button></div>)}
        <small className="muted">Use the same Pair ID for two cards. The host reveals cards from the TV controller.</small>
      </div>}

      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Auto-reveal interval (seconds)
        </label>
        <input
          id="image-reveal-auto-interval"
          type="number"
          min={1}
          max={60}
          value={irConfig.autoIntervalSeconds || 3}
          onChange={e => onChange({ ...irConfig, autoIntervalSeconds: parseInt(e.target.value, 10) || 3 })}
          style={{ width: '100px', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
      </div>

      <div>
        <label htmlFor="image-reveal-total-stages" style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Media asset ID (optional)
        </label>
        <input
          type="text"
          value={irConfig.mediaId || ''}
          onChange={e => onChange({ ...irConfig, mediaId: e.target.value })}
          placeholder="Use an existing LessonCue media asset"
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
        <small style={{ color: 'var(--muted)' }}>A media ID uses the local server playback route; an image URL remains supported for quick setup.</small>
      </div>

      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Reveal style
        </label>
        <select
          aria-label="Reveal style"
          value={irConfig.style || 'blur'}
          onChange={e => onChange({ ...irConfig, style: e.target.value })}
          style={{ width: '180px', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        >
          <option value="blur">Progressive blur</option>
          <option value="pixel">Pixel / scan</option>
          <option value="zoom">Zoomed detail</option>
          <option value="silhouette">Silhouette</option>
          <option value="crop">Missing piece</option>
        </select>
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
          id="image-reveal-total-stages"
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
