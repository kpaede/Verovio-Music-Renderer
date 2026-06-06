// svgDownloader.ts
export function downloadSVG(uid: string) {
  const container = activeDocument.querySelector<HTMLElement>(`.verovio-container[data-uid="${uid}"]`);
  if (!container) return;
  const doc = container.ownerDocument;
  const svgEl = container.querySelector('svg');
  if (!svgEl) return;

  const svg = new XMLSerializer().serializeToString(svgEl);
  const svgWithEncoding = `<?xml version="1.0" encoding="UTF-8"?>\n${svg}`;
  const blob = new Blob([svgWithEncoding], { type: 'image/svg+xml;charset=UTF-8' });
  const url = URL.createObjectURL(blob);
  const a = doc.body.createEl('a');
  a.href = url;
  a.download = 'score.svg';
  a.click();
  doc.body.removeChild(a);
  URL.revokeObjectURL(url);
}
