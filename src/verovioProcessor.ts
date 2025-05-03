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
}

// Map of instance states by unique ID
const instanceStateMap: Record<string, VerovioState> = {};

// Timing offsets for highlighting (leave these values intact)
const NOTE_ON_OFFSET = 33.5;
const NOTE_OFF_OFFSET = 0.5;
// Cache to track highlighted notes per instance
const highlightedNotesCache: Record<string, Set<string>> = {};

/**
 * Main processor for ```verovio``` code blocks.
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
    // Parse file path, inline options, and measureRange
    const { filePath, options, measureRange } = parseSource(source);

    // Fetch raw MEI data
    const rawMEI = await fetchMEIData.call(this, filePath);

    // Merge plugin settings and inline overrides
    const mergedOptions = { ...this.settings, ...options };
    window.VerovioToolkit.setOptions(mergedOptions);

    // Initial load & layout to capture complete MEI (with layout and measureRange)
    window.VerovioToolkit.loadData(rawMEI);
    if (measureRange) {
      const ok = window.VerovioToolkit.select({ measureRange });
      if (!ok) throw new Error(`Failed to apply measureRange: ${measureRange}`);
    }
    const meiData = window.VerovioToolkit.getMEI({ noLayout: false });

    // Create new instance state
    const uid = `verovio-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
    instanceStateMap[uid] = {
      meiData,
      options: mergedOptions,
      currentPage: 1
    };

    // Render container and append to DOM
    const container = createContainer(uid);
    el.appendChild(container);
  } catch (err) {
    el.createEl('p', { text: `Error rendering Verovio: ${err.message}` });
  }
}

/**
 * Parse block content into path, options, and measureRange.
 */
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
  const n = Number(v);
  return isNaN(n) ? v : n;
}

/**
 * Fetch MEI from URL or vault.
 */
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

/**
 * Create the container with SVG wrapper and toolbar.
 */
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
  toolbar.appendChild(createBtn('chevron-left',  () => changePage(uid, -1)));
  toolbar.appendChild(createBtn('chevron-right', () => changePage(uid, +1)));
  toolbar.appendChild(createBtn('play',          () => playMIDI(uid)));
  toolbar.appendChild(createBtn('square',        () => stopMIDI()));
  toolbar.appendChild(createBtn('image-down',    () => downloadSVG(uid)));
  toolbar.appendChild(createBtn('external-link', () => openFileExternally(uid)));
  container.appendChild(toolbar);

  return container;
}

/**
 * Render and inject the SVG for current page.
 */
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

/**
 * Change page by delta and re-render.
 */
function changePage(uid: string, delta: number) {
  const st = instanceStateMap[uid];
  const total = window.VerovioToolkit.getPageCount();
  st.currentPage = Math.min(Math.max(1, st.currentPage + delta), total);
  const wrapper = document.querySelector(
    `.verovio-container[data-uid=\"${uid}\"] .verovio-svg-wrapper`
  );
  if (wrapper instanceof HTMLElement) updateSVG(uid, wrapper);
}

/**
 * Play MIDI and highlight notes.
 */
async function playMIDI(uid: string) {
  const st = instanceStateMap[uid];
  changePage(uid, 0); // reload current
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

/** Stop MIDI playback */
function stopMIDI() {
  MIDI.Player.stop();
}

/** Highlight a note with offset */
function highlightNote(uid: string, data: any) {
  const time = MIDI.Player.currentTime + NOTE_ON_OFFSET;
  const elems = window.VerovioToolkit.getElementsAtTime(time);
  if (!highlightedNotesCache[uid]) highlightedNotesCache[uid] = new Set<string>();
  elems.notes?.forEach(id => {
    if (highlightedNotesCache[uid].has(id)) return;
    const el = document.querySelector(
      `.verovio-container[data-uid=\"${uid}\"] g.note#${id}`
    );
    if (el) {
      el.classList.add('playing');
      highlightedNotesCache[uid].add(id);
    }
  });
}

/** Remove highlight on note off */
function dehighlightNote(uid: string, data: any) {
  const time = MIDI.Player.currentTime - NOTE_OFF_OFFSET;
  const elems = window.VerovioToolkit.getElementsAtTime(time);
  const cache = highlightedNotesCache[uid];
  if (!cache) return;
  elems.notes?.forEach(id => {
    if (!cache.has(id)) return;
    const el = document.querySelector(
      `.verovio-container[data-uid=\"${uid}\"] g.note#${id}`
    );
    if (el) {
      el.classList.remove('playing');
      cache.delete(id);
    }
  });
}

/** Download the current SVG for instance */
function downloadSVG(uid: string) {
  const svgEl = document.querySelector(
    `.verovio-container[data-uid=\"${uid}\"] svg`
  );
  if (!svgEl) return;
  const blob = new Blob([
    new XMLSerializer().serializeToString(svgEl)
  ], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'score.svg';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Stub: Open original file externally */
function openFileExternally(uid: string) {
  new Notice('External open not implemented');
}

/** Create a toolbar button with an icon and mousedown handler */
/** Create a toolbar button with an icon and immediate response */
function createBtn(icon: string, cb: () => void): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.setAttribute('type', 'button');
  setIcon(btn, icon);
  // Use pointerdown for immediate response (covers mouse, touch, pen)
  btn.addEventListener('pointerdown', e => { e.preventDefault(); cb(); });
  // Fallback for environments without pointer events
  btn.addEventListener('click', e => { e.preventDefault(); cb(); });
  return btn;
}
