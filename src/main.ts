import { Plugin, WorkspaceLeaf } from 'obsidian';
import { processVerovioCodeBlocks, updateSVG, instanceStateMap } from './verovioProcessor';
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
      name: 'Open Verovio Code Editor.',
      callback: () => {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MUSIC_EDITOR);
        const leaf = leaves.length
          ? leaves[0]
          : this.app.workspace.getRightLeaf(false);
        if (!leaf) return;
        void leaf.setViewState({ type: VIEW_TYPE_MUSIC_EDITOR, active: true });
        void this.app.workspace.revealLeaf(leaf);
        if (this.lastClickedUid) {
          void (leaf.view as MusicEditorView).openBlock(this.lastClickedUid, '');
        }
      },
    });
  }

  private async loadVerovioSafely() {
    try { await loadVerovio(); }
    catch (e) { console.error('Failed to load Verovio:', e); }
  }

  private async loadSettings() {
    const data = await this.loadData() as Partial<VerovioPluginSettings> & { darkMode?: boolean } | null;
    if (data) delete data.darkMode;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
  }

  // Persist settings and update all rendered SVGs so changes are visible immediately
  async saveSettings() {
    await this.saveData(this.settings);
    this.updateAllSVGs();
  }

  // Refresh all rendered verovio SVGs in the document
  private updateAllSVGs() {
    this.app.workspace.containerEl.ownerDocument.querySelectorAll<HTMLElement>('.verovio-container').forEach(container => {
      const uid = container.getAttribute('data-uid');
      if (!uid) return;
      const wrapper = container.querySelector<HTMLElement>('.verovio-svg-wrapper');
      if (!wrapper) return;
      // Merge current plugin settings into the instance options so updateSVG uses them
      const st = instanceStateMap[uid];
      if (st) {
        st.options = { ...st.options, ...this.settings };
      }
      updateSVG(uid, wrapper);
    });
  }
}
