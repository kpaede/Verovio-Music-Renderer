import VerovioMusicRenderer from './main';
import { MarkdownPostProcessorContext, TFile, Notice, normalizePath, requestUrl, setIcon } from 'obsidian';
import type { VerovioOptions } from './parseVerovioSource';
import parseVerovioSource, { isCmmeInline, VerovioFormat } from './parseVerovioSource';
import { playMIDI, playSingleNote, stopMIDI } from './midiController';
import { downloadSVG } from './svgDownloader';
import { openFileExternally } from './externalOpener';
import { VIEW_TYPE_MUSIC_EDITOR, MusicEditorView } from './musicEditorView';
import { findMenuItemByKeyboardEvent } from './meiEditorMenus';
import { applyMeiEditorCommand } from './meiEditorOperations';
import { extractCodeBlockBody, replaceCodeBlockBody, resolveCodeBlockRange } from './codeBlockRange';

/** State für jede Verovio-Instanz */
export interface VerovioState {
  meiData: string;
  options: VerovioOptions;
  highlightColor?: string;
  selectionColor?: string;
  selectedElementIds: string[];
  lastSelectedElementId?: string;
  playNoteOnClick: boolean;
  supportsPlayback: boolean;
  measureRange?: string;
  currentPage: number;
  totalPages: number;
}
export const instanceStateMap: Record<string, VerovioState> = {};

/** Element-Info: Zeile (relativ inizial) und Parse-Index nur für Noten */
interface ElementInfo { line: number; index: number; }

interface VerovioContainerElement extends HTMLElement {
  _pluginContext?: VerovioMusicRenderer;
  _suppressNotationClick?: boolean;
}

interface GabcMetadata {
  title?: string;
  subtitle?: string;
  name?: string;
  annotation?: string;
  commentary?: string;
  userNotes?: string;
}

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

const PLUGIN_ONLY_OPTION_KEYS = new Set(['highlightColor', 'selectionColor', 'playNoteOnClick', 'darkColor', 'darkMode', 'darkModeStyle']);
let armedNotationShortcutUid: string | null = null;

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

export function sanitizeVerovioOptions(options: VerovioOptions): VerovioOptions {
  return Object.fromEntries(
    Object.entries(options).filter(([key, value]) => !PLUGIN_ONLY_OPTION_KEYS.has(key) && value !== undefined && value !== null)
  );
}

function getHighlightColor(options: VerovioOptions): string {
  return typeof options.highlightColor === 'string' ? options.highlightColor : '#DC143C';
}

function getSelectionColor(options: VerovioOptions): string {
  return typeof options.selectionColor === 'string' ? options.selectionColor : '#0066FF';
}

function getActiveSelectedUid(_plugin: VerovioMusicRenderer): string | undefined {
  if (armedNotationShortcutUid && instanceStateMap[armedNotationShortcutUid]?.selectedElementIds.length) {
    return armedNotationShortcutUid;
  }
  return undefined;
}

function isShortcutBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input,textarea,select,.verovio-music-editor-content .cm-editor,.modal'));
}

function isPluginInteractionTarget(target: HTMLElement): boolean {
  return Boolean(target.closest('.verovio-container,.verovio-music-editor-content,.verovio-mei-menu-dropdown,.modal'));
}

function clearNotationSelection(plugin: VerovioMusicRenderer) {
  armedNotationShortcutUid = null;
  plugin.lastClickedUid = null;

  Object.entries(instanceStateMap).forEach(([uid, st]) => {
    if (!st.selectedElementIds.length && !st.lastSelectedElementId) return;
    st.selectedElementIds = [];
    st.lastSelectedElementId = undefined;
    const wrapper = plugin.app.workspace.containerEl.ownerDocument.querySelector<HTMLElement>(
      `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
    );
    if (wrapper) applyNotationSelection(uid, wrapper);
  });
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

function getInputFrom(format: VerovioFormat): string {
  return format === 'pae' ? 'pae' : format;
}

function convertInlineCodeToMEI(code: string, format: VerovioFormat): string {
  if (format === 'mei') return code;
  const options = { inputFrom: getInputFrom(format) };
  window.VerovioToolkit.renderData(code, options);
  const mei = window.VerovioToolkit.getMEI();
  if (!mei.trim()) throw new Error(`Failed to convert ${format} input to MEI.`);
  return mei;
}

function prepareGabcInput(code: string): { body: string; metadata: GabcMetadata; syllables: string[] } {
  const rawLines = code.replace(/\r\n?/g, '\n').split('\n');
  const separatorIndex = rawLines.findIndex((line) => line.trim() === '%%');
  const headerLines = separatorIndex >= 0 ? rawLines.slice(0, separatorIndex) : [];
  const bodyLines = separatorIndex >= 0 ? rawLines.slice(separatorIndex + 1) : rawLines;
  const body = bodyLines.join('\n').trim();

  return {
    body,
    metadata: parseGabcMetadata(headerLines),
    syllables: extractGabcSyllables(body),
  };
}

function parseGabcMetadata(lines: string[]): GabcMetadata {
  const metadata: GabcMetadata = {};
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('%')) return;
    const sepIndex = trimmed.indexOf(':');
    if (sepIndex <= 0) return;

    const key = trimmed.slice(0, sepIndex).trim().toLowerCase();
    const value = trimmed.slice(sepIndex + 1).trim().replace(/;$/, '').trim();
    if (!value) return;

    if (key === 'title') metadata.title = value;
    else if (key === 'subtitle') metadata.subtitle = value;
    else if (key === 'name') metadata.name = value;
    else if (key === 'annotation') metadata.annotation = value;
    else if (key === 'commentary') metadata.commentary = value;
    else if (key === 'user-notes') metadata.userNotes = value;
  });
  return metadata;
}

function extractGabcSyllables(body: string): string[] {
  const syllables: string[] = [];
  let text = '';
  let inNotation = false;

  for (const char of body) {
    if (char === '(') {
      addGabcSyllable(syllables, text);
      text = '';
      inNotation = true;
    } else if (char === ')') {
      inNotation = false;
    } else if (!inNotation) {
      text += char;
    }
  }
  addGabcSyllable(syllables, text);
  return syllables;
}

function addGabcSyllable(syllables: string[], text: string) {
  const syllable = text.replace(/\s+/g, ' ').trim();
  if (syllable) syllables.push(syllable);
}

function fixGabcMeiSyllables(mei: string, syllables: string[]): string {
  let index = 0;
  return mei.replace(/<syl\b([^>]*)>([\s\S]*?)<\/syl>/g, (full, attrs: string, content: string) => {
    const source = syllables[index++];
    if (!source || !content.includes('�')) return full;
    return `<syl${attrs}>${escapeXml(source)}</syl>`;
  });
}

function addGabcMetadataToMEI(mei: string, metadata: GabcMetadata): string {
  const title = metadata.title || metadata.name;
  const subtitle = metadata.subtitle || metadata.commentary || metadata.userNotes;
  if (!title && !subtitle) return mei;

  const titles = [
    title ? `<title>${escapeXml(title)}</title>` : '',
    subtitle ? `<title type="subtitle">${escapeXml(subtitle)}</title>` : '',
  ].filter(Boolean).join('\n            ');

  return mei.replace(/<titleStmt>\s*<title\s*\/>\s*<\/titleStmt>/, `<titleStmt>\n            ${titles}\n         </titleStmt>`);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeMeasureRange(measureRange?: string): string | undefined {
  const trimmed = measureRange?.trim();
  if (!trimmed) return undefined;
  return /^\d+$/.test(trimmed) ? `${trimmed}-${trimmed}` : trimmed;
}

function applyMeasureRange(measureRange?: string) {
  const normalized = normalizeMeasureRange(measureRange);
  if (!normalized) return;
  window.VerovioToolkit.select({ measureRange: normalized });
  window.VerovioToolkit.redoLayout();
}

function hasMeasures(mei: string): boolean {
  const doc = new DOMParser().parseFromString(mei, 'application/xml');
  if (doc.querySelector('parsererror')) return /<(?:[\w.-]+:)?measure\b/i.test(mei);
  return Array.from(doc.getElementsByTagName('*')).some((element) => element.localName === 'measure');
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

/**
 * Fetch MEI data from a file path (local vault) or external URL.
 * Network requests are triggered on-demand only when the user explicitly provides an external URL.
 * No automatic polling, periodic updates, or background data transmission occurs.
 */
async function fetchMEIData(plugin: VerovioMusicRenderer, path: string, sourcePath?: string): Promise<{ text: string; vaultPath?: string }> {
  if (/^https?:\/\//.test(path)) {
    // On-demand fetch: Only triggered by explicit user code block rendering with external URL
    const res = await requestUrl({ url: path });
    if (res.status !== 200) throw new Error(`Failed to fetch ${path}: HTTP ${res.status}`);
    return { text: String(res.text) };
  }
  const file = resolveVaultFile(plugin, path, sourcePath);
  if (!(file instanceof TFile)) throw new Error(`File not found: ${path}`);
  return {
    text: await plugin.app.vault.read(file),
    vaultPath: file.path,
  };
}

function resolveVaultFile(plugin: VerovioMusicRenderer, path: string, sourcePath?: string): TFile | null {
  const cleanPath = stripObsidianLink(path.trim());
  const decodedPath = decodePath(cleanPath);
  const candidates = new Set<string>([cleanPath, decodedPath]);

  if (sourcePath) {
    const sourceDir = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '';
    for (const candidate of Array.from(candidates)) {
      if (!candidate.startsWith('/') && !candidate.startsWith('./') && !candidate.startsWith('../')) {
        candidates.add(normalizePath(sourceDir ? `${sourceDir}/${candidate}` : candidate));
      } else {
        candidates.add(normalizePath(sourceDir ? `${sourceDir}/${candidate}` : candidate));
      }
    }
  }

  for (const candidate of candidates) {
    const file = plugin.app.vault.getAbstractFileByPath(normalizePath(candidate));
    if (file instanceof TFile) return file;
  }

  const linked = plugin.app.metadataCache.getFirstLinkpathDest(decodedPath, sourcePath || '');
  return linked instanceof TFile ? linked : null;
}

function stripObsidianLink(path: string): string {
  const wikiLink = path.match(/^\[\[([^|\]]+)(?:\|[^\]]+)?\]\]$/);
  if (wikiLink) return wikiLink[1].trim();

  const markdownLink = path.match(/^\[[^\]]+\]\(([^)]+)\)$/);
  if (markdownLink) return markdownLink[1].trim();

  return path;
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
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
  attachNotationDragSelector(uid, wrapper);
  attachNotationClickHandlers(uid, wrapper);
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

function attachNotationClickHandlers(uid: string, wrapper: HTMLElement) {
  const container = wrapper.closest<VerovioContainerElement>('.verovio-container');
  const plugin = container?._pluginContext;
  if (!plugin) return;

  const selector = [
    'g.note[id]',
    'g.chord[id]',
    'g.rest[id]',
    'g.mRest[id]',
    'g.multiRest[id]',
  ].join(',');

  wrapper.querySelectorAll<SVGElement>(selector).forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (container._suppressNotationClick) {
        container._suppressNotationClick = false;
        return;
      }
      if (isTextClick(event.target)) return;
      const elementId = element.id;
      if (!elementId) return;

      selectNotationElement(uid, wrapper, elementId, event);
      if (instanceStateMap[uid]?.playNoteOnClick) playSingleNote(uid, elementId);
      void openMusicEditorForSource(plugin, uid, elementId, false, true);
    });
  });
}

function attachNotationDragSelector(uid: string, wrapper: HTMLElement) {
  const svg = wrapper.querySelector<SVGSVGElement>('svg');
  const container = wrapper.closest<VerovioContainerElement>('.verovio-container');
  if (!svg || !container) return;
  const plugin = container._pluginContext;

  let isMouseDown = false;
  let isDragging = false;
  let startClient: { x: number; y: number } | null = null;
  let selectionRect: SVGRectElement | null = null;
  let baseSelection: string[] = [];
  let selectableElements: SVGGraphicsElement[] = [];
  let latestElementId = '';

  svg.addEventListener('click', (event) => {
    if (container._suppressNotationClick) {
      container._suppressNotationClick = false;
      return;
    }
    if (isTextClick(event.target)) return;
    if (event.target instanceof Element && event.target.closest('g.note[id],g.chord[id],g.rest[id],g.mRest[id],g.multiRest[id]')) return;

    const st = instanceStateMap[uid];
    if (!st || st.selectedElementIds.length === 0) return;

    st.selectedElementIds = [];
    st.lastSelectedElementId = undefined;
    if (armedNotationShortcutUid === uid) armedNotationShortcutUid = null;
    applyNotationSelection(uid, wrapper);
  });

  svg.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('g.note[id],g.chord[id],g.rest[id],g.mRest[id],g.multiRest[id]')) return;
    if (isTextClick(event.target)) {
      event.preventDefault();
      event.stopPropagation();
    }

    container._suppressNotationClick = false;
    isMouseDown = true;
    isDragging = false;
    startClient = {
      x: event.clientX + wrapper.scrollLeft,
      y: event.clientY + wrapper.scrollTop,
    };
    baseSelection = instanceStateMap[uid]?.selectedElementIds ?? [];
    selectableElements = getDragSelectableElements(wrapper);
    latestElementId = '';
    svg.ownerDocument.addEventListener('mousemove', onMouseMove);
    svg.ownerDocument.addEventListener('mouseup', finishDrag);
  });

  const onMouseMove = (event: MouseEvent) => {
    if (!isMouseDown || !startClient) return;

    const dx = event.clientX + wrapper.scrollLeft - startClient.x;
    const dy = event.clientY + wrapper.scrollTop - startClient.y;
    if (!isDragging && Math.hypot(dx, dy) < 4) return;

    const pageMargin = svg.querySelector<SVGGElement>('g.page-margin') ?? svg;
    const matrix = pageMargin.getScreenCTM()?.inverse();
    if (!matrix) return;

    isDragging = true;
    container._suppressNotationClick = true;
    event.preventDefault();
    event.stopPropagation();

    if (!selectionRect) {
      selectionRect = activeDocument.createElementNS('http://www.w3.org/2000/svg', 'rect');
      selectionRect.setAttribute('class', 'verovio-drag-selection-rect no-invert');
      pageMargin.appendChild(selectionRect);
    }

    const startPoint = transformPoint(startClient, matrix);
    const endPoint = transformPoint({ x: event.clientX, y: event.clientY }, matrix);
    const bounds = normalizeSvgRect(startPoint, endPoint);
    updateDragSelectionRect(uid, selectionRect, bounds);
    const latest = updateDragSelection(uid, wrapper, selectableElements, bounds, baseSelection, event, endPoint);
    if (latest && latest !== latestElementId) {
      latestElementId = latest;
      if (plugin) void openMusicEditorForSource(plugin, uid, latest, false, true);
    }
  };

  const finishDrag = (event: MouseEvent) => {
    if (!isMouseDown) return;
    if (isDragging) {
      event.preventDefault();
      event.stopPropagation();
      container._suppressNotationClick = true;
      window.setTimeout(() => {
        container._suppressNotationClick = false;
      }, 0);
    }
    selectionRect?.remove();
    selectionRect = null;
    startClient = null;
    selectableElements = [];
    baseSelection = [];
    latestElementId = '';
    isMouseDown = false;
    isDragging = false;
    svg.ownerDocument.removeEventListener('mousemove', onMouseMove);
    svg.ownerDocument.removeEventListener('mouseup', finishDrag);
  };
}

function getDragSelectableElements(wrapper: HTMLElement): SVGGraphicsElement[] {
  const selector = [
    'g.note[id]',
    'g.chord[id]',
    'g.rest[id]',
    'g.mRest[id]',
    'g.multiRest[id]',
    'g.measure[id]',
  ].join(',');

  return Array.from(wrapper.querySelectorAll<SVGGraphicsElement>(selector));
}

function transformPoint(point: { x: number; y: number }, matrix: DOMMatrix) {
  return new DOMPoint(point.x, point.y).matrixTransform(matrix);
}

function normalizeSvgRect(start: DOMPoint, end: DOMPoint) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  return { x, y, width, height };
}

function updateDragSelectionRect(uid: string, rect: SVGRectElement, bounds: { x: number; y: number; width: number; height: number }) {
  rect.setAttribute('x', String(bounds.x));
  rect.setAttribute('y', String(bounds.y));
  rect.setAttribute('width', String(bounds.width));
  rect.setAttribute('height', String(bounds.height));
  const color = instanceStateMap[uid]?.selectionColor || '#0066FF';
  const strokeWidth = 1.25;
  rect.setAttribute('stroke-width', String(strokeWidth));
  rect.setAttribute('stroke-dasharray', '5 4');
  rect.setAttribute('stroke', color);
  rect.setAttribute('stroke-opacity', '0.85');
  rect.setAttribute('fill', color);
  rect.setAttribute('fill-opacity', '0.035');
  rect.setAttribute('pointer-events', 'none');
  rect.setAttribute('vector-effect', 'non-scaling-stroke');
}

function updateDragSelection(
  uid: string,
  wrapper: HTMLElement,
  elements: SVGGraphicsElement[],
  bounds: { x: number; y: number; width: number; height: number },
  baseSelection: string[],
  event: MouseEvent,
  cursorPoint: DOMPoint
) {
  const st = instanceStateMap[uid];
  if (!st) return undefined;

  const additive = event.metaKey || event.ctrlKey;
  if (!additive) clearOtherNotationSelections(uid, wrapper);
  const selected = new Set(additive ? baseSelection : []);
  let latest: { id: string; distance: number } | undefined;

  elements.forEach((element) => {
    const center = getElementCenter(element);
    if (!center || !isPointInRect(center, bounds)) return;

    const id = event.altKey && element.classList.contains('note')
      ? element.closest<SVGGraphicsElement>('g.chord[id]')?.id ?? element.id
      : element.id;
    if (!id) return;

    if (additive && baseSelection.includes(id)) selected.delete(id);
    else selected.add(id);

    const distance = Math.abs(center.x - cursorPoint.x) + Math.abs(center.y - cursorPoint.y);
    if (!latest || distance < latest.distance) latest = { id, distance };
  });

  st.selectedElementIds = Array.from(selected);
  st.lastSelectedElementId = latest?.id;
  armedNotationShortcutUid = st.selectedElementIds.length ? uid : null;
  applyNotationSelection(uid, wrapper);
  return latest?.id;
}

function getElementCenter(element: SVGGraphicsElement): { x: number; y: number } | null {
  try {
    const target = element.classList.contains('note')
      ? element.querySelector<SVGGraphicsElement>('g.notehead,path.notehead,use.notehead') ?? element
      : element;
    const box = target.getBBox();
    return {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  } catch {
    return null;
  }
}

function isPointInRect(point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) {
  return point.x >= rect.x
    && point.x <= rect.x + rect.width
    && point.y >= rect.y
    && point.y <= rect.y + rect.height;
}

function isTextClick(target: EventTarget | null): boolean {
  return target instanceof Element
    && Boolean(target.closest('text,tspan,g.syl,g.verse,g.lyric,g.label,g.dir,g.dynam,g.harm'));
}

function selectNotationElement(uid: string, wrapper: HTMLElement, elementId: string, event: MouseEvent) {
  const st = instanceStateMap[uid];
  if (!st) return;

  if (event.metaKey || event.ctrlKey) {
    st.selectedElementIds = st.selectedElementIds.includes(elementId)
      ? st.selectedElementIds.filter((id) => id !== elementId)
      : [...st.selectedElementIds, elementId];
  } else {
    clearOtherNotationSelections(uid, wrapper);
    st.selectedElementIds = [elementId];
  }
  st.lastSelectedElementId = elementId;
  armedNotationShortcutUid = st.selectedElementIds.length ? uid : null;

  applyNotationSelection(uid, wrapper);
}

export function selectRenderedNotationElement(uid: string, elementId: string, additive = false): boolean {
  const st = instanceStateMap[uid];
  const wrapper = activeDocument.querySelector<HTMLElement>(
    `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
  );
  if (!st || !wrapper) return false;

  const element = wrapper.querySelector<SVGElement>(`#${cssEscape(elementId)}`);
  if (!element) return false;

  if (additive) {
    st.selectedElementIds = st.selectedElementIds.includes(elementId)
      ? st.selectedElementIds.filter((id) => id !== elementId)
      : [...st.selectedElementIds, elementId];
  } else {
    clearOtherNotationSelections(uid, wrapper);
    st.selectedElementIds = [elementId];
  }
  st.lastSelectedElementId = st.selectedElementIds.at(-1);
  armedNotationShortcutUid = st.selectedElementIds.length ? uid : null;

  applyNotationSelection(uid, wrapper);
  return true;
}

function clearOtherNotationSelections(activeUid: string, activeWrapper: HTMLElement) {
  const root = activeWrapper.ownerDocument;
  Object.entries(instanceStateMap).forEach(([uid, st]) => {
    if (uid === activeUid || (!st.selectedElementIds.length && !st.lastSelectedElementId)) return;
    st.selectedElementIds = [];
    st.lastSelectedElementId = undefined;
    if (armedNotationShortcutUid === uid) armedNotationShortcutUid = null;
    const wrapper = root.querySelector<HTMLElement>(`.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`);
    if (wrapper) applyNotationSelection(uid, wrapper);
  });
}

function applyNotationSelection(uid: string, wrapper: HTMLElement) {
  const st = instanceStateMap[uid];
  if (!st) return;

  wrapper.querySelectorAll('.verovio-selected').forEach((element) => {
    element.classList.remove('verovio-selected', 'no-invert');
  });

  st.selectedElementIds.forEach((id) => {
    const element = wrapper.querySelector<SVGElement>(`#${cssEscape(id)}`);
    if (!element) return;
    element.classList.add('verovio-selected', 'no-invert');
  });
}

function cssEscape(value: string): string {
  return window.CSS?.escape ? window.CSS.escape(value) : value.replace(/([!"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
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
