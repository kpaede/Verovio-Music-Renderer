// src/main.ts
import { Plugin, WorkspaceLeaf } from 'obsidian';
import { processVerovioCodeBlocks, clickMap } from './verovioProcessor';
import { VerovioSettingTab, DEFAULT_SETTINGS, VerovioPluginSettings } from './settings';
import { loadVerovio } from './verovioLoader';
import { MusicEditorView, VIEW_TYPE_MUSIC_EDITOR } from './musicEditorView';

export default class VerovioMusicRenderer extends Plugin {
  settings: VerovioPluginSettings;
  /** Mapping aus dem Processor */
  public clickMap = clickMap;
  /** Zuletzt geklickte Rendering‑UID */
  private lastClickedUid: string | null = null;

  async onload() {
    // Verovio laden und Einstellungen
    await this.loadVerovioSafely();
    await this.loadSettings();
    this.addSettingTab(new VerovioSettingTab(this.app, this));

    // 1) Custom-View registrieren
    this.registerView(
      VIEW_TYPE_MUSIC_EDITOR,
      (leaf: WorkspaceLeaf) => new MusicEditorView(leaf, this)
    );

    // 2) Markdown-Codeblock-Processor
    this.registerMarkdownCodeBlockProcessor(
      'verovio',
      (source, el, ctx) => {
        // Rendert das SVG und füllt clickMap[uid]
        processVerovioCodeBlocks.call(this, source, el, ctx);

        // Ermitteln der neu hinzugefügten UID
        const uids = Object.keys(this.clickMap);
        const uid = uids[uids.length - 1];
        if (!uid) return;
        this.lastClickedUid = uid;

        // Klick-Handler ans SVG‑Wrapper hängen
        const container = el.querySelector('.verovio-container') as HTMLElement;
        if (container) {
          const wrapper = container.querySelector('.verovio-svg-wrapper') as HTMLElement;
          if (wrapper) {
            wrapper.style.cursor = 'pointer';
            wrapper.addEventListener('click', () => this.openEditorFor(uid));
          }
        }
      }
    );
  }

  private async loadVerovioSafely() {
    try {
      await loadVerovio();
    } catch (e) {
      console.error('Failed to load Verovio:', e);
    }
  }

  private async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  private async saveSettings() {
    await this.saveData(this.settings);
  }

  /**
   * Öffnet (oder fokussiert) dein MusicEditorView im Side‑Panel
   * und lädt dort den Codeblock für die gegebene UID.
   */
// innerhalb deiner Plugin‑Klasse in main.ts
public async openEditorFor(uid: string) {
  const raw = this.clickMap[uid];
  if (!raw) {
    new Notice('Zuordnung zum Codeblock nicht gefunden.');
    return;
  }
  const leaf = this.app.workspace.getLeavesOfType(VIEW_TYPE_MUSIC_EDITOR)[0]
             ?? this.app.workspace.getRightLeaf(false);
  await leaf.setViewState({ type: VIEW_TYPE_MUSIC_EDITOR, active: true });
  this.app.workspace.revealLeaf(leaf);

  const view = leaf.view as MusicEditorView;
  // **Hier** rufst du die neue Methode auf:
  await view.setInlineCode(raw);
}

}
