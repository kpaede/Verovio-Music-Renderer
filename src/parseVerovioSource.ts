// parseVerovioSource.ts

export type VerovioFormat = 'mei' | 'abc' | 'gabc' | 'musicxml' | 'pae';
export type VerovioOptionValue = string | number | boolean;
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
  const first = nonEmpty[0] || '';
  const firstLower = first.toLowerCase();

  // 2) Legacy-Präfixe
  if (firstLower === 'abc:' || firstLower === 'abc') {
    return {
      format: 'abc',
      code: codeLines.join('\n').replace(/^abc:\s*/i, '').trim(),
      options,
      measureRange
    };
  }
  if (firstLower === 'gabc:' || firstLower === 'gabc') {
    return {
      format: 'gabc',
      code: codeLines.join('\n').replace(/^gabc:\s*/i, '').trim(),
      options,
      measureRange
    };
  }
  if (firstLower === 'musicxml:' || firstLower === 'musicxml') {
    return {
      format: 'musicxml',
      code: codeLines.join('\n').replace(/^musicxml:\s*/i, '').trim(),
      options,
      measureRange
    };
  }
  if (firstLower === 'mei:' || firstLower === 'mei') {
    return {
      format: 'mei',
      code: codeLines.join('\n').replace(/^mei:\s*/i, '').trim(),
      options,
      measureRange
    };
  }

  // 3) Plaine and Easie inline detection (beginnend mit @)
  if (nonEmpty[0]?.startsWith('@')) {
    return {
      format: 'pae',
      code: codeLines.join('\n').trim(),
      options,
      measureRange
    };
  }

  // 4) Automatische Inline-Erkennung
  const inlineCode = codeLines.join('\n').trim();
  if (/<mei(?:\s|>)/i.test(inlineCode)) {
    return { format: 'mei', code: inlineCode, options, measureRange };
  }
  if (/<score-partwise(?:\s|>)/i.test(inlineCode) || /<score-timewise(?:\s|>)/i.test(inlineCode)) {
    return { format: 'musicxml', code: inlineCode, options, measureRange };
  }
  if (/^X:\d+/i.test(nonEmpty[0] || '')) {
    return { format: 'abc', code: inlineCode, options, measureRange };
  }
  if (isGabcInline(nonEmpty, inlineCode)) {
    return { format: 'gabc', code: inlineCode, options, measureRange };
  }

  // 5) Datei-Modus (erste Zeile = Pfad)
  const filePath = nonEmpty.shift();
  let fileFormat: VerovioFormat = 'mei';
  const ext = filePath?.split('.').pop()?.toLowerCase();
  if (ext === 'xml' || ext === 'musicxml') fileFormat = 'musicxml';
  else if (ext === 'abc') fileFormat = 'abc';
  else if (ext === 'gabc') fileFormat = 'gabc';
  else if (ext === 'mei') fileFormat = 'mei';
  return { format: fileFormat, filePath, options, measureRange };
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

function parseValue(v: string): VerovioOptionValue {
  if (v === 'true')  return true;
  if (v === 'false') return false;
  const n = Number(v);
  return isNaN(n) ? v : n;
}
