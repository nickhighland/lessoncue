import React, { useEffect, useState } from 'react';
import type { ActivityStateEnvelope } from './types';
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
        let activeRun = envelope;

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

        if (isCancelled || !activeRun) return;
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
  }, [propRunId, definitionId, lessonId, lessonItemId]);

  if (loading) {
    return (
      <div className="activity-stage">
        <div style={{ color: '#00f0ff', fontSize: '1.8rem', fontWeight: 800 }}>
          ⚡ Loading Game Stage...
        </div>
      </div>
    );
  }

  if (error || !envelope) {
    return (
      <div className="activity-stage">
        <div style={{ color: '#ef4444', fontSize: '1.5rem', fontWeight: 700 }}>
          ⚠️ {error || 'Activity not available'}
        </div>
      </div>
    );
  }

  const descriptor = getActivityDescriptor(envelope.type);
  const DisplayComponent = descriptor.displayComponent;

  return (
    <DisplayComponent
      envelope={envelope}
      // Interactive activity mechanics belong to the teacher controller. The
      // stage is a spectator surface even when a caller accidentally omits
      // the prop or passes the old preview default.
      interactive={false}
    />
  );
};
