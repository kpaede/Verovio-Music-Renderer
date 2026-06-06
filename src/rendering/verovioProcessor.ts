import VerovioMusicRenderer from '../main';
import { MarkdownPostProcessorContext, Notice } from 'obsidian';
import parseVerovioSource, { isCmmeInline } from '../verovio/parseVerovioSource';
import { playMIDI, stopMIDI } from '../playback/midiController';
import { downloadSVG } from './svgDownloader';
import { openFileExternally } from './externalOpener';
import { VIEW_TYPE_MUSIC_EDITOR, MusicEditorView } from '../editor/musicEditorView';
import { clickMap, instanceStateMap, sourceMap } from './verovioState';
import { getHighlightColor, getSelectionColor, sanitizeVerovioOptions } from './verovioOptions';
import { addGabcMetadataToMEI, convertInlineCodeToMEI, fixGabcMeiSyllables, getInputFrom, prepareGabcInput } from '../verovio/verovioImport';
import { applyMeasureRange, hasMeasures } from './measureRange';
import { fetchMEIData } from './verovioSourceResolver';
import { resetVerovioToolkitOptions } from '../verovio/verovioToolkit';
import { createRenderingContainer } from './renderingContainer';
import {
  applyNotationSelection,
  attachNotationClickHandlers,
  attachNotationDragSelector,
} from './verovioSelection';

export { clickMap, instanceStateMap, sourceMap } from './verovioState';
export { sanitizeVerovioOptions } from './verovioOptions';
export { selectRenderedNotationElement } from './verovioSelection';

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

    const workingCode = code;

    let rawMEI: string;
    let loadInputFrom = 'mei';
    if (workingCode) {
      if (format === 'gabc') {
        const gabc = prepareGabcInput(workingCode);
        rawMEI = addGabcMetadataToMEI(
          fixGabcMeiSyllables(await convertInlineCodeToMEI(gabc.body, format), gabc.syllables),
          gabc.metadata
        );
      } else {
        rawMEI = await convertInlineCodeToMEI(workingCode, format);
      }
      loadInputFrom = 'mei';
    } else if (filePath) {
      const sourceData = await fetchMEIData(this, filePath, ctx.sourcePath);
      const fileData = sourceData.text;
      if (format === 'gabc') {
        const gabc = prepareGabcInput(fileData);
        rawMEI = addGabcMetadataToMEI(
          fixGabcMeiSyllables(await convertInlineCodeToMEI(gabc.body, format), gabc.syllables),
          gabc.metadata
        );
        loadInputFrom = 'mei';
      } else if (format === 'abc') {
        rawMEI = await convertInlineCodeToMEI(fileData, format);
        loadInputFrom = 'mei';
      } else {
        rawMEI = fileData;
        loadInputFrom = getInputFrom(format === 'musicxml' && isCmmeInline(fileData) ? 'cmme.xml' : format);
      }
      if (sourceData.vaultPath) {
        sourceMap[uid] = sourceData.vaultPath;
      }
    } else {
      throw new Error('Neither inline code nor file path provided.');
    }

    const merged = { ...this.settings, ...options };
    const verovioOptions = sanitizeVerovioOptions(merged);
    resetVerovioToolkitOptions();
    window.VerovioToolkit.setOptions({ ...verovioOptions, inputFrom: loadInputFrom });
    window.VerovioToolkit.loadData(rawMEI);
    const importedMEI = window.VerovioToolkit.getMEI();
    const effectiveMeasureRange = measureRange && hasMeasures(importedMEI) ? measureRange : undefined;
    if (measureRange && !effectiveMeasureRange) {
      new Notice('measureRange needs measure-based MEI; this import has no <measure> elements.');
    }
    applyMeasureRange(effectiveMeasureRange);

    instanceStateMap[uid] = {
      meiData: window.VerovioToolkit.getMEI(),
      options: { ...verovioOptions, inputFrom: 'mei' },
      highlightColor: getHighlightColor(merged),
      selectionColor: getSelectionColor(merged),
      selectedElementIds: [],
      lastSelectedElementId: undefined,
      playNoteOnClick: Boolean(merged.playNoteOnClick),
      supportsPlayback: /<note\b/i.test(window.VerovioToolkit.getMEI()),
      measureRange: effectiveMeasureRange,
      currentPage: 1,
      totalPages: window.VerovioToolkit.getPageCount(),
    };

    const section: { lineStart: number; lineEnd: number } | null | undefined = ctx.getSectionInfo?.(el);
    if (section && ctx.sourcePath) {
      clickMap[uid] = {
        filePath: ctx.sourcePath,
        startLine: section.lineStart,
        endLine: section.lineEnd,
        elementMap: {},
      };
    }

    const container = createRenderingContainer(this, uid, el, {
      changePage,
      downloadSvg: downloadSVG,
      openEditor: (plugin, editorUid) => { void openMusicEditorForSource(plugin, editorUid, '', true, false); },
      openExternal: (plugin, editorUid) => { openFileExternally.call(plugin, editorUid); },
      play: playMIDI,
      renderSvg: updateSVG,
      stop: stopMIDI,
    });

    return container;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    new Notice(`Error rendering Verovio: ${message}`);
  }
}

async function openMusicEditorForSource(
  plugin: VerovioMusicRenderer,
  uid: string,
  elementId: string,
  openIfMissing = true,
  skipChooseModal = false
) {
  plugin.lastClickedUid = uid;
  if (!openIfMissing && !sourceMap[uid] && !clickMap[uid]) return;
  const leaves = plugin.app.workspace.getLeavesOfType(VIEW_TYPE_MUSIC_EDITOR);
  const leaf = leaves.length ? leaves[0] : (openIfMissing ? plugin.app.workspace.getRightLeaf(false) : null);
  if (!leaf) return;

  if (openIfMissing && leaves.length === 0) {
    await leaf.setViewState({ type: VIEW_TYPE_MUSIC_EDITOR, active: true });
  } else {
    await plugin.app.workspace.revealLeaf(leaf);
  }

  await (leaf.view as MusicEditorView).openSource(uid, elementId, skipChooseModal);
}

export function updateSVG(uid: string, wrapper: HTMLElement) {
  const st = instanceStateMap[uid];
  // ensure container uses current highlight color
  const container = wrapper.closest<HTMLElement>('.verovio-container');
  if (container) {
    const color = st.highlightColor || container.style.getPropertyValue('--verovio-play-color') || '#DC143C';
    container.style.setProperty('--verovio-play-color', color);
    const selectionColor = st.selectionColor || container.style.getPropertyValue('--verovio-selection-color') || '#0066FF';
    container.style.setProperty('--verovio-selection-color', selectionColor);
  }
  resetVerovioToolkitOptions();
  window.VerovioToolkit.setOptions({ ...sanitizeVerovioOptions(st.options), inputFrom: 'mei' });
  window.VerovioToolkit.loadData(st.meiData);
  applyMeasureRange(st.measureRange);
  const svgStr = window.VerovioToolkit.renderToSVG(st.currentPage);
  const doc = new DOMParser().parseFromString(svgStr, 'image/svg+xml');
  wrapper.innerHTML = '';
  wrapper.appendChild(doc.documentElement);
  attachNotationDragSelector(uid, wrapper, openMusicEditorForSource);
  attachNotationClickHandlers(uid, wrapper, openMusicEditorForSource);
  applyNotationSelection(uid, wrapper);

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

export function refreshRenderingsForSource(sourcePath: string, meiData: string) {
  Object.entries(sourceMap)
    .filter(([, path]) => path === sourcePath)
    .forEach(([uid]) => {
      const st = instanceStateMap[uid];
      const wrapper = activeDocument.querySelector<HTMLElement>(
        `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
      );
      if (!st || !wrapper) return;

      st.meiData = meiData;
      resetVerovioToolkitOptions();
      window.VerovioToolkit.setOptions({ ...sanitizeVerovioOptions(st.options), inputFrom: 'mei' });
      window.VerovioToolkit.loadData(st.meiData);
      applyMeasureRange(st.measureRange);
      st.totalPages = window.VerovioToolkit.getPageCount();
      st.currentPage = Math.min(Math.max(1, st.currentPage), Math.max(1, st.totalPages));
      st.supportsPlayback = /<note\b/i.test(window.VerovioToolkit.getMEI());
      updateSVG(uid, wrapper);
    });
}

export function changePage(uid: string, delta: number) {
  const st = instanceStateMap[uid];
  st.currentPage = Math.min(Math.max(1, st.currentPage + delta), st.totalPages);
  const wrap = activeDocument.querySelector<HTMLElement>(`.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`);
  if (!wrap) return;
  updateSVG(uid, wrap);
}
