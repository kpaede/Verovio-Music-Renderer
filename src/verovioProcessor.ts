import VerovioMusicRenderer from '../main';
import MIDI from 'lz-midi';
import { TFile, Notice, requestUrl, setIcon } from 'obsidian';
import { parseVerovioSource } from './parseVerovioSource';

/**
 * State for each Verovio rendering instance.
 */
interface VerovioState {
  meiData: string;
  options: Record<string, any>;
  currentPage: number;
  totalPages: number;
}

const instanceStateMap: Record<string, VerovioState> = {};

// Timing offsets – edit these if note highlighting is off in general
const NOTE_ON_OFFSET = 0.0;
const NOTE_OFF_OFFSET = 0.01;

export async function processVerovioCodeBlocks(
  this: VerovioMusicRenderer,
  source: string,
  el: HTMLElement,
  ctx: any
) {
  if (!window.VerovioToolkit) {
    el.createEl('p', { text: 'Verovio toolkit not loaded.' });
    return;
  }

  try {
    /* --- NEU: den Parser aufrufen ----------------------------------- */
    const parsed = parseVerovioSource(source);
    console.log('▶️ Parsed Verovio source', parsed);       // Debug

    const { format, code, filePath, options, measureRange } = parsed;
    let rawMEI: string;

    /* --- Inline-Notation ------------------------------------------- */
    if (code) {
      if (format === 'mei') {
        rawMEI = code;
      } else if (format === 'abc' || format === 'musicxml') {
        rawMEI = window.VerovioToolkit.renderData(code, { inputFormat: format });
      } else {
        throw new Error(`Unsupported inline format: ${format}`);
      }
    }
    /* --- Datei-Pfad ------------------------------------------------- */
    else if (filePath) {
      rawMEI = await fetchMEIData.call(this, filePath);
    }
    /* --- Nichts gefunden ------------------------------------------- */
    else {
      throw new Error('Neither inline code nor file path provided.');
    }

    /* --- wie gehabt: Optionen, Rendern, Container … ---------------- */
    const mergedOptions = { ...this.settings, ...options };
    window.VerovioToolkit.setOptions(mergedOptions);
    window.VerovioToolkit.loadData(rawMEI);

    if (measureRange) {
      const ok = window.VerovioToolkit.select({ measureRange });
      if (!ok) throw new Error(`Failed to apply measureRange: ${measureRange}`);
    }

    const meiData   = window.VerovioToolkit.getMEI({ noLayout: false });
    window.VerovioToolkit.loadData(meiData);
    const totalPages = window.VerovioToolkit.getPageCount();

    const uid = `verovio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    instanceStateMap[uid] = { meiData, options: mergedOptions, currentPage: 1, totalPages };

    el.appendChild(createContainer(uid));
  } catch (err: any) {
    el.createEl('p', { text: `Error rendering Verovio: ${err.message}` });
  }
}


async function fetchMEIData(this: VerovioMusicRenderer, path: string) {
  if (/^https?:\/\//.test(path)) {
    const res = await requestUrl({ url: path });
    if (res.status !== 200) throw new Error(res.statusText);
    return res.text;
  }
  const file = this.app.vault.getAbstractFileByPath(path);
  if (!file || !(file instanceof TFile)) throw new Error(`File not found: ${path}`);
  return await this.app.vault.read(file);
}

function createContainer(uid: string) {
  const container = document.createElement('div');
  container.className = 'verovio-container';
  container.dataset.uid = uid;

  const svgWrapper = document.createElement('div');
  svgWrapper.className = 'verovio-svg-wrapper';
  updateSVG(uid, svgWrapper);
  container.appendChild(svgWrapper);

  const toolbar = document.createElement('div');
  toolbar.className = 'verovio-toolbar';
  toolbar.appendChild(createBtn('chevron-left', () => changePage(uid, -1)));
  toolbar.appendChild(createBtn('chevron-right', () => changePage(uid, 1)));
  toolbar.appendChild(createBtn('play', () => playMIDI(uid)));
  toolbar.appendChild(createBtn('square', () => stopMIDI(uid)));
  toolbar.appendChild(createBtn('image-down', () => downloadSVG(uid)));
  toolbar.appendChild(createBtn('external-link', () => openFileExternally(uid)));
  container.appendChild(toolbar);

  return container;
}

function updateSVG(uid: string, wrapper: HTMLElement) {
  const st = instanceStateMap[uid];
  window.VerovioToolkit.setOptions(st.options);
  window.VerovioToolkit.loadData(st.meiData);
  const svgString = window.VerovioToolkit.renderToSVG(st.currentPage);
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) {
    wrapper.textContent = 'Error rendering SVG';
    return;
  }
  wrapper.innerHTML = '';
  wrapper.appendChild(svgEl);
}

function changePage(uid: string, delta: number) {
  const st = instanceStateMap[uid];
  st.currentPage = Math.min(Math.max(1, st.currentPage + delta), st.totalPages);
  const wrapper = document.querySelector(
    `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
  ) as HTMLElement;
  updateSVG(uid, wrapper);
}

async function playMIDI(uid: string) {
  const st = instanceStateMap[uid];
  const container = document.querySelector(`.verovio-container[data-uid="${uid}"]`)!;
  const svgWrapper = container.querySelector('.verovio-svg-wrapper') as HTMLElement;

  // Reset page and clear highlights
  changePage(uid, 0);
  container.querySelectorAll('g.note.playing').forEach(el => el.classList.remove('playing'));

  const midiData = window.VerovioToolkit.renderToMIDI();
  if (!midiData) return;

  // Stop previous playback and reset BPM so Verovio's tempo is used
  MIDI.Player.stop();
  MIDI.Player.BPM = null;

  MIDI.Player.clearListeners?.();

  // Monkey-patch scheduleTracking via addListener wrapping
  const originalAddListener = MIDI.Player.addListener;
  MIDI.Player.addListener = (callback: (data: any) => void) => {
    const wrapped = (data: any) => {
      // Highlight immediately on note-on
      if (data.message === 144) {
        const noteEl = container.querySelector(`g.note#${data.note}`);
        noteEl?.classList.add('playing');
      }
      // Call original callback (page turn + dehighlight)
      callback(data);
      // On note-off, remove highlight
      if (data.message === 128) {
        const noteEl = container.querySelector(`g.note#${data.note}`);
        noteEl?.classList.remove('playing');
      }
    };
    return originalAddListener.call(MIDI.Player, wrapped);
  };
  MIDI.Player.clearAnimation?.();

  MIDI.Player.loadFile(`data:audio/midi;base64,${midiData}`, () => {
    MIDI.Player.start();
    MIDI.Player.setAnimation(({ now }) => {
      const currentMs = now * 1000 + NOTE_ON_OFFSET;
      const elements = window.VerovioToolkit.getElementsAtTime(currentMs);
      if (elements.page > 0) {
        if (elements.page !== st.currentPage) {
          st.currentPage = elements.page;
          updateSVG(uid, svgWrapper);
        }
        container.querySelectorAll('g.note.playing').forEach(el => el.classList.remove('playing'));
        elements.notes.forEach(id => {
          const noteEl = container.querySelector(`g.note#${id}`);
          noteEl?.classList.add('playing');
        });
      }
    });
  });
}

function stopMIDI(uid: string) {
  const container = document.querySelector(`.verovio-container[data-uid="${uid}"]`)!;
  MIDI.Player.stop();
  container.querySelectorAll('g.note.playing').forEach(el => el.classList.remove('playing'));
}

function downloadSVG(uid: string) {
  const svgEl = document.querySelector(`.verovio-container[data-uid="${uid}"] svg`);
  if (!svgEl) return;
  const blob = new Blob([new XMLSerializer().serializeToString(svgEl)], { type: 'image/svg+xml;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'score.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function openFileExternally(uid: string) {
  new Notice('External open not implemented');
}

function createBtn(icon: string, cb: () => void) {
  const btn = document.createElement('button');
  setIcon(btn, icon);
  btn.addEventListener('click', e => { e.preventDefault(); cb(); });
  return btn;
}
