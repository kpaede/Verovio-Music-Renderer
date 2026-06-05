import VerovioMusicRenderer from './main';
import { MarkdownPostProcessorContext, TFile, Notice, setIcon } from 'obsidian';
import parseVerovioSource, { isCmmeInline } from './parseVerovioSource';
import { playMIDI, stopMIDI } from './midiController';
import { downloadSVG } from './svgDownloader';
import { openFileExternally } from './externalOpener';
import { VIEW_TYPE_MUSIC_EDITOR, MusicEditorView } from './musicEditorView';
import { findMenuItemByKeyboardEvent } from './meiEditorMenus';
import { applyMeiEditorCommand } from './meiEditorOperations';
import { extractCodeBlockBody, replaceCodeBlockBody, resolveCodeBlockRange } from './codeBlockRange';
import { clickMap, instanceStateMap, sourceMap, type VerovioContainerElement } from './verovioState';
import { getHighlightColor, getSelectionColor, sanitizeVerovioOptions } from './verovioOptions';
import { addGabcMetadataToMEI, convertInlineCodeToMEI, fixGabcMeiSyllables, getInputFrom, prepareGabcInput } from './verovioImport';
import { applyMeasureRange, hasMeasures } from './measureRange';
import { fetchMEIData } from './verovioSourceResolver';
import {
  applyNotationSelection,
  attachNotationClickHandlers,
  attachNotationDragSelector,
  clearNotationSelection,
  getActiveSelectedUid
} from './verovioSelection';

export { clickMap, instanceStateMap, sourceMap } from './verovioState';
export { sanitizeVerovioOptions } from './verovioOptions';
export { selectRenderedNotationElement } from './verovioSelection';

export function handleVerovioNotationShortcut(plugin: VerovioMusicRenderer, event: KeyboardEvent) {
  if (isShortcutBlockedTarget(event.target)) return;

  const uid = getActiveSelectedUid(plugin);
  if (!uid) return;

  const item = findMenuItemByKeyboardEvent(event);
  if (!item) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void applyShortcutCommandToSource(plugin, uid, item.id);
}

export function handleVerovioGlobalPointerDown(plugin: VerovioMusicRenderer, event: PointerEvent) {
  if (!(event.target instanceof HTMLElement)) return;
  if (isPluginInteractionTarget(event.target)) return;
  clearNotationSelection(plugin);
}

function isShortcutBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input,textarea,select,.verovio-music-editor-content .cm-editor,.modal'));
}

function isPluginInteractionTarget(target: HTMLElement): boolean {
  return Boolean(target.closest('.verovio-container,.verovio-music-editor-content,.verovio-mei-menu-dropdown,.modal'));
}

async function applyShortcutCommandToSource(plugin: VerovioMusicRenderer, uid: string, commandId: string) {
  const st = instanceStateMap[uid];
  if (!st?.selectedElementIds.length) return;

  const sourcePath = sourceMap[uid];
  if (sourcePath) {
    if (!sourcePath.toLowerCase().endsWith('.mei')) {
      new Notice('Edit operations require MEI. Convert inline notation to MEI first.');
      return;
    }
    const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) {
      new Notice(`File not found.: ${sourcePath}`);
      return;
    }

    const currentText = await plugin.app.vault.read(file);
    const result = applyMeiEditorCommand(commandId, currentText, st.selectedElementIds);
    if (!result.changed) {
      if (result.message) new Notice(result.message);
      return;
    }

    await plugin.app.vault.modify(file, result.text);
    refreshRenderingsForSource(sourcePath, result.text);
    new Notice('MEI updated.');
    return;
  }

  const mapping = clickMap[uid];
  if (!mapping) {
    new Notice('Open a MEI editor or use a vault MEI file for this shortcut.');
    return;
  }

  const file = plugin.app.vault.getAbstractFileByPath(mapping.filePath);
  if (!(file instanceof TFile)) {
    new Notice(`File not found.: ${mapping.filePath}`);
    return;
  }

  const fileText = await plugin.app.vault.read(file);
  const lines = fileText.split('\n');
  const blockRange = resolveCodeBlockRange(lines, mapping.startLine, mapping.endLine);
  const blockText = blockRange.text;
  if (isExternalReferenceBlockText(blockText)) {
    new Notice('External url content is read-only.');
    return;
  }
  if (!isEditableMeiBlockText(blockText)) {
    new Notice('Edit operations require MEI. Convert this codeblock to MEI first.');
    return;
  }
  const meiText = extractCodeBlockBody(blockText);
  const result = applyMeiEditorCommand(commandId, meiText, st.selectedElementIds);
  if (!result.changed) {
    if (result.message) new Notice(result.message);
    return;
  }

  const replacement = replaceCodeBlockBody(blockText, result.text);
  const merged = [
    ...lines.slice(0, blockRange.startLine),
    ...replacement.split('\n'),
    ...lines.slice(blockRange.endLineExclusive),
  ];
  await plugin.app.vault.modify(file, merged.join('\n'));
  st.meiData = result.text;
  if (commandId === 'delete') {
    st.selectedElementIds = [];
    st.lastSelectedElementId = undefined;
  }
  const wrapper = plugin.app.workspace.containerEl.ownerDocument.querySelector<HTMLElement>(
    `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
  );
  if (wrapper) updateSVG(uid, wrapper);
  new Notice('MEI updated.');
}

function isExternalReferenceBlockText(blockText: string): boolean {
  const body = extractCodeBlockBody(blockText).trim();
  if (/^https?:\/\//i.test(body.split('\n').find((line) => line.trim()) ?? '')) return true;
  try {
    return /^https?:\/\//i.test(parseVerovioSource(body).filePath ?? '');
  } catch {
    return false;
  }
}

function isEditableMeiBlockText(blockText: string): boolean {
  const body = extractCodeBlockBody(blockText).trim();
  try {
    const parsed = parseVerovioSource(body);
    return parsed.code !== undefined && parsed.format === 'mei';
  } catch {
    return /<mei(?:\s|>)/i.test(body);
  }
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

    const workingCode = code;

    let rawMEI: string;
    let loadInputFrom = 'mei';
    if (workingCode) {
      if (format === 'gabc') {
        const gabc = prepareGabcInput(workingCode);
        rawMEI = addGabcMetadataToMEI(
          fixGabcMeiSyllables(convertInlineCodeToMEI(gabc.body, format), gabc.syllables),
          gabc.metadata
        );
      } else {
        rawMEI = convertInlineCodeToMEI(workingCode, format);
      }
      loadInputFrom = 'mei';
    } else if (filePath) {
      const sourceData = await fetchMEIData(this, filePath, ctx.sourcePath);
      const fileData = sourceData.text;
      if (format === 'gabc') {
        const gabc = prepareGabcInput(fileData);
        rawMEI = addGabcMetadataToMEI(
          fixGabcMeiSyllables(convertInlineCodeToMEI(gabc.body, format), gabc.syllables),
          gabc.metadata
        );
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

    const container = createContainer(this, uid, el);

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

function createContainer(plugin: VerovioMusicRenderer, uid: string, parentEl: HTMLElement) {
  const container = parentEl.createDiv('verovio-container') as VerovioContainerElement;
  container._pluginContext = plugin;
  container.dataset.uid = uid;
  // apply highlight color variable
  const color = instanceStateMap[uid]?.highlightColor || plugin.settings.highlightColor || '#DC143C';
  container.style.setProperty('--verovio-play-color', color);
  const selectionColor = instanceStateMap[uid]?.selectionColor || plugin.settings.selectionColor || '#0066FF';
  container.style.setProperty('--verovio-selection-color', selectionColor);
  const svgWrap = container.createDiv('verovio-svg-wrapper');
  updateSVG(uid, svgWrap);

  const toolbar = container.createDiv('verovio-toolbar');
  toolbar.appendChild(createBtn('chevron-left', () => changePage(uid, -1)));
  toolbar.appendChild(createBtn('chevron-right', () => changePage(uid, 1)));
  toolbar.appendChild(createBtn('play', () => playMIDI(uid), {
    disabled: !instanceStateMap[uid]?.supportsPlayback,
    title: instanceStateMap[uid]?.supportsPlayback ? 'Play' : 'Playback is not supported for gabc/neume notation in verovio.',
  }));
  toolbar.appendChild(createBtn('square', () => stopMIDI(uid)));
  toolbar.appendChild(createBtn('pencil', () => { void openMusicEditorForSource(plugin, uid, '', true, false); }, {
    title: 'Open code editor',
  }));
  toolbar.appendChild(createBtn('image-down', () => downloadSVG(uid)));
  toolbar.appendChild(createBtn('external-link', () => { openFileExternally.call(plugin, uid); }));

  return container;
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

function createBtn(icon: string, cb: () => void, opts: { disabled?: boolean; title?: string } = {}) {
  const btn = createEl('button');
  setIcon(btn, icon);
  if (opts.title) btn.title = opts.title;
  if (opts.disabled) {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
  }
  btn.addEventListener('click', e => { e.preventDefault(); cb(); });
  return btn;
}
