// midiController.ts
import MIDI from 'lz-midi';
import { Notice } from 'obsidian';
import { changePage, updateSVG } from '../rendering/verovioProcessor';
import { instanceStateMap, NOTE_ON_OFFSET } from '../rendering/verovioState';
import { resetVerovioToolkitOptions } from '../verovio/verovioToolkit';
import { getPlaybackRange } from './playbackRange';
import { resetMidiChannelsToPiano } from './singleNotePlayback';

interface MidiMessage {
  message: number;
  note: string;
}

export { playSingleNote } from './singleNotePlayback';

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

  resetVerovioToolkitOptions();
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
