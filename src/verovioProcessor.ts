// verovioProcessor.ts
import VerovioMusicRenderer from '../main';
import { TFile, Notice, requestUrl, setIcon, Platform } from 'obsidian';
import parseVerovioSource from './parseVerovioSource';
import { playMIDI, stopMIDI } from './midiController';
import { downloadSVG } from './svgDownloader';
import { openFileExternally } from './externalOpener';

// Workaround: Override XMLHttpRequest.getResponseHeader to ignore unsafe header 'Content-Length-Raw'
if (typeof XMLHttpRequest !== 'undefined') {
  const origGetRH = XMLHttpRequest.prototype.getResponseHeader;
  XMLHttpRequest.prototype.getResponseHeader = function(name: string): string | null {
    if (name.toLowerCase() === 'content-length-raw') {
      return null;
    }
    return origGetRH.call(this, name);
  };
}

/** State for jede Verovio-Instanz */
export interface VerovioState {
  meiData: string;
  options: Record<string, any>;
  measureRange?: string;
  currentPage: number;
  totalPages: number;
}

export const instanceStateMap: Record<string, VerovioState> = {};
export const sourceMap: Record<string, string> = {};

export const NOTE_ON_OFFSET = 0.0;
export const NOTE_OFF_OFFSET = 0.01;

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
    const { format, code, filePath, options, measureRange } = parseVerovioSource(source);
    let mr = measureRange;
    if (mr && /^\d+$/.test(mr)) mr = `${mr}-${mr}`;

    let rawMEI: string;
    if (code) {
      rawMEI = format === 'mei' ? code : window.VerovioToolkit.renderData(code, {});
    } else if (filePath) {
      rawMEI = await fetchMEIData.call(this, filePath);
    } else {
      throw new Error('Neither inline code nor file path provided.');
    }

    const mergedOptions = { ...this.settings, ...options };
    window.VerovioToolkit.setOptions(mergedOptions);
    window.VerovioToolkit.loadData(rawMEI);

    if (mr) {
      if (!window.VerovioToolkit.select({ measureRange: mr })) {
        throw new Error(`Failed to apply measureRange: ${mr}`);
      }
      window.VerovioToolkit.redoLayout();
    }

    const meiData = window.VerovioToolkit.getMEI();
    const totalPages = window.VerovioToolkit.getPageCount();
    const uid = `verovio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    instanceStateMap[uid] = { meiData, options: mergedOptions, measureRange: mr, currentPage: 1, totalPages };
    if (filePath) sourceMap[uid] = filePath;

    el.appendChild(createContainer.call(this, uid));
  } catch (err: any) {
    new Notice(`Error rendering Verovio: ${err.message}`);
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
  toolbar.appendChild(createBtn('external-link', () => openFileExternally.call(this, uid)));
  container.appendChild(toolbar);

  return container;
}

export function updateSVG(uid: string, wrapper: HTMLElement) {
  const st = instanceStateMap[uid];
  window.VerovioToolkit.setOptions(st.options);
  window.VerovioToolkit.loadData(st.meiData);
  if (st.measureRange) {
    window.VerovioToolkit.select({ measureRange: st.measureRange });
    window.VerovioToolkit.redoLayout();
  }
  const svgString = window.VerovioToolkit.renderToSVG(st.currentPage);
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  wrapper.innerHTML = '';
  if (!svgEl) wrapper.textContent = 'Error rendering SVG';
  else wrapper.appendChild(svgEl);
}

export function changePage(uid: string, delta: number) {
  const st = instanceStateMap[uid];
  st.currentPage = Math.min(Math.max(1, st.currentPage + delta), st.totalPages);
  const wrapper = document.querySelector(
    `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
  ) as HTMLElement;
  updateSVG(uid, wrapper);
}

function createBtn(icon: string, cb: () => void) {
  const btn = document.createElement('button');
  setIcon(btn, icon);
  btn.addEventListener('click', e => { e.preventDefault(); cb(); });
  return btn;
}
