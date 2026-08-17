import React, { CSSProperties, useEffect, useState } from 'react';
import type { ActivityStateEnvelope, ActivityTheme } from './types';
import { ActivityApi, activityHub } from './api';
import { getActivityDescriptor } from './activityRegistry';
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

  return <div
    className={`activity-display-root activity-theme-${envelope.theme?.preset || 'stage'}`}
    data-activity-status="ready"
    data-activity-type={envelope.type}
    data-activity-preset={typeof envelope.config?.preset === 'string' ? envelope.config.preset : undefined}
    data-activity-run-id={envelope.runId}
    style={activityThemeVariables(envelope.theme)}
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

function activityThemeVariables(theme?: ActivityTheme | null): CSSProperties {
  const primary = theme?.primaryColor || '#2a6e4a';
  const secondary = theme?.secondaryColor || '#2563eb';
  const accent = theme?.accentColor || '#f59e0b';
  const background = theme?.backgroundColor || '#091c1d';
  return {
    '--act-gold': accent,
    '--act-gold-start': accent,
    '--act-gold-end': primary,
    '--act-green': primary,
    '--act-green-bright': secondary,
    '--act-stage-bg': background,
    '--act-stage-primary': primary,
    '--act-stage-secondary': secondary,
    '--act-stage-accent': accent,
    '--act-stage-primary-soft': colorWithAlpha(primary, 0.26),
    '--act-stage-secondary-soft': colorWithAlpha(secondary, 0.22),
    '--act-stage-accent-soft': colorWithAlpha(accent, 0.18),
    '--act-stage-text': theme?.textColor || '#ffffff',
  } as CSSProperties;
}

function colorWithAlpha(value: string, alpha: number) {
  const match = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!match) return value;
  const number = Number.parseInt(match[1], 16);
  return `rgba(${number >> 16}, ${(number >> 8) & 255}, ${number & 255}, ${alpha})`;
}
