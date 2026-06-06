import VerovioMusicRenderer from '../main';
import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { clickMap, instanceStateMap, refreshRenderingsForSource, selectRenderedNotationElement, sourceMap } from '../rendering/verovioProcessor';
import parseVerovioSource from '../verovio/parseVerovioSource';

// CodeMirror 6
import {
  EditorView as CMEditorView
} from '@codemirror/view';
import { closeSearchPanel, openSearchPanel, searchPanelOpen } from '@codemirror/search';
import { createMeiEditorDropdownMenu } from './mei/meiEditorDropdownMenus';
import { extractCodeBlockBody, replaceCodeBlockBody } from './codeBlockRange';
import { EDITOR_TOOLBAR_ITEMS, setToolbarIcon, type CombinedEditorTab, type SingleEditorTab } from './editorToolbar';
import {
  isMeiText,
} from './editorCodeblockOptions';
import { createMusicCodeEditor } from './musicCodeEditor';
import { jumpToXmlId, selectSvgElementFromEditorClick } from './editorNavigation';
import { convertCurrentBlockToMei, runMeiEditorCommand } from './editorMeiWorkflows';
import { renderEditorRenderingSettings } from './editorRenderingSettings';
import { isExternalReferenceBlock } from './editorSourceReader';
import { loadBlockSource, loadCombinedSource, loadExternalCombinedSource, loadFileSource } from './editorSourceLoaders';

export const VIEW_TYPE_MUSIC_EDITOR = 'music-editor-view';

/** Debounce-Helfer: führt fn frühestens wait ms nach letztem Aufruf aus */
function debounce<F extends (...args: unknown[]) => void>(fn: F, wait: number): F {
  let timer: number;
  return ((...args: Parameters<F>) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  }) as F;
}


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
    const isExternalBlock = canEditBlock ? await isExternalReferenceBlock(this.plugin, uid) : false;

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
    const source = await loadBlockSource(this.plugin, uid);
    if (!source) return;

    this.origLines        = source.lines;
    this.file             = source.file;
    this.sourcePath       = undefined;
    this.fileStartLine    = source.range.startLine;
    this.fileEndLine      = source.range.endLineExclusive;
    this.editMode         = 'block';

    this.showEditor(source.range.text, elementId);
  }

  public async openFile(path: string, elementId = ''): Promise<void> {
    const source = await loadFileSource(this.plugin, path);
    if (!source) return;

    this.origLines = source.lines;
    this.file = source.file;
    this.sourcePath = path;
    this.fileStartLine = 0;
    this.fileEndLine = this.origLines.length;
    this.editMode = 'file';

    this.showEditor(source.content, elementId);
  }

  public async openCombined(uid: string, elementId: string): Promise<void> {
    this.currentUid = uid;
    const source = await loadCombinedSource(this.plugin, uid);
    if (!source) return;

    this.blockOrigLines = source.blockLines;
    this.file = source.targetFile;
    this.sourcePath = source.path;
    this.fileStartLine = 0;
    this.fileEndLine = source.fileContent.split('\n').length;
    this.blockFile = source.blockFile;
    this.blockFileStartLine = source.range.startLine;
    this.blockFileEndLine = source.range.endLineExclusive;
    this.editMode = 'combined';

    this.showCombinedEditor(source.range.text, source.fileContent, elementId);
  }

  public async openExternalCombined(uid: string, elementId: string): Promise<void> {
    this.currentUid = uid;
    const source = await loadExternalCombinedSource(this.plugin, uid);
    if (!source) return;

    this.blockOrigLines = source.lines;
    this.blockFile = source.file;
    this.blockFileStartLine = source.range.startLine;
    this.blockFileEndLine = source.range.endLineExclusive;
    this.editMode = 'combined';
    this.sourcePath = undefined;

    this.showExternalCombinedEditor(source.range.text, source.remoteText, elementId);
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
    const settingsPane = body.createDiv('verovio-editor-tab-pane');
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
    if (this.editMode === 'file') disabledTabs.add('settings');
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
      if (tab === 'settings') {
        dropdown.close();
        blockPane.toggleClass('is-active', false);
        settingsPane.toggleClass('is-active', true);
        Object.entries(buttons).forEach(([key, button]) => {
          const isActive = key === tab;
          button.toggleClass('is-active', isActive);
          button.setAttribute('aria-selected', String(isActive));
        });
        this.renderRenderingSettings(settingsPane);
        return;
      }
      if (tab === 'edit' || tab === 'insert') {
        const anchor = buttons[tab];
        if (anchor) dropdown.toggle(tab === 'edit' ? 'manipulate' : 'insert', anchor);
        return;
      }
      dropdown.close();
      blockPane.toggleClass('is-active', true);
      settingsPane.toggleClass('is-active', false);
      Object.entries(buttons).forEach(([key, button]) => {
        const isActive = key === tab || (tab === activeSourceTab && key === activeSourceTab);
        button.toggleClass('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
      });
      this.currentEditor?.requestMeasure();
      this.ensureSearchPanelOpen(this.currentEditor);
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

    this.currentEditor = createMusicCodeEditor({
      doc: blockText,
      parent: editorWrapper,
      onChange: () => void save(),
      onClick: (event, editor) => this.selectSvgElementFromEditorClick(event, editor),
    });

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
    remotePane.createEl('h2', { text: 'External url content' });
    remotePane.createEl('p', { text: 'This rendering comes from an external url. The fetched MEI is shown read-only.' });
    const remoteWrapper = remotePane.createDiv('verovio-editor-wrapper');

    const blockPane = body.createDiv('verovio-editor-tab-pane');
    blockPane.createEl('h2', { text: 'Codeblock' });
    const blockWrapper = blockPane.createDiv('verovio-editor-wrapper');
    const settingsPane = body.createDiv('verovio-editor-tab-pane');

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
        dropdown.close();
        const editor = this.activeCombinedTab === 'block' ? this.currentBlockEditor : this.currentFileEditor;
        if (editor) {
          editor.requestMeasure();
          if (searchPanelOpen(editor.state)) closeSearchPanel(editor);
          else openSearchPanel(editor);
        }
        return;
      }
      if (tab === 'settings') {
        dropdown.close();
        Object.values(panes).forEach((pane) => pane.toggleClass('is-active', false));
        settingsPane.toggleClass('is-active', true);
        Object.entries(buttons).forEach(([key, button]) => {
          const isActive = key === tab;
          button.toggleClass('is-active', isActive);
          button.setAttribute('aria-selected', String(isActive));
        });
        this.renderRenderingSettings(settingsPane);
        return;
      }
      if (tab === 'edit' || tab === 'insert' || tab === 'convert') return;
      dropdown.close();
      settingsPane.toggleClass('is-active', false);
      this.activeCombinedTab = tab === 'block' ? 'block' : 'remote';
      Object.entries(panes).forEach(([key, pane]) => pane.toggleClass('is-active', key === this.activeCombinedTab));
      Object.entries(buttons).forEach(([key, button]) => {
        const isActive = key === tab;
        button.toggleClass('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
      });
      const activeEditor = this.activeCombinedTab === 'block' ? this.currentBlockEditor : this.currentFileEditor;
      activeEditor?.requestMeasure();
      this.ensureSearchPanelOpen(activeEditor);
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

    this.currentFileEditor = createMusicCodeEditor({
      doc: remoteText,
      parent: remoteWrapper,
      readOnly: true,
      onClick: (event, editor) => this.selectSvgElementFromEditorClick(event, editor),
    });
    this.currentBlockEditor = createMusicCodeEditor({
      doc: blockText,
      parent: blockWrapper,
      onChange: () => void saveBlock(),
      onClick: (event, editor) => this.selectSvgElementFromEditorClick(event, editor),
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
    const settingsPane = body.createDiv('verovio-editor-tab-pane');

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
        dropdown.close();
        const editor = this.activeCombinedTab === 'block' ? this.currentBlockEditor : this.currentFileEditor;
        if (editor) {
          editor.requestMeasure();
          if (searchPanelOpen(editor.state)) closeSearchPanel(editor);
          else openSearchPanel(editor);
        }
        return;
      }
      if (tab === 'settings') {
        dropdown.close();
        Object.values(panes).forEach((pane) => pane.toggleClass('is-active', false));
        settingsPane.toggleClass('is-active', true);
        Object.entries(buttons).forEach(([key, button]) => {
          const isActive = key === tab;
          button.toggleClass('is-active', isActive);
          button.setAttribute('aria-selected', String(isActive));
        });
        this.renderRenderingSettings(settingsPane);
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
      settingsPane.toggleClass('is-active', false);
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
        this.ensureSearchPanelOpen(editor);
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

    this.currentBlockEditor = createMusicCodeEditor({
      doc: blockText,
      parent: blockWrapper,
      onChange: () => void saveBlock(),
      onClick: (event, editor) => this.selectSvgElementFromEditorClick(event, editor),
    });
    this.currentFileEditor = createMusicCodeEditor({
      doc: fileText,
      parent: fileWrapper,
      onChange: () => void saveFile(),
      onClick: (event, editor) => this.selectSvgElementFromEditorClick(event, editor),
    });
    this.currentEditor = undefined;

    activateTab('file');
    this.jumpToXmlId(elementId, this.currentFileEditor);
  }

  private runMeiEditorCommand(commandId: string): boolean {
    return runMeiEditorCommand({
      activeCombinedTab: this.activeCombinedTab,
      commandId,
      currentBlockEditor: this.currentBlockEditor,
      currentEditor: this.currentEditor,
      currentFileEditor: this.currentFileEditor,
      currentUid: this.currentUid,
      editMode: this.editMode,
      jumpToXmlId: (elementId, editor) => this.jumpToXmlId(elementId, editor),
      plugin: this.plugin,
    });
  }

  private async convertCurrentBlockToMei(): Promise<void> {
    await convertCurrentBlockToMei({
      currentBlockEditor: this.currentBlockEditor,
      currentEditor: this.currentEditor,
      currentUid: this.currentUid,
      editMode: this.editMode,
      plugin: this.plugin,
      setToolbarDisabled: (tab, disabled) => this.setToolbarDisabled(tab, disabled),
    });
  }

  private setToolbarDisabled(tab: SingleEditorTab, disabled: boolean) {
    const button = this.contentEl.querySelector<HTMLButtonElement>(`.verovio-editor-tab-button[data-editor-tab="${tab}"]`);
    if (!button) return;
    button.disabled = disabled;
    button.setAttribute('aria-disabled', String(disabled));
  }

  private ensureSearchPanelOpen(editor?: CMEditorView) {
    if (editor && !searchPanelOpen(editor.state)) openSearchPanel(editor);
  }

  private renderRenderingSettings(parent: HTMLElement) {
    renderEditorRenderingSettings(parent, {
      currentUid: this.currentUid,
      editMode: this.editMode,
      getCurrentCodeBlockText: () => this.getCurrentCodeBlockText(),
      plugin: this.plugin,
      replaceCurrentCodeBlockBody: (updateBody) => this.replaceCurrentCodeBlockBody(updateBody),
    });
  }

  private getCurrentCodeBlockText(): string {
    if (this.editMode === 'combined') return this.currentBlockEditor?.state.doc.toString() ?? '';
    if (this.editMode === 'block') return this.currentEditor?.state.doc.toString() ?? '';
    return '';
  }

  private replaceCurrentCodeBlockBody(updateBody: (body: string) => string) {
    const editor = this.editMode === 'combined' ? this.currentBlockEditor : this.currentEditor;
    if (this.editMode === 'block' || this.editMode === 'combined') {
      if (!editor) return;
      const currentText = editor.state.doc.toString();
      const nextText = replaceCodeBlockBody(currentText, updateBody(extractCodeBlockBody(currentText)));
      editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: nextText } });
      return;
    }

    return;
  }

  private selectSvgElementFromEditorClick(event: MouseEvent, editor: CMEditorView) {
    selectSvgElementFromEditorClick({
      currentUid: this.currentUid ?? undefined,
      editor,
      event,
      selectRenderedElement: selectRenderedNotationElement,
    });
  }

  private jumpToXmlId(elementId: string, editor?: CMEditorView) {
    jumpToXmlId({ elementId, editor: editor ?? this.currentEditor });
  }
}
