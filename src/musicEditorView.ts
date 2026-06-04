import VerovioMusicRenderer from './main';
import { ButtonComponent, ItemView, Modal, Notice, setIcon, TFile, WorkspaceLeaf } from 'obsidian';
import { clickMap, instanceStateMap, refreshRenderingsForSource, sourceMap } from './verovioProcessor';

// CodeMirror 6
import {
  EditorView as CMEditorView,
  ViewUpdate,
  keymap,
  highlightActiveLine
} from '@codemirror/view';
import {
  EditorState,
  EditorSelection
} from '@codemirror/state';
import { basicSetup } from '@codemirror/basic-setup';
import { xml } from '@codemirror/lang-xml';
import { openSearchPanel, search, searchKeymap } from '@codemirror/search';

export const VIEW_TYPE_MUSIC_EDITOR = 'music-editor-view';

type CombinedEditorTab = 'file' | 'block' | 'edit' | 'insert' | 'search';

interface SidebarCommandGroup {
  heading: string;
  commands: string[];
}

const MANIPULATE_GROUPS: SidebarCommandGroup[] = [
  {
    heading: 'Placement',
    commands: ['Invert placement', 'Between placement', 'Add vertical group'],
  },
  {
    heading: 'Elements',
    commands: ['Delete element', 'Convert note to rest', 'Toggle chord'],
  },
  {
    heading: 'Pitch and duration',
    commands: [
      'Pitch chromatically up',
      'Pitch chromatically down',
      'Pitch diatonically up',
      'Pitch diatonically down',
      'Pitch 1 octave up',
      'Pitch 1 octave down',
      'Element 1 staff up',
      'Element 1 staff down',
      'Increase duration',
      'Decrease duration',
      'Toggle dotted note',
    ],
  },
  {
    heading: 'Utilities',
    commands: ['Check @accid.ges', 'Check @metcon', 'Renumber measures', 'Add ids to MEI', 'Remove ids from MEI', 'Rerender via Verovio'],
  },
];

const INSERT_GROUPS: SidebarCommandGroup[] = [
  {
    heading: 'Notes',
    commands: ['Add note'],
  },
  {
    heading: 'Accidentals',
    commands: ['Double sharp', 'Sharp', 'Natural', 'Flat', 'Double flat'],
  },
  {
    heading: 'Control events',
    commands: ['Tempo', 'Directive', 'Dynamics', 'Slur', 'Tie', 'Crescendo hairpin', 'Diminuendo hairpin', 'Beam', 'BeamSpan'],
  },
  {
    heading: 'Ornaments and marks',
    commands: [
      'Arpeggio',
      'Fermata',
      'Glissando',
      'Pedal down',
      'Pedal up',
      'Trill',
      'Turn',
      'Turn lower',
      'Mordent',
      'Mordent upper',
      'Octave (8va above)',
      'Octave (15va above)',
      'Octave (8va below)',
      'Octave (15va below)',
    ],
  },
  {
    heading: 'Clefs',
    commands: ['G clef before', 'G clef after', 'F clef before', 'F clef after', 'C clef before', 'C clef after'],
  },
  {
    heading: 'Articulation',
    commands: ['Staccato', 'Accent', 'Tenuto', 'Marcato', 'Staccatissimo', 'Spiccato'],
  },
];

/** Debounce-Helfer: führt fn frühestens wait ms nach letztem Aufruf aus */
function debounce<F extends (...args: unknown[]) => void>(fn: F, wait: number): F {
  let timer: number;
  return ((...args: Parameters<F>) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), wait);
  }) as F;
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

    this.origLines        = lines;
    this.file             = file;
    this.sourcePath       = undefined;
    this.fileStartLine    = startLine;
    this.fileEndLine      = endLine;
    this.editMode         = 'block';

    const blockText = lines.slice(startLine, endLine).join('\n');
    this.showEditor(blockText, elementId);
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
    this.file = targetFile;
    this.sourcePath = path;
    this.fileStartLine = 0;
    this.fileEndLine = fileContent.split('\n').length;
    this.blockFile = blockFile;
    this.blockFileStartLine = mapping.startLine;
    this.blockFileEndLine = mapping.endLine;
    this.editMode = 'combined';

    const blockText = this.blockOrigLines.slice(mapping.startLine, mapping.endLine).join('\n');
    this.showCombinedEditor(blockText, fileContent, elementId);
  }

  /** Editor einrichten und debounced bei jeder Änderung speichern */
  private showEditor(blockText: string, elementId: string) {
    this.contentEl.empty();
    this.contentEl.classList.add('verovio-music-editor-content');

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
        changeExt,
        highlightActiveLine(),
        activeLineTheme,
        codeFontTheme
      ]
    });

    // Editor erzeugen
    this.currentEditor = new CMEditorView({ state, parent: this.contentEl });

    this.currentBlockEditor = undefined;
    this.currentFileEditor = undefined;

    this.jumpToXmlId(elementId, this.currentEditor);
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

    const editPane = body.createDiv('verovio-editor-tab-pane');
    editPane.createEl('h2', { text: 'Edit' });
    this.createMeiFriendActionPane(editPane, MANIPULATE_GROUPS);

    const insertPane = body.createDiv('verovio-editor-tab-pane');
    insertPane.createEl('h2', { text: 'Insert' });
    this.createMeiFriendActionPane(insertPane, INSERT_GROUPS);

    const panes: Record<Exclude<CombinedEditorTab, 'search'>, HTMLElement> = {
      file: filePane,
      block: blockPane,
      edit: editPane,
      insert: insertPane,
    };
    const buttons: Partial<Record<CombinedEditorTab, HTMLButtonElement>> = {};

    const activateTab = (tab: CombinedEditorTab) => {
      if (tab === 'search') {
        const editor = this.activeCombinedTab === 'block' ? this.currentBlockEditor : this.currentFileEditor;
        if (editor) {
          editor.requestMeasure();
          openSearchPanel(editor);
          editor.focus();
        }
        return;
      }

      this.activeCombinedTab = tab;
      Object.entries(panes).forEach(([key, pane]) => {
        pane.toggleClass('is-active', key === tab);
      });
      Object.entries(buttons).forEach(([key, button]) => {
        const isActive = key === tab;
        button.toggleClass('is-active', isActive);
        button.setAttribute('aria-selected', String(isActive));
      });

      const editor = tab === 'block' ? this.currentBlockEditor : this.currentFileEditor;
      if (editor && (tab === 'file' || tab === 'block')) {
        editor.requestMeasure();
        editor.focus();
      }
    };

    [
      { tab: 'file' as const, icon: 'pencil', label: 'Referenced file' },
      { tab: 'block' as const, icon: 'code-2', label: 'Codeblock' },
      { tab: 'edit' as const, icon: 'square-pen', label: 'Edit' },
      { tab: 'insert' as const, icon: 'plus', label: 'Insert' },
      { tab: 'search' as const, icon: 'search', label: 'Search' },
    ].forEach(({ tab, icon, label }) => {
      const button = nav.createEl('button', {
        cls: 'verovio-editor-tab-button',
        attr: {
          type: 'button',
          title: label,
          'aria-label': label,
          role: 'tab',
        }
      });
      setIcon(button, icon);
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

  private createMeiFriendActionPane(parent: HTMLElement, groups: SidebarCommandGroup[]) {
    const selectedCount = this.currentUid ? instanceStateMap[this.currentUid]?.selectedElementIds.length ?? 0 : 0;
    parent.createEl('p', {
      cls: 'verovio-editor-selection-status',
      text: selectedCount === 1 ? '1 selected element' : `${selectedCount} selected elements`
    });

    groups.forEach((group) => {
      const section = parent.createDiv('verovio-editor-command-section');
      section.createEl('h3', { text: group.heading });
      const grid = section.createDiv('verovio-editor-command-grid');
      group.commands.forEach((command) => {
        const button = grid.createEl('button', {
          cls: 'verovio-editor-command-button',
          text: command,
          attr: { type: 'button' }
        });
        button.addEventListener('click', () => this.showCommandPendingNotice(command));
      });
    });
  }

  private showCommandPendingNotice(command: string) {
    const selectedCount = this.currentUid ? instanceStateMap[this.currentUid]?.selectedElementIds.length ?? 0 : 0;
    const suffix = selectedCount ? ` (${selectedCount} selected)` : '';
    new Notice(`${command} is visible now${suffix}; MEI transformation wiring comes next.`);
  }

  private jumpToXmlId(elementId: string, editor?: CMEditorView) {
    if (!elementId) return;

    const targetEditor = editor ?? this.currentEditor;
    if (!targetEditor) return;

    const doc = targetEditor.state.doc;
    const text = doc.toString();
    const attrMatch = new RegExp(`xml:id\\s*=\\s*["']${escapeRegExp(elementId)}["']`).exec(text);
    if (!attrMatch) {
      new Notice(`xml:id not found in editor: ${elementId}`);
      return;
    }

    const tagStart = text.lastIndexOf('<', attrMatch.index);
    const previousTagEnd = text.lastIndexOf('>', attrMatch.index);
    const pos = tagStart > previousTagEnd ? tagStart : attrMatch.index;
    const cursor = EditorSelection.cursor(pos);

    targetEditor.dispatch({
      selection: cursor,
      effects: CMEditorView.scrollIntoView(cursor, { y: 'start', yMargin: 50 })
    });
    targetEditor.focus();
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
