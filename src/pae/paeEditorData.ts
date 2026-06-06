export interface PianoKey {
  pitch: string;
  octave: number;
  alteration: -1 | 0 | 1;
  midi: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export const CLEFS = [
  ['G-1', 'G-1'],
  ['G-2', 'G-2 (treble)'],
  ['C-1', 'C-1'],
  ['C-2', 'C-2'],
  ['C-3', 'C-3'],
  ['C-4', 'C-4'],
  ['C-5', 'C-5'],
  ['F-4', 'F-4 (bass)'],
  ['C+1', 'C+1 (mensural)'],
  ['C+2', 'C+2 (mensural)'],
  ['C+3', 'C+3 (mensural)'],
  ['C+4', 'C+4 (mensural)'],
  ['C+5', 'C+5 (mensural)'],
];

export const KEYSIGS = [
  ['', 'Key signature ...'],
  ['xF', '1 ♯'],
  ['xFC', '2 ♯'],
  ['xFCG', '3 ♯'],
  ['xFCGD', '4 ♯'],
  ['xFCGDA', '5 ♯'],
  ['xFCGDAE', '6 ♯'],
  ['xFCGDAEB', '7 ♯'],
  ['bB', '1 ♭'],
  ['bBE', '2 ♭'],
  ['bBEA', '3 ♭'],
  ['bBEAD', '4 ♭'],
  ['bBEADG', '5 ♭'],
  ['bBEADGC', '6 ♭'],
  ['bBEADGCF', '7 ♭'],
];

export const DURATIONS = [
  { value: 9, label: 'Long' },
  { value: 1, label: 'Whole note' },
  { value: 2, label: 'Half note' },
  { value: 4, label: 'Quarter note' },
  { value: 8, label: 'Eighth note' },
  { value: 6, label: 'Sixteenth note' },
  { value: 3, label: 'Thirty-second note' },
  { value: 5, label: 'Sixty-fourth note' },
];

const WHITE_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SHARP_KEYS = [
  { pitch: 'C', x: 17, midiOffset: 1 },
  { pitch: 'D', x: 42, midiOffset: 3 },
  { pitch: 'F', x: 92, midiOffset: 6 },
  { pitch: 'G', x: 117, midiOffset: 8 },
  { pitch: 'A', x: 142, midiOffset: 10 },
];
const FLAT_KEYS = [
  { pitch: 'D', x: 17, midiOffset: 1 },
  { pitch: 'E', x: 42, midiOffset: 3 },
  { pitch: 'G', x: 92, midiOffset: 6 },
  { pitch: 'A', x: 117, midiOffset: 8 },
  { pitch: 'B', x: 142, midiOffset: 10 },
];

export function buildPianoKeys(): PianoKey[] {
  const keys: PianoKey[] = [];
  [1, 2, 3].forEach((octave, octaveIndex) => {
    const baseX = octaveIndex * 175;
    const baseMidi = 60 + octaveIndex * 12;
    WHITE_KEYS.forEach((pitch, index) => {
      keys.push({
        pitch,
        octave,
        alteration: 0,
        midi: baseMidi + [0, 2, 4, 5, 7, 9, 11][index],
        x: baseX + index * 25,
        y: 3,
        width: 25,
        height: 149,
        label: pitch,
      });
    });
    SHARP_KEYS.forEach((key) => {
      keys.push({
        pitch: key.pitch,
        octave,
        alteration: 1,
        midi: baseMidi + key.midiOffset,
        x: baseX + key.x,
        y: 3,
        width: 15,
        height: 49,
      });
    });
    FLAT_KEYS.forEach((key) => {
      keys.push({
        pitch: key.pitch,
        octave,
        alteration: -1,
        midi: baseMidi + key.midiOffset,
        x: baseX + key.x,
        y: 53,
        width: 15,
        height: 49,
      });
    });
  });
  return keys;
}
