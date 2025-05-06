import { Plugin, WorkspaceLeaf } from 'obsidian';
import { processVerovioCodeBlocks } from './verovioProcessor';
import { VerovioSettingTab, DEFAULT_SETTINGS, VerovioPluginSettings } from './settings';
import { loadVerovio } from './verovioLoader';
import { MusicEditorView, VIEW_TYPE_MUSIC_EDITOR } from './musicEditorView';

export default class VerovioMusicRenderer extends Plugin {
  settings: VerovioPluginSettings;
  public lastClickedUid: string | null = null;

  async onload() {
    await this.loadVerovioSafely();
    await this.loadSettings();
    this.addSettingTab(new VerovioSettingTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor(
      'verovio',
      (source, el, ctx) => {
        processVerovioCodeBlocks.call(this, source, el, ctx);
      }
    );

    this.registerView(
      VIEW_TYPE_MUSIC_EDITOR,
      (leaf: WorkspaceLeaf) => new MusicEditorView(leaf, this)
    );

    this.addCommand({
      id: 'open-verovio-code-editor',
      name: 'Verovio Code Editor öffnen',
      callback: () => {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MUSIC_EDITOR);
        const leaf = leaves.length
          ? leaves[0]
          : this.app.workspace.getRightLeaf(false);
        leaf.setViewState({ type: VIEW_TYPE_MUSIC_EDITOR, active: true });
        this.app.workspace.revealLeaf(leaf);
        if (this.lastClickedUid) {
          (leaf.view as MusicEditorView).openBlock(this.lastClickedUid);
        }
      },
    });
  }

  private async loadVerovioSafely() {
    try { await loadVerovio(); }
    catch (e) { console.error('Failed to load Verovio:', e); }
  }

  private async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
}
