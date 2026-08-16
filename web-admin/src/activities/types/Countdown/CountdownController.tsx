import React, { useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';

interface CountdownState {
  remainingMs?: number;
  isRunning?: boolean;
}

export const CountdownController: React.FC<{
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
}> = ({ envelope, onCommandSent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const state: CountdownState = (envelope.state as CountdownState) || {};

  const handleStart = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action: 'start',
      });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to start countdown:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handlePause = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action: 'pause',
      });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to pause countdown:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleAdjust = async (deltaSeconds: number) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action: 'adjusttime',
        payload: { deltaSeconds }
      });
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to adjust time:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const handleReset = async () => {
    setIsBusy(true);
    try {
      await ActivityApi.resetRun(envelope.runId);
      onCommandSent?.();
    } catch (err) {
      console.error('Failed to reset countdown:', err);
    } finally {
      setIsBusy(false);
    }
  };

  const totalSecsLeft = Math.ceil((state.remainingMs ?? 60000) / 1000);
  const minutes = Math.floor(totalSecsLeft / 60);
  const seconds = totalSecsLeft % 60;
  const formatted = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className="act-ctrl-container">
      {/* Big Display Clock */}
      <div className="act-ctrl-card" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '3rem', fontWeight: 900, fontVariantNumeric: 'tabular-nums', color: 'var(--ink)' }}>
          {formatted}
        </div>
        <div style={{ color: state.isRunning ? 'var(--green)' : 'var(--muted)', fontWeight: 700 }}>
          {state.isRunning ? '● RUNNING' : '❚❚ PAUSED'}
        </div>
      </div>

      {/* Start / Pause Control */}
      {state.isRunning ? (
        <button
          type="button"
          className="act-btn act-btn-danger"
          style={{ height: '64px', fontSize: '1.3rem' }}
          onClick={handlePause}
          disabled={isBusy}
        >
          ❚❚ PAUSE TIMER
        </button>
      ) : (
        <button
          type="button"
          className="act-btn act-btn-primary"
          style={{ height: '64px', fontSize: '1.3rem' }}
          onClick={handleStart}
          disabled={isBusy || totalSecsLeft === 0}
        >
          ▶ START TIMER
        </button>
      )}

      {/* Quick Time Adjustments */}
      <div className="act-ctrl-card">
        <h4 style={{ margin: '0 0 0.5rem', fontSize: '0.95rem', color: 'var(--muted)' }}>
          Adjust Time
        </h4>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
          <button
            type="button"
            className="act-btn act-btn-secondary"
            onClick={() => handleAdjust(-30)}
            disabled={isBusy}
          >
            -30s
          </button>
          <button
            type="button"
            className="act-btn act-btn-secondary"
            onClick={() => handleAdjust(-10)}
            disabled={isBusy}
          >
            -10s
          </button>
          <button
            type="button"
            className="act-btn act-btn-secondary"
            onClick={() => handleAdjust(10)}
            disabled={isBusy}
          >
            +10s
          </button>
          <button
            type="button"
            className="act-btn act-btn-secondary"
            onClick={() => handleAdjust(30)}
            disabled={isBusy}
          >
            +30s
          </button>
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
        🔄 Reset to Initial Time
      </button>
    </div>
  );
};
