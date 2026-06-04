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
  {
    items: [
      { id: 'cleanAccid', label: 'Check @accid.ges', shortcut: 'Ctrl Shift C' },
      { id: 'meterConformance', label: 'Check @metcon' },
      { id: 'renumberMeasuresTest', label: 'Renumber measures (test)' },
      { id: 'renumberMeasuresExec', label: 'Renumber measures (exec)', shortcut: 'Cmd Shift R' },
    ],
  },
  {
    items: [
      { id: 'addIds', label: 'Add ids to MEI', shortcut: 'Cmd M' },
      { id: 'removeIds', label: 'Remove ids from MEI', shortcut: 'Cmd Shift M' },
    ],
  },
  {
    items: [
      { id: 'reRenderMeiVerovio', label: 'Rerender via Verovio' },
    ],
  },
  {
    items: [
      { id: 'addFacsimile', label: 'Add facsimile element' },
      { id: 'ingestFacsimile', label: 'Ingest facsimile', shortcut: 'Cmd I' },
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
