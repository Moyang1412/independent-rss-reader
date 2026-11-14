export const MAX_RECORDING_DURATION_MS = 120_000;

export interface RecordedAudio {
  data: Blob;
  filename: string;
  mimeType: 'audio/wav';
  durationMs: number;
  sampleRate: number;
}

export interface MicrophoneRecorderOptions {
  maxDurationMs?: number;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  audioContextFactory?: () => AudioContext;
  onMaxDuration?: (audio: RecordedAudio) => void | Promise<void>;
}

function defaultGetUserMedia(constraints: MediaStreamConstraints) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) throw new Error('当前环境不支持麦克风录音');
  return navigator.mediaDevices.getUserMedia(constraints);
}

function defaultAudioContextFactory(): AudioContext {
  const root = (typeof window === 'undefined' ? globalThis : window) as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Context = root.AudioContext || root.webkitAudioContext;
  if (!Context) throw new Error('当前环境不支持音频录音');
  return new Context();
}

function clampSample(sample: number) {
  return Math.max(-1, Math.min(1, sample));
}

export function encodePcm16Wav(samples: Float32Array, sampleRate: number): Blob {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('录音采样率无效');
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, value: string) => { for (let index = 0; index < value.length; index++) view.setUint8(offset + index, value.charCodeAt(index)); };
  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, Math.round(sampleRate), true);
  view.setUint32(28, Math.round(sampleRate) * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let index = 0; index < samples.length; index++) {
    const sample = clampSample(samples[index]);
    view.setInt16(44 + index * 2, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export class MicrophoneRecorder {
  private readonly maxDurationMs: number;
  private readonly getUserMedia: (constraints: MediaStreamConstraints) => Promise<MediaStream>;
  private readonly audioContextFactory: () => AudioContext;
  private readonly onMaxDuration?: (audio: RecordedAudio) => void | Promise<void>;
  private stream?: MediaStream;
  private context?: AudioContext;
  private source?: MediaStreamAudioSourceNode;
  private processor?: ScriptProcessorNode;
  private silence?: GainNode;
  private chunks: Float32Array[] = [];
  private timer?: ReturnType<typeof setTimeout>;
  private recording = false;

  constructor(options: MicrophoneRecorderOptions = {}) {
    this.maxDurationMs = Math.min(Math.max(options.maxDurationMs ?? MAX_RECORDING_DURATION_MS, 1), MAX_RECORDING_DURATION_MS);
    this.getUserMedia = options.getUserMedia || defaultGetUserMedia;
    this.audioContextFactory = options.audioContextFactory || defaultAudioContextFactory;
    this.onMaxDuration = options.onMaxDuration;
  }

  get isRecording() { return this.recording; }

  async start() {
    if (this.recording) throw new Error('录音已经开始');
    const stream = await this.getUserMedia({ audio: true });
    let context: AudioContext | undefined;
    try {
      context = this.audioContextFactory();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silence = context.createGain();
      silence.gain.value = 0;
      processor.onaudioprocess = event => {
        const channel = event.inputBuffer.getChannelData(0);
        this.chunks.push(new Float32Array(channel));
      };
      source.connect(processor);
      processor.connect(silence);
      silence.connect(context.destination);
      this.stream = stream;
      this.context = context;
      this.source = source;
      this.processor = processor;
      this.silence = silence;
      this.chunks = [];
      this.recording = true;
      this.timer = setTimeout(() => {
        void this.stop().then(audio => this.onMaxDuration?.(audio)).catch(() => this.cancel());
      }, this.maxDurationMs);
    } catch (error) {
      for (const track of stream.getTracks()) track.stop();
      if (context) await context.close().catch(() => undefined);
      throw error instanceof Error ? error : new Error('无法开始录音');
    }
  }

  async stop(): Promise<RecordedAudio> {
    if (!this.recording || !this.context || !this.stream) throw new Error('当前没有正在进行的录音');
    const sampleRate = this.context.sampleRate;
    const samples = this.mergeChunks();
    const result: RecordedAudio = {
      data: encodePcm16Wav(samples, sampleRate),
      filename: 'recording.wav',
      mimeType: 'audio/wav',
      durationMs: samples.length / sampleRate * 1_000,
      sampleRate,
    };
    await this.release();
    return result;
  }

  async cancel() { await this.release(); }

  private mergeChunks() {
    const length = this.chunks.reduce((total, chunk) => total + chunk.length, 0);
    const samples = new Float32Array(length);
    let offset = 0;
    for (const chunk of this.chunks) { samples.set(chunk, offset); offset += chunk.length; }
    return samples;
  }

  private async release() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.silence?.disconnect();
    for (const track of this.stream?.getTracks() || []) track.stop();
    await this.context?.close().catch(() => undefined);
    this.stream = undefined;
    this.context = undefined;
    this.source = undefined;
    this.processor = undefined;
    this.silence = undefined;
    this.chunks = [];
    this.recording = false;
  }
}
