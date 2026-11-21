/**
 * Dev-only telemetry: ships client events to the Vite dev server
 * (POST /__telemetry → telemetry.log, JSON lines) so device behaviour can be
 * inspected remotely while testing on a phone/tablet.
 *
 * In production builds `import.meta.env.DEV` is false: `track()` is a no-op
 * and nothing is installed — the shipped game has no backend.
 */

type Fields = Record<string, unknown>;

const ENABLED = import.meta.env.DEV;
const ENDPOINT = '/__telemetry';
const session = Math.random().toString(36).slice(2, 8);
const t0 = performance.now();
let queue: Fields[] = [];
let flushTimer: number | undefined;

function flush(): void {
  flushTimer = undefined;
  if (queue.length === 0) return;
  const body = JSON.stringify(queue);
  queue = [];
  // keepalive so events survive a page reload / tab close.
  fetch(ENDPOINT, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(
    () => {},
  );
}

/** Record one event. Cheap; batched and sent within ~500 ms. */
export function track(event: string, fields: Fields = {}): void {
  if (!ENABLED) return;
  queue.push({ session, ms: Math.round(performance.now() - t0), event, ...fields });
  if (queue.length >= 50) flush();
  else if (flushTimer === undefined) flushTimer = window.setTimeout(flush, 500);
}

function describeError(err: unknown): Fields {
  if (err instanceof Error) return { name: err.name, message: err.message, stack: err.stack?.split('\n').slice(0, 6).join('\n') };
  return { message: String(err) };
}

/** Install global hooks (errors, mic, audio, taps). Call once, before the app starts. */
export function installTelemetry(): void {
  if (!ENABLED) return;

  track('load', {
    url: location.href,
    ua: navigator.userAgent,
    secureContext: window.isSecureContext,
    hasMediaDevices: !!navigator.mediaDevices?.getUserMedia,
    viewport: `${innerWidth}x${innerHeight}@${devicePixelRatio}`,
  });

  window.addEventListener('error', (e) => track('error', { ...describeError(e.error ?? e.message), src: e.filename, line: e.lineno }));
  window.addEventListener('unhandledrejection', (e) => track('unhandledrejection', describeError(e.reason)));

  // Taps on anything with an id or a button — shows what the user actually hit.
  document.addEventListener(
    'pointerdown',
    (e) => {
      const el = (e.target as HTMLElement | null)?.closest('button, [id]');
      if (el) track('tap', { id: el.id || undefined, text: el.textContent?.trim().slice(0, 30) });
    },
    { capture: true },
  );

  // Wrap getUserMedia: log request, success (track settings) or failure (error name).
  // Patched on the prototype *and* the instance via defineProperty: some
  // in-app browsers (Firefox iOS) install their own getUserMedia, and plain
  // assignment silently didn't take there.
  const md = navigator.mediaDevices;
  if (md?.getUserMedia) {
    const original = md.getUserMedia;
    const wrapped = async function (this: MediaDevices, constraints?: MediaStreamConstraints) {
      track('mic.request', { constraints });
      try {
        const stream = await original.call(this ?? md, constraints);
        const tr = stream.getAudioTracks()[0];
        track('mic.granted', { label: tr?.label, settings: tr?.getSettings() });
        tr?.addEventListener('ended', () => track('mic.ended'));
        return stream;
      } catch (err) {
        track('mic.failed', describeError(err));
        throw err;
      }
    };
    for (const target of [Object.getPrototypeOf(md), md]) {
      try {
        Object.defineProperty(target, 'getUserMedia', { value: wrapped, configurable: true, writable: true });
      } catch (err) {
        track('telemetry.hookFailed', { what: 'getUserMedia', ...describeError(err) });
      }
    }
    track('telemetry.micHook', { installed: navigator.mediaDevices.getUserMedia === wrapped });
  }
  // Record what the app tells the user (e.g. "microphone not available").
  const watchText = () => {
    const msg = document.getElementById('message');
    if (!msg) return;
    new MutationObserver(() => {
      const text = msg.textContent?.trim();
      if (text) track('ui.message', { text: text.slice(0, 120) });
    }).observe(msg, { childList: true, characterData: true, subtree: true });
  };
  queueMicrotask(watchText);

  // Wrap AudioContext: log creation, sample rate and state changes.
  const AC = window.AudioContext;
  if (AC) {
    window.AudioContext = class extends AC {
      constructor(opts?: AudioContextOptions) {
        super(opts);
        track('audio.context', { state: this.state, sampleRate: this.sampleRate, baseLatency: this.baseLatency });
        this.addEventListener('statechange', () => track('audio.state', { state: this.state }));
      }
    };
  }

  document.addEventListener('visibilitychange', () => {
    track('visibility', { state: document.visibilityState });
    if (document.visibilityState === 'hidden') flush();
  });
}
