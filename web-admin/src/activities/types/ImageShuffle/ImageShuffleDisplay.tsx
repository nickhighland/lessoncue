import React, { useEffect, useRef, useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { playTickSound, playFanfareSound, launchConfetti } from '../../effects';

interface ShuffleImage {
  id: string;
  imageUrl?: string;
  url?: string;
  label?: string;
}

interface ImageShuffleState {
  selectedImageId?: string | null;
  selectedImageUrl?: string | null;
  selectedLabel?: string | null;
  isShuffling?: boolean;
  actionNonce?: number;
}

export const ImageShuffleDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const state: ImageShuffleState = (envelope.state as ImageShuffleState) || {};
  const config = (envelope as unknown as { config?: { images?: ShuffleImage[] } }).config || {};
  const images: ShuffleImage[] = (config.images || []).map(image => ({
    ...image,
    imageUrl: image.imageUrl || image.url || ''
  }));

  const [activeIdx, setActiveIdx] = useState(0);
  const [, setIsCycling] = useState(false);
  const [isWinner, setIsWinner] = useState(false);
  const lastNonceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.actionNonce !== undefined && state.actionNonce !== lastNonceRef.current && state.selectedImageId) {
      lastNonceRef.current = state.actionNonce;
      setIsWinner(false);
      setIsCycling(true);

      const targetIdx = Math.max(0, images.findIndex(image => image.id === state.selectedImageId));
      const durationMs = 3500;
      const startTime = performance.now();
      let lastTickTime = 0;
      let tickInterval = 60;
      let curr = 0;

      const animate = (now: number) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / durationMs);

        tickInterval = 60 + Math.pow(progress, 3) * 350;

        if (now - lastTickTime >= tickInterval) {
          lastTickTime = now;
          curr = (curr + 1) % (images.length || 1);
          setActiveIdx(curr);
          playTickSound();
        }

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setActiveIdx(targetIdx);
          setIsCycling(false);
          setIsWinner(true);
          playFanfareSound();
          launchConfetti(containerRef.current, 100);
        }
      };

      requestAnimationFrame(animate);
    }
  }, [state.actionNonce, state.selectedImageId, state.selectedImageUrl, images.length]);

  const currentImage = images[activeIdx] || images[0] || (state.selectedImageUrl ? {
    id: state.selectedImageId || 'selected',
    imageUrl: state.selectedImageUrl,
    label: state.selectedLabel || undefined
  } : undefined);

  return (
    <div ref={containerRef} className="activity-stage">
      <div className="activity-stage-content">
        <div className="activity-header">
          <div className="stage-kicker">🔀 VISUAL RANDOMIZER · {images.length} IMAGES</div>
          <h1 className="activity-title">{envelope.name || 'Image Shuffle'}</h1>
        </div>

        <div className={`image-shuffle-frame ${isWinner ? 'winner' : ''}`}>
          {currentImage && (
            <img
              src={currentImage.imageUrl || ''}
              alt={currentImage.label || 'Shuffle'}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
            />
          )}

          {currentImage?.label && (
            <div
              style={{
                position: 'absolute',
                bottom: '1rem',
                left: '50%',
                transform: 'translateX(-50%)',
                background: 'rgba(0, 0, 0, 0.8)',
                padding: '0.5rem 1.5rem',
                borderRadius: '12px',
                fontWeight: 800,
                fontSize: '1.4rem',
                color: '#fff'
              }}
            >
              {currentImage.label}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
