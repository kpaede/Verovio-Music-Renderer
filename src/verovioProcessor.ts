import VerovioMusicRenderer from '../main';
import MIDI from 'lz-midi';
import { TFile, Platform, Notice, requestUrl, setIcon } from 'obsidian';

/**
 * State for each Verovio rendering instance.
 */
interface VerovioState {
  meiData: string;                   // MEI with layout applied (including measureRange)
  options: Record<string, any>;      // Merged Verovio options
  currentPage: number;               // Current page index
  totalPages: number;                // Total number of pages
}

// Map of instance states by unique ID
const instanceStateMap: Record<string, VerovioState> = {};

// Timing offsets for highlighting (leave these values intact)
const NOTE_ON_OFFSET = 33.5;
const NOTE_OFF_OFFSET = 0.5;

/**
 * Main processor for `verovio` code blocks.
 */
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
    // Parse source
    const { filePath, options, measureRange } = parseSource(source);

    // Fetch MEI
    const rawMEI = await fetchMEIData.call(this, filePath);

    // Merge options & initialize toolkit
    const mergedOptions = { ...this.settings, ...options };
    window.VerovioToolkit.setOptions(mergedOptions);
    window.VerovioToolkit.loadData(rawMEI);
    if (measureRange) {
      const ok = window.VerovioToolkit.select({ measureRange });
      if (!ok) throw new Error(`Failed to apply measureRange: ${measureRange}`);
    }
    const meiData = window.VerovioToolkit.getMEI({ noLayout: false });

    // Determine total pages
    window.VerovioToolkit.loadData(meiData);
    const totalPages = window.VerovioToolkit.getPageCount();

    // Create state
    const uid = `verovio-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
    instanceStateMap[uid] = { meiData, options: mergedOptions, currentPage: 1, totalPages };

    // Render and attach
    const container = createContainer(uid);
    el.appendChild(container);
  } catch (err) {
    el.createEl('p', { text: `Error rendering Verovio: ${err.message}` });
  }
}

function parseSource(src: string): { filePath: string; options: Record<string, any>; measureRange?: string } {
  const lines = src.split('\n').map(l => l.trim()).filter(l => l);
  const filePath = lines.shift()!;
  const options: Record<string, any> = {};
  let measureRange: string | undefined;
  for (const line of lines) {
    const [key, val] = line.split(':').map(p => p.trim());
    if (!key || !val) continue;
    if (key === 'measureRange') measureRange = val;
    else options[key] = parseValue(val);
  }
  return { filePath, options, measureRange };
}

function parseValue(v: string) {
  if (v === 'true') return true;
  if (v === 'false') return false;
  const num = Number(v);
  return isNaN(num) ? v : num;
}

async function fetchMEIData(this: VerovioMusicRenderer, path: string): Promise<string> {
  if (/^https?:\/\//.test(path)) {
    const res = await requestUrl({ url: path });
    if (res.status !== 200) throw new Error(res.statusText);
    return res.text;
  }
  const file = this.app.vault.getAbstractFileByPath(path);
  if (!file || !(file instanceof TFile)) throw new Error(`File not found: ${path}`);
  return await this.app.vault.read(file);
}

function createContainer(uid: string): HTMLDivElement {
  const container = document.createElement('div');
  container.className = 'verovio-container';
  container.dataset.uid = uid;

  // SVG wrapper
  const svgWrapper = document.createElement('div');
  svgWrapper.className = 'verovio-svg-wrapper';
  updateSVG(uid, svgWrapper);
  container.appendChild(svgWrapper);

  // Toolbar
  const toolbar = document.createElement('div');
  toolbar.className = 'verovio-toolbar';
  toolbar.appendChild(createBtn('chevron-left', () => changePage(uid, -1)));
  toolbar.appendChild(createBtn('chevron-right', () => changePage(uid, 1)));
  toolbar.appendChild(createBtn('play', () => playMIDI(uid)));
  toolbar.appendChild(createBtn('square', () => stopMIDI()));
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
  const next = st.currentPage + delta;
  st.currentPage = Math.min(Math.max(1, next), st.totalPages);
  const wrapper = document.querySelector(
    `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
  );
  if (wrapper instanceof HTMLElement) updateSVG(uid, wrapper);
}

async function playMIDI(uid: string) {
  const st = instanceStateMap[uid];
  changePage(uid, 0);
  const midiData = window.VerovioToolkit.renderToMIDI();
  if (!midiData) return;
  MIDI.Player.stop();
  MIDI.Player.loadFile(`data:audio/midi;base64,${midiData}`, () => {
    MIDI.Player.start();
    MIDI.Player.addListener(data => {
      if (data.message === 144) highlightNote(uid, data);
      if (data.message === 128) dehighlightNote(uid, data);
    });
  });
}

function stopMIDI() {
  MIDI.Player.stop();
}

function highlightNote(uid: string, data: any) {
  const container = document.querySelector(`.verovio-container[data-uid="${uid}"]`);
  if (!container) return;
  const currentTime = MIDI.Player.currentTime + NOTE_ON_OFFSET;
  const elems = window.VerovioToolkit.getElementsAtTime(currentTime);
  elems?.notes?.forEach(id => {
    const el = container.querySelector(`g.note#${id}`);
    el?.classList.add('playing');
  });
}

function dehighlightNote(uid: string, data: any) {
  const container = document.querySelector(`.verovio-container[data-uid="${uid}"]`);
  if (!container) return;
  const currentTime = MIDI.Player.currentTime - NOTE_OFF_OFFSET;
  const elems = window.VerovioToolkit.getElementsAtTime(currentTime);
  elems?.notes?.forEach(id => {
    const el = container.querySelector(`g.note#${id}`);
    el?.classList.remove('playing');
  });
}

function downloadSVG(uid: string) {
  const svgEl = document.querySelector(
    `.verovio-container[data-uid="${uid}"] svg`
  );
  if (!svgEl) return;
  const blob = new Blob([
    new XMLSerializer().serializeToString(svgEl)
  ], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'score.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openFileExternally(uid: string) {
  new Notice('External open not implemented');
}

/**
 * Create a toolbar button with icon and single click handler.
 */
function createBtn(icon: string, cb: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  setIcon(btn, icon);
  btn.addEventListener('click', e => {
    e.preventDefault();
    cb();
  });
  return btn;
}