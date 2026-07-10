// Lightweight ChordPro renderer for `chopro` / `chordpro` code blocks.
//
// This is intentionally independent of Verovio: ChordPro carries no pitch or
// rhythm, so there is nothing to engrave — it is chord names positioned over
// lyric text. The renderer is built screen-reader-first:
//   - DOM order is chord-then-syllable, so a screen reader reads a line the way
//     a musician would ("G, Carry me, D, home"), while CSS stacks the chord
//     above the syllable visually.
//   - Chords carry an aria-label ("G chord") so tokens like "Am" are not read
//     as the word "am".
//   - The title renders as a heading and choruses/verses as labelled groups,
//     and chords are distinguished by weight + position, never colour alone.

interface ChordSegment {
  chord?: string;
  text: string;
}

type ChordProNode =
  | { type: 'title'; value: string }
  | { type: 'subtitle'; value: string }
  | { type: 'meta'; label: string; value: string }
  | { type: 'comment'; value: string }
  | { type: 'section-start'; kind: SectionKind; label: string }
  | { type: 'section-end' }
  | { type: 'line'; segments: ChordSegment[] }
  | { type: 'empty' };

type SectionKind = 'chorus' | 'verse' | 'bridge' | 'tab';

const DIRECTIVE_RE = /^\s*\{\s*([^:}]+?)\s*(?::\s*([\s\S]*?))?\s*\}\s*$/;
const INLINE_CHORD_RE = /\[([^\]]*)\]/g;

const SECTION_LABELS: Record<SectionKind, string> = {
  chorus: 'Chorus',
  verse: 'Verse',
  bridge: 'Bridge',
  tab: 'Tablature',
};

/** Entry point registered as the `chopro` / `chordpro` code-block processor. */
export function renderChordProBlock(source: string, el: HTMLElement) {
  const nodes = parseChordPro(source);
  renderNodes(nodes, el);
}

export function parseChordPro(source: string): ChordProNode[] {
  const nodes: ChordProNode[] = [];

  for (const rawLine of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      nodes.push({ type: 'empty' });
      continue;
    }

    const directive = line.match(DIRECTIVE_RE);
    if (directive) {
      const node = parseDirective(directive[1].trim().toLowerCase(), (directive[2] ?? '').trim());
      if (node) nodes.push(node);
      continue;
    }

    nodes.push({ type: 'line', segments: parseChordLine(rawLine) });
  }

  return nodes;
}

function parseDirective(name: string, value: string): ChordProNode | null {
  switch (name) {
    case 'title':
    case 't':
      return { type: 'title', value };
    case 'subtitle':
    case 'st':
      return { type: 'subtitle', value };
    case 'comment':
    case 'c':
    case 'comment_italic':
    case 'ci':
      return { type: 'comment', value };
    case 'start_of_chorus':
    case 'soc':
      return { type: 'section-start', kind: 'chorus', label: value || SECTION_LABELS.chorus };
    case 'start_of_verse':
    case 'sov':
      return { type: 'section-start', kind: 'verse', label: value || SECTION_LABELS.verse };
    case 'start_of_bridge':
    case 'sob':
      return { type: 'section-start', kind: 'bridge', label: value || SECTION_LABELS.bridge };
    case 'start_of_tab':
    case 'sot':
      return { type: 'section-start', kind: 'tab', label: value || SECTION_LABELS.tab };
    case 'end_of_chorus':
    case 'eoc':
    case 'end_of_verse':
    case 'eov':
    case 'end_of_bridge':
    case 'eob':
    case 'end_of_tab':
    case 'eot':
      return { type: 'section-end' };
    default:
      // Remaining `key: value` directives (key, capo, tempo, artist, album…)
      // become readable metadata rows. Bare directives with no value are
      // ignored rather than rendered as empty rows.
      if (!value) return null;
      return { type: 'meta', label: titleCase(name.replace(/_/g, ' ')), value };
  }
}

/** Splits a lyric line into chord/text segments, preserving source order. */
function parseChordLine(line: string): ChordSegment[] {
  const segments: ChordSegment[] = [];
  let lastIndex = 0;
  let pendingChord: string | undefined;

  INLINE_CHORD_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INLINE_CHORD_RE.exec(line)) !== null) {
    const text = line.slice(lastIndex, match.index);
    if (text || pendingChord !== undefined) {
      segments.push({ chord: pendingChord, text });
    }
    pendingChord = match[1];
    lastIndex = INLINE_CHORD_RE.lastIndex;
  }

  const tail = line.slice(lastIndex);
  if (tail || pendingChord !== undefined || segments.length === 0) {
    segments.push({ chord: pendingChord, text: tail });
  }

  return segments;
}

function renderNodes(nodes: ChordProNode[], el: HTMLElement) {
  const title = nodes.find((n): n is Extract<ChordProNode, { type: 'title' }> => n.type === 'title')?.value;

  const sheet = el.createDiv('chopro-sheet');
  sheet.setAttribute('role', 'group');
  sheet.setAttribute('aria-label', title ? `Chord sheet: ${title}` : 'Chord sheet');

  // Lines inside a {start_of_*}…{end_of_*} block are appended to a labelled
  // group so screen-reader users can identify choruses/verses.
  let target: HTMLElement = sheet;

  for (const node of nodes) {
    switch (node.type) {
      case 'title':
        sheet.createEl('h4', { cls: 'chopro-title', text: node.value });
        break;
      case 'subtitle':
        sheet.createEl('div', { cls: 'chopro-subtitle', text: node.value });
        break;
      case 'meta':
        renderMeta(sheet, node.label, node.value);
        break;
      case 'comment':
        target.createEl('div', { cls: 'chopro-comment', text: node.value });
        break;
      case 'section-start': {
        const section = sheet.createDiv(`chopro-section chopro-${node.kind}`);
        section.setAttribute('role', 'group');
        section.setAttribute('aria-label', node.label);
        section.createEl('div', { cls: 'chopro-section-label', text: node.label });
        target = section;
        break;
      }
      case 'section-end':
        target = sheet;
        break;
      case 'line':
        renderLine(target, node.segments);
        break;
      case 'empty':
        target.createDiv('chopro-spacer');
        break;
    }
  }
}

function renderMeta(sheet: HTMLElement, label: string, value: string) {
  const row = sheet.createDiv('chopro-meta');
  row.createEl('span', { cls: 'chopro-meta-label', text: `${label}: ` });
  row.createEl('span', { cls: 'chopro-meta-value', text: value });
}

function renderLine(parent: HTMLElement, segments: ChordSegment[]) {
  const line = parent.createDiv('chopro-line');
  const hasChords = segments.some((s) => s.chord !== undefined);
  if (!hasChords) line.addClass('chopro-line-plain');

  for (const segment of segments) {
    const seg = line.createSpan('chopro-seg');

    if (segment.chord !== undefined) {
      const chordText = segment.chord.trim();
      const chord = seg.createSpan('chopro-chord');
      // Non-empty chords are read as "G chord"; an empty [] is a spacer only.
      chord.setText(chordText || ' ');
      if (chordText) chord.setAttribute('aria-label', `${chordText} chord`);
      else chord.setAttribute('aria-hidden', 'true');
    }

    const lyric = seg.createSpan('chopro-lyric');
    // Keep the syllable box from collapsing when a chord has no trailing text.
    lyric.setText(segment.text === '' ? ' ' : segment.text);
  }
}

function titleCase(value: string): string {
  return value.replace(/\b\w/g, (c) => c.toUpperCase());
}
