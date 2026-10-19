// Inserting dictated text into the thought without disturbing what the user typed.

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

const TR_WORDS = new Set(['bir', 've', 'bu', 'ile', 'ama', 'gibi', 'mi', 'mı', 'mu', 'mü', 'ne', 'var', 'yok', 'da', 'de', 'ben', 'sen', 'olsun', 'istiyorum', 'icin', 'için', 'ya', 'çok', 'cok']);

/**
 * The language the user is actually speaking or writing, read from the thought itself (the interface
 * language is not a signal: the interface stays English for everyone). Turkish letters and common
 * Turkish words decide; empty text: unknown. ponytail: tr/en only, the two languages the app models.
 */
export function textLang(text: string): 'tr' | 'en' | undefined {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (!words.length) return undefined;
  const turkish = words.filter((w) => TR_WORDS.has(w) || /[çğıöşü]/.test(w)).length;
  return turkish / words.length >= 0.15 ? 'tr' : 'en';
}
