// midiController.ts
import MIDI from 'lz-midi';
import { Notice } from 'obsidian';
import { instanceStateMap, changePage, updateSVG, NOTE_ON_OFFSET } from './verovioProcessor';

interface MidiMessage {
  message: number;
  note: string;
}

interface PlaybackRange {
  startMs: number;
  endMs?: number;
}

const SINGLE_NOTE_CHANNEL = 0;
const SINGLE_NOTE_VELOCITY = 100;
const SINGLE_NOTE_DURATION_SECONDS = 0.8;
let singleNoteSoundReady = false;
let singleNoteSoundLoading = false;
const pendingSingleNotes: number[][] = [];

function getMeasureRangeBounds(range?: string): { start?: number; end?: number } {
  if (!range) return {};

  const match = range.trim().match(/^(start|\d+)(?:\s*-\s*(end|\d+))?$/i);
  if (!match) return {};

  const start = match[1].toLowerCase() === 'start' ? 1 : Number(match[1]);
  const endToken = match[2] ?? match[1];
  const end = endToken.toLowerCase() === 'end' ? undefined : Number(endToken);
  return { start, end };
}

function getPlaybackRange(st: { meiData: string; measureRange?: string }): PlaybackRange {
  const { start, end } = getMeasureRangeBounds(st.measureRange);
  if (!start || typeof window.VerovioToolkit.getTimeForElement !== 'function') {
    return { startMs: 0 };
  }

  const doc = new DOMParser().parseFromString(st.meiData, 'application/xml');
  const measures = Array.from(doc.querySelectorAll('measure'));
  const startMeasure = measures[start - 1];
  const endMeasure = end ? measures[end] : undefined;

  const startId = startMeasure?.getAttribute('xml:id') || startMeasure?.getAttribute('id');
  const endId = endMeasure?.getAttribute('xml:id') || endMeasure?.getAttribute('id');

  const startMs = start > 1 && startId ? window.VerovioToolkit.getTimeForElement(startId) : 0;
  const endMs = endId ? window.VerovioToolkit.getTimeForElement(endId) : undefined;
  return { startMs: Number.isFinite(startMs) ? startMs : 0, endMs };
}

function resetMidiChannelsToPiano() {
  if (!MIDI.channels) return;
  Object.values(MIDI.channels).forEach((channel) => {
    channel.instrument = 0;
  });
}

export function playSingleNote(uid: string, elementId: string) {
  const st = instanceStateMap[uid];
  if (!st?.supportsPlayback) return;

  const notes = getMidiNotesForElement(st.meiData, elementId);
  if (!notes.length) return;

  playPianoNotes(notes);
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

function getMidiNotesForElement(mei: string, elementId: string): number[] {
  const doc = new DOMParser().parseFromString(mei, 'application/xml');
  const element = findElementByXmlId(doc, elementId);
  if (!element) return [];

  const noteElements = element.tagName.toLowerCase() === 'note'
    ? [element]
    : Array.from(element.querySelectorAll('note'));

  return noteElements
    .map(getMidiNote)
    .filter((note): note is number => typeof note === 'number');
}

function findElementByXmlId(doc: Document, elementId: string): Element | undefined {
  return Array.from(doc.getElementsByTagName('*')).find((element) =>
    element.getAttribute('xml:id') === elementId || element.getAttribute('id') === elementId
  );
}

function getMidiNote(note: Element): number | undefined {
  if (note.getAttribute('grace') || note.getAttribute('cue')) return undefined;

  const pname = note.getAttribute('pname')?.toLowerCase();
  const oct = Number(note.getAttribute('oct'));
  if (!pname || !Number.isFinite(oct)) return undefined;

  const pitchClass = pitchClassForPname(pname);
  if (pitchClass === undefined) return undefined;

  return (oct + 1) * 12 + pitchClass + accidentalOffset(note);
}

function pitchClassForPname(pname: string): number | undefined {
  return { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[pname as 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g'];
}

function accidentalOffset(note: Element): number {
  const accid = note.getAttribute('accid.ges') || note.getAttribute('accid') || '';
  if (accid.includes('ss')) return 2;
  if (accid.includes('ff')) return -2;
  if (accid.includes('s')) return 1;
  if (accid.includes('f')) return -1;
  return 0;
}

export function playMIDI(uid: string) {
  const st = instanceStateMap[uid];
  if (!st?.supportsPlayback) {
    new Notice('Playback is not supported for GABC/neume notation in Verovio.');
    return;
  }

  const container = activeDocument.querySelector<HTMLElement>(
    `.verovio-container[data-uid="${uid}"]`
  );
  const svgWrapper = container?.querySelector<HTMLElement>('.verovio-svg-wrapper');
  if (!container || !svgWrapper) return;

  // Reset und Clear
  changePage(uid, 0);
  container.querySelectorAll('g.note.playing').forEach(el => el.classList.remove('playing'));
  MIDI.Player.stop();
  MIDI.Player.BPM = null;
  MIDI.Player.clearListeners?.();
  resetMidiChannelsToPiano();

  window.VerovioToolkit.setOptions({ ...st.options, inputFrom: 'mei' });
  window.VerovioToolkit.loadData(st.meiData);
  const playbackRange = getPlaybackRange(st);

  const midiData = window.VerovioToolkit.renderToMIDI();
  if (!midiData) return;

  // Erzeuge Timemap für getElementsAtTime
  if (typeof window.VerovioToolkit.renderToTimemap === 'function') {
    // Einmalig Timemap erstellen, um valid notes-Arrays zu erhalten
    window.VerovioToolkit.renderToTimemap({});
  }

  const origAdd = MIDI.Player.addListener.bind(MIDI.Player) as (cb: (data: MidiMessage) => void) => void;
  MIDI.Player.addListener = (cb: (data: MidiMessage) => void) => {
    origAdd((data: MidiMessage) => {
      if (data.message === 144) {
        const noteEl = container.querySelector(`g.note#${data.note}`);
        noteEl?.classList.add('playing');
      }
      cb(data);
      if (data.message === 128) {
        const noteEl = container.querySelector(`g.note#${data.note}`);
        noteEl?.classList.remove('playing');
      }
    });
  };

  MIDI.Player.loadFile(`data:audio/midi;base64,${midiData}`, () => {
    MIDI.Player.currentTime = playbackRange.startMs;
    MIDI.Player.start();
    MIDI.Player.setAnimation?.(({ now }: { now: number }) => {
      const playbackMs = now * 1000;
      if (playbackRange.endMs !== undefined && playbackMs >= playbackRange.endMs) {
        stopMIDI(uid);
        return;
      }

      const currentMs = now * 1000 + NOTE_ON_OFFSET;
      const elements = window.VerovioToolkit.getElementsAtTime(currentMs) || {};
      if (!st.measureRange && typeof elements.page === 'number' && elements.page > 0 && elements.page !== st.currentPage) {
        st.currentPage = elements.page;
        updateSVG(uid, svgWrapper);
      }

      // Entferne alle aktuellen Playing-Klassen
      container.querySelectorAll('g.note.playing').forEach(el => el.classList.remove('playing'));

      // Sicheres Iterieren über notes
      const notes: string[] = Array.isArray(elements.notes) ? elements.notes : [];
      notes.forEach(id => {
        const noteEl = container.querySelector(`g.note#${id}`);
        noteEl?.classList.add('playing');
      });
    });
  });
}

export function stopMIDI(uid: string) {
  MIDI.Player.stop();
  MIDI.Player.clearListeners?.();
  MIDI.Player.setAnimation?.(() => {});
  // Entferne alle Highlights
  const container = activeDocument.querySelector<HTMLElement>(
    `.verovio-container[data-uid="${uid}"]`
  );
  if (!container) return;
  container.querySelectorAll('g.note.playing').forEach(el => el.classList.remove('playing'));
}
