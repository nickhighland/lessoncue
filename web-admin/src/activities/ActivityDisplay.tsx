import React, { useEffect, useRef, useState } from 'react';
import type { ActivityStateEnvelope } from './types';
import { ActivityApi, activityHub } from './api';
import { getActivityDescriptor } from './activityRegistry';
import { activityThemeVariables, resolveActivityTheme } from './activityPalettes';
import { playGameTheme, resolveGameAudioChain, stopGameTheme } from './audio/gameAudio';
import { finalStretchDue, stageBedFor } from './audio/stageAudio';
import { TIMED_PHASES } from './activityPhase';
import { useActivityCountdown, useDeadlineCountdown } from './ActivityMotion';
import { useAudioPreloader } from './audio/useAudioPreloader';
import './activity.css';
// The shared tactile/lobby layer must load on the stage too, not only on the
// participant bundle, and after activity.css so equal-specificity rules win.
import './activity-juice.css';

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

  // The same two clocks the stage draws. One of them running is what makes
  // this a timed moment, and the remaining time is what the final-five cue
  // waits for.
  const state = (envelope?.state || {}) as Record<string, unknown>;
  const timerDurationMs = typeof state.timerDurationMs === 'number' ? state.timerDurationMs : 0;
  const timerRunning = state.timerRunning === true && timerDurationMs > 0;
  const timerRemainingMs = useActivityCountdown({
    durationMs: timerDurationMs,
    startedAt: state.timerStartedAt,
    pausedAt: state.timerPausedAt,
    running: timerRunning,
  });
  const deadlineRemainingMs = useDeadlineCountdown(state.autoAdvanceAt);
  const autoCounting = !timerRunning && deadlineRemainingMs !== null
    && TIMED_PHASES.includes(phase);
  const countingDown = !inLobby && !finished && (timerRunning || autoCounting);
  const countdownRemainingMs = !countingDown
    ? null
    : timerRunning ? timerRemainingMs : deadlineRemainingMs;
  const previousRemaining = useRef<number | null>(null);

  useEffect(() => {
    if (!envelope) return;
    const chain = audioChainKey.split('>');
    const previous = previousPhase.current;
    previousPhase.current = phase;

    // Leaving the lobby for any phase is the start of play. Engines that skip
    // the optional `intro` phase still get their opening sting this way.
    const starting = previous !== null && (previous === 'lobby' || previous === 'setup') && !inLobby;

    // Stings mark the moments. They play over the bed now rather than
    // replacing it, so the music no longer stops for each one.
    if (finished) playGameTheme('gameOutro', { chain });
    else if (starting) playGameTheme('gameIntro', { chain });
    else if (phase === 'roundIntro' && previous !== phase) playGameTheme('roundTransition', { chain });
    // Keyed on phase, not the envelope: state updates arrive constantly during
    // a round and must not restart anything each time.
  }, [audioChainKey, envelope, finished, inLobby, phase]);

  // The bed is a question about the game's state rather than about a moment,
  // so it is set from that state on every render. Asking for the bed that is
  // already playing does nothing.
  useEffect(() => {
    if (!envelope) return;
    const chain = audioChainKey.split('>');
    const bed = stageBedFor({ inLobby, finished, counting: countingDown });
    if (bed) playGameTheme(bed, { chain });
    else stopGameTheme();
  }, [audioChainKey, envelope, inLobby, finished, countingDown]);

  // An announcement as a timed window opens, and the last five seconds -- both
  // one-shots, so a recording of a count can be dropped in for either.
  useEffect(() => {
    if (!envelope || !countingDown) return;
    playGameTheme('countdownAnnounce', { chain: audioChainKey.split('>') });
  }, [audioChainKey, envelope, countingDown]);

  useEffect(() => {
    if (!envelope) return;
    if (finalStretchDue(previousRemaining.current, countdownRemainingMs)) {
      playGameTheme('countdownFinalFive', { chain: audioChainKey.split('>') });
    }
    previousRemaining.current = countdownRemainingMs;
  }, [audioChainKey, envelope, countdownRemainingMs]);

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
        const runId = activeRun.runId;
        unsubscribe = await activityHub.subscribeRun(runId, updated => {
          if (!isCancelled) {
            setEnvelope(updated);
          }
        });

        // Read once more now the subscription exists. Anything that changed
        // between the first read and this point was pushed to nobody -- which
        // on a slow machine is exactly when a host presses Start, and the room
        // is left looking at the lobby.
        if (!isCancelled) {
          try {
            const current = await ActivityApi.getRun(runId);
            if (!isCancelled) setEnvelope(current);
          } catch {
            // The subscription is live; the next push will carry the truth.
          }
        }
      } catch (err) {
        if (!isCancelled) {
          console.error('Failed to initialize activity display:', err);
          setError((err as Error).message || 'Failed to load activity');
          setLoading(false);
        }
      }
    };

    initRun();

    // A slow safety net under the live connection. A television is left running
    // for an hour at a time, and a dropped or missed push should heal itself
    // rather than leaving the room looking at a stale screen until somebody
    // reloads the browser.
    const heal = window.setInterval(() => {
      const runId = propRunId || initialEnvelope?.runId;
      if (!runId || isCancelled) return;
      void ActivityApi.getRun(runId)
        .then(current => { if (!isCancelled) setEnvelope(current); })
        .catch(() => { /* offline for a moment; the next tick tries again */ });
    }, 5_000);

    return () => {
      isCancelled = true;
      window.clearInterval(heal);
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
