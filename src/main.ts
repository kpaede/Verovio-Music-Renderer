import { App, Plugin, WorkspaceLeaf, ItemView, ViewState, MarkdownView, Notice } from 'obsidian';
import { processVerovioCodeBlocks } from './verovioProcessor';
import { VerovioSettingTab, DEFAULT_SETTINGS, VerovioPluginSettings } from './settings';
import { loadVerovio } from './verovioLoader';

declare global {
  interface Window {
    VerovioToolkitLoading?: boolean;
    VerovioToolkit?: any;
  }
}

const VIEW_TYPE_VEROVIO_SIDEBAR = 'verovio-sidebar';

export default class VerovioMusicRenderer extends Plugin {
  settings: VerovioPluginSettings;

  async onload() {
    try {
      await loadVerovio();
    } catch (error) {
      console.error('Failed to load Verovio library:', error);
    }

    await this.loadSettings();
    this.addSettingTab(new VerovioSettingTab(this.app, this));

    // Register code block processor
    this.registerMarkdownCodeBlockProcessor('verovio', (source, el, ctx) => {
      try {
        processVerovioCodeBlocks.call(this, source, el, ctx);
      } catch (error) {
        console.error('Error processing Verovio code block:', error);
      }
    });

    // Register sidebar view
    this.registerView(
      VIEW_TYPE_VEROVIO_SIDEBAR,
      (leaf: WorkspaceLeaf) => new VerovioSidebarView(leaf)
    );

    // Add command to open the sidebar
    this.addCommand({
      id: 'open-verovio-sidebar',
      name: 'Open Verovio Code Sidebar',
      callback: async () => {
        const leaf = this.app.workspace.getRightLeaf(false);
        await leaf.setViewState({ type: VIEW_TYPE_VEROVIO_SIDEBAR, active: true } as ViewState);
      }
    });
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_VEROVIO_SIDEBAR);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// Sidebar View
class VerovioSidebarView extends ItemView {
  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return VIEW_TYPE_VEROVIO_SIDEBAR;
  }

  getDisplayText() {
    return 'Verovio Code';
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();

    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) {
      container.createEl('p', { text: 'No active markdown view.' });
      return;
    }
    const editor = activeView.editor;
    const cursor = editor.getCursor();

    // Find start of current verovio code block
    let start = cursor.line;
    while (start >= 0 && !editor.getLine(start).trim().startsWith('```verovio')) {
      start--;
    }
    if (start < 0) {
      container.createEl('p', { text: 'No verovio code block at cursor.' });
      return;
    }
    // Find end of block
    let end = start + 1;
    while (end < editor.lineCount && !editor.getLine(end).trim().startsWith('```')) {
      end++;
    }

    const codeLines: string[] = [];
    for (let i = start + 1; i < end; i++) {
      codeLines.push(editor.getLine(i));
    }
    const firstLine = codeLines.find(l => l.trim().length > 0) || '';

        // Detect external file links
    const externalPattern = /^(?:https?:\/\/|\.\/|\/)/;
    if (externalPattern.test(firstLine.trim())) {
      container.createEl('p', { text: 'External file mode: editing not supported.' });
      return;
    }// Inline code: show textarea
    const textarea = container.createEl('textarea');
    textarea.value = codeLines.join('\n');
    textarea.style.width = '100%';
    textarea.style.height = '80%';

    const saveBtn = container.createEl('button', { text: 'Save' });
    saveBtn.onclick = () => {
      editor.replaceRange(
        textarea.value,
        { line: start + 1, ch: 0 },
        { line: end, ch: 0 }
      );
      new Notice('Verovio code updated.');
    };
  }

  async onClose() {
    // Nothing to cleanup
  }
}
