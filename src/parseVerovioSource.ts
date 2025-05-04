/* -----------------------------------------------------------------------
 *  parseVerovioSource.ts
 * --------------------------------------------------------------------- */
export type VerovioFormat = 'mei' | 'abc' | 'musicxml';

export interface ParsedVerovioSource {
  format: VerovioFormat;               // erkannter Notationstyp
  filePath?: string;                   // Pfad im Vault / URL (nur Datei-Modus)
  code?: string;                       // Inline-Notation          (nur Inline-Modus)
  options: Record<string, any>;        // Verovio-Optionen aus Block
  measureRange?: string;               // optionale Measure-Range
}

/**
 *  Zerlegt den Inhalt eines 
 *  verovio-Codeblocks, erkennt Inline-Notation vs. Datei-Modus,
 *  extrahiert Optionen und measureRange immer am Ende des Blocks.
 */
export default function parseVerovioSource(src: string): ParsedVerovioSource {
  const rawLines = src.split('\n');

  // 1) Extrahiere zusammenhängende key:val‑Zeilen am Ende
  //    (Filtere URLs aus, damit Pfade nicht als Optionen erkannt werden)
  const options: Record<string, any> = {};
  let measureRange: string | undefined;
  let end = rawLines.length;
  for (let i = rawLines.length - 1; i >= 0; i--) {
    const line = rawLines[i].trim();
    // Zeile als URL erkennen: http:// oder https:// --> Abbruch, keine weiteren Optionen
    if (/^https?:\/\//i.test(line)) {
      break;
    }
    // Option-Zeilen: Schlüssel:Wert, Schlüssel keine URL
    if (/^[A-Za-z]\w*\s*:\s*.+$/.test(line) && !/^[A-Za-z]+:\/\//.test(line)) {
      const [key, val] = line.split(':').map(p => p.trim());
      if (key === 'measureRange') measureRange = val;
      else options[key] = parseValue(val);
      end = i;
    } else {
      break;
    }
  }

  const codeLines = rawLines.slice(0, end);
  const nonEmpty = codeLines.map(l => l.trim()).filter(Boolean);
  const first = nonEmpty[0] || '';
  const firstLower = first.toLowerCase();

  // 2) Legacy‑Präfixe
  if (firstLower === 'abc:' || firstLower === 'abc') {
    return {
      format: 'abc',
      code: codeLines.join('\n').replace(/^abc:\s*\n?/i, ''),
      options,
      measureRange
    };
  }
  if (firstLower === 'musicxml:' || firstLower === 'musicxml') {
    return {
      format: 'musicxml',
      code: codeLines.join('\n').replace(/^musicxml:\s*\n?/i, ''),
      options,
      measureRange
    };
  }
  if (firstLower === 'mei:' || firstLower === 'mei') {
    return {
      format: 'mei',
      code: codeLines.join('\n').replace(/^mei:\s*\n?/i, ''),
      options,
      measureRange
    };
  }

  // 3) Automatische Inline-Erkennung
  if (nonEmpty[0]?.startsWith('<mei')) {
    return { format: 'mei', code: codeLines.join('\n'), options, measureRange };
  }
  if (nonEmpty[0]?.startsWith('<?xml') ||
      nonEmpty[0]?.includes('<score-partwise')) {
    return { format: 'musicxml', code: codeLines.join('\n'), options, measureRange };
  }
  if (/^X:\d+/i.test(nonEmpty[0] || '')) {
    return { format: 'abc', code: codeLines.join('\n'), options, measureRange };
  }

  // 4) Datei-Modus (erste Zeile = Pfad)
  const filePath = nonEmpty.shift();
  // Format basierend auf Dateiendung erkennen
  let fileFormat: VerovioFormat = 'mei';
  const ext = filePath?.split('.').pop()?.toLowerCase();
  if (ext === 'xml' || ext === 'musicxml') fileFormat = 'musicxml';
  else if (ext === 'abc') fileFormat = 'abc';
  else if (ext === 'mei') fileFormat = 'mei';
  return { format: fileFormat, filePath, options, measureRange };
}

/* --- kleine Helfer ---------------------------------------------------- */
function parseValue(v: string) {
  if (v === 'true')  return true;
  if (v === 'false') return false;
  const n = Number(v);
  return isNaN(n) ? v : n;
}
