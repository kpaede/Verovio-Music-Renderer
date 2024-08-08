import { App, Plugin } from 'obsidian';
import { processVerovioCodeBlocks } from './verovioProcessor';
import { addVerovioStyles } from './styles';
import { VerovioSettingTab, DEFAULT_SETTINGS, VerovioPluginSettings } from './settings';
import { loadVerovio } from './verovioLoader';

declare global {
  interface Window {
    VerovioToolkitLoading?: boolean;
    VerovioToolkit?: any;
  }
}

export default class VerovioMusicRenderer extends Plugin {
  settings: VerovioPluginSettings;

  async onload() {
    console.log("Loading Verovio Music Renderer plugin...");
    addVerovioStyles();

    try {
      await loadVerovio();
      console.log("Verovio loaded successfully.");
    } catch (error) {
      console.error("Failed to load Verovio library:", error);
    }

    await this.loadSettings();
    this.addSettingTab(new VerovioSettingTab(this.app, this));

    this.registerMarkdownCodeBlockProcessor("verovio", (source, el, ctx) => {
      try {
        processVerovioCodeBlocks.call(this, source, el, ctx);
      } catch (error) {
        console.error("Error processing Verovio code block:", error);
      }
    });

    const ribbonIconEl = this.addRibbonIcon("dice", "Verovio Music Renderer", () => {
      new Notice("This is a notice!");
    });
    ribbonIconEl.addClass("my-plugin-ribbon-class");

    const statusBarItemEl = this.addStatusBarItem();
    statusBarItemEl.setText("Status Bar Text");
  }

  onunload() {
    console.log("Unloading Verovio Music Renderer plugin...");
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
