// Pure helper logic for live voice transcription state and text management.

export type VoiceState = 'idle' | 'listening' | 'paused' | 'processing' | 'error';

export interface VoiceError {
  type: 'permission_denied' | 'unsupported' | 'network' | 'no_speech' | 'unknown';
  message: string;
}

export interface VoiceSessionState {
  state: VoiceState;
  interimText: string;
  lastFinalIndex: number;
  error?: VoiceError;
}

export const initialVoiceState = (): VoiceSessionState => ({
  state: 'idle',
  interimText: '',
  lastFinalIndex: -1,
});

/**
 * Safely appends new finalized text chunk to existing text without destroying user edits.
 * If cursor is provided, inserts at cursor position and preserves surrounding text.
 * Otherwise appends cleanly to the end with proper spacing.
 */
export function appendFinalTranscript(
  existingText: string,
  newChunk: string,
  cursorPos?: number,
): { text: string; nextCursor: number } {
  const chunk = newChunk.trim();
  if (!chunk) {
    return { text: existingText, nextCursor: cursorPos ?? existingText.length };
  }

  // If no cursor or cursor is at or beyond the end, append to end
  if (cursorPos === undefined || cursorPos < 0 || cursorPos >= existingText.length) {
    if (!existingText.trim()) {
      return { text: chunk, nextCursor: chunk.length };
    }
    const needsSpace = !/\s$/.test(existingText);
    const text = existingText + (needsSpace ? ' ' : '') + chunk;
    return { text, nextCursor: text.length };
  }

  // Insert at cursor
  const before = existingText.slice(0, cursorPos);
  const after = existingText.slice(cursorPos);
  const leadSpace = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const trailSpace = after.length > 0 && !/^\s/.test(after) ? ' ' : '';
  const inserted = leadSpace + chunk + trailSpace;
  const text = before + inserted + after;
  const nextCursor = cursorPos + inserted.length;
  return { text, nextCursor };
}

/**
 * Filters out duplicate finalized segments.
 * Only returns chunks from result indices strictly greater than `lastFinalIndex`.
 */
export function processSpeechResults(
  results: Array<{ index: number; transcript: string; isFinal: boolean }>,
  lastFinalIndex: number,
): {
  newFinalChunks: string[];
  interimText: string;
  nextLastFinalIndex: number;
} {
  const newFinalChunks: string[] = [];
  let interimText = '';
  let highestFinalIndex = lastFinalIndex;

  for (const item of results) {
    if (item.isFinal) {
      if (item.index > highestFinalIndex) {
        const clean = item.transcript.trim();
        if (clean) {
          newFinalChunks.push(clean);
        }
        highestFinalIndex = item.index;
      }
    } else {
      interimText += (interimText ? ' ' : '') + item.transcript.trim();
    }
  }

  return {
    newFinalChunks,
    interimText,
    nextLastFinalIndex: highestFinalIndex,
  };
}

/**
 * Maps browser error codes to human-readable English errors.
 */
export function mapBrowserSpeechError(errorEventCode: string): VoiceError {
  switch (errorEventCode) {
    case 'not-allowed':
    case 'service-not-allowed':
      return {
        type: 'permission_denied',
        message: 'Microphone permission was denied. Allow microphone access in your browser settings to use live voice.',
      };
    case 'audio-capture':
      return {
        type: 'permission_denied',
        message: 'No microphone was found or microphone is in use by another application.',
      };
    case 'network':
      return {
        type: 'network',
        message: 'Speech recognition network error occurred. Check your internet connection.',
      };
    case 'no-speech':
      return {
        type: 'no_speech',
        message: 'No speech was detected. Try speaking louder or moving closer to the microphone.',
      };
    default:
      return {
        type: 'unknown',
        message: `Speech recognition error: ${errorEventCode}`,
      };
  }
}
