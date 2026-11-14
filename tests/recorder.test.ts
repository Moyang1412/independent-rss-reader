import { describe, expect, it, vi } from 'vitest';
import { encodePcm16Wav, MicrophoneRecorder } from '../src/audio/recorder';

describe('PCM WAV recorder', () => {
  it('encodes mono 16-bit PCM WAV with a valid header', async () => {
    const blob = encodePcm16Wav(new Float32Array([-1, 0, 1]), 8_000);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe('audio/wav');
    expect(bytes.length).toBe(50);
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('RIFF');
    expect(new TextDecoder().decode(bytes.slice(8, 12))).toBe('WAVE');
    expect(new DataView(bytes.buffer).getUint16(22, true)).toBe(1);
    expect(new DataView(bytes.buffer).getUint16(34, true)).toBe(16);
  });

  it('records, stops, releases the microphone, and returns WAV', async () => {
    const stopTrack = vi.fn();
    const stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
    let processor: { onaudioprocess?: (event: AudioProcessingEvent) => void; connect: () => void; disconnect: () => void };
    const close = vi.fn(async () => undefined);
    const context = {
      sampleRate: 8_000,
      destination: {},
      createMediaStreamSource: () => ({ connect: () => undefined, disconnect: () => undefined }),
      createScriptProcessor: () => { processor = { connect: () => undefined, disconnect: () => undefined }; return processor; },
      createGain: () => ({ gain: { value: 0 }, connect: () => undefined, disconnect: () => undefined }),
      close,
    } as unknown as AudioContext;
    const recorder = new MicrophoneRecorder({ getUserMedia: async () => stream, audioContextFactory: () => context });
    await recorder.start();
    expect(recorder.isRecording).toBe(true);
    processor!.onaudioprocess?.({ inputBuffer: { getChannelData: () => new Float32Array([0, 0.5, -0.5]) } } as unknown as AudioProcessingEvent);
    const result = await recorder.stop();
    expect(result.mimeType).toBe('audio/wav');
    expect(result.durationMs).toBeCloseTo(0.375);
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(recorder.isRecording).toBe(false);
  });
});
