import React, { useEffect, useRef } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { playChimeSound, launchConfetti } from '../../effects';

interface ImageRevealState {
  currentStage?: number;
  revealed?: boolean;
  totalStages?: number;
  revealedAnswer?: string;
}

interface ImageRevealConfig {
  imageUrl?: string;
  mode?: string;
  style?: string;
  totalStages?: number;
  stages?: number;
  prompt?: string;
  answer?: string;
  presetLabel?: string;
}

export const ImageRevealDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const state: ImageRevealState = (envelope.state as ImageRevealState) || {};
  const config = (envelope as unknown as { config?: ImageRevealConfig }).config || {};
  const imageUrl = config.imageUrl || '/api/v1/media/placeholder';
  const totalStages = Math.max(1, config.totalStages || config.stages || 5);
  const currentStage = state.currentStage ?? 0;
  const isRevealed = state.revealed || currentStage >= totalStages;
  const revealStyle = config.style || 'blur';

  // Progressive unblur / pixelate: blur decreases as the host reveals stages.
  const blurAmount = isRevealed ? 0 : Math.max(0, (totalStages - currentStage) * 4);
  const revealPercent = Math.round((Math.min(currentStage, totalStages) / totalStages) * 100);
  const imageStyle: React.CSSProperties = {
    filter: isRevealed ? 'none' : revealStyle === 'silhouette' ? 'brightness(0) saturate(0)' : `blur(${blurAmount}px)${revealStyle === 'pixel' ? ' saturate(.7)' : ''}`,
    imageRendering: revealStyle === 'pixel' ? 'pixelated' : 'auto',
    transform: revealStyle === 'zoom' && !isRevealed ? `scale(${Math.max(1.05, 1.65 - revealPercent / 220)})` : undefined,
    clipPath: revealStyle === 'crop' && !isRevealed ? `inset(${Math.max(0, 34 - revealPercent / 2)}% ${Math.max(0, 28 - revealPercent / 3)}%)` : undefined
  };

  useEffect(() => {
    if (isRevealed) {
      playChimeSound();
      launchConfetti(containerRef.current, 80);
    }
  }, [isRevealed]);

  return (
    <div ref={containerRef} className="activity-stage">
      <div className="activity-stage-content">
        <div className="activity-header">
          <div className="stage-kicker">🔍 {config.presetLabel || 'MYSTERY IMAGE'} · {revealPercent}% REVEALED</div>
          <h1 className="activity-title">{envelope.name || 'Mystery Image Reveal'}</h1>
          <div className="activity-subtitle">
            {isRevealed ? (state.revealedAnswer || config.answer || 'Mystery solved!') : (config.prompt || 'Can you guess what it is?')}
          </div>
        </div>

        <div className={`image-reveal-frame ${isRevealed ? 'revealed' : ''}`}>
          {imageUrl && (
            <img
              src={imageUrl}
              alt="Mystery Reveal"
              className="image-reveal-image"
              style={imageStyle}
            />
          )}

          <div className="image-reveal-vignette" />
          {!isRevealed && <div className="image-reveal-scanlines" aria-hidden="true" />}
          <div className="image-reveal-progress">
            <span style={{ width: `${revealPercent}%` }} />
          </div>
          <div className="image-reveal-stage-count">STAGE {Math.min(currentStage, totalStages)} / {totalStages}</div>
        </div>
      </div>
    </div>
  );
};
