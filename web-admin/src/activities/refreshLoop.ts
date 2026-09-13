/** One cancellable request at a time, with one trailing refresh after a burst. */
export function createRefreshLoop(task: (signal: AbortSignal) => Promise<void>, interval: () => number) {
  let stopped = false;
  let queued = false;
  let pending: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  function refresh(): Promise<void> {
    if (stopped) return Promise.resolve();
    queued = true;
    clearTimeout(timer);
    if (pending) return pending;
    pending = (async () => {
      // Defer task invocation until pending is assigned (including sync tasks).
      await Promise.resolve();
      while (queued && !stopped) {
        queued = false;
        controller = new AbortController();
        const timeout = setTimeout(() => controller?.abort(), 10000);
        try { await task(controller.signal); }
        catch { /* task surfaces errors; transport failures must not end polling */ }
        finally { clearTimeout(timeout); }
      }
    })().finally(() => {
      pending = undefined;
      if (!stopped) timer = setTimeout(() => { void refresh(); }, interval());
    });
    return pending;
  }

  return {
    refresh,
    stop() {
      stopped = true;
      clearTimeout(timer);
      controller?.abort();
    },
  };
}
