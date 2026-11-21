import { App } from './ui/app';
import { pickLang } from './i18n';

const params = new URLSearchParams(window.location.search);
const lang = pickLang(params);
document.documentElement.lang = lang;
new App(document.getElementById('app')!, lang, params.get('sim') === '1');
