import React, { useEffect, useState } from 'react';

interface PickerConfig {
  title?: string;
  items?: Array<string | { id: string; text: string; weight?: number }>;
  removeAfterPick?: boolean;
  removeOnPick?: boolean;
}

export const PickerEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const pickerConfig = (config as PickerConfig) || {};
  const items = (pickerConfig.items || []).map(item => typeof item === 'string' ? item : item.text);
  const [textInput, setTextInput] = useState(items.join('\n'));

  useEffect(() => {
    setTextInput(items.join('\n'));
  }, [pickerConfig.items]);

  const handleTextChange = (val: string) => {
    setTextInput(val);
    const parsed = val.split('\n').map(s => s.trim()).filter(Boolean);
    onChange({ ...pickerConfig, items: parsed });
  };

  const addItem = () => {
    if (items.length >= 25000) return;
    handleTextChange(`${textInput.trimEnd()}${textInput.trim() ? '\n' : ''}New entry`);
  };

  const removeLastItem = () => {
    if (items.length <= 1) return;
    handleTextChange(items.slice(0, -1).join('\n'));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Activity Title
        </label>
        <input
          type="text"
          value={pickerConfig.title || ''}
          onChange={e => onChange({ ...pickerConfig, title: e.target.value })}
          placeholder="e.g. Student Name Picker"
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--ink)' }}>
        <input
          type="checkbox"
          checked={pickerConfig.removeAfterPick ?? pickerConfig.removeOnPick ?? true}
          onChange={e => onChange({ ...pickerConfig, removeAfterPick: e.target.checked })}
        />
        <span>Automatically remove picked items from pool</span>
      </label>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
          <label style={{ display: 'block', fontWeight: 700, color: 'var(--ink)' }}>
            Items Pool ({items.length} items)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" className="button" onClick={addItem} disabled={items.length >= 25000}>+ Add entry</button>
            <button type="button" className="button danger" onClick={removeLastItem} disabled={items.length <= 1}>Remove last</button>
          </div>
        </div>
        <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
          Enter names or options below, one per line. Use the buttons to quickly grow or trim the pool; bulk paste remains supported.
        </div>
        <textarea
          rows={10}
          value={textInput}
          onChange={e => handleTextChange(e.target.value)}
          placeholder="Alice&#10;Bob&#10;Charlie&#10;David"
          style={{ width: '100%', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '8px', padding: '0.75rem', fontFamily: 'monospace' }}
        />
      </div>
    </div>
  );
};
