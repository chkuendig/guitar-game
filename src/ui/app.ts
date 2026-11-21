import { OPEN_STRINGS } from '../strings';
import { FRAME_SIZE } from '../config';
import { detectPitch } from '../pitch/detect';
import { rms } from '../pitch/synth';
import { nearestOpenString } from '../pitch/matcher';
import { GameEngine } from '../game/engine';
import type { GameEvent } from '../game/engine';
import { MicInput } from '../audio/mic';
import { PluckSynth } from '../audio/pluck';
import { SimSource } from '../sim';
import { STRINGS } from '../i18n';
import type { Lang, Strings } from '../i18n';

const ANALYSIS_INTERVAL_MS = 45;
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;

interface VizHeard {
  stringIndex: number | null;
  level: number;
  atMs: number;
}

interface VizPlayback {
  stringIndex: number;
  startMs: number;
}

export class App {
  private readonly t: Strings;
  private readonly root: HTMLElement;

  private readonly engine: GameEngine;
  private sim: SimSource | null = null;
  private ctx: AudioContext | null = null;
  private mic: MicInput | null = null;
  private synth: PluckSynth | null = null;

  private started = false;
  private simMode: boolean;
  private tuneMode = false;

  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly ringFill: SVGCircleElement;
  private readonly promptFigurine: HTMLElement;
  private readonly promptLabel: HTMLElement;
  private readonly message: HTMLElement;
  private readonly simBar: HTMLElement;
  private readonly startOverlay: HTMLElement;
  private readonly tuneScreen: HTMLElement;
  private readonly needle: SVGGElement;
  private readonly tuneFigurine: HTMLElement;
  private readonly tuneName: HTMLElement;
  private readonly tuneCents: HTMLElement;
  private readonly celebration: HTMLElement;
  private readonly celeFigurine: HTMLElement;

  private vizHeard: VizHeard | null = null;
  private playback: VizPlayback | null = null;
  private ringTarget = 0;
  private ringDisplay = 0;
  private phase = 0;
  private lastAnalysisMs = 0;
  private lastFrameMs = 0;
  private roundTimer: number | null = null;

  constructor(root: HTMLElement, lang: Lang, simRequested: boolean) {
    this.root = root;
    this.t = STRINGS[lang];
    this.simMode = simRequested;

    root.innerHTML = this.template();
    this.canvas = root.querySelector('#stringsCanvas')!;
    this.g = this.canvas.getContext('2d')!;
    this.ringFill = root.querySelector('#ringFill')!;
    this.promptFigurine = root.querySelector('#promptFigurine')!;
    this.promptLabel = root.querySelector('#promptLabel')!;
    this.message = root.querySelector('#message')!;
    this.simBar = root.querySelector('#simBar')!;
    this.startOverlay = root.querySelector('#startOverlay')!;
    this.tuneScreen = root.querySelector('#tuneScreen')!;
    this.needle = root.querySelector('#needle')!;
    this.tuneFigurine = root.querySelector('#tuneFigurine')!;
    this.tuneName = root.querySelector('#tuneName')!;
    this.tuneCents = root.querySelector('#tuneCents')!;
    this.celebration = root.querySelector('#celebration')!;
    this.celeFigurine = root.querySelector('#celeFigurine')!;

    this.engine = new GameEngine((e) => this.onEngineEvent(e));

    root.querySelector('#startBtn')!.addEventListener('click', () => void this.start());
    root.querySelector('#tuneBtn')!.addEventListener('click', () => this.setTuneMode(true));
    root.querySelector('#tuneBack')!.addEventListener('click', () => this.setTuneMode(false));

    window.addEventListener('keydown', (e) => {
      if (!this.simMode || !this.started) return;
      const index = '123456'.indexOf(e.key);
      if (index >= 0) this.pluckSim(index);
    });

    this.ringFill.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
    this.ringFill.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
  }

  private template(): string {
    const t = this.t;
    return `
      <header class="topbar">
        <div class="title">${t.title}</div>
        <button id="tuneBtn" class="chip" aria-label="${t.tune}">🎸</button>
      </header>
      <main class="stage">
        <section class="prompt">
          <div class="figurine-wrap">
            <svg class="ring" viewBox="0 0 120 120">
              <circle class="ring-bg" cx="60" cy="60" r="52"/>
              <circle class="ring-fill" id="ringFill" cx="60" cy="60" r="52"/>
            </svg>
            <div class="figurine" id="promptFigurine">🎸</div>
          </div>
          <div class="prompt-label" id="promptLabel">${t.listening}</div>
        </section>
        <canvas id="stringsCanvas"></canvas>
        <div class="message" id="message"></div>
        <div class="simbar hidden" id="simBar"></div>
      </main>
      <div class="overlay" id="startOverlay">
        <div class="start-card">
          <div class="start-fig">🎸</div>
          <h1>${t.title}</h1>
          <button id="startBtn" class="big-btn">${t.start}</button>
          ${this.simMode ? `<p class="sim-note">${t.simHint}</p>` : ''}
        </div>
      </div>
      <section class="tune hidden" id="tuneScreen">
        <div class="tune-card">
          <div class="tune-fig" id="tuneFigurine">🎵</div>
          <svg class="gauge" viewBox="0 0 300 150">
            <path class="gauge-arc" d="M 30 140 A 120 120 0 0 1 270 140"/>
            <line class="gauge-tick" x1="30" y1="140" x2="42" y2="132"/>
            <line class="gauge-tick" x1="150" y1="20" x2="150" y2="34"/>
            <line class="gauge-tick" x1="270" y1="140" x2="258" y2="132"/>
            <g id="needle" transform="rotate(0 150 140)">
              <line class="gauge-needle" x1="150" y1="140" x2="150" y2="38"/>
              <circle class="gauge-hub" cx="150" cy="140" r="8"/>
            </g>
          </svg>
          <div class="tune-readout"><span id="tuneName">–</span><span id="tuneCents"></span></div>
          <div class="tune-hint">${this.t.tunePrompt}</div>
          <button id="tuneBack" class="big-btn small">${t.back}</button>
        </div>
      </section>
      <div class="celebration hidden" id="celebration">
        <div class="cele-fig" id="celeFigurine"></div>
        <div class="cele-sparkles">✨ 🎉 ✨</div>
      </div>
    `;
  }

  private async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    try {
      this.ctx = new AudioContext();
      await this.ctx.resume();
    } catch {
      this.ctx = null;
    }
    const sampleRate = this.ctx?.sampleRate ?? 48000;
    this.sim = new SimSource(sampleRate, FRAME_SIZE);
    this.synth = this.ctx ? new PluckSynth(this.ctx) : null;

    if (!this.simMode) {
      try {
        this.mic = this.ctx ? await MicInput.create(this.ctx) : null;
      } catch {
        this.mic = null;
      }
      if (!this.mic) {
        this.simMode = true;
        this.message.textContent = this.t.micDenied;
      }
    }
    if (this.simMode) this.buildSimBar();

    this.startOverlay.classList.add('hidden');
    this.engine.start(performance.now());
    requestAnimationFrame((now) => this.loop(now));
  }

  private buildSimBar(): void {
    this.simBar.classList.remove('hidden');
    this.simBar.innerHTML = '';
    for (const s of OPEN_STRINGS) {
      const btn = document.createElement('button');
      btn.className = 'sim-btn';
      btn.style.setProperty('--string-color', s.color);
      btn.innerHTML = `<span class="sim-fig">${s.figurine}</span><span class="sim-name">${s.index + 1}</span>`;
      btn.addEventListener('click', () => this.pluckSim(s.index));
      this.simBar.appendChild(btn);
    }
  }

  private pluckSim(index: number): void {
    this.sim?.pluck(index, performance.now());
  }

  private setTuneMode(on: boolean): void {
    if (!this.started) return;
    this.tuneMode = on;
    this.tuneScreen.classList.toggle('hidden', !on);
    this.root.querySelector('.stage')!.classList.toggle('hidden', on);
    if (!on) this.engine.continueRound();
  }

  private onEngineEvent(e: GameEvent): void {
    const now = performance.now();
    switch (e.type) {
      case 'round': {
        const s = OPEN_STRINGS[e.target];
        this.promptFigurine.textContent = s.figurine;
        this.promptFigurine.style.filter = 'none';
        this.ringFill.style.stroke = s.color;
        this.promptLabel.textContent = this.t.listening;
        this.message.textContent = '';
        break;
      }
      case 'listening':
        this.promptLabel.textContent = this.t.listening;
        this.message.textContent = '';
        break;
      case 'pitch':
        this.vizHeard = { stringIndex: e.stringIndex, level: e.level, atMs: now };
        break;
      case 'hold':
        this.ringTarget = e.progress;
        break;
      case 'success': {
        const s = OPEN_STRINGS[e.target];
        const toneMs = this.synth ? this.synth.play(s) : e.toneMs;
        this.engine.notifyPlayback(now, toneMs);
        this.playback = { stringIndex: e.target, startMs: now };
        this.celeFigurine.textContent = s.figurine;
        this.celebration.classList.remove('hidden');
        this.celebration.classList.add('active');
        this.clearRoundTimer();
        this.roundTimer = window.setTimeout(() => {
          this.celebration.classList.add('hidden');
          this.celebration.classList.remove('active');
          this.playback = null;
          this.engine.beginRound(performance.now());
        }, toneMs + 800);
        break;
      }
      case 'hint': {
        const heard = OPEN_STRINGS[e.heard];
        const target = OPEN_STRINGS[e.target];
        this.message.innerHTML =
          `${heard.figurine} ${this.t.hintWas} <b style="color:${heard.color}">` +
          `${this.t.colorNames[heard.index]}</b> — ${this.t.hintTry} ` +
          `<b style="color:${target.color}">${this.t.colorNames[target.index]}</b> ${target.figurine}`;
        this.clearRoundTimer();
        this.roundTimer = window.setTimeout(() => this.engine.continueRound(), 2400);
        break;
      }
    }
  }

  private clearRoundTimer(): void {
    if (this.roundTimer !== null) {
      window.clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
  }

  private loop(now: number): void {
    const dt = this.lastFrameMs === 0 ? 16 : now - this.lastFrameMs;
    this.lastFrameMs = now;
    this.phase += dt * 0.012;

    if (now - this.lastAnalysisMs >= ANALYSIS_INTERVAL_MS) {
      this.lastAnalysisMs = now;
      this.analyze(now);
    }

    this.drawCanvas(now);
    this.updateRing(dt);
    requestAnimationFrame((t) => this.loop(t));
  }

  private analyze(now: number): void {
    const useMic = !this.simMode && this.mic !== null;
    const sampleRate = useMic ? this.mic!.sampleRate : (this.ctx?.sampleRate ?? 48000);
    const frame = useMic ? this.mic!.readFrame() : this.sim!.currentFrame(now);
    const level = rms(frame);
    const pitch = detectPitch(frame, sampleRate);

    if (this.tuneMode) {
      if (pitch) {
        const match = nearestOpenString(pitch.frequency);
        const s = OPEN_STRINGS[match.stringIndex];
        this.tuneFigurine.textContent = s.figurine;
        this.tuneName.textContent = s.name;
        this.tuneName.style.color = s.color;
        const cents = Math.round(match.cents);
        this.tuneCents.textContent =
          Math.abs(cents) <= 5 ? this.t.inTune : `${cents > 0 ? '+' : ''}${cents}`;
        const angle = Math.max(-50, Math.min(50, match.cents)) * 1.8;
        this.needle.setAttribute('transform', `rotate(${angle} 150 140)`);
      }
      return;
    }

    this.engine.processFrame(pitch?.frequency ?? null, level, now);
  }

  private drawCanvas(now: number): void {
    const canvas = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const g = this.g;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);

    const top = cssH * 0.14;
    const gap = (cssH * 0.72) / (OPEN_STRINGS.length - 1);
    const x0 = 64;
    const x1 = cssW - 14;
    const heardLive =
      this.vizHeard && now - this.vizHeard.atMs < 250 ? this.vizHeard : null;

    g.textBaseline = 'middle';
    for (const s of OPEN_STRINGS) {
      const y = top + gap * s.index;
      const isTarget = this.started && !this.tuneMode && s.index === this.engine.target;
      const isHeard = heardLive?.stringIndex === s.index;
      const isPlaying = this.playback?.stringIndex === s.index;

      let amp = 0;
      if (isHeard && heardLive) amp = 26 * Math.min(1, heardLive.level / 0.12);
      if (isPlaying && this.playback) {
        amp = Math.max(amp, 24 * Math.exp(-(now - this.playback.startMs) / 650));
      }

      // Figurine badge
      g.globalAlpha = isTarget || amp > 0.5 ? 1 : 0.45;
      g.font = '24px serif';
      g.fillStyle = '#ffffff';
      g.fillText(s.figurine, 12, y);
      if (isTarget) {
        g.strokeStyle = s.color;
        g.lineWidth = 2;
        g.beginPath();
        g.arc(24, y, 20, 0, Math.PI * 2);
        g.stroke();
      }

      // String
      g.globalAlpha = isTarget || amp > 0.5 ? 1 : 0.35;
      g.strokeStyle = s.color;
      g.lineWidth = isTarget ? 5 : 2.5;
      if (amp > 1) {
        g.shadowColor = s.color;
        g.shadowBlur = 8;
      }
      g.beginPath();
      if (amp > 0.5) {
        const cycles = 3;
        for (let i = 0; i <= 60; i++) {
          const x = x0 + ((x1 - x0) * i) / 60;
          const env = Math.sin((Math.PI * i) / 60); // pin the ends like a real string
          const yy = y + amp * env * Math.sin(cycles * 2 * Math.PI * (i / 60) + this.phase);
          if (i === 0) g.moveTo(x, yy);
          else g.lineTo(x, yy);
        }
      } else {
        g.moveTo(x0, y);
        g.lineTo(x1, y);
      }
      g.stroke();
      g.shadowBlur = 0;
    }
    g.globalAlpha = 1;
  }

  private updateRing(dt: number): void {
    if (this.ringDisplay < this.ringTarget) {
      const smooth = 1 - Math.exp(-dt / 70);
      this.ringDisplay += (this.ringTarget - this.ringDisplay) * smooth;
    } else {
      // Drain back smoothly instead of snapping to empty.
      this.ringDisplay = Math.max(this.ringTarget, this.ringDisplay - (dt / 1000) * 0.9);
    }
    this.ringFill.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - this.ringDisplay)}`;
  }
}
