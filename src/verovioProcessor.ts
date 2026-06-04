import VerovioMusicRenderer from './main';
import { MarkdownPostProcessorContext, TFile, Notice, normalizePath, requestUrl, setIcon } from 'obsidian';
import type { VerovioOptions } from './parseVerovioSource';
import parseVerovioSource, { isCmmeInline, VerovioFormat } from './parseVerovioSource';
import { playMIDI, stopMIDI } from './midiController';
import { downloadSVG } from './svgDownloader';
import { openFileExternally } from './externalOpener';
import { VIEW_TYPE_MUSIC_EDITOR, MusicEditorView } from './musicEditorView';

/** State für jede Verovio-Instanz */
export interface VerovioState {
  meiData: string;
  options: VerovioOptions;
  highlightColor?: string;
  supportsPlayback: boolean;
  measureRange?: string;
  currentPage: number;
  totalPages: number;
}
export const instanceStateMap: Record<string, VerovioState> = {};

/** Element-Info: Zeile (relativ inizial) und Parse-Index nur für Noten */
interface ElementInfo { line: number; index: number; }

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

/** Zeilen-Offset beim Springen */
const LINE_JUMP_OFFSET = 2;
const PLUGIN_ONLY_OPTION_KEYS = new Set(['highlightColor', 'darkColor', 'darkMode', 'darkModeStyle']);

export function sanitizeVerovioOptions(options: VerovioOptions): VerovioOptions {
  return Object.fromEntries(
    Object.entries(options).filter(([key, value]) => !PLUGIN_ONLY_OPTION_KEYS.has(key) && value !== undefined && value !== null)
  );
}

function getHighlightColor(options: VerovioOptions): string {
  return typeof options.highlightColor === 'string' ? options.highlightColor : '#DC143C';
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
  return /<measure\b/i.test(mei);
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
      const fileData = await fetchMEIData(this, filePath, ctx.sourcePath);
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
      // Fix: Mapping UID statt Source
      sourceMap[uid] = filePath;
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
      supportsPlayback: /<note\b/i.test(window.VerovioToolkit.getMEI()),
      measureRange: effectiveMeasureRange,
      currentPage: 1,
      totalPages: window.VerovioToolkit.getPageCount(),
    };

    const section: { lineStart: number; lineEnd: number } | null | undefined = ctx.getSectionInfo?.(el);
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

    const container = createContainer(this, uid, el);

    // Editor-Öffnen
    const svgWrapper = container.querySelector<HTMLElement>('.verovio-svg-wrapper');
    svgWrapper?.addEventListener('click', (e: Event) => {
      e.stopPropagation();
      this.lastClickedUid = uid;
      const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MUSIC_EDITOR);
      if (leaves.length) void (leaves[0].view as MusicEditorView).openBlock(uid, '');
    });

    window.setTimeout(() => {
      const svg = container.querySelector<SVGSVGElement>('svg');
      if (!svg) return;
      Object.keys(clickMap[uid]?.elementMap ?? {}).forEach(id => {
        const node = svg.querySelector<SVGElement>(`#${id}`);
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
async function fetchMEIData(plugin: VerovioMusicRenderer, path: string, sourcePath?: string): Promise<string> {
  if (/^https?:\/\//.test(path)) {
    // On-demand fetch: Only triggered by explicit user code block rendering with external URL
    const res = await requestUrl({ url: path });
    if (res.status !== 200) throw new Error(`Failed to fetch ${path}: HTTP ${res.status}`);
    return String(res.text);
  }
  const file = resolveVaultFile(plugin, path, sourcePath);
  if (!(file instanceof TFile)) throw new Error(`File not found: ${path}`);
  return plugin.app.vault.read(file);
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
  const container = parentEl.createDiv('verovio-container');
  container.dataset.uid = uid;
  // apply highlight color variable
  const color = instanceStateMap[uid]?.highlightColor || plugin.settings.highlightColor || '#DC143C';
  container.style.setProperty('--verovio-play-color', color);
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
  }
  window.VerovioToolkit.setOptions({ ...sanitizeVerovioOptions(st.options), inputFrom: 'mei' });
  window.VerovioToolkit.loadData(st.meiData);
  applyMeasureRange(st.measureRange);
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
