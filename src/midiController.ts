// midiController.ts
declare const MIDI: any;
import 'lz-midi';
import { instanceStateMap, changePage, updateSVG, NOTE_ON_OFFSET, NOTE_OFF_OFFSET } from './verovioProcessor';

export function playMIDI(uid: string) {
  const st = instanceStateMap[uid];
  const container = document.querySelector(
    `.verovio-container[data-uid="${uid}"]`
  )! as HTMLElement;
  const svgWrapper = container.querySelector('.verovio-svg-wrapper') as HTMLElement;

  // Reset und Clear
  changePage(uid, 0);
  container.querySelectorAll('g.note.playing').forEach(el => el.classList.remove('playing'));
  MIDI.Player.stop();
  MIDI.Player.BPM = null;
  MIDI.Player.clearListeners?.();

  const midiData = window.VerovioToolkit.renderToMIDI();
  if (!midiData) return;

  // Erzeuge Timemap für getElementsAtTime
  if (typeof window.VerovioToolkit.renderToTimemap === 'function') {
    // Einmalig Timemap erstellen, um valid notes-Arrays zu erhalten
    window.VerovioToolkit.renderToTimemap({});
  }

  const origAdd = MIDI.Player.addListener;
  MIDI.Player.addListener = (cb: (data: any) => void) =>
    origAdd.call(MIDI.Player, (data: any) => {
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
    MIDI.Player.start();
    MIDI.Player.setAnimation(({ now }: any) => {
      const currentMs = now * 1000 + NOTE_ON_OFFSET;
      const elements = window.VerovioToolkit.getElementsAtTime(currentMs) || {};
      if (elements.page > 0 && elements.page !== st.currentPage) {
        st.currentPage = elements.page;
        updateSVG(uid, svgWrapper);
      }

      // Entferne alle aktuellen Playing-Klassen
      container.querySelectorAll('g.note.playing').forEach(el => el.classList.remove('playing'));

      // Sicheres Iterieren über notes
      const notes: any[] = Array.isArray(elements.notes) ? elements.notes : [];
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
  const container = document.querySelector(
    `.verovio-container[data-uid="${uid}"]`
  )! as HTMLElement;
  container.querySelectorAll('g.note.playing').forEach(el => el.classList.remove('playing'));
}
