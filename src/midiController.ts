// midiController.ts
import MIDI from 'lz-midi';
import { instanceStateMap, changePage, updateSVG, NOTE_ON_OFFSET } from './verovioProcessor';

interface MidiMessage {
  message: number;
  note: string;
}

interface PlaybackRange {
  startMs: number;
  endMs?: number;
}

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

export function playMIDI(uid: string) {
  const st = instanceStateMap[uid];
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

  const origAdd = MIDI.Player.addListener.bind(MIDI.Player);
  MIDI.Player.addListener = (cb: (data: MidiMessage) => void) =>
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
