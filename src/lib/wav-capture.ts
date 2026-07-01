/**
 * Запись WAV через Web Audio API — обходит сломанный MediaRecorder в мобильных WebView.
 */
export type WavCapture = {
  getLevel: () => number;
  stop: () => Promise<Blob>;
  dispose: () => void;
};

type AudioContextCtor = typeof AudioContext;

function getAudioContextClass(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: AudioContextCtor };
  return window.AudioContext ?? w.webkitAudioContext ?? null;
}

export function canUseWavCapture(): boolean {
  const Ctx = getAudioContextClass();
  if (!Ctx) return false;
  try {
    const probe = new Ctx();
    const ok = typeof probe.createScriptProcessor === "function";
    void probe.close();
    return ok;
  } catch {
    return false;
  }
}

function mergeFloatChunks(chunks: Float32Array[]): Float32Array {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

function downsampleTo16k(samples: Float32Array, sampleRate: number): Float32Array {
  if (sampleRate <= 16_000) return samples;
  const ratio = sampleRate / 16_000;
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = samples[idx] ?? 0;
    const b = samples[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

function encodeWavMono16(samples: Float32Array, sampleRate: number): Blob {
  const dataLen = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataLen, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x80_00 : s * 0x7f_ff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

export async function createWavCaptureAsync(stream: MediaStream): Promise<WavCapture | null> {
  const Ctx = getAudioContextClass();
  if (!Ctx) return null;

  let audioContext: AudioContext;
  try {
    audioContext = new Ctx({ latencyHint: "interactive" });
  } catch {
    try {
      audioContext = new Ctx();
    } catch {
      return null;
    }
  }

  if (audioContext.state === "suspended") {
    try {
      await audioContext.resume();
    } catch {
      /* ignore */
    }
  }

  const source = audioContext.createMediaStreamSource(stream);
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  source.connect(analyser);

  const pcmChunks: Float32Array[] = [];
  let level = 0;
  let disposed = false;

  const bufferSize = 2048;
  let processor: ScriptProcessorNode;
  try {
    processor = audioContext.createScriptProcessor(bufferSize, 1, 1);
  } catch {
    await audioContext.close();
    return null;
  }

  processor.onaudioprocess = (event) => {
    if (disposed) return;
    const input = event.inputBuffer.getChannelData(0);
    pcmChunks.push(new Float32Array(input));

    let sum = 0;
    for (let i = 0; i < input.length; i++) {
      const n = input[i];
      sum += n * n;
    }
    level = Math.min(1, Math.sqrt(sum / input.length) * 6);
  };

  const silentGain = audioContext.createGain();
  silentGain.gain.value = 0.0001;
  source.connect(processor);
  processor.connect(silentGain);
  silentGain.connect(audioContext.destination);

  const levelBuf = new Uint8Array(analyser.fftSize);

  const teardownGraph = () => {
    try {
      processor.disconnect();
      silentGain.disconnect();
      source.disconnect();
      analyser.disconnect();
    } catch {
      /* ignore */
    }
  };

  return {
    getLevel: () => {
      analyser.getByteTimeDomainData(levelBuf);
      let sum = 0;
      for (let i = 0; i < levelBuf.length; i++) {
        const n = (levelBuf[i] - 128) / 128;
        sum += n * n;
      }
      const fromAnalyser = Math.min(1, Math.sqrt(sum / levelBuf.length) * 4);
      return Math.max(level, fromAnalyser);
    },

    stop: async () => {
      disposed = true;
      teardownGraph();

      const rate = audioContext.sampleRate || 44_100;
      let samples = mergeFloatChunks(pcmChunks);
      if (samples.length === 0) {
        await audioContext.close();
        return new Blob([], { type: "audio/wav" });
      }

      samples = downsampleTo16k(samples, rate);
      const wav = encodeWavMono16(samples, 16_000);
      await audioContext.close();
      return wav;
    },

    dispose: () => {
      disposed = true;
      teardownGraph();
      void audioContext.close();
    },
  };
}

/** ~0.35 с речи при 16 kHz mono 16-bit */
export function minWavBytes(): number {
  return 12_000;
}
