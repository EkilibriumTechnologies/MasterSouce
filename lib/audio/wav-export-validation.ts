import { probeAudioStream } from "@/lib/audio/media-probe";
import type { WavOutputCodec } from "@/lib/audio/wav-export-codec";
import { WAV_EXPORT_CHANNELS, WAV_EXPORT_SAMPLE_RATE } from "@/lib/audio/wav-export-codec";

export class WavExportValidationError extends Error {
  readonly code = "WAV_EXPORT_VALIDATION_FAILED" as const;

  constructor(message: string) {
    super(message);
    this.name = "WavExportValidationError";
  }
}

export type ExpectedWavExport = {
  codec: WavOutputCodec;
  sampleRate?: number;
  channels?: number;
};

function expectedBitsForCodec(codec: WavOutputCodec): number {
  if (codec === "pcm_s24le") return 24;
  if (codec === "pcm_f32le") return 32;
  return 16;
}

/**
 * Export-only verification: confirms the muxed WAV matches the plan codec and layout.
 * Does not re-process audio and does not change mastering decisions.
 */
export async function validateExportedWav(filePath: string, expected: ExpectedWavExport): Promise<void> {
  const probe = await probeAudioStream(filePath);
  const expectedSampleRate = expected.sampleRate ?? WAV_EXPORT_SAMPLE_RATE;
  const expectedChannels = expected.channels ?? WAV_EXPORT_CHANNELS;
  const expectedBits = expectedBitsForCodec(expected.codec);

  if (probe.codec_name !== expected.codec) {
    throw new WavExportValidationError(
      `WAV codec mismatch: expected ${expected.codec}, got ${probe.codec_name || "unknown"}.`
    );
  }

  if (probe.sample_rate !== expectedSampleRate) {
    throw new WavExportValidationError(
      `WAV sample rate mismatch: expected ${expectedSampleRate} Hz, got ${probe.sample_rate} Hz.`
    );
  }

  if (probe.channels !== expectedChannels) {
    throw new WavExportValidationError(
      `WAV channel layout mismatch: expected ${expectedChannels}, got ${probe.channels}.`
    );
  }

  const observedBits = probe.bits_per_sample ?? probe.bits_per_raw_sample;
  if (observedBits !== null && observedBits !== expectedBits) {
    throw new WavExportValidationError(
      `WAV bit depth mismatch: expected ${expectedBits}-bit, got ${observedBits}-bit.`
    );
  }
}
