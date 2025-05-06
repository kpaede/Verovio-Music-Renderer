import {
  ItemView,
  WorkspaceLeaf,
  Notice,
  TFile,
} from 'obsidian';
import type VerovioMusicRenderer from '../main';

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

  onOpen(): Promise<void> {
    // kein Direkt-Render, wir starten über setInlineCode()
    return Promise.resolve();
  }

  // ──────────────────────────────────────────────────────────────────────────
  /** Setzt den rohen Block‑Text und Metadaten, zeigt im Editor und speichert Änderungen. */
  public async setInlineCode(rawMapping: string): Promise<void> {
    const mapping = JSON.parse(rawMapping) as {
      code: string;
      filePath: string;
      startLine: number | null;
      endLine: number | null;
    };

    const { code, filePath, startLine, endLine } = mapping;

    // 1) Container leeren
    const container = this.containerEl.children[1];
    container.empty();

    // 2) <textarea> für den Codeblock
    const textarea = container.createEl('textarea');
    textarea.style.width = '100%';
    textarea.style.height = '100%';
    textarea.value = code;

    // 3) Änderungs-Handler: schreibt den Block zurück in die Datei
    textarea.addEventListener('input', async () => {
      if (filePath && startLine !== null && endLine !== null) {
        const file = this.app.vault.getAbstractFileByPath(filePath) as TFile;
        if (!file) {
          new Notice(`Datei nicht gefunden: ${filePath}`);
          return;
        }
        const fullText = await this.app.vault.read(file);
        const lines = fullText.split('\n');
        const before = lines.slice(0, startLine + 1);
        const after = lines.slice(endLine);
        const newBlock = textarea.value.split('\n');
        const newText = [...before, ...newBlock, ...after].join('\n');
        await this.app.vault.modify(file, newText);
      } else {
        new Notice('Zeilenbereich fehlt – Änderung nicht gespeichert.');
      }
    });
  }
  // ──────────────────────────────────────────────────────────────────────────

  onClose(): Promise<void> {
    return Promise.resolve();
  }
}
