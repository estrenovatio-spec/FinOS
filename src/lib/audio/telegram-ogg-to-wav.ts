import { OggOpusDecoder } from "ogg-opus-decoder";
import { WaveFile } from "wavefile";

let decoder: OggOpusDecoder | null = null;

async function getDecoder(): Promise<OggOpusDecoder> {
  if (!decoder) {
    decoder = new OggOpusDecoder();
    await decoder.ready;
  }
  return decoder;
}

/** Telegram voice → WAV 16-bit mono 16 kHz (лучше для Whisper / Gemini audio) */
export async function telegramVoiceToWavFile(
  oggBuffer: ArrayBuffer,
): Promise<File | null> {
  if (oggBuffer.byteLength < 32) return null;

  try {
    const dec = await getDecoder();
    const decoded = await dec.decodeFile(new Uint8Array(oggBuffer));
    if (!decoded.samplesDecoded || !decoded.channelData?.length) return null;

    const wav = new WaveFile();
    wav.fromScratch(
      decoded.channelData.length,
      decoded.sampleRate,
      "32f",
      decoded.channelData,
    );
    wav.toBitDepth("16");
    wav.toSampleRate(16_000);

    const buf = wav.toBuffer() as Buffer;
    return new File([Buffer.from(buf)], "voice.wav", { type: "audio/wav" });
  } catch (err) {
    console.warn("[telegram-ogg-to-wav]", err instanceof Error ? err.message : err);
    return null;
  }
}
