import React, { useState } from 'react';

interface WheelItem {
  id: string;
  label: string;
  weight: number;
  color?: string;
}

interface WheelConfig {
  title?: string;
  items?: WheelItem[];
  removeWinner?: boolean;
  spinDurationSeconds?: number;
}

export const WheelEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const wheelConfig = (config as WheelConfig) || {};
  const items: WheelItem[] = wheelConfig.items || [
    { id: '1', label: 'Option 1', weight: 1 },
    { id: '2', label: 'Option 2', weight: 1 }
  ];

  const [bulkText, setBulkText] = useState('');
  const [showBulk, setShowBulk] = useState(false);

  const updateItems = (newItems: WheelItem[]) => {
    onChange({ ...wheelConfig, items: newItems });
  };

  const handleAddItem = () => {
    const newItem: WheelItem = {
      id: Math.random().toString(36).substring(2, 9),
      label: `Option ${items.length + 1}`,
      weight: 1
    };
    updateItems([...items, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    updateItems(items.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: keyof WheelItem, val: unknown) => {
    const next = [...items];
    next[index] = { ...next[index], [field]: val };
    updateItems(next);
  };

  const handleBulkImport = () => {
    const lines = bulkText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length > 0) {
      const imported: WheelItem[] = lines.map(line => ({
        id: Math.random().toString(36).substring(2, 9),
        label: line,
        weight: 1
      }));
      updateItems(imported);
      setBulkText('');
      setShowBulk(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Activity Title
        </label>
        <input
          type="text"
          value={wheelConfig.title || ''}
          onChange={e => onChange({ ...wheelConfig, title: e.target.value })}
          placeholder="e.g. Prize Wheel"
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--ink)' }}>
          <input
            type="checkbox"
            checked={wheelConfig.removeWinner !== false}
            onChange={e => onChange({ ...wheelConfig, removeWinner: e.target.checked })}
          />
          <span>Automatically remove winning items</span>
        </label>
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label style={{ fontWeight: 700, color: 'var(--ink)' }}>Wheel Slices ({items.length})</label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setShowBulk(!showBulk)}
              className="button"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', margin: 0 }}
            >
              {showBulk ? 'Cancel Bulk' : 'Bulk Paste'}
            </button>
            <button
              type="button"
              onClick={handleAddItem}
              disabled={items.length >= 50}
              className="button"
              style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', margin: 0 }}
            >
              + Add Slice
            </button>
          </div>
        </div>

        {showBulk ? (
          <div style={{ marginBottom: '1rem', background: 'var(--mint)', border: '1px solid var(--line)', padding: '0.75rem', borderRadius: '8px' }}>
            <textarea
              rows={5}
              placeholder="Paste list of names or choices, one per line..."
              value={bulkText}
              onChange={e => setBulkText(e.target.value)}
              style={{ width: '100%', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)', borderRadius: '8px', padding: '0.5rem' }}
            />
            <button
              type="button"
              onClick={handleBulkImport}
              className="button primary"
              style={{ marginTop: '0.5rem', padding: '0.4rem 1rem', margin: 0, fontSize: '0.85rem' }}
            >
              Replace Slices
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '350px', overflowY: 'auto' }}>
            {items.map((item, idx) => (
              <div key={item.id || idx} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="text"
                  value={item.label}
                  onChange={e => handleItemChange(idx, 'label', e.target.value)}
                  style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
                />
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={item.weight}
                  onChange={e => handleItemChange(idx, 'weight', parseFloat(e.target.value) || 0)}
                  title="Weight (0 = excluded)"
                  style={{ width: '70px', padding: '0.4rem 0.6rem', borderRadius: '6px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
                />
                <button
                  type="button"
                  onClick={() => handleRemoveItem(idx)}
                  disabled={items.length <= 1}
                  className="button danger"
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.9rem', margin: 0 }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
