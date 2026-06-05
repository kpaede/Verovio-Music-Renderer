import type { VerovioOptions } from './parseVerovioSource';

const PLUGIN_ONLY_OPTION_KEYS = new Set(['highlightColor', 'selectionColor', 'playNoteOnClick', 'darkColor', 'darkMode', 'darkModeStyle']);

export function sanitizeVerovioOptions(options: VerovioOptions): VerovioOptions {
  return Object.fromEntries(
    Object.entries(options).filter(([key, value]) => !PLUGIN_ONLY_OPTION_KEYS.has(key) && value !== undefined && value !== null)
  );
}

export function getHighlightColor(options: VerovioOptions): string {
  return typeof options.highlightColor === 'string' ? options.highlightColor : '#DC143C';
}

export function getSelectionColor(options: VerovioOptions): string {
  return typeof options.selectionColor === 'string' ? options.selectionColor : '#0066FF';
}
