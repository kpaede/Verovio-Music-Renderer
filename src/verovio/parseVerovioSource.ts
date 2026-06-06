// parseVerovioSource.ts

export type VerovioFormat = 'mei' | 'abc' | 'cmme.xml' | 'gabc' | 'humdrum' | 'musicxml' | 'pae' | 'volpiano';
export type VerovioOptionValue = string | number | boolean | null | undefined;
export type VerovioOptions = Record<string, VerovioOptionValue>;

export interface ParsedVerovioSource {
  format: VerovioFormat;               // erkannter Notationstyp
  filePath?: string;                   // Pfad im Vault / URL (nur Datei-Modus)
  code?: string;                       // Inline-Notation          (nur Inline-Modus)
  options: VerovioOptions;             // Verovio-Optionen aus Block
  measureRange?: string;               // optionale Measure-Range
}

/**
 *  Zerlegt den Inhalt eines
 *  verovio-Codeblocks, erkennt Inline-Notation vs. Datei-Modus,
 *  extrahiert Optionen und measureRange immer am Ende des Blocks.
 */
export default function parseVerovioSource(src: string): ParsedVerovioSource {
  const rawLines = src.split('\n');

  // 1) Extrahiere zusammenhängende key:val-Zeilen am Ende
  //    (Filtere URLs aus, damit Pfade nicht als Optionen erkannt werden)
  const options: VerovioOptions = {};
  let measureRange: string | undefined;
  let end = rawLines.length;

  for (let i = rawLines.length - 1; i >= 0; i--) {
    const lineRaw = rawLines[i];
    const line = lineRaw.trim();
    // Leerzeilen überspringen
    if (line === '') {
      continue;
    }
    // Zeile als URL erkennen: http:// oder https:// --> Abbruch, keine weiteren Optionen
    if (/^https?:\/\//i.test(line)) {
      break;
    }
    // Option-Zeilen: Schlüssel:Wert, Schlüssel beginnt mit kleinem Buchstaben
    if (/^[a-z]\w*\s*:\s*.+$/.test(line) && !/^[A-Za-z]+:\/\//.test(line)) {
      const sepIndex = line.indexOf(':');
      const key = line.slice(0, sepIndex).trim();
      const val = line.slice(sepIndex + 1).trim();
      if (key === 'measureRange') {
        measureRange = val;
      } else {
        options[key] = parseValue(val);
      }
      end = i;
    } else {
      break;
    }
  }

  const codeLines = rawLines.slice(0, end);
  const nonEmpty = codeLines.map(l => l.trim()).filter(Boolean);
  // 2) Plaine and Easie inline detection (beginnend mit @)
  if (nonEmpty[0]?.startsWith('@')) {
    return {
      format: 'pae',
      code: codeLines.join('\n').trim(),
      options,
      measureRange
    };
  }

  // 3) Automatische Inline-Erkennung
  const inlineCode = codeLines.join('\n').trim();
  const xmlCode = extractXmlDocument(inlineCode);
  if (xmlCode && /<mei(?:\s|>)/i.test(xmlCode)) {
    return { format: 'mei', code: xmlCode, options, measureRange };
  }
  if (xmlCode && (/<score-partwise(?:\s|>)/i.test(xmlCode) || /<score-timewise(?:\s|>)/i.test(xmlCode))) {
    return { format: 'musicxml', code: xmlCode, options, measureRange };
  }
  if (xmlCode && isCmmeInline(xmlCode)) {
    return { format: 'cmme.xml', code: xmlCode, options, measureRange };
  }
  if (isHumdrumInline(nonEmpty, inlineCode)) {
    return { format: 'humdrum', code: inlineCode, options, measureRange };
  }
  if (/^X:\d+/i.test(nonEmpty[0] || '')) {
    return { format: 'abc', code: inlineCode, options, measureRange };
  }
  if (isGabcInline(nonEmpty, inlineCode)) {
    return { format: 'gabc', code: inlineCode, options, measureRange };
  }
  if (isVolpianoInline(nonEmpty, inlineCode)) {
    return { format: 'volpiano', code: inlineCode, options, measureRange };
  }

  // 4) Datei-Modus (erste Zeile = Pfad)
  const filePath = nonEmpty.shift();
  let fileFormat: VerovioFormat = 'mei';
  const lowerPath = filePath?.toLowerCase() || '';
  const ext = lowerPath.split('.').pop();
  if (lowerPath.endsWith('.cmme.xml') || ext === 'cmme') fileFormat = 'cmme.xml';
  else if (ext === 'krn' || ext === 'kern' || ext === 'humdrum') fileFormat = 'humdrum';
  else if (ext === 'xml' || ext === 'musicxml') fileFormat = 'musicxml';
  else if (ext === 'abc') fileFormat = 'abc';
  else if (ext === 'gabc') fileFormat = 'gabc';
  else if (ext === 'volpiano' || ext === 'vol' || ext === 'vp') fileFormat = 'volpiano';
  else if (ext === 'mei') fileFormat = 'mei';
  return { format: fileFormat, filePath, options, measureRange };
}

export function isCmmeInline(inlineCode: string): boolean {
  const xmlCode = extractXmlDocument(inlineCode);
  if (!xmlCode) return false;
  return /<(?:Piece|Music|Composition|GeneralData|VoiceData|MensuralMusic)\b/i.test(xmlCode)
    && /<(?:GeneralData|VoiceData|Section|Mensuration|Note)\b/i.test(xmlCode);
}

function extractXmlDocument(code: string): string | undefined {
  const trimmed = code.trim();
  const rootMatch = trimmed.match(/<(?:\?xml\b[^>]*>\s*)?(?:mei|score-partwise|score-timewise|Piece|Music|Composition|GeneralData|VoiceData|MensuralMusic)\b/i);
  if (!rootMatch || rootMatch.index === undefined) return undefined;
  return trimmed.slice(rootMatch.index).trim();
}

function isGabcInline(nonEmpty: string[], inlineCode: string): boolean {
  if (!nonEmpty.length) return false;
  if (!inlineCode.includes('%%')) return false;

  const headerKeys = ['name', 'title', 'subtitle', 'annotation', 'office-part', 'mode'];
  return nonEmpty.some((line) => {
    const sepIndex = line.indexOf(':');
    if (sepIndex <= 0) return false;
    return headerKeys.includes(line.slice(0, sepIndex).trim().toLowerCase());
  });
}

function isHumdrumInline(nonEmpty: string[], inlineCode: string): boolean {
  if (!nonEmpty.length) return false;
  return /^\*\*(?:kern|dynam|text|recip|mens|deg|solfa|harm|root)(?:\s|\t|$)/i.test(nonEmpty[0])
    || /^!!![A-Z0-9_]+:/m.test(inlineCode);
}

function isVolpianoInline(nonEmpty: string[], inlineCode: string): boolean {
  if (nonEmpty.length !== 1) return false;
  const text = inlineCode.trim();
  if (!/^[1-7]/.test(text) || !text.includes('---')) return false;
  return /^[1-7a-mA-M+\-.\s]+$/.test(text);
}

function parseValue(v: string): VerovioOptionValue {
  if (v === 'true')  return true;
  if (v === 'false') return false;
  const n = Number(v);
  return isNaN(n) ? v : n;
}
