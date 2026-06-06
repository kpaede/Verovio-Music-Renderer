import { extractCodeBlockBody } from './codeBlockRange';
import type { VerovioOptionValue } from '../verovio/parseVerovioSource';

export function isMeiText(text: string): boolean {
  return /<mei(?:\s|>)/i.test(text);
}

export function isXmlText(text: string): boolean {
  return /<\?xml\b|<[A-Za-z_][\w:.-]*(?:\s|>)/.test(extractCodeBlockBody(text).trim());
}

export function getInputFrom(format: string): string {
  return format === 'pae' ? 'pae' : format;
}

export function splitNotationAndOptions(body: string): { notation: string; optionsText: string } {
  const lines = body.split('\n');
  let end = lines.length;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (/^https?:\/\//i.test(line)) break;
    if (/^[a-z]\w*\s*:\s*.+$/.test(line) && !/^[A-Za-z]+:\/\//.test(line)) {
      end = i;
      continue;
    }
    break;
  }

  return {
    notation: lines.slice(0, end).join('\n').trim(),
    optionsText: lines.slice(end).join('\n').trim(),
  };
}

function optionLineKey(line: string): string | undefined {
  const match = line.trim().match(/^([a-z]\w*)\s*:\s*.+$/);
  return match?.[1];
}

export function getCodeBlockBodyOptionsText(body: string): string {
  return splitNotationAndOptions(body).optionsText;
}

export function formatOptionValue(value: VerovioOptionValue | VerovioOptionValue[]): string {
  if (Array.isArray(value)) return value.join(',');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

export function updateOptionInBody(body: string, key: string, value: VerovioOptionValue | undefined): string {
  const { notation, optionsText } = splitNotationAndOptions(body);
  const optionLines = optionsText
    ? optionsText.split('\n').filter((line) => optionLineKey(line) !== key)
    : [];

  if (value !== undefined && value !== null && value !== '') {
    optionLines.push(`${key}: ${formatOptionValue(value)}`);
  }

  return optionLines.length
    ? `${notation}\n${optionLines.join('\n')}`
    : notation;
}

export function removeOptionsFromBody(body: string, keys: Set<string>): string {
  const { notation, optionsText } = splitNotationAndOptions(body);
  if (!optionsText) return notation;
  const optionLines = optionsText
    .split('\n')
    .filter((line) => {
      const key = optionLineKey(line);
      return !key || !keys.has(key);
    });
  return optionLines.length ? `${notation}\n${optionLines.join('\n')}` : notation;
}

export function parseOptionText(optionsText: string): Record<string, VerovioOptionValue> {
  const parsed: Record<string, VerovioOptionValue> = {};
  optionsText.split('\n').forEach((line) => {
    const key = optionLineKey(line);
    if (!key) return;
    const sepIndex = line.indexOf(':');
    parsed[key] = parseOptionValue(line.slice(sepIndex + 1).trim());
  });
  return parsed;
}

function parseOptionValue(value: string): VerovioOptionValue {
  if (value === 'true') return true;
  if (value === 'false') return false;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? value : numberValue;
}
