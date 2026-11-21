import './ui/style.css';
import { installTelemetry, track } from './telemetry';
import { App } from './ui/app';
import { pickLang } from './i18n';

installTelemetry();

const params = new URLSearchParams(window.location.search);
const lang = pickLang(params);
document.documentElement.lang = lang;
track('app.init', { lang, sim: params.get('sim') === '1' });
new App(document.getElementById('app')!, lang, params.get('sim') === '1');
