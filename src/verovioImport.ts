import type { VerovioFormat, VerovioOptionValue } from './parseVerovioSource';
import createVerovioModule from 'verovio/wasm-hum';
import { VerovioToolkit } from 'verovio/esm';

interface GabcMetadata {
  title?: string;
  subtitle?: string;
  name?: string;
  annotation?: string;
  commentary?: string;
  userNotes?: string;
}

export function getInputFrom(format: VerovioFormat): string {
  return format === 'pae' ? 'pae' : format;
}

export async function convertInlineCodeToMEI(
  code: string,
  format: VerovioFormat,
  options: Record<string, VerovioOptionValue> = {}
): Promise<string> {
  if (format === 'mei') return code;
  const toolkit = format === 'abc' ? await createIsolatedToolkit() : window.VerovioToolkit;
  try {
    toolkit.renderData(code, { ...options, inputFrom: getInputFrom(format) });
    const mei = toolkit.getMEI();
    if (!mei.trim()) throw new Error(`Failed to convert ${format} input to MEI.`);
    return mei;
  } finally {
    if (toolkit !== window.VerovioToolkit) toolkit.destroy?.();
  }
}

async function createIsolatedToolkit(): Promise<VerovioToolkit> {
  const verovioModule = await createVerovioModule();
  return new VerovioToolkit(verovioModule);
}

export function prepareGabcInput(code: string): { body: string; metadata: GabcMetadata; syllables: string[] } {
  const rawLines = code.replace(/\r\n?/g, '\n').split('\n');
  const separatorIndex = rawLines.findIndex((line) => line.trim() === '%%');
  const headerLines = separatorIndex >= 0 ? rawLines.slice(0, separatorIndex) : [];
  const bodyLines = separatorIndex >= 0 ? rawLines.slice(separatorIndex + 1) : rawLines;
  const body = bodyLines.join('\n').trim();

  return {
    body,
    metadata: parseGabcMetadata(headerLines),
    syllables: extractGabcSyllables(body),
  };
}

function parseGabcMetadata(lines: string[]): GabcMetadata {
  const metadata: GabcMetadata = {};
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%')) return;
    const sepIndex = trimmed.indexOf(':');
    if (sepIndex <= 0) return;

    const key = trimmed.slice(0, sepIndex).trim().toLowerCase();
    const value = trimmed.slice(sepIndex + 1).trim().replace(/;$/, '').trim();
    if (!value) return;

    if (key === 'title') metadata.title = value;
    else if (key === 'subtitle') metadata.subtitle = value;
    else if (key === 'name') metadata.name = value;
    else if (key === 'annotation') metadata.annotation = value;
    else if (key === 'commentary') metadata.commentary = value;
    else if (key === 'user-notes') metadata.userNotes = value;
  });
  return metadata;
}

function extractGabcSyllables(body: string): string[] {
  const syllables: string[] = [];
  let text = '';
  let inNotation = false;

  for (const char of body) {
    if (char === '(') {
      addGabcSyllable(syllables, text);
      text = '';
      inNotation = true;
    } else if (char === ')') {
      inNotation = false;
    } else if (!inNotation) {
      text += char;
    }
  }
  addGabcSyllable(syllables, text);
  return syllables;
}

function addGabcSyllable(syllables: string[], text: string) {
  const syllable = text.replace(/\s+/g, ' ').trim();
  if (syllable) syllables.push(syllable);
}

export function fixGabcMeiSyllables(mei: string, syllables: string[]): string {
  let index = 0;
  return mei.replace(/<syl\b([^>]*)>([\s\S]*?)<\/syl>/g, (full, attrs: string, content: string) => {
    const source = syllables[index++];
    if (!source || !content.includes('�')) return full;
    return `<syl${attrs}>${escapeXml(source)}</syl>`;
  });
}

export function addGabcMetadataToMEI(mei: string, metadata: GabcMetadata): string {
  const title = metadata.title || metadata.name;
  const subtitle = metadata.subtitle || metadata.commentary || metadata.userNotes;
  if (!title && !subtitle) return mei;

  const titles = [
    title ? `<title>${escapeXml(title)}</title>` : '',
    subtitle ? `<title type="subtitle">${escapeXml(subtitle)}</title>` : '',
  ].filter(Boolean).join('\n            ');

  return mei.replace(/<titleStmt>\s*<title\s*\/>\s*<\/titleStmt>/, `<titleStmt>\n            ${titles}\n         </titleStmt>`);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
