const NON_TYPING_INPUTS = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file']);

/**
 * True when a keystroke belongs to a field (text, number, select, range…) instead of the editor
 * shortcuts. Checkboxes and buttons don't consume arrows/space, so shortcuts keep working after
 * clicking them.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) return !NON_TYPING_INPUTS.has(target.type);
  return target.isContentEditable;
}
