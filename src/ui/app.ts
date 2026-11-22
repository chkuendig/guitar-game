import { OPEN_STRINGS } from '../strings';
import { CLARITY_THRESHOLD, DETECT_MAX_HZ, DETECT_MIN_HZ, FRAME_SIZE, WIDE_MAX_HZ, WIDE_MIN_HZ } from '../config';
import { detectPitch } from '../pitch/detect';
import { rms } from '../pitch/synth';
import { nearestOpenString } from '../pitch/matcher';
import { GameEngine, TRUMPET } from '../game/engine';
import type { GameEvent } from '../game/engine';
import { MicInput } from '../audio/mic';
import { PluckSynth } from '../audio/pluck';
import { playFanfare } from '../audio/fanfare';
import { SimSource } from '../sim';
import { SongEngine } from '../play/song-engine';
import type { SongEvent } from '../play/song-engine';
import { SONGS, midiToFrequency, stringFigurine } from '../play/songs';
import type { Song } from '../play/songs';
import { track } from '../telemetry';
import { STRINGS } from '../i18n';
import type { Lang, Strings } from '../i18n';

const ANALYSIS_INTERVAL_MS = 45;
const RING_CIRCUMFERENCE = 2 * Math.PI * 52;
// Hidden ?trumpet option.
const TRUMPET_FIGURINE = '🎺';
const TRUMPET_COLOR = '#f5b700';

interface VizHeard {
  stringIndex: number | null;
  level: number;
  atMs: number;
}

type Mode = 'tune' | 'pluck' | 'play';

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
  /** Tune · Pluck · Play. Pluck (the original game) is the default. */
  private mode: Mode = 'pluck';
  private readonly songEngine: SongEngine;

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
  private readonly stage: HTMLElement;
  private readonly fretBadge: HTMLElement;
  private readonly songStrip: HTMLElement;
  private readonly songPicker: HTMLElement;
  private readonly songsBtn: HTMLElement;

  private vizHeard: VizHeard | null = null;
  private playback: VizPlayback | null = null;
  private ringTarget = 0;
  private ringDisplay = 0;
  private phase = 0;
  private lastAnalysisMs = 0;
  private lastFrameMs = 0;
  private roundTimer: number | null = null;
  private lastPitchTrackMs = 0;
  private prevLevel = 0;
  /** Telemetry: frames after a sudden onset — [ms, level, hz, centroidHz]. */
  private onset: { startMs: number; before: number; frames: [number, number, number | null, number][] } | null = null;

  /** Hidden option (?trumpet): the trumpet is a 7th target. */
  private readonly trumpetEnabled: boolean;

  constructor(root: HTMLElement, lang: Lang, simRequested: boolean, trumpet = false) {
    this.trumpetEnabled = trumpet;
    this.root = root;
    this.t = STRINGS[lang];
    this.simMode = simRequested;

    root.innerHTML = this.template();
    this.canvas = root.querySelector('#stringsCanvas') as HTMLCanvasElement;
    this.g = this.canvas.getContext('2d')!;
    this.ringFill = root.querySelector('#ringFill') as SVGCircleElement;
    this.promptFigurine = root.querySelector('#promptFigurine')!;
    this.promptLabel = root.querySelector('#promptLabel')!;
    this.message = root.querySelector('#message')!;
    this.simBar = root.querySelector('#simBar')!;
    this.startOverlay = root.querySelector('#startOverlay')!;
    this.tuneScreen = root.querySelector('#tuneScreen')!;
    this.needle = root.querySelector('#needle') as unknown as SVGGElement;
    this.tuneFigurine = root.querySelector('#tuneFigurine')!;
    this.tuneName = root.querySelector('#tuneName')!;
    this.tuneCents = root.querySelector('#tuneCents')!;
    this.celebration = root.querySelector('#celebration')!;
    this.celeFigurine = root.querySelector('#celeFigurine')!;
    this.stage = root.querySelector('.stage')!;
    this.fretBadge = root.querySelector('#fretBadge')!;
    this.songStrip = root.querySelector('#songStrip')!;
    this.songPicker = root.querySelector('#songPicker')!;
    this.songsBtn = root.querySelector('#songsBtn')!;

    this.engine = new GameEngine((e) => this.onEngineEvent(e), { trumpet });
    this.songEngine = new SongEngine((e) => this.onSongEvent(e));
    this.buildSongPicker();

    root.querySelector('#startBtn')!.addEventListener('click', () => void this.start());
    root.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) =>
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode as Mode)),
    );
    this.songsBtn.addEventListener('click', () => this.showSongPicker());

    window.addEventListener('keydown', (e) => {
      if (!this.simMode || !this.started) return;
      if (e.key === 'n' || e.key === 'N') {
        this.playNextNoteSim();
        return;
      }
      const index = '1234567'.indexOf(e.key);
      if (index === TRUMPET) {
        if (this.trumpetEnabled) this.blowSim();
      } else if (index >= 0) this.pluckSim(index);
    });

    this.ringFill.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;
    this.ringFill.style.strokeDashoffset = `${RING_CIRCUMFERENCE}`;
  }

  private template(): string {
    const t = this.t;
    return `
      <header class="topbar">
        <div class="title">${t.title}</div>
        <nav class="modes" aria-label="${t.subtitle}">
          <button class="mode-btn" data-mode="tune">🎚️<span>${t.modeTune}</span></button>
          <button class="mode-btn active" data-mode="pluck">🦀<span>${t.modePluck}</span></button>
          <button class="mode-btn" data-mode="play">🦆<span>${t.modePlay}</span></button>
        </nav>
      </header>
      <main class="stage">
        <section class="prompt">
          <button id="songsBtn" class="chip songs-btn hidden">🎵 ${t.songs}</button>
          <div class="figurine-wrap">
            <svg class="ring" viewBox="0 0 120 120">
              <circle class="ring-bg" cx="60" cy="60" r="52"/>
              <circle class="ring-fill" id="ringFill" cx="60" cy="60" r="52"/>
            </svg>
            <div class="figurine" id="promptFigurine">🎸</div>
            <div class="fret-badge hidden" id="fretBadge"></div>
          </div>
          <div class="prompt-label" id="promptLabel">${t.listening}</div>
        </section>
        <div class="song-strip hidden" id="songStrip"></div>
        <div class="song-picker hidden" id="songPicker"></div>
        <canvas id="stringsCanvas"></canvas>
        <div class="message" id="message"></div>
        <div class="simbar hidden" id="simBar"></div>
      </main>
      <div class="overlay" id="startOverlay">
        <div class="start-card">
          <div class="start-fig">🎸</div>
          <h1>${t.title}</h1>
          <p class="subtitle">${t.subtitle}</p>
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
    track('start', { sim: this.simMode });
    try {
      this.ctx = new AudioContext();
      await this.ctx.resume();
    } catch (err) {
      track('audio.failed', { error: err instanceof Error ? err.name : String(err) });
      this.ctx = null;
    }
    const sampleRate = this.ctx?.sampleRate ?? 48000;
    this.sim = new SimSource(sampleRate, FRAME_SIZE);
    this.synth = this.ctx ? new PluckSynth(this.ctx) : null;

    if (!this.simMode) {
      let micError: string | undefined;
      if (!this.ctx) {
        micError = 'no-audio-context';
      } else {
        try {
          this.mic = await MicInput.create(this.ctx);
        } catch (err) {
          micError = err instanceof Error ? err.name : String(err);
          this.mic = null;
        }
      }
      if (!this.mic) {
        this.simMode = true;
        this.message.textContent = this.t.micDenied;
        track('mic.denied', { error: micError ?? 'unknown' });
      }
    }
    if (this.simMode) this.buildSimBar();

    this.startOverlay.classList.add('hidden');
    this.engine.start();
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
    const next = document.createElement('button');
    next.className = 'sim-btn';
    next.innerHTML = `<span class="sim-fig">🎵</span><span class="sim-name">N</span>`;
    next.title = this.t.simPlayHint;
    next.addEventListener('click', () => this.playNextNoteSim());
    this.simBar.appendChild(next);
    if (this.trumpetEnabled) {
      const horn = document.createElement('button');
      horn.className = 'sim-btn';
      horn.style.setProperty('--string-color', TRUMPET_COLOR);
      horn.innerHTML = `<span class="sim-fig">${TRUMPET_FIGURINE}</span><span class="sim-name">7</span>`;
      horn.addEventListener('click', () => this.blowSim());
      this.simBar.appendChild(horn);
    }
  }

  private blowSim(): void {
    track('sim.blow');
    this.sim?.blow(performance.now());
  }

  private pluckSim(index: number): void {
    track('sim.pluck', { string: index + 1 });
    this.sim?.pluck(index, performance.now());
  }

  /** Play mode in sim: pluck the note the song is waiting for (key N). */
  private playNextNoteSim(): void {
    const note = this.currentNote();
    if (this.mode !== 'play' || !note) return;
    track('sim.note', { midi: note.midi });
    this.sim?.pluckFrequency(midiToFrequency(note.midi), performance.now());
  }

  /** Switch between Tune, Pluck and Play (the toggle in the top bar). */
  private setMode(mode: Mode): void {
    if (!this.started) return;
    if (mode === this.mode) {
      // Tapping Play again goes back to the song list.
      if (mode === 'play') this.showSongPicker();
      return;
    }
    track('mode', { mode });
    this.mode = mode;
    this.root.querySelectorAll<HTMLButtonElement>('.mode-btn').forEach((btn) =>
      btn.classList.toggle('active', btn.dataset.mode === mode),
    );
    this.clearRoundTimer();
    this.celebration.classList.add('hidden');
    this.celebration.classList.remove('active');
    this.playback = null;
    this.ringTarget = 0;
    this.message.innerHTML = '';
    this.tuneScreen.classList.toggle('hidden', mode !== 'tune');
    this.stage.classList.toggle('hidden', mode === 'tune');
    const play = mode === 'play';
    this.songsBtn.classList.toggle('hidden', !play);
    this.fretBadge.classList.toggle('hidden', !play);
    this.songStrip.classList.toggle('hidden', !play);
    if (play) {
      this.showSongPicker();
    } else {
      this.songEngine.stop();
      this.stage.classList.remove('picking');
      this.songPicker.classList.add('hidden');
    }
    if (mode === 'pluck') {
      this.showPluckTarget(this.engine.target);
      this.engine.continueRound();
    }
  }

  private showPluckTarget(target: number): void {
    const s = this.noteInfo(target);
    this.promptFigurine.textContent = s.figurine;
    this.promptFigurine.style.filter = 'none';
    this.ringFill.style.stroke = s.color;
    this.promptLabel.textContent = this.t.listening;
  }

  // ---- Play mode ----------------------------------------------------------

  private buildSongPicker(): void {
    this.songPicker.innerHTML = `<h2>${this.t.pickSong}</h2>`;
    for (const song of SONGS) {
      const btn = document.createElement('button');
      btn.className = 'song-btn';
      btn.innerHTML = `<span class="song-fig">${song.figurine}</span> ${song.title}`;
      btn.addEventListener('click', () => this.startSong(song));
      this.songPicker.appendChild(btn);
    }
  }

  private showSongPicker(): void {
    this.songEngine.stop();
    this.clearRoundTimer();
    this.celebration.classList.add('hidden');
    this.ringTarget = 0;
    this.message.innerHTML = '';
    this.stage.classList.add('picking');
    this.songPicker.classList.remove('hidden');
  }

  private startSong(song: Song): void {
    track('song.start', { song: song.id });
    this.stage.classList.remove('picking');
    this.songPicker.classList.add('hidden');
    this.message.innerHTML = '';
    this.songStrip.innerHTML = song.notes
      .map((note, i) => {
        const color = OPEN_STRINGS[note.string].color;
        return (
          `<div class="note-card" data-i="${i}" style="--c:${color}">` +
          `<span class="nc-fig">${stringFigurine(note)}</span>` +
          `<span class="nc-fret" style="color:${color}">${note.fret}</span>` +
          `<span class="nc-syl">${note.syllable}</span></div>`
        );
      })
      .join('');
    this.songEngine.start(song);
  }

  private currentNote() {
    const song = this.songEngine.song;
    return song && !this.songEngine.done ? song.notes[this.songEngine.index] : null;
  }

  private onSongEvent(e: SongEvent): void {
    const now = performance.now();
    switch (e.type) {
      case 'note': {
        const note = this.songEngine.song!.notes[e.index];
        const s = OPEN_STRINGS[note.string];
        this.promptFigurine.textContent = s.figurine;
        this.promptFigurine.style.filter = 'none';
        this.ringFill.style.stroke = s.color;
        this.fretBadge.textContent = String(note.fret);
        this.fretBadge.style.setProperty('--c', s.color);
        const how = note.fret === 0 ? this.t.openString : this.t.holdFret.replace('{fret}', String(note.fret));
        this.promptLabel.innerHTML = `<b class="syl">${note.syllable}</b><span class="fret-hint">${how}</span>`;
        this.songStrip.querySelectorAll<HTMLElement>('.note-card').forEach((card, i) => {
          card.classList.toggle('done', i < e.index);
          card.classList.toggle('current', i === e.index);
        });
        this.songStrip
          .querySelector<HTMLElement>(`.note-card[data-i="${e.index}"]`)
          ?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        if (e.index > 0) track('song.note', { index: e.index - 1, midi: this.songEngine.song!.notes[e.index - 1].midi });
        break;
      }
      case 'hold':
        this.ringTarget = e.progress;
        break;
      case 'heard': {
        const note = this.currentNote();
        this.vizHeard = { stringIndex: e.onTarget && note ? note.string : null, level: e.level, atMs: now };
        break;
      }
      case 'done': {
        const song = this.songEngine.song!;
        track('song.done', { song: song.id });
        this.songStrip.querySelectorAll('.note-card').forEach((card) => {
          card.classList.add('done');
          card.classList.remove('current');
        });
        this.message.textContent = this.t.songDone;
        this.celeFigurine.textContent = song.figurine;
        this.celebration.classList.remove('hidden');
        this.celebration.classList.add('active');
        // Play the whole melody back as a reward (input is ignored: song done).
        const step = 0.36;
        let toneMs = 1800;
        if (this.synth) {
          song.notes.forEach((note, i) => {
            toneMs = this.synth!.playFrequency(midiToFrequency(note.midi), i * step, 0.6);
          });
        }
        const totalMs = song.notes.length * step * 1000 + toneMs * 0.5;
        this.clearRoundTimer();
        this.roundTimer = window.setTimeout(() => {
          this.celebration.classList.add('hidden');
          this.celebration.classList.remove('active');
          if (this.mode === 'play') this.showSongPicker();
        }, totalMs);
        break;
      }
    }
  }

  private onEngineEvent(e: GameEvent): void {
    const now = performance.now();
    switch (e.type) {
      case 'round': {
        const s = this.noteInfo(e.target);
        track('round', { target: e.target, string: s.name });
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
        // Throttled sample of what the mic hears, for tuning the detection.
        if (e.level > 0.002 && now - this.lastPitchTrackMs > 250) {
          this.lastPitchTrackMs = now;
          track('pitch', {
            string: e.stringIndex,
            cents: e.cents === null ? null : Math.round(e.cents),
            level: Number(e.level.toFixed(4)),
            ring: Number(this.ringTarget.toFixed(2)),
          });
        }
        break;
      case 'hold':
        this.ringTarget = e.progress;
        break;
      case 'success': {
        const s = this.noteInfo(e.target);
        track('hold.confirm', { string: e.target, outcome: 'success', cents: Math.round(e.cents), outOfTune: e.outOfTune });
        this.message.innerHTML = e.outOfTune ? this.outOfTuneText(e.target, e.cents) : '';
        let toneMs = e.toneMs;
        if (e.target === TRUMPET) {
          if (this.ctx) toneMs = playFanfare(this.ctx);
          this.playback = null;
        } else {
          if (this.synth) toneMs = this.synth.play(OPEN_STRINGS[e.target]);
          this.playback = { stringIndex: e.target, startMs: now };
        }
        this.engine.notifyPlayback(now, toneMs);
        this.celeFigurine.textContent = s.figurine;
        this.celebration.classList.remove('hidden');
        this.celebration.classList.add('active');
        this.clearRoundTimer();
        this.roundTimer = window.setTimeout(() => {
          this.celebration.classList.add('hidden');
          this.celebration.classList.remove('active');
          this.playback = null;
          this.engine.beginRound();
        }, toneMs + 800);
        break;
      }
      case 'harmonic':
        track('hold.harmonic', { heard: e.heard, target: e.target, cents: Math.round(e.cents) });
        break;
      case 'hint': {
        const heard = this.noteInfo(e.heard);
        const target = this.noteInfo(e.target);
        track('hold.confirm', { string: e.heard, outcome: 'hint', target: e.target, cents: Math.round(e.cents), outOfTune: e.outOfTune });
        this.message.innerHTML =
          `${heard.figurine} ${this.t.hintWas} <b style="color:${heard.color}">` +
          `${heard.label}</b> — ${this.t.hintTry} ` +
          `<b style="color:${target.color}">${target.label}</b> ${target.figurine}` +
          (e.outOfTune ? `<br>${this.outOfTuneText(e.heard, e.cents)}` : '');
        this.clearRoundTimer();
        this.roundTimer = window.setTimeout(() => this.engine.continueRound(), 2400);
        break;
      }
    }
  }

  /** Figurine, colour and spoken label of a target (a string, or the hidden trumpet). */
  private noteInfo(index: number): { figurine: string; color: string; label: string; name: string } {
    if (index === TRUMPET) {
      return { figurine: TRUMPET_FIGURINE, color: TRUMPET_COLOR, label: this.t.trumpetName, name: 'trumpet' };
    }
    const s = OPEN_STRINGS[index];
    return { figurine: s.figurine, color: s.color, label: this.t.colorNames[index], name: s.name };
  }

  /** "The red string is really out of tune (too low) — tune it with 🎸". */
  private outOfTuneText(stringIndex: number, cents: number): string {
    const s = OPEN_STRINGS[stringIndex];
    const color = `<b style="color:${s.color}">${this.t.colorNames[stringIndex]}</b>`;
    const dir = cents < 0 ? this.t.outOfTuneLow : this.t.outOfTuneHigh;
    return `<span class="out-of-tune">🔧 ${this.t.outOfTune.replace('{color}', color).replace('{dir}', dir)}</span>`;
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
    const pitch = detectPitch(frame, sampleRate, {
      minFrequency: DETECT_MIN_HZ,
      maxFrequency: DETECT_MAX_HZ,
      clarityThreshold: CLARITY_THRESHOLD,
    });

    if (this.mode === 'tune') {
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

    if (this.mode === 'play') {
      this.songEngine.processFrame(pitch?.frequency ?? null, level, now);
      return;
    }

    // Trumpet option only: wide-range pitch (beyond the guitar band).
    const wide = this.trumpetEnabled
      ? detectPitch(frame, sampleRate, {
          minFrequency: WIDE_MIN_HZ,
          maxFrequency: WIDE_MAX_HZ,
          clarityThreshold: CLARITY_THRESHOLD,
        })
      : null;
    this.engine.processFrame(pitch?.frequency ?? null, level, now, wide?.frequency ?? null);
    this.recordOnset(frame, sampleRate, level, pitch?.frequency ?? null, now);
  }

  /**
   * Telemetry only: on a sudden sound (level jumps ≥3× within one frame), log
   * the next ~400 ms of envelope, pitch and brightness as one 'onset' event —
   * to tell a knock/drum on the guitar body apart from a plucked string.
   */
  private recordOnset(frame: Float32Array, sampleRate: number, level: number, hz: number | null, now: number): void {
    const prev = this.prevLevel;
    this.prevLevel = level;
    if (!this.onset && level > 0.008 && level > 3 * prev) {
      this.onset = { startMs: now, before: Number(prev.toFixed(4)), frames: [] };
    }
    if (!this.onset) return;
    let diffEnergy = 0;
    for (let i = 1; i < frame.length; i++) {
      const d = frame[i] - frame[i - 1];
      diffEnergy += d * d;
    }
    const ratio = Math.sqrt(diffEnergy / (frame.length - 1)) / Math.max(level, 1e-9);
    const centroidHz = Math.round((sampleRate / Math.PI) * Math.asin(Math.min(1, ratio / 2)));
    this.onset.frames.push([Math.round(now - this.onset.startMs), Number(level.toFixed(4)), hz === null ? null : Math.round(hz), centroidHz]);
    if (now - this.onset.startMs >= 400) {
      track('onset', { before: this.onset.before, frames: this.onset.frames, target: this.engine.target });
      this.onset = null;
    }
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
    const playNote = this.mode === 'play' ? this.currentNote() : null;
    for (const s of OPEN_STRINGS) {
      // Lowest string (index 0, low E) at the bottom, highest at the top.
      const y = top + gap * (OPEN_STRINGS.length - 1 - s.index);
      const isTarget =
        this.started &&
        (this.mode === 'pluck' ? s.index === this.engine.target : playNote?.string === s.index);
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

      // Play mode: where to hold — a numbered dot on the fret (0 = open string).
      if (isTarget && playNote) {
        const fretW = (x1 - x0) / 5;
        const fx = playNote.fret === 0 ? x0 + 16 : x0 + fretW * (playNote.fret - 0.5);
        g.globalAlpha = 1;
        g.fillStyle = s.color;
        g.beginPath();
        g.arc(fx, y, 15, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#1c2540';
        g.font = 'bold 18px system-ui, sans-serif';
        g.textAlign = 'center';
        g.fillText(String(playNote.fret), fx, y + 1);
        g.textAlign = 'start';
      }
    }

    // Play mode: faint fret lines so the numbered dot reads as a position.
    if (playNote) {
      g.globalAlpha = 0.18;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2;
      for (let f = 1; f <= 4; f++) {
        const fx = x0 + ((x1 - x0) / 5) * f;
        g.beginPath();
        g.moveTo(fx, top - 10);
        g.lineTo(fx, top + gap * (OPEN_STRINGS.length - 1) + 10);
        g.stroke();
      }
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
