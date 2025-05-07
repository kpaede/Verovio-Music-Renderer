import { ItemView, Notice, TFile, WorkspaceLeaf } from 'obsidian';
import type VerovioMusicRenderer from './main';
import { clickMap } from './verovioProcessor';

// CodeMirror‑Module — alles aus basic-setup, eine einzige Version
import { EditorView, EditorState, basicSetup } from '@codemirror/basic-setup';

export const VIEW_TYPE_MUSIC_EDITOR = 'music-editor-view';

export class MusicEditorView extends ItemView {
  plugin: VerovioMusicRenderer;

  constructor(leaf: WorkspaceLeaf, plugin: VerovioMusicRenderer) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_MUSIC_EDITOR;
  }

  getDisplayText(): string {
    return 'Verovio Code Editor';
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.createEl('p', {
      text: 'Bitte ein Verovio‑Rendering anklicken oder das Panel neu öffnen.',
    });
  }

  onClose(): Promise<void> {
    return Promise.resolve();
  }

  /** Lädt und zeigt den Block mit der gegebenen UID */
  public async openBlock(uid: string): Promise<void> {
    const mapping = clickMap[uid];
    if (!mapping) {
      new Notice('Zuordnung zum Block nicht gefunden.');
      return;
    }
    const { filePath, startLine, endLine } = mapping;
    const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
    if (!file) {
      new Notice(`Datei nicht gefunden: ${filePath}`);
      return;
    }

    const text = await this.app.vault.read(file);
    const allLines = text.split('\n');
    const blockLines = allLines.slice(startLine + 1, endLine);
    this.showEditor(blockLines.join('\n'), file, startLine + 1, endLine);
  }

  private showEditor(
    blockText: string,
    file: TFile,
    blockStart: number,
    blockEnd: number
  ) {
    // Container aufräumen
    this.contentEl.empty();
    this.contentEl.style.padding = '0';
    this.contentEl.style.margin  = '0';
    this.contentEl.style.height  = '100%';

    // CodeMirror-State konfigurieren
    const state = EditorState.create({
      doc: blockText,
      extensions: [
        basicSetup,
        EditorView.updateListener.of(async (update) => {
          if (update.docChanged) {
            const updatedText = update.state.doc.toString();
            const full = await this.app.vault.read(file);
            const lines = full.split('\n');
            const before = lines.slice(0, blockStart);
            const after  = lines.slice(blockEnd);
            const combined = [
              ...before,
              ...updatedText.split('\n'),
              ...after
            ].join('\n');
            await this.app.vault.modify(file, combined);
          }
        })
      ]
    });

    // Editor initialisieren und in das Panel hängen
    new EditorView({
      state,
      parent: this.contentEl
    });
  }
}
