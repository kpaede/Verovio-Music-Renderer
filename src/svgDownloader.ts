// svgDownloader.ts
export function downloadSVG(uid: string) {
    const svgEl = document.querySelector(
      `.verovio-container[data-uid="${uid}"] svg`
    );
    if (!svgEl) return;
    const blob = new Blob([
      new XMLSerializer().serializeToString(svgEl)
    ], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'score.svg';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
  