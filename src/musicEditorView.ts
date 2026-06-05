import VerovioMusicRenderer from './main';
import { ButtonComponent, ItemView, Modal, Notice, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import { clickMap, instanceStateMap, refreshRenderingsForSource, selectRenderedNotationElement, sourceMap, updateSVG } from './verovioProcessor';
import parseVerovioSource from './parseVerovioSource';

// CodeMirror 6
import {
  EditorView as CMEditorView,
  ViewUpdate,
  Decoration,
  keymap,
  highlightActiveLine
} from '@codemirror/view';
import {
  EditorState,
  StateEffect,
  StateField
} from '@codemirror/state';
import { basicSetup } from '@codemirror/basic-setup';
import { xml } from '@codemirror/lang-xml';
import { closeSearchPanel, openSearchPanel, search, searchKeymap, searchPanelOpen } from '@codemirror/search';
import { createMeiEditorDropdownMenu } from './meiEditorDropdownMenus';
import { applyMeiEditorCommand } from './meiEditorOperations';
import { extractCodeBlockBody, replaceCodeBlockBody, resolveCodeBlockRange } from './codeBlockRange';
import meiLogoUrl from './meilogo.png';

export const VIEW_TYPE_MUSIC_EDITOR = 'music-editor-view';

type CombinedEditorTab = 'file' | 'block' | 'remote' | 'edit' | 'insert' | 'convert' | 'search';
type SingleEditorTab = 'source' | 'block' | 'edit' | 'insert' | 'convert' | 'search';

const EDITOR_TOOLBAR_ITEMS: Array<{ tab: SingleEditorTab; icon: string; label: string }> = [
  { tab: 'source', icon: 'pencil', label: 'Referenced content' },
  { tab: 'block', icon: 'code-2', label: 'Codeblock' },
  { tab: 'edit', icon: 'square-pen', label: 'Edit' },
  { tab: 'insert', icon: 'plus', label: 'Insert' },
  { tab: 'convert', icon: meiLogoUrl, label: 'Convert to MEI' },
  { tab: 'search', icon: 'search', label: 'Search' },
];

/** Debounce-Helfer: führt fn frühestens wait ms nach letztem Aufruf aus */
function debounce<F extends (...args: unknown[]) => void>(fn: F, wait: number): F {
  let timer: number;
  return ((...args: Parameters<F>) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  }) as F;
}

function setToolbarIcon(button: HTMLElement, icon: string) {
  if (icon.startsWith('data:image/')) {
    button.createEl('img', { cls: 'verovio-editor-tab-image', attr: { src: icon, alt: '' } });
    return;
  }
  setIcon(button, icon);
}

function isMeiText(text: string): boolean {
  return /<mei(?:\s|>)/i.test(text);
}

function isXmlText(text: string): boolean {
  return /<\?xml\b|<[A-Za-z_][\w:.-]*(?:\s|>)/.test(extractCodeBlockBody(text).trim());
}

function getInputFrom(format: string): string {
  return format === 'pae' ? 'pae' : format;
}

function splitNotationAndOptions(body: string): { notation: string; optionsText: string } {
  const lines = body.split('\n');
  let end = lines.length;

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (line === '') continue;
    if (/^https?:\/\//i.test(line)) break;
    if (/^[a-z]\w*\s*:\s*.+$/.test(line) && !/^[A-Za-z]+:\/\//.test(line)) {
      end = i;
      continue;
    }
    break;
  }

  return {
    notation: lines.slice(0, end).join('\n').trim(),
    optionsText: lines.slice(end).join('\n').trim(),
  };
}

function collectXmlIds(value: string): string[] {
  const ids: string[] = [];
  const regex = /\bxml:id\s*=\s*["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(value)) !== null) ids.push(match[1]);
  return ids;
}

function collectXmlIdCandidatesNearPosition(text: string, pos: number, lineFrom: number, lineTo: number): string[] {
  const candidates: string[] = [];
  const add = (ids: string[]) => {
    ids.forEach((id) => {
      if (!candidates.includes(id)) candidates.push(id);
    });
  };

  const lineText = text.slice(lineFrom, lineTo);
  add(collectXmlIds(lineText));
  if (!lineText.includes('<')) return candidates;

  const tagStart = text.lastIndexOf('<', pos);
  const tagEnd = text.indexOf('>', pos);
  if (tagStart >= 0 && tagEnd >= pos) {
    const previousTagEnd = text.lastIndexOf('>', pos);
    if (tagStart > previousTagEnd) add(collectXmlIds(text.slice(tagStart, tagEnd + 1)));
  }

  const contextStart = Math.max(0, pos - 1000);
  add(collectXmlIds(text.slice(contextStart, pos)).reverse());

  return candidates;
}

/** Theme-Override: kräftigere Hervorhebung der aktiven Zeile */
const activeLineTheme = CMEditorView.theme({
  '.cm-activeLine': {
    backgroundColor: 'rgba(100, 150, 250, 0.3)',
  }
});

/** Theme-Override: Schriftgröße im Editor verkleinern */
const codeFontTheme = CMEditorView.theme({
  '& .cm-content': {
    fontSize: '0.85em'
  }
});

const markXmlLineEffect = StateEffect.define<number | null>();
const markedXmlLineField = StateField.define({
  create() {
    return Decoration.none;
  },
  update(value, transaction) {
    value = value.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(markXmlLineEffect)) continue;
      value = effect.value === null
        ? Decoration.none
        : Decoration.set([
          Decoration.line({ class: 'verovio-editor-marked-xml-line' }).range(effect.value)
        ]);
    }
    return value;
  },
  provide: (field) => CMEditorView.decorations.from(field)
});

export class MusicEditorView extends ItemView {
  plugin: VerovioMusicRenderer;
  private currentEditor?: CMEditorView;
  private currentBlockEditor?: CMEditorView;
  private currentFileEditor?: CMEditorView;
  private editMode: 'block' | 'file' | 'combined' = 'block';
  private activeCombinedTab: CombinedEditorTab = 'file';
  private currentUid?: string;

  // In-Memory-Snapshot der geladenen Datei
  private origLines: string[] = [];
  private file!: TFile;
  private sourcePath?: string;
  private fileStartLine = 0;
  private fileEndLine = 0;

  // Combined mode state
  private blockOrigLines: string[] = [];
  private blockFile!: TFile;
  private blockFileStartLine = 0;
  private blockFileEndLine = 0;

  constructor(leaf: WorkspaceLeaf, plugin: VerovioMusicRenderer) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_MUSIC_EDITOR; }
  getDisplayText(): string { return 'Verovio code editor'; }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.createEl('p', {
      text: 'Please open a Verovio rendering or re-open the panel.'
    });
  }

  onClose(): Promise<void> { return Promise.resolve(); }

  public async openSource(uid: string, elementId: string, skipChooseModal = false): Promise<void> {
    this.currentUid = uid;
    const path = sourceMap[uid];
    const canEditBlock = Boolean(clickMap[uid]);
    const canEditMeiFile = path?.toLowerCase().endsWith('.mei') ?? false;
    const isExternalBlock = canEditBlock ? await this.isExternalReferenceBlock(uid) : false;

    if (elementId && canEditMeiFile && path && this.sourcePath === path) {
      if (this.editMode === 'file' && this.currentEditor) {
        this.jumpToXmlId(elementId, this.currentEditor);
        return;
      }
      if (this.editMode === 'combined' && this.currentFileEditor) {
        this.jumpToXmlId(elementId, this.currentFileEditor);
        return;
      }
    }

    if (canEditMeiFile && canEditBlock && path) {
      await this.openCombined(uid, elementId);
      return;
    }

    if (skipChooseModal) {
      if (isExternalBlock) {
        await this.openExternalCombined(uid, elementId);
        return;
      }
      if (canEditMeiFile && path) {
        await this.openFile(path, elementId);
        return;
      }
      if (canEditBlock) {
        await this.openBlock(uid, elementId);
        return;
      }
    }

    if (canEditMeiFile && path) {
      await this.openFile(path, elementId);
      return;
    }

    if (isExternalBlock) {
      await this.openExternalCombined(uid, elementId);
      return;
    }

    if (canEditBlock) {
      await this.openBlock(uid, elementId);
      return;
    }

    new Notice('Attachment not found.');
  }

  /** Datei laden, Snapshot speichern, und Editor öffnen */
  public async openBlock(uid: string, elementId: string): Promise<void> {
    this.currentUid = uid;
    const mapping = clickMap[uid];
    if (!mapping) {
      new Notice('Attachment not found.');
      return;
    }

    const { filePath, startLine, endLine } = mapping;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) {
      new Notice(`File not found.: ${filePath}`);
      return;
    }

    const content = await this.app.vault.read(file);
    const lines = content.split('\n');
    const range = resolveCodeBlockRange(lines, startLine, endLine);

    this.origLines        = lines;
    this.file             = file;
    this.sourcePath       = undefined;
    this.fileStartLine    = range.startLine;
    this.fileEndLine      = range.endLineExclusive;
    this.editMode         = 'block';

    this.showEditor(range.text, elementId);
  }

  public async openFile(path: string, elementId = ''): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      new Notice(`File not found.: ${path}`);
      return;
    }

    const content = await this.app.vault.read(file);
    this.origLines = content.split('\n');
    this.file = file;
    this.sourcePath = path;
    this.fileStartLine = 0;
    this.fileEndLine = this.origLines.length;
    this.editMode = 'file';

    this.showEditor(content, elementId);
  }

  public async openCombined(uid: string, elementId: string): Promise<void> {
    this.currentUid = uid;
    const mapping = clickMap[uid];
    const path = sourceMap[uid];
    if (!mapping || !path) {
      new Notice('Attachment not found.');
      return;
    }

    const blockFile = this.app.vault.getAbstractFileByPath(mapping.filePath);
    if (!(blockFile instanceof TFile)) {
      new Notice(`File not found.: ${mapping.filePath}`);
      return;
    }

    const targetFile = this.app.vault.getAbstractFileByPath(path);
    if (!(targetFile instanceof TFile)) {
      new Notice(`File not found.: ${path}`);
      return;
    }

    const blockContent = await this.app.vault.read(blockFile);
    const fileContent = await this.app.vault.read(targetFile);

    this.blockOrigLines = blockContent.split('\n');
    const range = resolveCodeBlockRange(this.blockOrigLines, mapping.startLine, mapping.endLine);
    this.file = targetFile;
    this.sourcePath = path;
    this.fileStartLine = 0;
    this.fileEndLine = fileContent.split('\n').length;
    this.blockFile = blockFile;
    this.blockFileStartLine = range.startLine;
    this.blockFileEndLine = range.endLineExclusive;
    this.editMode = 'combined';

    this.showCombinedEditor(range.text, fileContent, elementId);
  }

  public async openExternalCombined(uid: string, elementId: string): Promise<void> {
    this.currentUid = uid;
    const mapping = clickMap[uid];
    if (!mapping) {
      new Notice('Attachment not found.');
      return;
    }

    const blockFile = this.app.vault.getAbstractFileByPath(mapping.filePath);
    if (!(blockFile instanceof TFile)) {
      new Notice(`File not found.: ${mapping.filePath}`);
      return;
    }

    const blockContent = await this.app.vault.read(blockFile);
    this.blockOrigLines = blockContent.split('\n');
    const range = resolveCodeBlockRange(this.blockOrigLines, mapping.startLine, mapping.endLine);
    this.blockFile = blockFile;
    this.blockFileStartLine = range.startLine;
    this.blockFileEndLine = range.endLineExclusive;
    this.editMode = 'combined';
    this.sourcePath = undefined;

    this.showExternalCombinedEditor(range.text, instanceStateMap[uid]?.meiData ?? '', elementId);
  }

  /** Editor einrichten und debounced bei jeder Änderung speichern */
  private showEditor(blockText: string, elementId: string) {
    this.contentEl.empty();
    this.contentEl.classList.add('verovio-music-editor-content');

    const nav = this.contentEl.createDiv('verovio-editor-tabs');
    const body = this.contentEl.createDiv('verovio-editor-tab-body');
    const blockPane = body.createDiv('verovio-editor-tab-pane');
    blockPane.createEl('h2', { text: this.editMode === 'file' ? `Referenced file: ${this.file.name}` : 'Codeblock' });
    const editorWrapper = blockPane.createDiv('verovio-editor-wrapper');
    const dropdown = createMeiEditorDropdownMenu(this.contentEl, {
      getSelectedCount: () => this.currentUid ? instanceStateMap[this.currentUid]?.selectedElementIds.length ?? 0 : 0,
      runCommand: (commandId) => this.runMeiEditorCommand(commandId),
    });

    const activeSourceTab: SingleEditorTab = this.editMode === 'file' ? 'source' : 'block';
    const blockBody = this.editMode === 'block' ? extractCodeBlockBody(blockText) : blockText;
    const parsedBlock = this.editMode === 'block' ? parseVerovioSource(blockBody) : undefined;
    const canEditMei = this.editMode === 'file' || (this.editMode === 'block' && parsedBlock?.code !== undefined && parsedBlock.format === 'mei');
    const canConvertInline = this.editMode === 'block' && parsedBlock?.code !== undefined && parsedBlock.format !== 'mei';
    const disabledTabs = new Set<SingleEditorTab>(this.editMode === 'file' ? ['block', 'convert'] : ['source']);
    if (!canEditMei) {
      disabledTabs.add('edit');
      disabledTabs.add('insert');
    }
    if (!canConvertInline) disabledTabs.add('convert');
    const buttons: Partial<Record<SingleEditorTab, HTMLButtonElement>> = {};
    const activateTab = (tab: SingleEditorTab) => {
      if (disabledTabs.has(tab)) return;
      if (tab === 'convert') {
        void this.convertCurrentBlockToMei();
        return;
      }
      if (tab === 'search') {
        dropdown.close();
        if (!this.currentEditor) return;
        this.currentEditor.requestMeasure();
        if (searchPanelOpen(this.currentEditor.state)) closeSearchPanel(this.currentEditor);
        else openSearchPanel(this.currentEditor);
        return;
      }
      if (tab === 'edit' || tab === 'insert') {
        const anchor = buttons[tab];
        if (anchor) dropdown.toggle(tab === 'edit' ? 'manipulate' : 'insert', anchor);
        return;
      }
      dropdown.close();
      blockPane.toggleClass('is-active', true);
      Object.entries(buttons).forEach(([key, button]) => {
        const isActive = key === tab || (tab === activeSourceTab && key === activeSourceTab);
        button.toggleClass('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
      });
      this.currentEditor?.requestMeasure();
    };

    const addToolButton = (tab: SingleEditorTab, icon: string, label: string) => {
      const button = nav.createEl('button', {
        cls: 'verovio-editor-tab-button',
        attr: {
          type: 'button',
          'aria-label': label,
          title: label,
          'data-editor-tab': tab,
          role: tab === 'edit' || tab === 'insert' ? 'button' : 'tab',
          ...(tab === 'edit' || tab === 'insert' ? { 'aria-haspopup': 'menu' } : {}),
        },
      });
      setToolbarIcon(button, icon);
      if (disabledTabs.has(tab)) {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
      }
      button.addEventListener('click', () => activateTab(tab));
      buttons[tab] = button;
    };
    EDITOR_TOOLBAR_ITEMS.forEach(({ tab, icon, label }) => addToolButton(
      tab,
      icon,
      tab === 'source' && this.editMode === 'file' ? 'Referenced file' : label
    ));

    // Debounced-Save: tauscht nur den Block-Bereich aus
    const save = debounce(async () => {
      try {
        const updatedText = this.currentEditor!.state.doc.toString();

        if (this.editMode === 'file') {
          await this.app.vault.modify(this.file, updatedText);
          this.origLines = updatedText.split('\n');
          this.fileEndLine = this.origLines.length;
          if (this.sourcePath) {
            refreshRenderingsForSource(this.sourcePath, updatedText);
          }
          return;
        }

        const updatedLines = updatedText.split('\n');
        const before = this.origLines.slice(0, this.fileStartLine);
        const after = this.origLines.slice(this.fileEndLine);
        const merged = [...before, ...updatedLines, ...after];
        await this.app.vault.modify(this.file, merged.join('\n'));
        this.origLines = merged;
        this.fileEndLine = this.fileStartLine + updatedLines.length;
      } catch (e) {
        console.error('Save failed.:', e);
        new Notice(this.editMode === 'file' ? 'Saving MEI file failed.' : 'Saving in code block failed.');
      }
    }, 300);

    // Change-Listener nur bei echten doc-Änderungen
    const changeExt = CMEditorView.updateListener.of((v: ViewUpdate) => {
      if (v.docChanged) void save();
    });

    // State mit allen Extensions
    const state = EditorState.create({
      doc: blockText,
      extensions: [
        basicSetup,
        xml(),
        markedXmlLineField,
        this.createEditorSvgSelectionExtension(),
        search(),
        keymap.of(searchKeymap),
        changeExt,
        highlightActiveLine(),
        activeLineTheme,
        codeFontTheme
      ]
    });

    // Editor erzeugen
    this.currentEditor = new CMEditorView({ state, parent: editorWrapper });

    this.currentBlockEditor = undefined;
    this.currentFileEditor = undefined;

    activateTab(activeSourceTab);
    this.jumpToXmlId(elementId, this.currentEditor);
  }

  private showExternalCombinedEditor(blockText: string, remoteText: string, elementId: string) {
    this.contentEl.empty();
    this.contentEl.classList.add('verovio-music-editor-content');
    this.activeCombinedTab = 'remote';

    const nav = this.contentEl.createDiv('verovio-editor-tabs');
    const body = this.contentEl.createDiv('verovio-editor-tab-body');

    const remotePane = body.createDiv('verovio-editor-tab-pane');
    remotePane.createEl('h2', { text: 'External URL content' });
    remotePane.createEl('p', { text: 'This rendering comes from an external URL. The fetched MEI is shown read-only.' });
    const remoteWrapper = remotePane.createDiv('verovio-editor-wrapper');

    const blockPane = body.createDiv('verovio-editor-tab-pane');
    blockPane.createEl('h2', { text: 'Codeblock' });
    const blockWrapper = blockPane.createDiv('verovio-editor-wrapper');

    const dropdown = createMeiEditorDropdownMenu(this.contentEl, {
      getSelectedCount: () => this.currentUid ? instanceStateMap[this.currentUid]?.selectedElementIds.length ?? 0 : 0,
      runCommand: (commandId) => this.runMeiEditorCommand(commandId),
    });

    const panes: Record<'remote' | 'block', HTMLElement> = {
      remote: remotePane,
      block: blockPane,
    };
    const buttons: Partial<Record<SingleEditorTab, HTMLButtonElement>> = {};

    const activateTab = (tab: SingleEditorTab) => {
      if (tab === 'search') {
        const editor = this.activeCombinedTab === 'block' ? this.currentBlockEditor : this.currentFileEditor;
        if (editor) {
          editor.requestMeasure();
          if (searchPanelOpen(editor.state)) closeSearchPanel(editor);
          else openSearchPanel(editor);
        }
        return;
      }
      if (tab === 'edit' || tab === 'insert' || tab === 'convert') return;
      dropdown.close();
      this.activeCombinedTab = tab === 'block' ? 'block' : 'remote';
      Object.entries(panes).forEach(([key, pane]) => pane.toggleClass('is-active', key === this.activeCombinedTab));
      Object.entries(buttons).forEach(([key, button]) => {
        const isActive = key === tab;
        button.toggleClass('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
      });
      (this.activeCombinedTab === 'block' ? this.currentBlockEditor : this.currentFileEditor)?.requestMeasure();
    };

    EDITOR_TOOLBAR_ITEMS.forEach(({ tab, icon, label }) => {
      const disabled = tab === 'edit' || tab === 'insert' || tab === 'convert';
      const button = nav.createEl('button', {
        cls: 'verovio-editor-tab-button',
        attr: {
          type: 'button',
          title: disabled ? `${label} unavailable for external URL content` : tab === 'source' ? 'External URL content' : label,
          'aria-label': tab === 'source' ? 'External URL content' : label,
          'data-editor-tab': tab,
          role: tab === 'edit' || tab === 'insert' ? 'button' : 'tab',
          ...(tab === 'edit' || tab === 'insert' ? { 'aria-haspopup': 'menu' } : {}),
        }
      });
      setToolbarIcon(button, icon);
      button.disabled = disabled;
      if (disabled) button.setAttribute('aria-disabled', 'true');
      button.addEventListener('click', () => activateTab(tab));
      buttons[tab] = button;
    });

    const saveBlock = debounce(async () => {
      try {
        const updatedText = this.currentBlockEditor!.state.doc.toString();
        const updatedLines = updatedText.split('\n');
        const before = this.blockOrigLines.slice(0, this.blockFileStartLine);
        const after = this.blockOrigLines.slice(this.blockFileEndLine);
        const merged = [...before, ...updatedLines, ...after];
        await this.app.vault.modify(this.blockFile, merged.join('\n'));
        this.blockOrigLines = merged;
        this.blockFileEndLine = this.blockFileStartLine + updatedLines.length;
      } catch (e) {
        console.error('Save failed.:', e);
        new Notice('Saving in code block failed.');
      }
    }, 300);

    const blockChangeExt = CMEditorView.updateListener.of((v: ViewUpdate) => {
      if (v.docChanged) void saveBlock();
    });

    this.currentFileEditor = new CMEditorView({
      state: EditorState.create({
        doc: remoteText,
        extensions: [
          basicSetup,
          xml(),
          markedXmlLineField,
          this.createEditorSvgSelectionExtension(),
          EditorState.readOnly.of(true),
          CMEditorView.editable.of(false),
          search(),
          keymap.of(searchKeymap),
          highlightActiveLine(),
          activeLineTheme,
          codeFontTheme
        ]
      }),
      parent: remoteWrapper,
    });
    this.currentBlockEditor = new CMEditorView({
      state: EditorState.create({
        doc: blockText,
        extensions: [
          basicSetup,
          xml(),
          markedXmlLineField,
          this.createEditorSvgSelectionExtension(),
          search(),
          keymap.of(searchKeymap),
          blockChangeExt,
          highlightActiveLine(),
          activeLineTheme,
          codeFontTheme
        ]
      }),
      parent: blockWrapper,
    });
    this.currentEditor = undefined;

    activateTab('source');
    this.jumpToXmlId(elementId, this.currentFileEditor);
  }

  private showCombinedEditor(blockText: string, fileText: string, elementId: string) {
    this.contentEl.empty();
    this.contentEl.classList.add('verovio-music-editor-content');

    this.activeCombinedTab = 'file';

    const nav = this.contentEl.createDiv('verovio-editor-tabs');
    const body = this.contentEl.createDiv('verovio-editor-tab-body');

    const filePane = body.createDiv('verovio-editor-tab-pane');
    filePane.createEl('h2', { text: `Referenced file: ${this.file.name}` });
    const fileWrapper = filePane.createDiv('verovio-editor-wrapper');

    const blockPane = body.createDiv('verovio-editor-tab-pane');
    blockPane.createEl('h2', { text: 'Codeblock' });
    const blockWrapper = blockPane.createDiv('verovio-editor-wrapper');

    const dropdown = createMeiEditorDropdownMenu(this.contentEl, {
      getSelectedCount: () => this.currentUid ? instanceStateMap[this.currentUid]?.selectedElementIds.length ?? 0 : 0,
      runCommand: (commandId) => this.runMeiEditorCommand(commandId),
    });

    const panes: Record<'file' | 'block', HTMLElement> = {
      file: filePane,
      block: blockPane,
    };
    const buttons: Partial<Record<CombinedEditorTab, HTMLButtonElement>> = {};

    const activateTab = (tab: CombinedEditorTab) => {
      if (tab === 'search') {
        const editor = this.activeCombinedTab === 'block' ? this.currentBlockEditor : this.currentFileEditor;
        if (editor) {
          editor.requestMeasure();
          if (searchPanelOpen(editor.state)) closeSearchPanel(editor);
          else openSearchPanel(editor);
        }
        return;
      }
      if (tab === 'edit' || tab === 'insert') {
        const currentText = this.activeCombinedTab === 'block'
          ? this.currentBlockEditor?.state.doc.toString() ?? ''
          : this.currentFileEditor?.state.doc.toString() ?? '';
        const currentBody = this.activeCombinedTab === 'block' ? extractCodeBlockBody(currentText) : currentText;
        if (!isMeiText(currentBody)) return;
        const anchor = buttons[tab];
        if (anchor) dropdown.toggle(tab === 'edit' ? 'manipulate' : 'insert', anchor);
        return;
      }
      if (tab === 'convert') return;

      dropdown.close();
      this.activeCombinedTab = tab;
      Object.entries(panes).forEach(([key, pane]) => {
        pane.toggleClass('is-active', key === tab);
      });
      Object.entries(buttons).forEach(([key, button]) => {
        const isActive = key === tab;
        button.toggleClass('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
      });

      const editorText = tab === 'block'
        ? this.currentBlockEditor?.state.doc.toString() ?? ''
        : this.currentFileEditor?.state.doc.toString() ?? '';
      const canEditCurrent = isMeiText(tab === 'block' ? extractCodeBlockBody(editorText) : editorText);
      ['edit', 'insert'].forEach((key) => {
        const button = buttons[key as CombinedEditorTab];
        if (!button) return;
        button.disabled = !canEditCurrent;
        button.setAttribute('aria-disabled', String(!canEditCurrent));
      });

      const editor = tab === 'block' ? this.currentBlockEditor : this.currentFileEditor;
      if (editor && (tab === 'file' || tab === 'block')) {
        editor.requestMeasure();
      }
    };

    EDITOR_TOOLBAR_ITEMS.forEach(({ tab: toolbarTab, icon, label }) => {
      const tab: CombinedEditorTab = toolbarTab === 'source' ? 'file' : toolbarTab;
      const button = nav.createEl('button', {
        cls: 'verovio-editor-tab-button',
        attr: {
          type: 'button',
          title: toolbarTab === 'source' ? 'Referenced file' : label,
          'aria-label': toolbarTab === 'source' ? 'Referenced file' : label,
          'data-editor-tab': toolbarTab,
          role: tab === 'edit' || tab === 'insert' ? 'button' : 'tab',
          ...(tab === 'edit' || tab === 'insert' ? { 'aria-haspopup': 'menu' } : {}),
        }
      });
      if (tab === 'convert') {
        button.disabled = true;
        button.setAttribute('aria-disabled', 'true');
      }
      setToolbarIcon(button, icon);
      button.addEventListener('click', () => activateTab(tab));
      buttons[tab] = button;
    });

    // Block editor save
    const saveBlock = debounce(async () => {
      try {
        const updatedText = this.currentBlockEditor!.state.doc.toString();
        const updatedLines = updatedText.split('\n');
        const before = this.blockOrigLines.slice(0, this.blockFileStartLine);
        const after = this.blockOrigLines.slice(this.blockFileEndLine);
        const merged = [...before, ...updatedLines, ...after];
        await this.app.vault.modify(this.blockFile, merged.join('\n'));
        this.blockOrigLines = merged;
        this.blockFileEndLine = this.blockFileStartLine + updatedLines.length;
      } catch (e) {
        console.error('Save failed.:', e);
        new Notice('Saving in code block failed.');
      }
    }, 300);

    const saveFile = debounce(async () => {
      try {
        const updatedText = this.currentFileEditor!.state.doc.toString();
        await this.app.vault.modify(this.file, updatedText);
        this.origLines = updatedText.split('\n');
        this.fileEndLine = this.origLines.length;
        if (this.sourcePath) {
          refreshRenderingsForSource(this.sourcePath, updatedText);
        }
      } catch (e) {
        console.error('Save failed.:', e);
        new Notice('Saving MEI file failed.');
      }
    }, 300);

    const blockChangeExt = CMEditorView.updateListener.of((v: ViewUpdate) => {
      if (v.docChanged) void saveBlock();
    });

    const fileChangeExt = CMEditorView.updateListener.of((v: ViewUpdate) => {
      if (v.docChanged) void saveFile();
    });

    const blockState = EditorState.create({
      doc: blockText,
      extensions: [
        basicSetup,
        xml(),
        markedXmlLineField,
        this.createEditorSvgSelectionExtension(),
        search(),
        keymap.of(searchKeymap),
        blockChangeExt,
        highlightActiveLine(),
        activeLineTheme,
        codeFontTheme
      ]
    });

    const fileState = EditorState.create({
      doc: fileText,
      extensions: [
        basicSetup,
        xml(),
        markedXmlLineField,
        this.createEditorSvgSelectionExtension(),
        search(),
        keymap.of(searchKeymap),
        fileChangeExt,
        highlightActiveLine(),
        activeLineTheme,
        codeFontTheme
      ]
    });

    this.currentBlockEditor = new CMEditorView({ state: blockState, parent: blockWrapper });
    this.currentFileEditor = new CMEditorView({ state: fileState, parent: fileWrapper });
    this.currentEditor = undefined;

    activateTab('file');
    this.jumpToXmlId(elementId, this.currentFileEditor);
  }

  private runMeiEditorCommand(commandId: string): boolean {
    const editor = this.editMode === 'combined'
      ? (this.activeCombinedTab === 'block' ? this.currentBlockEditor : this.currentFileEditor)
      : this.currentEditor;
    const uid = this.currentUid;
    if (!editor || !uid) {
      new Notice('Open a MEI editor before running this command.');
      return true;
    }

    const selectedIds = instanceStateMap[uid]?.selectedElementIds ?? [];
    const currentText = editor.state.doc.toString();
    const useCodeBlockEnvelope = this.editMode === 'block' || (this.editMode === 'combined' && this.activeCombinedTab === 'block');
    const editableMei = useCodeBlockEnvelope ? extractCodeBlockBody(currentText) : currentText;
    const result = applyMeiEditorCommand(commandId, editableMei, selectedIds);
    if (!result.changed) {
      if (result.message) new Notice(result.message);
      return true;
    }
    const nextText = useCodeBlockEnvelope ? replaceCodeBlockBody(currentText, result.text) : result.text;

    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: nextText },
    });

    if (commandId === 'delete' && instanceStateMap[uid]) {
      instanceStateMap[uid].selectedElementIds = [];
      instanceStateMap[uid].lastSelectedElementId = undefined;
    }

    const lastSelected = commandId === 'delete'
      ? undefined
      : instanceStateMap[uid]?.lastSelectedElementId ?? selectedIds.at(-1);
    if (lastSelected) this.jumpToXmlId(lastSelected, editor);
    if (useCodeBlockEnvelope && instanceStateMap[uid]) {
      instanceStateMap[uid].meiData = result.text;
      const wrapper = this.app.workspace.containerEl.ownerDocument.querySelector<HTMLElement>(
        `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
      );
      if (wrapper) updateSVG(uid, wrapper);
    }
    new Notice('MEI updated.');
    return true;
  }

  private async convertCurrentBlockToMei(): Promise<void> {
    const editor = this.editMode === 'combined' ? this.currentBlockEditor : this.currentEditor;
    const uid = this.currentUid;
    if (!editor) return;
    if (!window.VerovioToolkit) {
      new Notice('Verovio toolkit is not loaded.');
      return;
    }

    const currentText = editor.state.doc.toString();
    const body = extractCodeBlockBody(currentText);
    const parsed = parseVerovioSource(body);
    if (!parsed.code) {
      new Notice('Only inline notation codeblocks can be converted to MEI.');
      return;
    }
    if (parsed.format === 'mei') {
      new Notice('This codeblock is already MEI.');
      return;
    }
    const confirmed = await confirmConvertToMei(this.app, parsed.format);
    if (!confirmed) return;

    const { notation, optionsText } = splitNotationAndOptions(body);
    window.VerovioToolkit.renderData(notation, { ...parsed.options, inputFrom: getInputFrom(parsed.format) });
    const mei = window.VerovioToolkit.getMEI().trim();
    if (!mei) {
      new Notice(`Could not convert ${parsed.format} to MEI.`);
      return;
    }

    const nextBody = optionsText ? `${mei}\n${optionsText}` : mei;
    const nextText = replaceCodeBlockBody(currentText, nextBody);
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: nextText },
    });

    if (uid && instanceStateMap[uid]) {
      instanceStateMap[uid].meiData = mei;
      instanceStateMap[uid].options = { ...instanceStateMap[uid].options, inputFrom: 'mei' };
      const wrapper = this.app.workspace.containerEl.ownerDocument.querySelector<HTMLElement>(
        `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
      );
      if (wrapper) updateSVG(uid, wrapper);
    }

    this.setToolbarDisabled('edit', false);
    this.setToolbarDisabled('insert', false);
    this.setToolbarDisabled('convert', true);
    new Notice('Codeblock converted to MEI.');
  }

  private setToolbarDisabled(tab: SingleEditorTab, disabled: boolean) {
    const button = this.contentEl.querySelector<HTMLButtonElement>(`.verovio-editor-tab-button[data-editor-tab="${tab}"]`);
    if (!button) return;
    button.disabled = disabled;
    button.setAttribute('aria-disabled', String(disabled));
  }

  private createEditorSvgSelectionExtension() {
    return CMEditorView.domEventHandlers({
      click: (event, editor) => {
        this.selectSvgElementFromEditorClick(event, editor);
        return false;
      }
    });
  }

  private selectSvgElementFromEditorClick(event: MouseEvent, editor: CMEditorView) {
    if (!this.currentUid) return;

    const pos = editor.posAtCoords({ x: event.clientX, y: event.clientY });
    if (pos === null) return;

    const text = editor.state.doc.toString();
    if (!isXmlText(text)) return;

    const line = editor.state.doc.lineAt(pos);
    const candidates = collectXmlIdCandidatesNearPosition(text, pos, line.from, line.to);
    const selected = candidates.some((id) => (
      selectRenderedNotationElement(this.currentUid!, id, event.metaKey || event.ctrlKey)
    ));
    if (!selected) return;

    editor.dispatch({ effects: markXmlLineEffect.of(line.from) });
  }

  private async isExternalReferenceBlock(uid: string): Promise<boolean> {
    const blockText = await this.readMappedBlockText(uid);
    const body = extractCodeBlockBody(blockText).trim();
    if (/^https?:\/\//i.test(body.split('\n').find((line) => line.trim()) ?? '')) return true;
    try {
      const parsed = parseVerovioSource(body);
      return /^https?:\/\//i.test(parsed.filePath ?? '');
    } catch {
      return false;
    }
  }

  private async readMappedBlockText(uid: string): Promise<string> {
    const mapping = clickMap[uid];
    if (!mapping) return '';
    const file = this.app.vault.getAbstractFileByPath(mapping.filePath);
    if (!(file instanceof TFile)) return '';
    const lines = (await this.app.vault.read(file)).split('\n');
    return resolveCodeBlockRange(lines, mapping.startLine, mapping.endLine).text;
  }

  private jumpToXmlId(elementId: string, editor?: CMEditorView) {
    if (!elementId) return;

    const targetEditor = editor ?? this.currentEditor;
    if (!targetEditor) return;

    const doc = targetEditor.state.doc;
    const text = doc.toString();
    const attrMatch = new RegExp(`xml:id\\s*=\\s*["']${escapeRegExp(elementId)}["']`).exec(text);
    if (!attrMatch) {
      if (!isXmlText(text)) return;
      new Notice(`xml:id not found in editor: ${elementId}`);
      return;
    }

    const tagStart = text.lastIndexOf('<', attrMatch.index);
    const previousTagEnd = text.lastIndexOf('>', attrMatch.index);
    const pos = tagStart > previousTagEnd ? tagStart : attrMatch.index;
    const lineStart = doc.lineAt(pos).from;

    targetEditor.dispatch({
      effects: [
        markXmlLineEffect.of(lineStart),
        CMEditorView.scrollIntoView(pos, { y: 'start', yMargin: 50 })
      ]
    });
  }
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class ChooseMeiEditTargetModal extends Modal {
  constructor(
    app: VerovioMusicRenderer['app'],
    private readonly path: string,
    private readonly onOpenFile: () => void,
    private readonly onOpenBlock?: () => void
  ) {
    super(app);
  }

  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: 'What do you want to edit?' });
    this.contentEl.createEl('p', {
      text: `This rendering links to ${this.path}.`
    });

    const buttonRow = this.contentEl.createDiv('verovio-confirm-buttons');
    new ButtonComponent(buttonRow)
      .setButtonText('Edit MEI file')
      .setCta()
      .onClick(() => {
        this.close();
        this.onOpenFile();
      });
    if (this.onOpenBlock) {
      new ButtonComponent(buttonRow)
        .setButtonText('Edit codeblock')
        .onClick(() => {
          this.close();
          this.onOpenBlock?.();
        });
    }
    new ButtonComponent(buttonRow)
      .setButtonText('Cancel')
      .onClick(() => this.close());
  }
}

function confirmConvertToMei(app: VerovioMusicRenderer['app'], format: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new ConfirmConvertToMeiModal(app, format, resolve);
    modal.open();
  });
}

class ConfirmConvertToMeiModal extends Modal {
  private resolved = false;

  constructor(
    app: VerovioMusicRenderer['app'],
    private readonly format: string,
    private readonly resolveChoice: (confirmed: boolean) => void
  ) {
    super(app);
  }

  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: 'Convert to MEI?' });
    this.contentEl.createEl('p', {
      text: `This will replace the inline ${this.format} notation in the codeblock with generated MEI. Codeblock options will be kept.`
    });

    const buttonRow = this.contentEl.createDiv('verovio-confirm-buttons');
    new ButtonComponent(buttonRow)
      .setButtonText('Convert to MEI')
      .setCta()
      .onClick(() => {
        this.resolved = true;
        this.close();
        this.resolveChoice(true);
      });
    new ButtonComponent(buttonRow)
      .setButtonText('Cancel')
      .onClick(() => {
        this.resolved = true;
        this.close();
        this.resolveChoice(false);
      });
  }

  onClose() {
    if (!this.resolved) this.resolveChoice(false);
  }
}
