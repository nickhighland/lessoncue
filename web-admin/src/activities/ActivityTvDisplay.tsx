import React, { Component, ErrorInfo, ReactNode, useEffect, useMemo, useState } from 'react';
import { ActivityDisplay } from './ActivityDisplay';

type BoundaryProps = { children: ReactNode };
type BoundaryState = { error?: Error };

class ActivityStageBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = {};

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Activity TV renderer failed:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ActivityStageProblem
      title="The game stage stopped unexpectedly"
      detail="Use Previous or Next to keep moving. The host can safely reopen this Activity after the display reconnects."
    />;
  }
}
function ActivityStageProblem({ title, detail }: { title: string; detail: string }) {
  return <main className="activity-tv-display" data-activity-status="error" role="alert">
    <section className="activity-tv-problem">
      <span>DISPLAY RECOVERY</span>
      <h1>{title}</h1>
      <p>{detail}</p>
    </section>
  </main>;
}

/**
 * Full-screen Activity surface for embedded TV clients.
 *
 * The native app owns pairing, transport, and lesson navigation. This route
 * owns only the shared game renderer so Android TV never embeds a second copy
 * of the browser player's library and playback controls.
 */
export function ActivityTvDisplayApp() {
  const query = useMemo(() => new URLSearchParams(location.search), []);
  const runId = query.get('runId') || undefined;
  const definitionId = query.get('definitionId') || undefined;
  const lessonId = query.get('lessonId') || undefined;
  const lessonItemId = query.get('lessonItemId') || query.get('cue') || undefined;
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => {
      window.removeEventListener('online', connected);
      window.removeEventListener('offline', disconnected);
    };
  }, []);

  if (!runId && !definitionId) {
    return <ActivityStageProblem
      title="This Activity could not be identified"
      detail="Return to the lesson and launch the cue again."
    />;
  }

  return <main className="activity-tv-display" data-activity-status={online ? 'connected' : 'reconnecting'}>
    <ActivityStageBoundary>
      <ActivityDisplay
        runId={runId}
        definitionId={definitionId}
        lessonId={lessonId}
        lessonItemId={lessonItemId}
        interactive={false}
      />
    </ActivityStageBoundary>
    {!online && <div className="activity-tv-reconnect" role="status">
      Reconnecting to LessonCue…
    </div>}
  </main>;
}
