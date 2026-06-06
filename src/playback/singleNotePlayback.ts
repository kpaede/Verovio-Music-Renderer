import MIDI from 'lz-midi';
import { Notice } from 'obsidian';
import { getMidiNotesForElement } from './midiNotes';
import { instanceStateMap } from '../rendering/verovioState';

const SINGLE_NOTE_CHANNEL = 0;
const SINGLE_NOTE_VELOCITY = 100;
const SINGLE_NOTE_DURATION_SECONDS = 0.8;
let singleNoteSoundReady = false;
let singleNoteSoundLoading = false;
const pendingSingleNotes: number[][] = [];

export function playSingleNote(uid: string, elementId: string) {
  const st = instanceStateMap[uid];
  if (!st?.supportsPlayback) return;

  const notes = getMidiNotesForElement(st.meiData, elementId);
  if (!notes.length) return;

  playPianoNotes(notes);
}

export function resetMidiChannelsToPiano() {
  if (!MIDI.channels) return;
  Object.values(MIDI.channels).forEach((channel) => {
    channel.instrument = 0;
  });
}

function playPianoNotes(notes: number[]) {
  const uniqueNotes = Array.from(new Set(notes));

  if (!singleNoteSoundReady) {
    pendingSingleNotes.push(uniqueNotes);
    loadSingleNoteSound();
    return;
  }

  resetMidiChannelsToPiano();
  MIDI.programChange?.(SINGLE_NOTE_CHANNEL, 0, 0);
  MIDI.setVolume?.(SINGLE_NOTE_CHANNEL, 127, 0);
  uniqueNotes.forEach((note) => {
    MIDI.noteOn?.(SINGLE_NOTE_CHANNEL, note, SINGLE_NOTE_VELOCITY, 0);
    MIDI.noteOff?.(SINGLE_NOTE_CHANNEL, note, SINGLE_NOTE_DURATION_SECONDS);
  });
}

function loadSingleNoteSound() {
  if (singleNoteSoundLoading) return;
  singleNoteSoundLoading = true;

  MIDI.loadPlugin?.({
    instrument: 'acoustic_grand_piano',
    onsuccess: () => {
      singleNoteSoundReady = true;
      singleNoteSoundLoading = false;
      while (pendingSingleNotes.length) {
        const notes = pendingSingleNotes.shift();
        if (notes) playPianoNotes(notes);
      }
    },
    onerror: (error: unknown) => {
      singleNoteSoundLoading = false;
      pendingSingleNotes.length = 0;
      console.error('Unable to load single-note sound.', error);
      new Notice('Unable to load piano sound.');
    },
  });
}
