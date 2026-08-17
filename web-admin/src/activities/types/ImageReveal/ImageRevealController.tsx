import React, { useCallback, useEffect, useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { ActivityApi } from '../../api';

export const ImageRevealController: React.FC<{
  envelope: ActivityStateEnvelope;
  onCommandSent?: () => void;
}> = ({ envelope, onCommandSent }) => {
  const [isBusy, setIsBusy] = useState(false);
  const state = (envelope.state as { currentStage?: number; revealed?: boolean; isAutoPlaying?: boolean; memoryCardsVisible?: boolean; revealedCardIds?: string[]; audioNonce?: number }) || {};
  const config = (envelope as unknown as {
    config?: { totalStages?: number; stages?: number; autoIntervalSeconds?: number; mediaMode?: string; memoryCards?: Array<{ id: string; label: string }> }
  }).config || {};
  const mediaMode = (config.mediaMode || 'image').toLowerCase();
  const currentStage = state.currentStage ?? 0;
  const totalStages = config.totalStages || config.stages || 5;

  const sendAction = useCallback(async (action: string, payload?: Record<string, unknown>) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await ActivityApi.executeCommand(envelope.runId, {
        action,
        payload,
      });
      onCommandSent?.();
    } catch (err) {
      console.error(`Failed to execute ${action}:`, err);
    } finally {
      setIsBusy(false);
    }
  }, [envelope.runId, isBusy, onCommandSent]);

  useEffect(() => {
    if (!state.isAutoPlaying || state.revealed || currentStage >= totalStages) return;
    const intervalMs = Math.max(1, Number(config.autoIntervalSeconds || 3)) * 1000;
    const timer = window.setInterval(() => { void sendAction('revealstage'); }, intervalMs);
    return () => window.clearInterval(timer);
  }, [config.autoIntervalSeconds, currentStage, sendAction, state.isAutoPlaying, state.revealed, totalStages]);

  return (
    <div className="act-ctrl-container">
      {mediaMode === 'audio' && <div className="act-ctrl-card media-control-card"><strong>Audio clue</strong><span>Play the sound from the TV, then reveal the answer when the room has guessed.</span><button type="button" className="act-btn act-btn-primary" onClick={() => sendAction('playaudio')} disabled={isBusy}>🔊 Play audio clue</button></div>}
      {mediaMode === 'memorygrid' && <>
        <div className="act-ctrl-card media-control-card"><strong>Memory Grid</strong><span>{state.memoryCardsVisible ? 'Cards are visible. Hide them when the room is ready.' : 'Reveal selected cards after the memorization moment.'}</span><div className="act-controller-button-row"><button type="button" className="act-btn act-btn-primary" onClick={() => sendAction('showallcards')} disabled={isBusy}>👀 Show all cards</button><button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('hidecards')} disabled={isBusy || !state.memoryCardsVisible}>Hide cards</button><button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction('clearcards')} disabled={isBusy}>Clear picks</button></div></div>
        <div className="memory-controller-grid">{(config.memoryCards || []).map(card => <button type="button" className={`memory-controller-card ${(state.revealedCardIds || []).includes(card.id) ? 'selected' : ''}`} key={card.id} onClick={() => void sendAction('revealcard', { cardId: card.id })} disabled={isBusy || state.memoryCardsVisible === true}><strong>{(state.revealedCardIds || []).includes(card.id) ? card.label : '?'}</strong><small>{card.id}</small></button>)}</div>
      </>}
      {mediaMode !== 'memorygrid' && mediaMode !== 'audio' && <>
      {/* Current Stage Indicator */}
      <div className="act-ctrl-card" style={{ textAlign: 'center' }}>
        <div style={{ color: 'var(--gold)', fontSize: '0.9rem', fontWeight: 700, textTransform: 'uppercase' }}>
          Reveal Progress
        </div>
        <div style={{ fontSize: '2rem', fontWeight: 900, marginTop: '0.25rem', color: 'var(--ink)' }}>
          Stage {Math.min(currentStage, totalStages)} / {totalStages}
        </div>
      </div>

      <div className="act-controller-button-row image-reveal-controller-actions">
      <button
        type="button"
        className="act-btn act-btn-primary"
        onClick={() => sendAction('prevstage')}
        disabled={isBusy || currentStage <= 0}
      >
        ◀ Previous stage
      </button>
      <button
        type="button"
        className="act-btn act-btn-primary"
        onClick={() => sendAction('revealstage')}
        disabled={isBusy || state.revealed || currentStage >= totalStages}
      >
        🔍 REVEAL NEXT STAGE (+1)
      </button>
      </div>

      <div className="act-controller-button-row image-reveal-controller-actions">
      <button type="button" className="act-btn act-btn-secondary" onClick={() => sendAction(state.isAutoPlaying ? 'pauseauto' : 'startauto')} disabled={isBusy || state.revealed}>
        {state.isAutoPlaying ? '⏸ Pause auto reveal' : '▶ Auto reveal'}
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
      </div>

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
      </>}
      {(mediaMode === 'memorygrid' || mediaMode === 'audio') && <button type="button" className="act-btn act-btn-secondary" style={{ opacity: 0.7 }} onClick={() => sendAction('reset')} disabled={isBusy}>🔄 Reset activity</button>}
    </div>
  );
};
