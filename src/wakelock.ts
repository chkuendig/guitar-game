import { track } from './telemetry';

/**
 * Keep the screen on while playing (no dimming / auto-lock), using the Screen
 * Wake Lock API. The browser drops the lock whenever the page is hidden, so it
 * is re-acquired when the page becomes visible again. Best effort: unsupported
 * or refused requests are logged and otherwise ignored.
 */
let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  if (!('wakeLock' in navigator)) {
    track('wakelock.unsupported');
    return;
  }
  if (sentinel && !sentinel.released) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    track('wakelock.acquired');
    sentinel.addEventListener('release', () => track('wakelock.released'));
  } catch (err) {
    track('wakelock.failed', { error: err instanceof Error ? `${err.name}: ${err.message}` : String(err) });
  }
}

/** Call from a user gesture (e.g. the Start button). */
export function keepScreenAwake(): void {
  if (!wanted) {
    wanted = true;
    document.addEventListener('visibilitychange', () => {
      if (wanted && document.visibilityState === 'visible') void acquire();
    });
  }
  void acquire();
}
