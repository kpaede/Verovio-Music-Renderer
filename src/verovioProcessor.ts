// src/verovioProcessor.ts
import VerovioMusicRenderer from './main';
import { TFile, Notice, requestUrl, setIcon } from 'obsidian';
import parseVerovioSource from './parseVerovioSource';
import { playMIDI, stopMIDI } from './midiController';
import { downloadSVG } from './svgDownloader';
import { openFileExternally } from './externalOpener';
import { VIEW_TYPE_MUSIC_EDITOR, MusicEditorView } from './musicEditorView';

/** State für jede Verovio‑Instanz */
export interface VerovioState {
  meiData: string;
  options: Record<string, any>;
  measureRange?: string;
  currentPage: number;
  totalPages: number;
}
export const instanceStateMap: Record<string, VerovioState> = {};

/** Mapping UID → Datei & Zeilen für den Block‑Editor */
export interface BlockMapping {
  filePath: string;
  startLine: number;
  endLine: number;
}
export const clickMap: Record<string, BlockMapping> = {};

/** sourceMap wird von externalOpener.ts benötigt */
export const sourceMap: Record<string, string> = {};

/** MIDI‑Offsets (für midiController) */
export const NOTE_ON_OFFSET = 0.0;
export const NOTE_OFF_OFFSET = 0.01;

/** Hauptfunktion zum Rendern der Code‑Blöcke */
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
    // 1) Quelle parsen
    const { format, code, filePath, options, measureRange } = parseVerovioSource(source);
    let mr = measureRange;
    if (mr && /^\d+$/.test(mr)) mr = `${mr}-${mr}`;

    // 2) Roh-MEI erzeugen
    let rawMEI: string;
    if (code) {
      rawMEI = format === 'mei'
        ? code
        : window.VerovioToolkit.renderData(code, {});
    } else if (filePath) {
      rawMEI = await fetchMEIData.call(this, filePath);
      // optional Quelle merken
      sourceMap[source] = filePath;
    } else {
      throw new Error('Neither inline code nor file path provided.');
    }

    // 3) Optionen setzen und laden
    const mergedOptions = { ...this.settings, ...options };
    window.VerovioToolkit.setOptions(mergedOptions);
    window.VerovioToolkit.loadData(rawMEI);

    if (mr) {
      if (!window.VerovioToolkit.select({ measureRange: mr })) {
        throw new Error(`Failed to apply measureRange: ${mr}`);
      }
      window.VerovioToolkit.redoLayout();
    }

    // 4) UID & State speichern
    const uid = `verovio-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;
    const meiData = window.VerovioToolkit.getMEI();
    const totalPages = window.VerovioToolkit.getPageCount();
    instanceStateMap[uid] = {
      meiData,
      options: mergedOptions,
      measureRange: mr,
      currentPage: 1,
      totalPages,
    };

    // 5) Mapping für Editor merken
    const section = ctx.getSectionInfo?.(el);
    if (section && ctx.sourcePath) {
      clickMap[uid] = {
        filePath: ctx.sourcePath,
        startLine: section.lineStart,
        endLine: section.lineEnd,
      };
    }

    // 6) Container bauen
    const container = createContainer.call(this, uid);
    el.appendChild(container);

    // 7) Klick‑Handler: lastClickedUid + openBlock
    container.addEventListener('click', () => {
      this.lastClickedUid = uid;
      console.log('Verovio SVG clicked → lastClickedUid set.');
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MUSIC_EDITOR);
      if (leaves.length) {
        const view = leaves[0].view as MusicEditorView;
        view.openBlock(uid);
      }
    });
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
  if (!file || !(file instanceof TFile)) {
    throw new Error(`File not found: ${path}`);
  }
  return await this.app.vault.read(file as TFile);
}

function createContainer(this: VerovioMusicRenderer, uid: string) {
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
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  wrapper.innerHTML = '';
  if (svgEl) wrapper.appendChild(svgEl);
  else wrapper.textContent = 'Error rendering SVG';
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
