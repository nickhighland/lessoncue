import React, { useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';

interface BoxState {
  boxNumber: number;
  revealed: boolean;
  prize?: string | null;
  points?: number | null;
}

interface PrizeGridState {
  boxes?: BoxState[];
}

export const PrizeGridController: React.FC<{
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
}> = ({ envelope, onCommandSent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const state: PrizeGridState = (envelope.state as PrizeGridState) || {};
  const boxes = state.boxes || [];

  const handleReveal = async (boxNumber: number) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action: 'revealbox',
        payload: { boxNumber }
      });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to reveal box:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleRevealAll = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action: 'revealall',
      });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to reveal all boxes:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Hide all prize boxes?')) return;
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
      {/* Quick Reveal All */}
      <button
        type="button"
        className="act-btn act-btn-gold"
        onClick={handleRevealAll}
        disabled={isBusy}
      >
        ✨ REVEAL ALL BOXES
      </button>

      {/* Boxes Grid */}
      <div className="act-ctrl-card">
        <h4 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: 'var(--muted)' }}>
          Boxes Grid ({boxes.filter(b => b.revealed).length}/{boxes.length} revealed)
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          {boxes.map(b => (
            <button
              key={b.boxNumber}
              type="button"
              className={`act-btn ${b.revealed ? 'act-btn-secondary' : 'act-btn-primary'}`}
              style={{ padding: '0.8rem 0.4rem', flexDirection: 'column', gap: '0.2rem' }}
              onClick={() => handleReveal(b.boxNumber)}
              disabled={isBusy}
            >
              <span style={{ fontSize: '1.2rem', fontWeight: 900 }}>Box #{b.boxNumber}</span>
              <span style={{ fontSize: '0.8rem', opacity: 0.9 }}>
                {b.revealed ? (b.prize || 'Revealed') : '🎁 Tap to Open'}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Reset */}
      <button
        type="button"
        className="act-btn act-btn-secondary"
        style={{ opacity: 0.7 }}
        onClick={handleReset}
        disabled={isBusy}
      >
        🔄 Reset & Conceal All Boxes
      </button>
    </div>
  );
};
