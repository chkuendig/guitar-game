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
new App(document.getElementById('app')!, lang, params.get('sim') === '1', trumpet);

// Keep the screen on once the game starts (needs the Start tap as user gesture).
document.getElementById('startBtn')?.addEventListener('click', keepScreenAwake);
