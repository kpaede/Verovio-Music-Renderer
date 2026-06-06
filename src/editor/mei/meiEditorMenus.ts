export type MeiEditorMenuKind = 'manipulate' | 'insert';

export interface MeiEditorMenuItem {
  id: string;
  label: string;
  shortcut?: string;
}

export interface MeiEditorMenuSection {
  items: MeiEditorMenuItem[];
}

export const MANIPULATE_MENU: MeiEditorMenuSection[] = [
  {
    items: [
      { id: 'invertPlacement', label: 'Invert placement', shortcut: 'X' },
      { id: 'betweenPlacement', label: 'Between placement', shortcut: 'Shift X' },
      { id: 'addVerticalGroup', label: 'Add vertical group', shortcut: 'V' },
    ],
  },
  {
    items: [
      { id: 'delete', label: 'Delete element', shortcut: 'Backspace / Del' },
    ],
  },
  {
    items: [
      { id: 'convertNoteToRest', label: 'Convert note(s) <=> rest(s)', shortcut: 'Shift N' },
      { id: 'toggleChord', label: 'Toggle chord', shortcut: 'C' },
    ],
  },
  {
    items: [
      { id: 'pitchChromUp', label: 'Pitch chromatically up', shortcut: 'Shift Up' },
      { id: 'pitchChromDown', label: 'Pitch chromatically down', shortcut: 'Shift Down' },
      { id: 'pitchUpDiat', label: 'Pitch diatonically up', shortcut: 'Alt Shift Up' },
      { id: 'pitchDownDiat', label: 'Pitch diatonically down', shortcut: 'Alt Shift Down' },
      { id: 'pitchOctaveUp', label: 'Pitch 1 octave up', shortcut: 'Cmd Shift Up' },
      { id: 'pitchOctaveDown', label: 'Pitch 1 octave down', shortcut: 'Cmd Shift Down' },
      { id: 'staffUp', label: 'Element 1 staff up', shortcut: 'Cmd Alt Up' },
      { id: 'staffDown', label: 'Element 1 staff down', shortcut: 'Cmd Alt Down' },
      { id: 'increaseDur', label: 'Increase duration', shortcut: 'Shift Right' },
      { id: 'decreaseDur', label: 'Decrease duration', shortcut: 'Shift Left' },
      { id: 'toggleDots', label: 'Toggle dotted note', shortcut: '.' },
    ],
  },
];

export const INSERT_MENU: MeiEditorMenuSection[] = [
  {
    items: [
      { id: 'addNote', label: 'Add note', shortcut: 'N' },
    ],
  },
  {
    items: [
      { id: 'addDoubleSharp', label: 'Double sharp', shortcut: 'Shift +' },
      { id: 'addSharp', label: 'Sharp', shortcut: '+' },
      { id: 'addNatural', label: 'Natural', shortcut: '=' },
      { id: 'addFlat', label: 'Flat', shortcut: '-' },
      { id: 'addDoubleFlat', label: 'Double flat', shortcut: 'Shift -' },
    ],
  },
  {
    items: [
      { id: 'addTempo', label: 'Tempo', shortcut: 'Shift T' },
      { id: 'addDirective', label: 'Directive', shortcut: 'I' },
      { id: 'addDynamics', label: 'Dynamics', shortcut: 'D' },
      { id: 'addSlur', label: 'Slur', shortcut: 'S' },
      { id: 'addTie', label: 'Tie', shortcut: 'T' },
      { id: 'addCresHairpin', label: 'Crescendo hairpin', shortcut: 'H' },
      { id: 'addDimHairpin', label: 'Diminuendo hairpin', shortcut: 'Shift H' },
      { id: 'addBeam', label: 'Beam', shortcut: 'B' },
      { id: 'addBeamSpan', label: 'BeamSpan', shortcut: 'Shift B' },
    ],
  },
  {
    items: [
      { id: 'addArpeggio', label: 'Arpeggio', shortcut: 'A' },
      { id: 'addFermata', label: 'Fermata', shortcut: 'F' },
      { id: 'addGlissando', label: 'Glissando', shortcut: 'G' },
      { id: 'addPedalDown', label: 'Pedal down', shortcut: 'P' },
      { id: 'addPedalUp', label: 'Pedal up', shortcut: 'Shift P' },
      { id: 'addTrill', label: 'Trill', shortcut: 'L' },
      { id: 'addTurn', label: 'Turn', shortcut: 'R' },
      { id: 'addTurnLower', label: 'Turn lower', shortcut: 'Shift R' },
      { id: 'addMordent', label: 'Mordent', shortcut: 'M' },
      { id: 'addMordentUpper', label: 'Mordent upper', shortcut: 'Shift M' },
      { id: 'addOctave8Above', label: 'Octave (8va above)', shortcut: 'O' },
      { id: 'addOctave15Above', label: 'Octave (15va above)', shortcut: 'Shift O' },
      { id: 'addOctave8Below', label: 'Octave (8va below)', shortcut: 'Ctrl O' },
      { id: 'addOctave15Below', label: 'Octave (15va below)', shortcut: 'Ctrl Shift O' },
    ],
  },
  {
    items: [
      { id: 'addGClefChangeBefore', label: 'G clef before', shortcut: 'Shift G' },
      { id: 'addGClefChangeAfter', label: 'G clef after', shortcut: 'Cmd Shift G' },
      { id: 'addFClefChangeBefore', label: 'F clef before', shortcut: 'Shift F' },
      { id: 'addFClefChangeAfter', label: 'F clef after', shortcut: 'Cmd Shift F' },
      { id: 'addCClefChangeBefore', label: 'C clef before', shortcut: 'Shift C' },
      { id: 'addCClefChangeAfter', label: 'C clef after', shortcut: 'Cmd Shift C' },
    ],
  },
  {
    items: [
      { id: 'toggleStacc', label: 'Staccato', shortcut: 'Shift S' },
      { id: 'toggleAccent', label: 'Accent', shortcut: 'Shift V' },
      { id: 'toggleTenuto', label: 'Tenuto', shortcut: 'Shift E' },
      { id: 'toggleMarcato', label: 'Marcato', shortcut: 'Shift A' },
      { id: 'toggleStacciss', label: 'Staccatissimo', shortcut: 'Shift I' },
      { id: 'toggleSpicc', label: 'Spiccato', shortcut: 'Shift Y' },
    ],
  },
];

export function findMenuItemByKeyboardEvent(event: KeyboardEvent): MeiEditorMenuItem | undefined {
  return [...MANIPULATE_MENU, ...INSERT_MENU]
    .flatMap((section) => section.items)
    .find((item) => item.shortcut && shortcutMatchesEvent(item.shortcut, event));
}

function shortcutMatchesEvent(shortcut: string, event: KeyboardEvent): boolean {
  if (shortcut === 'Backspace / Del') return !hasAnyModifier(event) && (event.key === 'Backspace' || event.key === 'Delete');

  const parts = shortcut.split(/\s+/);
  const key = parts.at(-1);
  if (!key) return false;

  const wantsShift = parts.includes('Shift');
  const wantsAlt = parts.includes('Alt');
  const wantsCtrl = parts.includes('Ctrl');
  const wantsCmd = parts.includes('Cmd');

  if (event.shiftKey !== wantsShift) return false;
  if (event.altKey !== wantsAlt) return false;
  if (event.ctrlKey !== wantsCtrl) return false;
  if (event.metaKey !== wantsCmd) return false;

  return possibleEventKeys(event).has(normalizeKey(key));
}

function hasAnyModifier(event: KeyboardEvent): boolean {
  return event.shiftKey || event.altKey || event.ctrlKey || event.metaKey;
}

function normalizeKey(key: string): string {
  const aliases: Record<string, string> = {
    up: 'arrowup',
    down: 'arrowdown',
    left: 'arrowleft',
    right: 'arrowright',
    del: 'delete',
    add: '+',
    equal: '=',
    minus: '-',
  };
  const normalized = key.toLowerCase();
  return aliases[normalized] ?? normalized;
}

function possibleEventKeys(event: KeyboardEvent): Set<string> {
  const keys = new Set<string>([normalizeKey(event.key)]);
  if (/^key[a-z]$/i.test(event.code)) keys.add(event.code.slice(3).toLowerCase());
  if (event.code === 'Equal') keys.add('=');
  if (event.code === 'Minus') keys.add('-');
  if (event.code === 'NumpadAdd') keys.add('+');
  if (event.code === 'NumpadSubtract') keys.add('-');

  if (event.key === '+') keys.add('=');
  if (event.key === '*') keys.add('+');

  return keys;
}
