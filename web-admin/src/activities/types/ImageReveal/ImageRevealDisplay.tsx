import React, { useEffect, useRef, useState } from 'react';
import type { ActivityStateEnvelope } from '../../types';
import { playChimeSound, launchConfetti } from '../../effects';

interface ImageRevealState {
  currentStage?: number;
  revealed?: boolean;
  totalStages?: number;
  revealedAnswer?: string;
  audioNonce?: number;
  memoryCardsVisible?: boolean;
  memoryTimerRemainingMs?: number;
  revealedCardIds?: string[];
  memoryCards?: Array<{ id: string; label: string; match?: string }>;
}

interface ImageRevealConfig {
  imageUrl?: string;
  mediaId?: string;
  mode?: string;
  style?: string;
  totalStages?: number;
  stages?: number;
  prompt?: string;
  answer?: string;
  presetLabel?: string;
  title?: string;
  mediaMode?: string;
  audioUrl?: string;
  audioMediaId?: string;
  audioDurationSeconds?: number;
  audioTransform?: string;
  memorySeconds?: number;
  memoryCards?: Array<{ id: string; label: string; match?: string }>;
  comparisonImageUrl?: string;
  emojiClue?: string;
  rebusClue?: string;
  hint?: string;
}

export const ImageRevealDisplay: React.FC<{ envelope: ActivityStateEnvelope }> = ({ envelope }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const state: ImageRevealState = (envelope.state as ImageRevealState) || {};
  const config = (envelope as unknown as { config?: ImageRevealConfig }).config || {};
  const mediaMode = (config.mediaMode || 'image').toLowerCase();
  const imageUrl = config.imageUrl || (config.mediaId ? `/api/v1/media/${config.mediaId}/playback` : '/api/v1/media/placeholder');
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

  if (mediaMode === 'memorygrid') return <MemoryGridDisplay envelope={envelope} state={state} config={config} />;
  if (mediaMode === 'audio') return <AudioClueDisplay envelope={envelope} state={state} config={config} />;
  if (mediaMode === 'difference') return <DifferenceDisplay envelope={envelope} state={state} config={config} />;
  if (mediaMode === 'emoji') return <EmojiDecodeDisplay envelope={envelope} state={state} config={config} />;
  if (mediaMode === 'rebus') return <RebusRushDisplay envelope={envelope} state={state} config={config} />;

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
              alt={config.prompt || 'Mystery reveal image'}
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
          {!isRevealed && <div className="image-reveal-guess-hint">Guess now or wait for the next reveal</div>}
        </div>
      </div>
    </div>
  );
};

const DifferenceDisplay: React.FC<{ envelope: ActivityStateEnvelope; state: ImageRevealState; config: ImageRevealConfig }> = ({ envelope, state, config }) => {
  const revealed = state.revealed === true;
  const firstImage = config.imageUrl || '/api/v1/media/placeholder';
  const secondImage = config.comparisonImageUrl || firstImage;
  return <div className="activity-stage media-difference-stage">
    <div className="activity-stage-content">
      <div className="activity-header"><div className="stage-kicker">🕵️ {config.presetLabel || "WHAT'S DIFFERENT?"} · OBSERVE CLOSELY</div><h1 className="activity-title">{config.title || envelope.name || "What's Different?"}</h1><div className="activity-subtitle">{revealed ? (state.revealedAnswer || config.answer || 'Difference revealed!') : (config.prompt || 'What changed between these two scenes?')}</div></div>
      <div className="difference-board" aria-label="Two images to compare"><div className="difference-card"><span>A</span><img src={firstImage} alt="First scene" /></div><div className="difference-versus" aria-hidden="true">VS</div><div className="difference-card"><span>B</span><img src={secondImage} alt="Second scene" /></div></div>
      <div className={`difference-answer ${revealed ? 'revealed' : ''}`}>{revealed ? <><span>THE CHANGE</span><strong>{state.revealedAnswer || config.answer || 'The host has not added the answer yet.'}</strong></> : <span>Spot the change, then wait for the reveal.</span>}</div>
    </div>
  </div>;
};

const EmojiDecodeDisplay: React.FC<{ envelope: ActivityStateEnvelope; state: ImageRevealState; config: ImageRevealConfig }> = ({ envelope, state, config }) => {
  const revealed = state.revealed === true;
  return <div className="activity-stage media-emoji-stage">
    <div className="activity-stage-content">
      <div className="activity-header"><div className="stage-kicker">😀 {config.presetLabel || 'EMOJI DECODE'} · CRACK THE CLUE</div><h1 className="activity-title">{config.title || envelope.name || 'Emoji Decode'}</h1><div className="activity-subtitle">{revealed ? (state.revealedAnswer || config.answer || 'Decoded!') : (config.prompt || 'What do these emojis mean?')}</div></div>
      <div className="emoji-decode-card"><div className="emoji-decode-clue" aria-label="Emoji clue">{config.emojiClue || '❓'}</div><div className="emoji-decode-dots" aria-hidden="true">•••</div><div className={`emoji-decode-answer ${revealed ? 'revealed' : ''}`}>{revealed ? (state.revealedAnswer || config.answer || 'Add the answer in the editor') : '???'}</div></div>
      {!revealed && config.hint && <div className="media-clue-hint">Hint: {config.hint}</div>}
    </div>
  </div>;
};

const RebusRushDisplay: React.FC<{ envelope: ActivityStateEnvelope; state: ImageRevealState; config: ImageRevealConfig }> = ({ envelope, state, config }) => {
  const revealed = state.revealed === true;
  return <div className="activity-stage media-rebus-stage">
    <div className="activity-stage-content">
      <div className="activity-header"><div className="stage-kicker">🧩 {config.presetLabel || 'REBUS RUSH'} · THINK SIDEWAYS</div><h1 className="activity-title">{config.title || envelope.name || 'Rebus Rush'}</h1><div className="activity-subtitle">{revealed ? (state.revealedAnswer || config.answer || 'Rebus solved!') : (config.prompt || 'Read the symbols as a phrase.')}</div></div>
      <div className="rebus-rush-card"><div className="rebus-rush-clue" aria-label="Rebus clue">{config.rebusClue || '❓'}</div><div className="rebus-rush-rule" aria-hidden="true" /><div className={`rebus-rush-answer ${revealed ? 'revealed' : ''}`}>{revealed ? (state.revealedAnswer || config.answer || 'Add the answer in the editor') : 'What phrase is hiding here?'}</div></div>
      {!revealed && config.hint && <div className="media-clue-hint">Hint: {config.hint}</div>}
    </div>
  </div>;
};

const AudioClueDisplay: React.FC<{ envelope: ActivityStateEnvelope; state: ImageRevealState; config: ImageRevealConfig }> = ({ envelope, state, config }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const source = config.audioUrl || (config.audioMediaId ? `/api/v1/media/${config.audioMediaId}/playback` : '');
  const [playbackSource, setPlaybackSource] = useState(source);
  const [reverseReady, setReverseReady] = useState(config.audioTransform !== 'reverse');
  const [reverseFallback, setReverseFallback] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    setReverseFallback(false);
    if (!source || config.audioTransform !== 'reverse') {
      setPlaybackSource(source);
      setReverseReady(true);
      return () => undefined;
    }

    setPlaybackSource('');
    setReverseReady(false);
    if (!window.AudioContext) {
      setPlaybackSource(source);
      setReverseFallback(true);
      setReverseReady(true);
      return () => undefined;
    }
    const context = new window.AudioContext();
    let contextClosed = false;
    const closeContext = () => {
      if (contextClosed) return;
      contextClosed = true;
      void context.close().catch(() => undefined);
    };
    void fetch(source)
      .then(response => {
        if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
        return response.arrayBuffer();
      })
      .then(buffer => context.decodeAudioData(buffer))
      .then(decoded => {
        if (cancelled) return;
        for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
          const samples = decoded.getChannelData(channel);
          const reversed = new Float32Array(samples.length);
          for (let index = 0; index < samples.length; index += 1) reversed[index] = samples[samples.length - index - 1];
          samples.set(reversed);
        }
        objectUrl = URL.createObjectURL(audioBufferToWav(decoded));
        setPlaybackSource(objectUrl);
        setReverseReady(true);
      })
      .catch(() => {
        if (cancelled) return;
        // A teacher-provided clip still plays when a browser cannot decode the
        // source locally; the UI makes the fallback visible to the host.
        setPlaybackSource(source);
        setReverseFallback(true);
        setReverseReady(true);
      })
      .finally(closeContext);

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      closeContext();
    };
  }, [config.audioTransform, source]);

  useEffect(() => {
    if (!state.audioNonce || !audioRef.current || !playbackSource || !reverseReady) return;
    audioRef.current.currentTime = 0;
    void audioRef.current.play().catch(() => { /* Browsers may require a TV interaction before audio. */ });
  }, [playbackSource, reverseReady, state.audioNonce]);
  useEffect(() => {
    const audio = audioRef.current;
    const limit = Math.max(0, Number(config.audioDurationSeconds || 0));
    if (!audio || !limit) return;
    const stopAtLimit = () => {
      if (audio.currentTime >= limit) {
        audio.pause();
        audio.currentTime = 0;
      }
    };
    audio.addEventListener('timeupdate', stopAtLimit);
    return () => audio.removeEventListener('timeupdate', stopAtLimit);
  }, [config.audioDurationSeconds]);
  return <div className="activity-stage media-audio-stage">
    <div className="activity-stage-content">
      <div className="activity-header"><div className="stage-kicker">🔊 {config.presetLabel || 'SOUND CHECK'} · LISTEN CLOSELY</div><h1 className="activity-title">{config.title || envelope.name || 'Audio Challenge'}</h1><div className="activity-subtitle">{state.revealed ? (state.revealedAnswer || config.answer || 'Sound revealed!') : (config.prompt || 'What made that sound?')}</div></div>
      <div className="audio-clue-panel"><div className="audio-clue-orb" aria-hidden="true">{config.audioTransform === 'reverse' ? '↶' : '♫'}</div><div className="audio-clue-copy"><span>{config.audioTransform === 'reverse' ? 'REVERSED AUDIO' : 'AUDIO CLUE'}</span><strong>{source ? reverseFallback ? 'Playing the original clip' : 'Ready to play' : 'Add an audio clip in the editor'}</strong><small>{config.audioDurationSeconds ? `${config.audioDurationSeconds} second${config.audioDurationSeconds === 1 ? '' : 's'} · ` : ''}The host controls the reveal.</small></div><audio ref={audioRef} className="audio-clue-player" src={playbackSource || undefined} controls preload="metadata" /></div>
      {!state.revealed && <div className="interactive-help">Listen, make your guess, and watch for the answer reveal.</div>}
    </div>
  </div>;
};

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frameCount = buffer.length;
  const bytesPerSample = 2;
  const dataLength = frameCount * channels * bytesPerSample;
  const output = new ArrayBuffer(44 + dataLength);
  const view = new DataView(output);
  const writeText = (offset: number, value: string) => [...value].forEach((character, index) => view.setUint8(offset + index, character.charCodeAt(0)));
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, dataLength, true);
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return new Blob([output], { type: 'audio/wav' });
}

const MemoryGridDisplay: React.FC<{ envelope: ActivityStateEnvelope; state: ImageRevealState; config: ImageRevealConfig }> = ({ envelope, state, config }) => {
  const cards = state.memoryCards || config.memoryCards || [];
  const revealed = new Set(state.revealedCardIds || []);
  const visible = state.memoryCardsVisible === true;
  return <div className="activity-stage memory-grid-stage">
    <div className="activity-stage-content">
      <div className="activity-header"><div className="stage-kicker">🧠 {config.presetLabel || 'MEMORY GRID'} · {visible ? 'MEMORIZE!' : 'FIND THE PAIRS'}</div><h1 className="activity-title">{config.title || envelope.name || 'Memory Grid'}</h1><div className="activity-subtitle">{config.prompt || 'Remember what you see, then find the matching card.'}</div></div>
      <div className={`memory-grid-board ${visible ? 'memorize' : ''}`}>{cards.map((card, index) => { const isFaceUp = visible || revealed.has(card.id); return <div className={`memory-grid-card ${isFaceUp ? 'face-up' : ''} ${revealed.has(card.id) ? 'selected' : ''}`} key={card.id}><span>{isFaceUp ? card.label : '?'}</span><small>{isFaceUp ? `CARD ${index + 1}` : 'HIDDEN'}</small></div>; })}</div>
      {visible && <div className="memory-grid-callout">Look closely… the cards hide again when the host is ready.</div>}
      {!visible && !revealed.size && <div className="interactive-help">The host will reveal cards one at a time. Which two belong together?</div>}
    </div>
  </div>;
};
