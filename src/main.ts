import { Plugin, WorkspaceLeaf } from 'obsidian';
import { processVerovioCodeBlocks } from './verovioProcessor';
import { VerovioSettingTab, DEFAULT_SETTINGS, VerovioPluginSettings } from './settings';
import { loadVerovio } from './verovioLoader';
import { MusicEditorView, VIEW_TYPE_MUSIC_EDITOR } from './musicEditorView';

export default class VerovioMusicRenderer extends Plugin {
  settings: VerovioPluginSettings;
  public lastClickedUid: string | null = null;
  private themeObserver: MutationObserver | null = null;

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
        if (leaf) {
          leaf.setViewState({ type: VIEW_TYPE_MUSIC_EDITOR, active: true });
          this.app.workspace.revealLeaf(leaf);
          if (this.lastClickedUid && leaf.view instanceof MusicEditorView) {
            leaf.view.openBlock(this.lastClickedUid, '');
          }
        }
      },
    });

    // Theme change observer for automatic dark mode detection
    if (this.settings.autoDetectTheme) {
      this.startThemeObserver();
    }
  }

  private async loadVerovioSafely() {
    try { await loadVerovio(); }
    catch (e) { console.error('Failed to load Verovio:', e); }
  }

  private async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
    // Restart theme observer wenn auto-detect aktiviert wurde
    if (this.settings.autoDetectTheme && !this.themeObserver) {
      this.startThemeObserver();
    } else if (!this.settings.autoDetectTheme && this.themeObserver) {
      this.stopThemeObserver();
    }
    // Update all existing SVGs
    this.updateAllSVGs();
  }

  private startThemeObserver() {
    this.themeObserver = new MutationObserver(() => {
      // Update all SVGs when theme changes
      this.updateAllSVGs();
    });

    this.themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
      childList: false,
      subtree: false
    });
  }

  private stopThemeObserver() {
    if (this.themeObserver) {
      this.themeObserver.disconnect();
      this.themeObserver = null;
    }
  }

  private updateAllSVGs() {
    // Update all rendered SVGs with new theme settings
    document.querySelectorAll('.verovio-container').forEach(container => {
      const uid = container.getAttribute('data-uid');
      if (uid) {
        const wrapper = container.querySelector('.verovio-svg-wrapper') as HTMLElement;
        if (wrapper) {
          import('./verovioProcessor').then(({ updateSVG }) => {
            updateSVG(uid, wrapper, this);
          });
        }
      }
    });
  }

  onunload() {
    this.stopThemeObserver();
  }
}
