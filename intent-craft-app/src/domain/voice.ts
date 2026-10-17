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
