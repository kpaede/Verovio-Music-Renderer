import { ItemView, Notice, TFile } from 'obsidian';
import type VerovioMusicRenderer from './main';
import { clickMap } from './verovioProcessor';

export const VIEW_TYPE_MUSIC_EDITOR = 'music-editor-view';

export class MusicEditorView extends ItemView {
  plugin: VerovioMusicRenderer;

  constructor(leaf, plugin: VerovioMusicRenderer) {
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

  /** Lädt und zeigt den Block mit UID */
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
    this.contentEl.empty();
    this.contentEl.style.padding = '0';
    this.contentEl.style.margin = '0';
    this.contentEl.style.height = '100%';

    const ta = this.contentEl.createEl('textarea');
    ta.value = blockText;
    ta.style.width = '100%';
    ta.style.height = '100%';
    ta.style.boxSizing = 'border-box';
    ta.style.padding = '8px';
    ta.style.fontFamily = 'monospace';
    ta.style.fontSize = '14px';
    ta.style.border = 'none';
    ta.style.outline = 'none';
    ta.style.resize = 'none';
    ta.focus();

    ta.addEventListener('input', async () => {
      const full = await this.app.vault.read(file);
      const lines = full.split('\n');
      const before = lines.slice(0, blockStart);
      const after = lines.slice(blockEnd);
      const updated = [
        ...before,
        ...ta.value.split('\n'),
        ...after
      ].join('\n');
      await this.app.vault.modify(file, updated);
    });
  }
}
