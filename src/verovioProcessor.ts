import VerovioMusicRenderer from './main';
import { MarkdownPostProcessorContext, TFile, Notice, requestUrl, setIcon } from 'obsidian';
import type { VerovioOptions } from './parseVerovioSource';
import parseVerovioSource from './parseVerovioSource';
import { playMIDI, stopMIDI } from './midiController';
import { downloadSVG } from './svgDownloader';
import { openFileExternally } from './externalOpener';
import { VIEW_TYPE_MUSIC_EDITOR, MusicEditorView } from './musicEditorView';

/** State für jede Verovio-Instanz */
export interface VerovioState {
  meiData: string;
  options: VerovioOptions;
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

/** Zeilen-Offset beim Springen */
const LINE_JUMP_OFFSET = 2;

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
  ctx: MarkdownPostProcessorContext
) {
  if (!window.VerovioToolkit) {
    el.createEl('p', { text: 'Verovio toolkit not loaded.' });
    return;
  }

  try {
    const { format, code, filePath, options, measureRange } = parseVerovioSource(source);
    const uid = `verovio-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

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

    const merged = { ...this.settings, ...options };
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
      Object.entries(elementMap).forEach(([id, info]: [string, ElementInfo]) => {
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

    const container = createContainer.call(this, uid, el);

    // Editor-Öffnen
    const svgWrapper = container.querySelector('.verovio-svg-wrapper');
    svgWrapper?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.lastClickedUid = uid;
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MUSIC_EDITOR);
      if (leaves.length) void (leaves[0].view as MusicEditorView).openBlock(uid, '');
    });

    window.setTimeout(() => {
      const svg = container.querySelector('svg');
      if (!svg) return;
      Object.keys(clickMap[uid].elementMap).forEach(id => {
        const node = svg.querySelector(`#${id}`);
        if (node) {
          node.addEventListener('click', (ev: Event) => {
            ev.stopPropagation();
            this.lastClickedUid = uid;
            const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MUSIC_EDITOR);
            if (leaves.length) void (leaves[0].view as MusicEditorView).openBlock(uid, id);
          });
        }
      });
    }, 100);

    return container;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    new Notice(`Error rendering Verovio: ${message}`);
  }
}

/**
 * Fetch MEI data from a file path (local vault) or external URL.
 * Network requests are triggered on-demand only when the user explicitly provides an external URL.
 * No automatic polling, periodic updates, or background data transmission occurs.
 */
async function fetchMEIData(this: VerovioMusicRenderer, path: string) {
  if (/^https?:\/\//.test(path)) {
    // On-demand fetch: Only triggered by explicit user code block rendering with external URL
    const res = await requestUrl({ url: path });
    if (res.status !== 200) throw new Error(`Failed to fetch ${path}: HTTP ${res.status}`);
    return res.text;
  }
  const file = this.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) throw new Error(`File not found: ${path}`);
  return this.app.vault.read(file);
}

function createContainer(this: VerovioMusicRenderer, uid: string, parentEl: HTMLElement) {
  const container = parentEl.createDiv('verovio-container');
  container.dataset.uid = uid;
  // apply highlight color variable
  const color = this.settings.highlightColor || '#DC143C';
  container.style.setProperty('--verovio-play-color', color);
  const svgWrap = container.createDiv('verovio-svg-wrapper');
  updateSVG(uid, svgWrap);

  const toolbar = container.createDiv('verovio-toolbar');
  toolbar.appendChild(createBtn('chevron-left', () => changePage(uid, -1)));
  toolbar.appendChild(createBtn('chevron-right', () => changePage(uid, 1)));
  toolbar.appendChild(createBtn('play', () => playMIDI(uid)));
  toolbar.appendChild(createBtn('square', () => stopMIDI(uid)));
  toolbar.appendChild(createBtn('image-down', () => downloadSVG(uid)));
  toolbar.appendChild(createBtn('external-link', () => openFileExternally.call(this, uid)));

  return container;
}

export function updateSVG(uid: string, wrapper: HTMLElement) {
  const st = instanceStateMap[uid];
  // ensure container uses current highlight color
  const container = wrapper.closest<HTMLElement>('.verovio-container');
  if (container) {
    const color = typeof st.options.highlightColor === 'string'
      ? st.options.highlightColor
      : (container.style.getPropertyValue('--verovio-play-color') || '#DC143C');
    container.style.setProperty('--verovio-play-color', color);
  }
  window.VerovioToolkit.setOptions(st.options);
  window.VerovioToolkit.loadData(st.meiData);
  if (st.measureRange) {
    window.VerovioToolkit.select({ measureRange: st.measureRange });
    window.VerovioToolkit.redoLayout();
  }
  const svgStr = window.VerovioToolkit.renderToSVG(st.currentPage);
  const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
  wrapper.innerHTML = '';
  wrapper.appendChild(doc.documentElement);

  // Ensure currently-playing notes keep their color under dark-inversion
  try {
    const playing = wrapper.querySelectorAll('g.note.playing');
    playing.forEach(el => el.classList.add('no-invert'));
  } catch { /* safe */ }

  // Inject playing color from settings if plugin context available on wrapper
  try {
    const container = wrapper.closest<HTMLElement>('.verovio-container');
    let color: string | undefined = undefined;
    if (container) {
      const plugin = (container as HTMLElement & { _pluginContext?: VerovioMusicRenderer })._pluginContext;
      color = plugin?.settings?.highlightColor || undefined;
    }
    if (!color && window.__verovioDefaultHighlight) color = window.__verovioDefaultHighlight;
    if (color && container) {
      // Set CSS variable directly on container element (inline style) instead of creating a style element
      container.style.setProperty('--verovio-play-color', color);
    }
  } catch { /* ignore */ }
}

export function changePage(uid: string, delta: number) {
  const st = instanceStateMap[uid];
  st.currentPage = Math.min(Math.max(1, st.currentPage + delta), st.totalPages);
  const wrap = activeDocument.querySelector<HTMLElement>(`.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`);
  if (!wrap) return;
  updateSVG(uid, wrap);
}

function createBtn(icon: string, cb: () => void) {
  const btn = createEl('button');
  setIcon(btn, icon);
  btn.addEventListener('click', e => { e.preventDefault(); cb(); });
  return btn;
}
