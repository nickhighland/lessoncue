import React, { useRef } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { playChimeSound, playWhooshSound, launchConfetti } from '../../effects';
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

interface PrizeGridBoxConfig {
  boxNumber: number;
  frontText?: string;
  frontEmoji?: string;
  hiddenPrize?: string;
  label?: string;
  icon?: string;
  prize?: string;
}

export const PrizeGridDisplay: React.FC<{
  envelope: ActivityStateEnvelope;
  interactive?: boolean;
}> = ({ envelope, interactive = false }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const state: PrizeGridState = (envelope.state as PrizeGridState) || {};
  const boxes = state.boxes || [];
  const config = (envelope as unknown as { config?: { title?: string; boxes?: PrizeGridBoxConfig[] } }).config || {};
  const configuredBoxes = new Map((config.boxes || []).map(box => [box.boxNumber, box]));

  const totalPoints = boxes
    .filter(b => b.revealed && b.points)
    .reduce((sum, b) => sum + (b.points || 0), 0);

  const handleBoxClick = async (boxNumber: number, alreadyRevealed: boolean) => {
    if (alreadyRevealed || !interactive) return;
    try {
      playWhooshSound();
      playChimeSound();
      launchConfetti(containerRef.current, 60);
      await ActivityApi.executeCommand(envelope.runId, {
        action: 'revealbox',
        payload: { boxNumber }
      });
    } catch (err) {
      console.error('Failed to reveal box:', err);
    }
  };

  return (
    <div ref={containerRef} className="activity-stage">
      <div className="activity-stage-content">
        <div className="activity-header">
          <div className="stage-kicker">🎁 MYSTERY PRIZE GRID · {boxes.length} BOXES</div>
          <div className="prize-grid-scoreline">
            {totalPoints > 0 && (
              <span>
                ⭐ {totalPoints} Total Points
              </span>
            )}
          </div>
          <h1 className="activity-title">{config.title || envelope.name || 'Mystery Prize Grid'}</h1>
          <div className="activity-subtitle">Pick a box. Reveal the surprise.</div>
        </div>

        <div className="prizegrid-stage">
          <div className="prizegrid-boxes">
            {boxes.map(box => {
              const configured = configuredBoxes.get(box.boxNumber);
              const frontText = configured?.frontText || configured?.label || String(box.boxNumber);
              const frontEmoji = configured?.frontEmoji || configured?.icon || '🎁';
              return (
                <div
                  key={box.boxNumber}
                  className={`prize-box ${box.revealed ? 'revealed' : ''}`}
                  onClick={() => handleBoxClick(box.boxNumber, box.revealed)}
                  style={{ cursor: interactive ? 'pointer' : 'default' }}
                >
                  {/* Front (Closed Gold Mystery Box) */}
                  <div className="prize-box-front">
                    <div className="prize-box-number">{frontText}</div>
                    <div style={{ fontSize: '2rem', marginTop: '0.25rem' }}>{frontEmoji}</div>
                  </div>

                  {/* Back (Revealed Content) */}
                  <div className="prize-box-back">
                    <div className="prize-back-title">{box.prize || 'Mystery Revealed'}</div>
                    {box.points !== null && box.points !== undefined && (
                      <div className="prize-back-points">+{box.points} pts</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
