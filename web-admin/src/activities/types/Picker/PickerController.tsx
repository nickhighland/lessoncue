import React, { useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';

interface PickerItem {
  id: string;
  text: string;
  weight?: number;
}

function normalizeItems(value: unknown): PickerItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (typeof item === 'string') return { id: item, text: item };
      if (!item || typeof item !== 'object') return null;
      const candidate = item as { id?: unknown; text?: unknown; label?: unknown; weight?: unknown };
      const text = String(candidate.text ?? candidate.label ?? '').trim();
      if (!text) return null;
      return {
        id: String(candidate.id ?? `${text}-${index}`),
        text,
        weight: typeof candidate.weight === 'number' ? candidate.weight : 1
      };
    })
    .filter((item): item is PickerItem => item !== null);
}

export const PickerController: React.FC<{
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
}> = ({ envelope, onCommandSent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const [riggedItem, setRiggedItem] = useState('');

  const state = envelope.state as {
    currentPick?: string;
    removedIds?: string[];
    history?: string[];
  };
  const config = (envelope as unknown as { config?: { items?: unknown[] } }).config || {};
  const items = normalizeItems(config.items);
  const removedIds = state.removedIds || [];
  const activeItems = items.filter(item => !removedIds.includes(item.id));

  const handlePick = async (target?: string) => {
    if (isBusy || activeItems.length === 0) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action: 'pick',
        payload: target ? { targetItem: target } : {}
      });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to pick item:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleUndo = async () => {
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action: 'undopick',
      });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to undo pick:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRestoreRemoved = async () => {
    if (isBusy || removedIds.length === 0) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, { action: 'restoreremoved' });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to restore picker pool:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset this picker run?')) return;
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
      {/* Pick Winner Button */}
      <button
        type="button"
        className="act-btn act-btn-gold"
        style={{ height: '72px', fontSize: '1.4rem' }}
        disabled={isBusy || activeItems.length === 0}
        onClick={() => handlePick()}
      >
        🎲 {isBusy ? 'Picking...' : 'PICK RANDOM ITEM'}
      </button>

      {/* Current Winner */}
      {state.currentPick && (
        <div className="act-ctrl-card" style={{ textAlign: 'center', borderColor: 'var(--gold)' }}>
          <div style={{ color: 'var(--gold)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase' }}>
            Current Pick
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 900, marginTop: '0.25rem' }}>
            {state.currentPick}
          </div>
          {(state.history || []).length > 0 && (
            <button
              type="button"
              className="act-btn act-btn-secondary"
              style={{ marginTop: '0.75rem', padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}
              onClick={handleUndo}
              disabled={isBusy}
            >
              Undo Pick
            </button>
          )}
        </div>
      )}

      {/* Host Rigged Pick Control */}
      <div className="act-ctrl-card">
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--muted)' }}>
          Host Controls
        </h4>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <select
            value={riggedItem}
            onChange={e => setRiggedItem(e.target.value)}
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
                Target: {item.text}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="act-btn act-btn-primary"
            style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
            disabled={!riggedItem || isBusy}
            onClick={() => {
              handlePick(riggedItem);
              setRiggedItem('');
            }}
          >
            Direct Pick
          </button>
        </div>
      </div>

      {/* Active Pool Summary */}
      <div className="act-ctrl-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>Active Pool: {activeItems.length} items</span>
          <span>Removed: {removedIds.length}</span>
        </div>
        {removedIds.length > 0 && (
          <button type="button" className="act-btn act-btn-secondary" style={{ marginTop: '0.75rem', width: '100%' }} onClick={handleRestoreRemoved} disabled={isBusy}>
            ↩ Restore removed items
          </button>
        )}
      </div>

      {/* Reset */}
      <button
        type="button"
        className="act-btn act-btn-secondary"
        style={{ opacity: 0.7 }}
        onClick={handleReset}
        disabled={isBusy}
      >
        🔄 Reset Picker Run
      </button>
    </div>
  );
};
