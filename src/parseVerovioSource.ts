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
 *  Zerlegt den Inhalt eines ```verovio-Codeblocks und entscheidet,
 *  ob es Dateipfad oder Inline-Notation ist. Erkennt MEI, ABC, MusicXML.
 */
export function parseVerovioSource(src: string): ParsedVerovioSource {
  /* --- Zeilen vorbereiten --------------------------------------------- */
  const rawLines      = src.split('\n');
  const linesTrimmed  = rawLines.map(l => l.trim());
  const nonEmptyLines = linesTrimmed.filter(Boolean);
  const options: Record<string, any> = {};
  let measureRange: string | undefined;

  /* --- 1) Legacy-Präfixe (abc:, musicxml:, mei:) ---------------------- */
  const firstLower = nonEmptyLines[0]?.toLowerCase() ?? '';
  if (firstLower === 'abc:' || firstLower === 'abc') {
    return {
      format : 'abc',
      code   : rawLines.join('\n').replace(/^abc:\s*\n?/i, ''),
      options, measureRange
    };
  }
  if (firstLower === 'musicxml:' || firstLower === 'musicxml') {
    return {
      format : 'musicxml',
      code   : rawLines.join('\n').replace(/^musicxml:\s*\n?/i, ''),
      options, measureRange
    };
  }
  if (firstLower === 'mei:' || firstLower === 'mei') {
    return {
      format : 'mei',
      code   : rawLines.join('\n').replace(/^mei:\s*\n?/i, ''),
      options, measureRange
    };
  }

  /* --- 2) Automatische Inline-Erkennung ------------------------------- */
  if (nonEmptyLines[0]?.startsWith('<mei')) {
    return { format: 'mei', code: rawLines.join('\n'), options, measureRange };
  }
  if (nonEmptyLines[0]?.startsWith('<?xml') ||
      nonEmptyLines[0]?.includes('<score-partwise')) {
    return { format: 'musicxml', code: rawLines.join('\n'), options, measureRange };
  }
  if (/^X:\d+/i.test(nonEmptyLines[0])) {
    return { format: 'abc', code: rawLines.join('\n'), options, measureRange };
  }

  /* --- 3) Datei-Modus (erste Zeile = Pfad) ---------------------------- */
  const filePath = nonEmptyLines.shift();      // entfernt erste Zeile

  for (const line of nonEmptyLines) {
    const [key, val] = line.split(':').map(p => p.trim());
    if (!key || !val) continue;
    if (key === 'measureRange') measureRange = val;
    else options[key] = parseValue(val);
  }

  /*  Default-Format für Dateien = MEI (Verovio wandelt ABC/MusicXML selbst) */
  return { format: 'mei', filePath, options, measureRange };
}

/* --- kleine Helfer ---------------------------------------------------- */
function parseValue(v: string) {
  if (v === 'true')  return true;
  if (v === 'false') return false;
  const n = Number(v);
  return isNaN(n) ? v : n;
}
