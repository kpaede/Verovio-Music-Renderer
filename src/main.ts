import { Plugin, WorkspaceLeaf } from 'obsidian';
import { processVerovioCodeBlocks, updateSVG, instanceStateMap, sanitizeVerovioOptions } from './verovioProcessor';
import { VerovioSettingTab, DEFAULT_SETTINGS, VerovioPluginSettings } from './settings';
import { loadVerovio } from './verovioLoader';
import { MusicEditorView, VIEW_TYPE_MUSIC_EDITOR } from './musicEditorView';
import { VerovioModal } from './modal';

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

    this.addCommand({
      id: 'insert-pae-codeblock',
      name: 'Insert Plaine & Easie music codeblock',
      editorCallback: (editor) => {
        new VerovioModal(this.app, (codeBlock) => editor.replaceSelection(codeBlock)).open();
      },
    });
  }

  private async loadVerovioSafely() {
    try { await loadVerovio(); }
    catch (e) { console.error('Failed to load Verovio:', e); }
  }

  private async loadSettings() {
    const data = await this.loadData() as Partial<VerovioPluginSettings> & {
      darkColor?: string;
      darkMode?: boolean;
      darkModeStyle?: string;
    } | null;
    if (data) {
      delete data.darkColor;
      delete data.darkMode;
      delete data.darkModeStyle;
    }
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
        st.options = sanitizeVerovioOptions({ ...st.options, ...this.settings });
        st.highlightColor = this.settings.highlightColor || st.highlightColor;
      }
      updateSVG(uid, wrapper);
    });
  }
}
