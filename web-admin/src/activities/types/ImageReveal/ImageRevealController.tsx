import React, { useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';

export const ImageRevealController: React.FC<{
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
}> = ({ envelope, onCommandSent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const state = (envelope.state as { currentStage?: number; revealed?: boolean }) || {};
  const config = (envelope as unknown as { config?: { totalStages?: number; stages?: number } }).config || {};
  const currentStage = state.currentStage ?? 0;
  const totalStages = config.totalStages || config.stages || 5;

  const sendAction = async (action: string) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action,
      });
      onCommandSent?.();
    } catch (err) {
      console.error(`Failed to execute ${action}:`, err);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="act-ctrl-container">
      {/* Current Stage Indicator */}
      <div className="act-ctrl-card" style={{ textAlign: 'center' }}>
        <div style={{ color: 'var(--gold)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase' }}>
          Reveal Progress
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.25rem', color: 'var(--ink)' }}>
          Stage {Math.min(currentStage, totalStages)} / {totalStages}
        </div>
      </div>

      {/* Advance Reveal Stage Button */}
      <button
        type="button"
        className="act-btn act-btn-primary"
        style={{ height: '64px', fontSize: '1.25rem' }}
        onClick={() => sendAction('revealstage')}
        disabled={isBusy || state.revealed || currentStage >= totalStages}
      >
        🔍 REVEAL NEXT STAGE (+1)
      </button>

      {/* Reveal All */}
      <button
        type="button"
        className="act-btn act-btn-gold"
        onClick={() => sendAction('revealall')}
        disabled={isBusy || state.revealed}
      >
        ✨ REVEAL FULL IMAGE
      </button>

      {/* Reset */}
      <button
        type="button"
        className="act-btn act-btn-secondary"
        style={{ opacity: 0.7 }}
        onClick={async () => {
          if (!window.confirm('Reset image reveal?')) return;
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
        🔄 Reset Image to Concealed
      </button>
    </div>
  );
};
