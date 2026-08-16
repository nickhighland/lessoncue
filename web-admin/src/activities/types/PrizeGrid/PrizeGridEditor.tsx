import React from 'react';

interface BoxConfig {
  boxNumber: number;
  frontText: string;
  frontEmoji?: string;
  hiddenPrize: string;
  points: number;
}

interface PrizeGridConfig {
  title?: string;
  boxes?: BoxConfig[];
}

export const PrizeGridEditor: React.FC<{
  config: Record<string, unknown>;
  onChange: (updated: Record<string, unknown>) => void;
}> = ({ config, onChange }) => {
  const pgConfig = (config as PrizeGridConfig) || {};
  const rawBoxes = (pgConfig.boxes || []) as Array<BoxConfig & { label?: string; icon?: string; prize?: string }>;
  const boxes: BoxConfig[] = rawBoxes.length ? rawBoxes.map(box => ({
    boxNumber: box.boxNumber,
    frontText: box.frontText || box.label || String(box.boxNumber),
    frontEmoji: box.frontEmoji || box.icon || '🎁',
    hiddenPrize: box.hiddenPrize || box.prize || '',
    points: box.points || 0
  })) : [
    { boxNumber: 1, frontText: '1', frontEmoji: '🎁', hiddenPrize: '$100 Gift Card', points: 100 },
    { boxNumber: 2, frontText: '2', frontEmoji: '🎁', hiddenPrize: 'Mystery Box', points: 50 },
    { boxNumber: 3, frontText: '3', frontEmoji: '🎁', hiddenPrize: 'Grand Prize', points: 500 },
    { boxNumber: 4, frontText: '4', frontEmoji: '🎁', hiddenPrize: 'Candy Bar', points: 10 },
    { boxNumber: 5, frontText: '5', frontEmoji: '🎁', hiddenPrize: 'Bonus Points', points: 250 },
    { boxNumber: 6, frontText: '6', frontEmoji: '🎁', hiddenPrize: 'Teacher for a Day', points: 200 }
  ];

  const updateBoxes = (newBoxes: BoxConfig[]) => {
    onChange({ ...pgConfig, boxes: newBoxes });
  };

  const handleAddBox = () => {
    const nextNum = boxes.length + 1;
    updateBoxes([...boxes, { boxNumber: nextNum, frontText: nextNum.toString(), frontEmoji: '🎁', hiddenPrize: `Prize ${nextNum}`, points: 50 }]);
  };

  const handleRemoveBox = (idx: number) => {
    const filtered = boxes.filter((_, i) => i !== idx).map((b, i) => ({ ...b, boxNumber: i + 1, frontText: (i + 1).toString() }));
    updateBoxes(filtered);
  };

  const handleBoxChange = (idx: number, field: keyof BoxConfig, val: unknown) => {
    const next = [...boxes];
    next[idx] = { ...next[idx], [field]: val };
    updateBoxes(next);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      <div>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '0.25rem', color: 'var(--ink)' }}>
          Activity Title
        </label>
        <input
          type="text"
          value={pgConfig.title || ''}
          onChange={e => onChange({ ...pgConfig, title: e.target.value })}
          placeholder="e.g. Mystery Prize Grid"
          style={{ width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
        />
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
          <label style={{ fontWeight: 700, color: 'var(--ink)' }}>Prize Boxes ({boxes.length})</label>
          <button
            type="button"
            onClick={handleAddBox}
            disabled={boxes.length >= 100}
            className="button"
            style={{ fontSize: '0.8rem', padding: '0.3rem 0.6rem', margin: 0 }}
          >
            + Add Box
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {boxes.map((box, idx) => (
            <div
              key={box.boxNumber}
              style={{
                display: 'flex',
                gap: '0.5rem',
                alignItems: 'center',
                background: 'var(--mint)',
                border: '1px solid var(--line)',
                padding: '0.5rem 0.75rem',
                borderRadius: '8px'
              }}
            >
              <span style={{ fontWeight: 800, minWidth: '45px', textAlign: 'center', color: 'var(--ink)' }}>
                #{box.boxNumber}
              </span>
              <input
                type="text"
                value={box.hiddenPrize || ''}
                onChange={e => handleBoxChange(idx, 'hiddenPrize', e.target.value)}
                placeholder="Prize description..."
                style={{ flex: 1, padding: '0.4rem 0.6rem', borderRadius: '6px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
              />
              <input
                type="number"
                value={box.points || 0}
                onChange={e => handleBoxChange(idx, 'points', parseInt(e.target.value, 10) || 0)}
                placeholder="Points"
                style={{ width: '80px', padding: '0.4rem 0.6rem', borderRadius: '6px', background: '#fff', color: 'var(--ink)', border: '1px solid var(--line)' }}
              />
              <button
                type="button"
                onClick={() => handleRemoveBox(idx)}
                disabled={boxes.length <= 1}
                className="button danger"
                style={{ padding: '0.2rem 0.5rem', fontSize: '0.9rem', margin: 0 }}
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
