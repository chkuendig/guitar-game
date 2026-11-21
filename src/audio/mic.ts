import { FRAME_SIZE } from '../config';

/**
 * Microphone capture for pitch analysis. Must be created from a user gesture
 * (the Start button) so iOS unlocks getUserMedia and audio playback.
 *
 * The analyser is a dead end (not routed to the speakers), so the game's own
 * playback can never feed back into detection through the graph; the remaining
 * acoustic overlap is handled by the engine's playback-ignore window.
 */
export class MicInput {
  private readonly ctx: AudioContext;
  private readonly analyser: AnalyserNode;
  private readonly frame = new Float32Array(FRAME_SIZE);
  private stream: MediaStream | null = null;

  private constructor(ctx: AudioContext, analyser: AnalyserNode) {
    this.ctx = ctx;
    this.analyser = analyser;
  }

  static async create(ctx: AudioContext): Promise<MicInput> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = FRAME_SIZE;
    source.connect(analyser);
    const mic = new MicInput(ctx, analyser);
    mic.stream = stream;
    return mic;
  }

  get sampleRate(): number {
    return this.ctx.sampleRate;
  }

  /** Latest FRAME_SIZE time-domain samples. The returned buffer is reused. */
  readFrame(): Float32Array {
    this.analyser.getFloatTimeDomainData(this.frame);
    return this.frame;
  }

  close(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
