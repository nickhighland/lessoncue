import React, { useEffect, useRef, useState } from 'react';
import type { ActivityStateEnvelope } from './types';
import { ActivityApi, activityHub } from './api';
import { getActivityDescriptor } from './activityRegistry';
import { activityThemeVariables, resolveActivityTheme } from './activityPalettes';
import { playGameTheme, resolveGameAudioChain, stopGameTheme } from './audio/gameAudio';
import { useAudioPreloader } from './audio/useAudioPreloader';
import './activity.css';

export interface ActivityDisplayProps {
  runId?: string;
  definitionId?: string;
  initialEnvelope?: ActivityStateEnvelope;
  lessonId?: string;
  lessonItemId?: string;
  interactive?: boolean;
}

export const ActivityDisplay: React.FC<ActivityDisplayProps> = ({
  runId: propRunId,
  definitionId,
  initialEnvelope,
  lessonId,
  lessonItemId
}) => {
  const [envelope, setEnvelope] = useState<ActivityStateEnvelope | null>(initialEnvelope || null);
  const [loading, setLoading] = useState(!initialEnvelope);
  const [error, setError] = useState<string | null>(null);

  // Music beds belong on the room's shared speaker, not on every phone, so the
  // display owns theme playback while phones stay effects-only. Both surfaces
  // preload the same pack.
  const audioChain = resolveGameAudioChain(envelope);
  const audioChainKey = audioChain.join('>');
  useAudioPreloader(audioChain, Boolean(envelope));
  const phase = typeof envelope?.state?.phase === 'string' ? envelope.state.phase : '';
  const inLobby = phase === 'lobby' || phase === 'setup';
  const finished = phase === 'finalResults' || phase === 'complete'
    || envelope?.status === 'ended' || envelope?.status === 'completed';
  const previousPhase = useRef<string | null>(null);

  useEffect(() => {
    if (!envelope) return;
    const chain = audioChainKey.split('>');
    const previous = previousPhase.current;
    previousPhase.current = phase;

    // Leaving the lobby for any phase is the start of play. Engines that skip
    // the optional `intro` phase still get their opening sting this way.
    const starting = previous !== null && (previous === 'lobby' || previous === 'setup') && !inLobby;

    if (inLobby) playGameTheme('lobby', { chain });
    else if (finished) playGameTheme('gameOutro', { chain });
    else if (starting) playGameTheme('gameIntro', { chain });
    else if (phase === 'roundIntro') playGameTheme('roundTransition', { chain });
    else if (previous === phase) return; // ordinary in-round update: leave audio alone
    else stopGameTheme();
    // Keyed on phase, not the envelope: state updates arrive constantly during
    // a round and must not restart the music each time.
  }, [audioChainKey, envelope, finished, inLobby, phase]);

  useEffect(() => stopGameTheme, []);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let isCancelled = false;

    const initRun = async () => {
      try {
        setError(null);
        setLoading(!initialEnvelope);
        if (!initialEnvelope) setEnvelope(null);
        let activeRun = initialEnvelope;

        if (!activeRun) {
          if (propRunId) {
            activeRun = await ActivityApi.getRun(propRunId);
          } else if (definitionId) {
            activeRun = await ActivityApi.getOrCreateRun({
              activityDefinitionId: definitionId,
              lessonId,
              lessonItemId
            });
          }
        }

        if (isCancelled) return;
        if (!activeRun) throw new Error('Activity run is not available.');
        setEnvelope(activeRun);
        setLoading(false);

        // Subscribe to live SignalR updates
        unsubscribe = await activityHub.subscribeRun(activeRun.runId, updated => {
          if (!isCancelled) {
            setEnvelope(updated);
          }
        });
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to initialize activity display:', err);
          setError((err as Error).message || 'Failed to load activity');
          setLoading(false);
        }
      }
    };

    initRun();

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [propRunId, definitionId, initialEnvelope, lessonId, lessonItemId]);

  if (loading) {
    return (
      <div className="activity-display-root" data-activity-status="loading">
        <div className="activity-stage activity-stage-message">
          <div className="activity-stage-message-card">
            <span>GET READY</span>
            <strong>Loading the game stage…</strong>
          </div>
        </div>
      </div>
    );
  }

  if (error || !envelope) {
    return (
      <div className="activity-display-root" data-activity-status="error">
        <div className="activity-stage activity-stage-message">
          <div className="activity-stage-message-card error" role="alert">
            <span>DISPLAY RECOVERY</span>
            <strong>{error || 'Activity not available'}</strong>
            <small>Use Previous or Next to continue, then try this cue again.</small>
          </div>
        </div>
      </div>
    );
  }

  const descriptor = getActivityDescriptor(envelope.type);
  const DisplayComponent = descriptor.displayComponent;
  // Each engine and named preset carries its own colour identity. A theme the
  // teacher actually customised always wins over the generated palette.
  const theme = resolveActivityTheme(envelope.type, envelope.config?.preset, envelope.theme);

  return <div
    className={`activity-display-root activity-theme-${envelope.theme?.preset || 'stage'}`}
    data-activity-status="ready"
    data-activity-type={envelope.type}
    data-activity-preset={typeof envelope.config?.preset === 'string' ? envelope.config.preset : undefined}
    data-activity-motion={envelope.theme?.backgroundMotion === false ? 'off' : 'on'}
    data-activity-run-id={envelope.runId}
    style={activityThemeVariables(theme)}
  >
    <DisplayComponent
      envelope={envelope}
      // Interactive activity mechanics belong to the teacher controller. The
      // stage is a spectator surface even when a caller accidentally omits
      // the prop or passes the old preview default.
      interactive={false}
    />
  </div>;
};
