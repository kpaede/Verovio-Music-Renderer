import VerovioMusicRenderer from './main';
import { TFile, Notice, requestUrl, setIcon } from 'obsidian';
import parseVerovioSource from './parseVerovioSource';
import { playMIDI, stopMIDI } from './midiController';
import { downloadSVG } from './svgDownloader';
import { openFileExternally } from './externalOpener';
import { VIEW_TYPE_MUSIC_EDITOR, MusicEditorView } from './musicEditorView';

/** State für jede Verovio-Instanz */
export interface VerovioState {
  meiData: string;
  options: Record<string, any>;
  measureRange?: string;
  currentPage: number;
  totalPages: number;
}
export const instanceStateMap: Record<string, VerovioState> = {};

/** Element-Info: Zeile (relativ inizial) und Parse-Index nur für Noten */
interface ElementInfo { line: number; index: number; }

/** Mapping UID → Datei & Zeilen für den Block-Editor */
export interface BlockMapping {
  filePath: string;
  startLine: number;
  endLine: number;
  elementMap: Record<string, ElementInfo>;
}
export const clickMap: Record<string, BlockMapping> = {};

/** sourceMap für externalOpener */
export const sourceMap: Record<string, string> = {};

/** MIDI-Offsets (für midiController) */
export const NOTE_ON_OFFSET = 0.0;
export const NOTE_OFF_OFFSET = 0.01;

/** Zeilen-Offset beim Springen */
const LINE_JUMP_OFFSET = 2;

/**
 * Generiert CSS für Dark Mode basierend auf den Plugin-Settings
 */
function generateDarkModeCSS(plugin: VerovioMusicRenderer): string {
  const isDarkMode = plugin.settings.autoDetectTheme 
    ? document.body.classList.contains('theme-dark')
    : plugin.settings.darkMode;

  if (!isDarkMode) {
    return '';
  }

  const noteColor = plugin.settings.customNoteColor || '#ffffff';
  const staffColor = plugin.settings.customStaffColor || '#ffffff';

  return `
    .note { fill: ${noteColor}; }
    .notehead { fill: ${noteColor}; }
    .stem { fill: ${noteColor}; stroke: ${noteColor}; }
    .accid { fill: ${noteColor}; }
    .artic { fill: ${noteColor}; }
    .beam { fill: ${noteColor}; stroke: ${noteColor}; }
    .flag { fill: ${noteColor}; }
    .dots { fill: ${noteColor}; }
    .rest { fill: ${noteColor}; }
    .mrest { fill: ${noteColor}; }
    .mrpt { fill: ${noteColor}; }
    .tie { stroke: ${noteColor}; fill: none; }
    .slur { stroke: ${noteColor}; fill: none; }
    .staff path { stroke: ${staffColor}; }
    .staff ellipse { stroke: ${staffColor}; fill: ${staffColor}; }
    .ledgerLines { stroke: ${staffColor}; }
    .barLine * { stroke: ${staffColor}; fill: ${staffColor}; }
    .clef { fill: ${noteColor}; }
    .keySig { fill: ${noteColor}; }
    .meterSig { fill: ${noteColor}; }
    .tempo { fill: ${noteColor}; }
    .dir { fill: ${noteColor}; }
    .dynam { fill: ${noteColor}; }
    .harm { fill: ${noteColor}; }
    .lyrics { fill: ${noteColor}; }
    .tupletNum { fill: ${noteColor}; }
    .tupletBracket { stroke: ${noteColor}; }
    text { fill: ${noteColor}; }
  `;
}

/**
 * Parst MEI, injiziert xml:id nur für <note>-Tags und baut elementMap (relativ zur MEI-String-Zeile)
 */
function injectIdsAndMap(mei: string, uid: string): { code: string; elementMap: Record<string, ElementInfo> } {
  const lines = mei.split('\n');
  const elementMap: Record<string, ElementInfo> = {};
  let counter = 0;
  const openTagRE = /<note\b[^>]*>/g;

  const newLines = lines.map((line, idx) =>
    line.replace(openTagRE, (full) => {
      const xmlId = `${uid}-el${++counter}`;
      elementMap[xmlId] = { line: idx + 1, index: counter };
      return full.replace(/^<note/, `<note xml:id="${xmlId}"`);
    })
  );

  return { code: newLines.join('\n'), elementMap };
}

/** Haupt-Renderer */
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
    const uid = `verovio-${Date.now()}-${Math.random().toString(36).substr(2,9)}`;

    let workingCode = code;
    let elementMap: Record<string, ElementInfo> = {};

    if (format === 'mei' && code) {
      const parsed = injectIdsAndMap(code, uid);
      workingCode = parsed.code;
      elementMap = parsed.elementMap;
    }

    let rawMEI: string;
    if (workingCode) {
      rawMEI = format === 'mei' ? workingCode : window.VerovioToolkit.renderData(workingCode, {});
    } else if (filePath) {
      rawMEI = await fetchMEIData.call(this, filePath);
      // Fix: Mapping UID statt Source
      sourceMap[uid] = filePath;
    } else {
      throw new Error('Neither inline code nor file path provided.');
    }

    const darkModeCSS = generateDarkModeCSS(this);

    // Settings nur mit erlaubten Keys an Verovio geben:
    const { autoDetectTheme, darkMode, customNoteColor, customStaffColor, ...verovioSettings } = this.settings;

    const merged = { 
      ...verovioSettings, 
      ...options,
      ...(darkModeCSS ? { svgCss: darkModeCSS } : {})
    };

    window.VerovioToolkit.setOptions(merged);

    window.VerovioToolkit.loadData(rawMEI);
    if (measureRange && /^\d+$/.test(measureRange)) {
      window.VerovioToolkit.select({ measureRange: `${measureRange}-${measureRange}` });
      window.VerovioToolkit.redoLayout();
    }

    instanceStateMap[uid] = {
      meiData: window.VerovioToolkit.getMEI(),
      options: merged,
      measureRange,
      currentPage: 1,
      totalPages: window.VerovioToolkit.getPageCount(),
    };

    const section = ctx.getSectionInfo?.(el);
    if (section && ctx.sourcePath) {
      const absMap: Record<string, ElementInfo> = {};
      Object.entries(elementMap).forEach(([id, info]) => {
        absMap[id] = {
          line: section.lineStart + info.line - 1 + LINE_JUMP_OFFSET,
          index: info.index
        };
      });
      clickMap[uid] = {
        filePath: ctx.sourcePath,
        startLine: section.lineStart,
        endLine: section.lineEnd,
        elementMap: absMap,
      };
    }

    const container = createContainer.call(this, uid);
    el.appendChild(container);

    // Editor-Öffnen
    const svgWrapper = container.querySelector('.verovio-svg-wrapper');
    svgWrapper?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.lastClickedUid = uid;
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MUSIC_EDITOR);
      if (leaves.length) (leaves[0].view as MusicEditorView).openBlock(uid, '');
    });

    setTimeout(() => {
      const svg = container.querySelector('svg');
      if (!svg) return;
      Object.keys(clickMap[uid].elementMap).forEach(id => {
        const node = svg.querySelector(`#${id}`);
        if (node) {
          node.addEventListener('click', (ev: Event) => {
            ev.stopPropagation();
            this.lastClickedUid = uid;
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MUSIC_EDITOR);
            if (leaves.length) (leaves[0].view as MusicEditorView).openBlock(uid, id);
          });
        }
      });
    }, 100);

    return container;
  } catch (err: any) {
    new Notice(`Error rendering Verovio: ${err.message}`);
  }
}

async function fetchMEIData(this: VerovioMusicRenderer, path: string) {
  if (/^https?:\/\//.test(path)) {
    const res = await requestUrl({ url: path });
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    return res.text;
  }
  const file = this.app.vault.getAbstractFileByPath(path) as TFile;
  if (!file) throw new Error(`File not found: ${path}`);
  return this.app.vault.read(file as TFile);
}

function createContainer(this: VerovioMusicRenderer, uid: string) {
  const container = document.createElement('div');
  container.className = 'verovio-container';
  container.dataset.uid = uid;

  const svgWrap = document.createElement('div');
  svgWrap.className = 'verovio-svg-wrapper';
  updateSVG(uid, svgWrap, this);
  container.appendChild(svgWrap);

  const toolbar = document.createElement('div');
  toolbar.className = 'verovio-toolbar';
  toolbar.appendChild(createBtn('chevron-left', () => changePage(uid, -1, this)));
  toolbar.appendChild(createBtn('chevron-right', () => changePage(uid, 1, this)));
  toolbar.appendChild(createBtn('play', () => playMIDI(uid)));
  toolbar.appendChild(createBtn('square', () => stopMIDI(uid)));
  toolbar.appendChild(createBtn('image-down', () => downloadSVG(uid)));
  toolbar.appendChild(createBtn('external-link', () => openFileExternally.call(this, uid)));
  container.appendChild(toolbar);

  return container;
}

export function updateSVG(uid: string, wrapper: HTMLElement, plugin?: VerovioMusicRenderer) {
  const st = instanceStateMap[uid];
  const optionsToUse = plugin 
    ? { ...st.options, ...(generateDarkModeCSS(plugin) ? { svgCss: generateDarkModeCSS(plugin) } : {}) }
    : st.options;
  window.VerovioToolkit.setOptions(optionsToUse);
  window.VerovioToolkit.loadData(st.meiData);
  if (st.measureRange) {
    window.VerovioToolkit.select({ measureRange: st.measureRange });
    window.VerovioToolkit.redoLayout();
  }
  const svgStr = window.VerovioToolkit.renderToSVG(st.currentPage);
  const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
  wrapper.innerHTML = '';
  wrapper.appendChild(doc.documentElement);
}

export function changePage(uid: string, delta: number, plugin?: VerovioMusicRenderer) {
  const st = instanceStateMap[uid];
  st.currentPage = Math.min(Math.max(1, st.currentPage + delta), st.totalPages);
  const wrap = document.querySelector(`.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`) as HTMLElement;
  updateSVG(uid, wrap, plugin);
}

function createBtn(icon: string, cb: () => void) {
  const btn = document.createElement('button');
  setIcon(btn, icon);
  btn.addEventListener('click', e => { e.preventDefault(); cb(); });
  return btn;
}
