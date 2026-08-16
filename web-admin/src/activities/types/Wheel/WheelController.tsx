import React, { useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';

export const WheelController: React.FC<{
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
}> = ({ envelope, onCommandSent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const [selectedRiggedId, setSelectedRiggedId] = useState<string>('');

  const state = envelope.state as {
    removedIds?: string[];
    winnerLabel?: string;
    spinCount?: number;
  };
  const config = (envelope as unknown as { config?: { items?: Array<{ id: string; label: string }> } }).config || {};
  const items = (envelope.state as unknown as { items?: Array<{ id: string; label: string }> })?.items
    || config.items
    || [];

  const activeItems = items.filter(it => !(state.removedIds || []).includes(it.id));

  const handleSpin = async (riggedTargetId?: string) => {
    if (isBusy || activeItems.length === 0) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action: 'spin',
        payload: riggedTargetId ? { targetItemId: riggedTargetId } : {}
      });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to spin wheel:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRestore = async () => {
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action: 'restoreremoved',
      });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to restore items:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset this wheel activity?')) return;
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
      {/* Big Spin Button */}
      <button
        type="button"
        className="act-btn act-btn-gold"
        style={{ height: '72px', fontSize: '1.4rem' }}
        disabled={isBusy || activeItems.length === 0}
        onClick={() => handleSpin()}
      >
        ☸ {isBusy ? 'Spinning...' : 'SPIN WHEEL'}
      </button>

      {/* Current Winner Banner */}
      {state.winnerLabel && (
        <div className="act-ctrl-card" style={{ textAlign: 'center', borderColor: 'var(--gold)' }}>
          <div style={{ color: 'var(--gold)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase' }}>
            Current Winner
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, marginTop: '0.25rem' }}>
            {state.winnerLabel}
          </div>
        </div>
      )}

      {/* Host Rigged Pick Control */}
      <div className="act-ctrl-card">
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--muted)' }}>
          Host Controls
        </h4>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            className="act-select"
            value={selectedRiggedId}
            onChange={e => setSelectedRiggedId(e.target.value)}
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
            {activeItems.map(item => (
              <option key={item.id} value={item.id}>
                Target: {item.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="act-btn act-btn-primary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            disabled={!selectedRiggedId || isBusy}
            onClick={() => {
              handleSpin(selectedRiggedId);
              setSelectedRiggedId('');
            }}
          >
            Direct Spin
          </button>
        </div>
      </div>

      {/* Active Pool and Removed Count */}
      <div className="act-ctrl-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Eligible Items ({activeItems.length})</span>
          {(state.removedIds || []).length > 0 && (
            <button
              type="button"
              className="act-btn act-btn-secondary"
              style={{ padding: '0.3rem 0.8rem', fontSize: '0.85rem' }}
              onClick={handleRestore}
              disabled={isBusy}
            >
              Restore ({state.removedIds?.length})
            </button>
          )}
        </div>
      </div>

      {/* Reset Run */}
      <button
        type="button"
        className="act-btn act-btn-secondary"
        style={{ opacity: 0.7 }}
        onClick={handleReset}
        disabled={isBusy}
      >
        🔄 Reset Activity Run
      </button>
    </div>
  );
};
