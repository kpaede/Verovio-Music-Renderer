import VerovioMusicRenderer from './main';
import { ButtonComponent, ItemView, Modal, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { clickMap, refreshRenderingsForSource, sourceMap } from './verovioProcessor';

// CodeMirror 6
import {
  EditorView as CMEditorView,
  ViewUpdate,
  highlightActiveLine
} from '@codemirror/view';
import {
  EditorState,
  EditorSelection
} from '@codemirror/state';
import { basicSetup } from '@codemirror/basic-setup';
import { xml } from '@codemirror/lang-xml';

export const VIEW_TYPE_MUSIC_EDITOR = 'music-editor-view';

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
  private editMode: 'block' | 'file' = 'block';

  // In-Memory-Snapshot der geladenen Datei
  private origLines: string[] = [];
  private file!: TFile;
  private sourcePath?: string;
  private fileStartLine = 0;
  private fileEndLine = 0;

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

  public async openSource(uid: string, elementId: string): Promise<void> {
    const path = sourceMap[uid];
    const canEditBlock = Boolean(clickMap[uid]);
    const canEditMeiFile = path?.toLowerCase().endsWith('.mei') ?? false;

    if (elementId && canEditMeiFile && path && this.editMode === 'file' && this.sourcePath === path && this.currentEditor) {
      this.jumpToXmlId(elementId);
      return;
    }

    if (canEditMeiFile && canEditBlock && path) {
      new ChooseMeiEditTargetModal(
        this.app,
        path,
        () => { void this.openFile(path, elementId); },
        () => { void this.openBlock(uid, elementId); }
      ).open();
      return;
    }

    if (canEditMeiFile && path) {
      new ChooseMeiEditTargetModal(
        this.app,
        path,
        () => { void this.openFile(path, elementId); }
      ).open();
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

    this.jumpToXmlId(elementId);
  }

  private jumpToXmlId(elementId: string) {
    if (!elementId || !this.currentEditor) return;

    const doc = this.currentEditor.state.doc;
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

    this.currentEditor.dispatch({
      selection: cursor,
      effects: CMEditorView.scrollIntoView(cursor, { y: 'start', yMargin: 50 })
    });
    this.currentEditor.focus();
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
