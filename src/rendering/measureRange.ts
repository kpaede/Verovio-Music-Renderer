export function normalizeMeasureRange(measureRange?: string): string | undefined {
  const trimmed = measureRange?.trim();
  if (!trimmed) return undefined;
  return /^\d+$/.test(trimmed) ? `${trimmed}-${trimmed}` : trimmed;
}

export function applyMeasureRange(measureRange?: string) {
  const normalized = normalizeMeasureRange(measureRange);
  if (!normalized) return;
  window.VerovioToolkit.select({ measureRange: normalized });
  window.VerovioToolkit.redoLayout();
}

export function hasMeasures(mei: string): boolean {
  const doc = new DOMParser().parseFromString(mei, 'application/xml');
  if (doc.querySelector('parsererror')) return /<(?:[\w.-]+:)?measure\b/i.test(mei);
  return Array.from(doc.getElementsByTagName('*')).some((element) => element.localName === 'measure');
}
