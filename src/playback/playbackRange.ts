export interface PlaybackRange {
  startMs: number;
  endMs?: number;
}

export function getPlaybackRange(st: { meiData: string; measureRange?: string }): PlaybackRange {
  const { start, end } = getMeasureRangeBounds(st.measureRange);
  if (!start || typeof window.VerovioToolkit.getTimeForElement !== 'function') {
    return { startMs: 0 };
  }

  const doc = new DOMParser().parseFromString(st.meiData, 'application/xml');
  const measures = Array.from(doc.querySelectorAll('measure'));
  const startMeasure = measures[start - 1];
  const endMeasure = end ? measures[end] : undefined;

  const startId = startMeasure?.getAttribute('xml:id') || startMeasure?.getAttribute('id');
  const endId = endMeasure?.getAttribute('xml:id') || endMeasure?.getAttribute('id');

  const startMs = start > 1 && startId ? window.VerovioToolkit.getTimeForElement(startId) : 0;
  const endMs = endId ? window.VerovioToolkit.getTimeForElement(endId) : undefined;
  return { startMs: Number.isFinite(startMs) ? startMs : 0, endMs };
}

function getMeasureRangeBounds(range?: string): { start?: number; end?: number } {
  if (!range) return {};

  const match = range.trim().match(/^(start|\d+)(?:\s*-\s*(end|\d+))?$/i);
  if (!match) return {};

  const start = match[1].toLowerCase() === 'start' ? 1 : Number(match[1]);
  const endToken = match[2] ?? match[1];
  const end = endToken.toLowerCase() === 'end' ? undefined : Number(endToken);
  return { start, end };
}
