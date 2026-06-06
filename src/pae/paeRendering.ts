import { resetVerovioToolkitOptions } from '../verovio/verovioToolkit';

export function renderPaeToolbarGlyph(data: string, className: 'note' | 'rest' | 'barLine'): string {
  if (!window.VerovioToolkit) return '';

  const pae = [
    '@clef:G-2',
    '@keysig:',
    '@key:',
    '@timesig:',
    `@data: ${data}`,
    '',
  ].join('\n');

  try {
    resetVerovioToolkitOptions();
    const rendered = window.VerovioToolkit.renderData(pae, {
      inputFrom: 'pae',
      scale: 50,
      adjustPageHeight: 1,
      pageWidth: 600,
      pageMarginTop: 0,
      pageMarginBottom: 0,
      pageMarginLeft: 0,
      pageMarginRight: 0,
      spacingStaff: 2,
      xmlIdSeed: 1,
    });
    const doc = new DOMParser().parseFromString(rendered, 'image/svg+xml');
    const defs = doc.querySelector('defs')?.cloneNode(true);
    const glyph = doc.querySelector<SVGGElement>(`g.${className}`);
    if (!glyph) return '';
    const viewBox = className === 'barLine'
      ? '1200 160 520 900'
      : className === 'rest'
        ? '760 160 900 900'
        : '700 360 900 980';
    const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'verovio-pae-vrv-icon');
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
    svg.setAttribute('viewBox', viewBox);
    svg.setAttribute('color', 'currentColor');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    if (defs) svg.append(defs);
    svg.append(glyph.cloneNode(true));
    return new XMLSerializer().serializeToString(svg);
  } catch (error) {
    console.error('Failed to render Verovio toolbar glyph:', error);
    return '';
  }
}

export function renderPaePreviewSvg(pae: string): string {
  resetVerovioToolkitOptions();
  return window.VerovioToolkit.renderData(`${pae}\n`, {
    inputFrom: 'pae',
    scale: 50,
    adjustPageHeight: 1,
    pageWidth: 1048,
    pageMarginTop: 0,
    pageMarginBottom: 0,
    pageMarginLeft: 0,
    pageMarginRight: 0,
    spacingStaff: 2,
    xmlIdSeed: 1,
  });
}

export function getPaeValidationMessages(pae: string): string[] {
  if (!window.VerovioToolkit?.validatePAE) return [];
  const validation = window.VerovioToolkit.validatePAE(pae) as Record<string, unknown>;
  const messages: string[] = [];
  ['clef', 'keysig', 'timesig'].forEach((key) => {
    const item = validation[key] as { text?: string } | undefined;
    if (item && !Array.isArray(item) && item.text) messages.push(item.text);
  });
  const dataMessages = validation.data as { text?: string }[] | undefined;
  if (Array.isArray(dataMessages)) {
    dataMessages.forEach((item) => {
      if (item.text) messages.push(item.text);
    });
  }
  return messages;
}

export function convertPaeToMei(pae: string): string {
  if (!window.VerovioToolkit) throw new Error('Verovio toolkit is not loaded.');
  resetVerovioToolkitOptions();
  window.VerovioToolkit.renderData(`${pae}\n`, { inputFrom: 'pae' });
  const mei = window.VerovioToolkit.getMEI();
  if (!mei.trim()) throw new Error('Verovio did not return MEI.');
  return mei;
}
