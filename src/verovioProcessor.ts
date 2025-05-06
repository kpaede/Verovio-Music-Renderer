// src/verovioProcessor.ts
import VerovioMusicRenderer from '../main';
import { TFile, Notice, requestUrl, setIcon } from 'obsidian';
import parseVerovioSource from './parseVerovioSource';
import { playMIDI, stopMIDI } from './midiController';
import { downloadSVG } from './svgDownloader';
import { openFileExternally } from './externalOpener';

// MIDI‑Offsets (bleiben exportiert für midiController)
export const NOTE_ON_OFFSET = 0.0;
export const NOTE_OFF_OFFSET = 0.01;

/** State für jede Verovio-Instanz */
export interface VerovioState {
  meiData: string;
  options: Record<string, any>;
  measureRange?: string;
  currentPage: number;
  totalPages: number;
}

// Speichert den Renderer-Zustand pro UID
export const instanceStateMap: Record<string, VerovioState> = {};
// Mapping für Side‑Panel (wird hier nur angelegt, stört Rendering nicht)
export const clickMap: Record<string, string> = {};
export const sourceMap: Record<string, string> = {};

/**
 * Rendert das SVG für jeden ```verovio```-Codeblock
 * und speichert State in instanceStateMap[uid]
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
    // 1) Quelle parsen (inline vs. file, Optionen etc.)
    const { format, code, filePath, options, measureRange } = parseVerovioSource(source);
    let mr = measureRange;
    if (mr && /^\d+$/.test(mr)) mr = `${mr}-${mr}`;

    // 2) Roh‑MEI erzeugen
    let rawMEI: string;
    if (code) {
      // Inline‑Notation
      rawMEI = format === 'mei'
        ? code
        : window.VerovioToolkit.renderData(code, {});
    } else if (filePath) {
      // Datei‑Modus
      rawMEI = await fetchMEIData.call(this, filePath);
    } else {
      throw new Error('Neither inline code nor file path provided.');
    }

    // 3) Optionen setzen und laden
    const mergedOptions = { ...this.settings, ...options };
    window.VerovioToolkit.setOptions(mergedOptions);
    window.VerovioToolkit.loadData(rawMEI);

    // 4) MeasureRange anwenden
    if (mr) {
      if (!window.VerovioToolkit.select({ measureRange: mr })) {
        throw new Error(`Failed to apply measureRange: ${mr}`);
      }
      window.VerovioToolkit.redoLayout();
    }

    // 5) UID erzeugen
    const uid = `verovio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // 6) State speichern
    const meiData = window.VerovioToolkit.getMEI();
    const totalPages = window.VerovioToolkit.getPageCount();
    instanceStateMap[uid] = {
      meiData,
      options: mergedOptions,
      measureRange: mr,
      currentPage: 1,
      totalPages,
    };

    // 7) Container bauen und anhängen
    const container = createContainer.call(this, uid);
    el.appendChild(container);

    // ───────────────────────────────────────────────────────────────────────────
    // 8) MAPPING für Side‑Panel (kann bleiben, beeinflusst Rendering nicht)
    const section = ctx.getSectionInfo?.(el);
    if (section && ctx.sourcePath) {
      clickMap[uid] = JSON.stringify({
        code: source.trim(),
        filePath: ctx.sourcePath,
        startLine: section.lineStart,
        endLine: section.lineEnd,
      });
    } else {
      clickMap[uid] = JSON.stringify({
        code: source.trim(),
        filePath: ctx.sourcePath ?? '',
        startLine: null,
        endLine: null,
      });
    }
    if (filePath) {
      sourceMap[uid] = filePath;
    }
    // 9) Klick öffnet Side‑Panel-Editor
    container.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.verovio-svg-wrapper')) {
        this.openEditorFor(uid);
      }
    });
    // ───────────────────────────────────────────────────────────────────────────

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
  if (svgEl) {
    wrapper.appendChild(svgEl);
  } else {
    wrapper.textContent = 'Error rendering SVG';
  }
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
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    cb();
  });
  return btn;
}
