import React, { useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';

interface ImageItem {
  id: string;
  label?: string;
  imageUrl?: string;
}

export const ImageShuffleController: React.FC<{
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
}> = ({ envelope, onCommandSent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const [selectedTargetId, setSelectedTargetId] = useState('');

  const config = (envelope as unknown as { config?: { images?: ImageItem[] } }).config || {};
  const images = config.images || [];

  const handleShuffle = async (targetId?: string) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action: 'shuffle',
        payload: targetId ? { targetImageId: targetId } : {}
      });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to shuffle images:', err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="act-ctrl-container">
      {/* Big Shuffle / Pick Button */}
      <button
        type="button"
        className="act-btn act-btn-gold"
        style={{ height: '72px', fontSize: '1.4rem' }}
        onClick={() => handleShuffle()}
        disabled={isBusy}
      >
        🔀 {isBusy ? 'Shuffling...' : 'SHUFFLE & PICK IMAGE'}
      </button>

      {/* Host Direct Target Selection (if images configured) */}
      {images.length > 0 && (
        <div className="act-ctrl-card">
          <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--muted)' }}>
            Host Direct Pick
          </h4>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select
              value={selectedTargetId}
              onChange={e => setSelectedTargetId(e.target.value)}
              style={{
                flex: 1,
                background: '#fff',
                color: 'var(--ink)',
                border: '1px solid var(--line)',
                borderRadius: '8px',
                padding: '0.5rem'
              }}
            >
              <option value="">(Random Fair Pick)</option>
              {images.map(img => (
                <option key={img.id} value={img.id}>
                  Target: {img.label || img.id}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="act-btn act-btn-primary"
              style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
              disabled={!selectedTargetId || isBusy}
              onClick={() => {
                handleShuffle(selectedTargetId);
                setSelectedTargetId('');
              }}
            >
              Direct Pick
            </button>
          </div>
        </div>
      )}

      {/* Reset */}
      <button
        type="button"
        className="act-btn act-btn-secondary"
        style={{ opacity: 0.7 }}
        onClick={async () => {
          if (!window.confirm('Reset shuffle run?')) return;
          setIsBusy(true);
          try {
            await ActivityApi.resetRun(envelope.runId);
            onCommandSent?.();
          } finally {
            setIsBusy(false);
          }
        }}
        disabled={isBusy}
      >
        🔄 Reset Shuffle
      </button>
    </div>
  );
};
