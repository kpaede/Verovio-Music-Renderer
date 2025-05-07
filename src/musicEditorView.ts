import VerovioMusicRenderer from './main';
import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import { clickMap } from './verovioProcessor';

// CodeMirror-Module
import { EditorView as CMEditorView } from '@codemirror/view';
import { EditorState } from '@codemirror/state';
import { basicSetup } from '@codemirror/basic-setup';
import { xml } from '@codemirror/lang-xml';

export const VIwoEW_TYPE_MUSIC_EDITOR = 'music-editor-view';

interface ElementInfo { line: number; index: number; }

export class MusicEditorView extends ItemView {
  plugin: VerovioMusicRenderer;
  private currentEditor?: CMEditorView;
  private currentElementMap?: Record<string, ElementInfo>;

  constructor(leaf: WorkspaceLeaf, plugin: VerovioMusicRenderer) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return VIEW_TYPE_MUSIC_EDITOR; }
  getDisplayText(): string { return 'Verovio Code Editor'; }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.createEl('p', { text: 'Bitte ein Verovio-Rendering anklicken oder das Panel neu öffnen.' });
  }

  onClose(): Promise<void> { return Promise.resolve(); }

  /** Öffnet den Code-Block und springt auf das Element mit elementId */
  public async openBlock(uid: string, elementId: string): Promise<void> {
    const mapping = clickMap[uid];
    if (!mapping) {
      new Notice('Zuordnung nicht gefunden.');
      return;
    }
    const { filePath, startLine, endLine, elementMap } = mapping;
    const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
    if (!file) {
      new Notice(`Datei nicht gefunden: ${filePath}`);
      return;
    }
    const fullText = await this.app.vault.read(file);
    const lines = fullText.split('\n');
    const blockLines = lines.slice(startLine, endLine);
    const blockText = blockLines.join('\n');
    this.currentElementMap = elementMap;
    this.showEditor(blockText, file, startLine, endLine, elementId);
  }

  /** Erstellt den Editor und synchronisiert nur beim Verlassen */
  private showEditor(
    blockText: string,
    file: TFile,
    startLine: number,
    endLine: number,
    elementId: string
  ) {
    this.contentEl.empty();
    this.contentEl.style.padding = '0';
    this.contentEl.style.margin = '0';
    this.contentEl.style.height = '100%';

    const state = EditorState.create({
      doc: blockText,
      extensions: [basicSetup, xml()]
    });

    const editor = new CMEditorView({ state, parent: this.contentEl });
    this.currentEditor = editor;

    // Wenn Editor-Fokus verloren geht, Datei updaten
    editor.dom.addEventListener('blur', async () => {
      const updatedLines = editor.state.doc.toString().split('\n');
      const original = await this.app.vault.read(file);
      const origLines = original.split('\n');
      const newContentLines = [
        ...origLines.slice(0, startLine),
        ...updatedLines,
        ...origLines.slice(endLine)
      ];
      await this.app.vault.modify(file, newContentLines.join('\n'));
    }, true);

    // Positioniere Cursor am gewünschten Element
    if (elementId && this.currentElementMap) {
      const info = this.currentElementMap[elementId];
      if (info) {
        const relLine = info.line - startLine;
        const lineNum = Math.min(Math.max(1, relLine), editor.state.doc.lines);
        const line = editor.state.doc.line(lineNum);
        editor.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
      }
    }
  }
}
