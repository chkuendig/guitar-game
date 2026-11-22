import './ui/style.css';
import { installTelemetry, track } from './telemetry';
import { App } from './ui/app';
import { pickLang } from './i18n';
import { keepScreenAwake } from './wakelock';

installTelemetry();

const params = new URLSearchParams(window.location.search);
const lang = pickLang(params);
document.documentElement.lang = lang;
// Hidden option: ?trumpet adds the trumpet (🎺) as a 7th target.
const trumpet = params.has('trumpet');
track('app.init', { lang, sim: params.get('sim') === '1', trumpet });
const app = new App(document.getElementById('app')!, lang, params.get('sim') === '1', trumpet);
// Sim-only test helpers (no mic involved): ?autostart skips the Start tap,
// ?mode=tune|pluck|play opens a mode, ?simdemo plucks by itself.
if (params.get('sim') === '1') app.simTestHooks(params);

// Keep the screen on once the game starts (needs the Start tap as user gesture).
document.getElementById('startBtn')?.addEventListener('click', keepScreenAwake);
