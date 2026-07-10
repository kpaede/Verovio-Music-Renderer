import { Editor, Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { processVerovioCodeBlocks, updateSVG, instanceStateMap, sanitizeVerovioOptions } from './rendering/verovioProcessor';
import { handleVerovioGlobalPointerDown, handleVerovioNotationShortcut } from './rendering/notationShortcuts';
import { VerovioSettingTab, DEFAULT_SETTINGS, VerovioPluginSettings } from './settings';
import { loadVerovio } from './verovio/verovioLoader';
import { MusicEditorView, VIEW_TYPE_MUSIC_EDITOR } from './editor/musicEditorView';
import { VerovioModal } from './pae/paeEditorModal';
import parseVerovioSource, { VerovioFormat } from './verovio/parseVerovioSource';
import { convertInlineCodeToMEI } from './verovio/verovioImport';
import { renderChordProBlock } from './chordpro/chordProBlock';

interface FencedSelection {
  body: string;
  prefix?: string;
  suffix?: string;
}

export default class VerovioMusicRenderer extends Plugin {
  settings: VerovioPluginSettings;
  public lastClickedUid: string | null = null;

  async onload() {
    await this.loadVerovioSafely();
    await this.loadSettings();
    this.addSettingTab(new VerovioSettingTab(this.app, this));
    this.registerDomEvent(
      this.app.workspace.containerEl.ownerDocument,
      'keydown',
      (event) => handleVerovioNotationShortcut(this, event),
      { capture: true }
    );
    this.registerDomEvent(
      this.app.workspace.containerEl.ownerDocument,
      'pointerdown',
      (event) => handleVerovioGlobalPointerDown(this, event),
      { capture: true }
    );

    this.registerMarkdownCodeBlockProcessor(
      'verovio',
      (source, el, ctx) => {
        processVerovioCodeBlocks.call(this, source, el, ctx);
      }
    );

    // ChordPro lead sheets (chords + lyrics). Independent of Verovio — see
    // chordProBlock.ts. Disable the standalone ChordPro Viewer plugin to avoid
    // both claiming the same code-block language.
    for (const lang of ['chopro', 'chordpro']) {
      this.registerMarkdownCodeBlockProcessor(lang, (source, el) => renderChordProBlock(source, el));
    }

    this.registerView(
      VIEW_TYPE_MUSIC_EDITOR,
      (leaf: WorkspaceLeaf) => new MusicEditorView(leaf, this)
    );

    this.addCommand({
      id: 'open-verovio-code-editor',
      name: 'Open Verovio code editor',
      callback: () => {
        const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_MUSIC_EDITOR);
        const leaf = leaves.length
          ? leaves[0]
          : this.app.workspace.getRightLeaf(false);
        if (!leaf) return;
        void leaf.setViewState({ type: VIEW_TYPE_MUSIC_EDITOR, active: true });
        void this.app.workspace.revealLeaf(leaf);
        if (this.lastClickedUid) {
          void (leaf.view as MusicEditorView).openSource(this.lastClickedUid, '', true);
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

    this.addCommand({
      id: 'convert-selection-to-mei',
      name: 'Convert selected notation to MEI',
      editorCallback: (editor) => this.convertSelectionToMEI(editor),
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
        st.selectionColor = this.settings.selectionColor || st.selectionColor;
        st.playNoteOnClick = this.settings.playNoteOnClick;
      }
      updateSVG(uid, wrapper);
    });
  }

  private async convertSelectionToMEI(editor: Editor) {
    if (!window.VerovioToolkit) {
      new Notice('Verovio toolkit is not loaded.');
      return;
    }

    const selection = editor.getSelection();
    if (!selection.trim()) {
      new Notice('Select notation code to convert to MEI.');
      return;
    }

    try {
      const fenced = this.extractFencedSelection(selection);
      const parsed = parseVerovioSource(fenced.body);
      if (parsed.filePath) {
        new Notice('Select the notation content itself, not a file path.');
        return;
      }
      if (!parsed.code?.trim()) {
        new Notice('No notation content found in the selection.');
        return;
      }

      const mei = (await this.convertNotationToMEI(parsed.code, parsed.format)).trim();
      const replacement = fenced.prefix
        ? `${fenced.prefix}${mei}\n${fenced.suffix ?? '```'}`
        : mei;
      editor.replaceSelection(replacement);
      new Notice('Selection converted to MEI.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not convert selection to MEI: ${message}`);
    }
  }

  private extractFencedSelection(selection: string): FencedSelection {
    const match = selection.match(/^(\s*```[^\n]*\n)([\s\S]*?)(\n```\s*)$/);
    if (!match) return { body: selection };
    return {
      body: match[2],
      prefix: match[1].replace(/^(\s*)```[^\n]*/, '$1```verovio'),
      suffix: match[3].trimEnd(),
    };
  }

  private async convertNotationToMEI(code: string, format: VerovioFormat): Promise<string> {
    return convertInlineCodeToMEI(code, format);
  }
}
