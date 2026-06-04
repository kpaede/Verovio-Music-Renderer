import { App, PluginSettingTab, Setting } from 'obsidian';
import VerovioMusicRenderer from './main';

export interface VerovioPluginSettings {
  scale: number;
  adjustPageHeight: boolean;
  adjustPageWidth: boolean;
  breaks: string;
  pageWidth: number;
  font: string;
  highlightColor?: string;
  selectionColor?: string;
  playNoteOnClick: boolean;
}

export const DEFAULT_SETTINGS: VerovioPluginSettings = {
  scale: 100,
  adjustPageHeight: true,
  adjustPageWidth: true,
  breaks: 'auto',
  pageWidth: 700,
  font: 'Leland',
  highlightColor: '#DC143C',
  selectionColor: '#0066FF',
  playNoteOnClick: false
}

export class VerovioSettingTab extends PluginSettingTab {
  plugin: VerovioMusicRenderer;

  constructor(app: App, plugin: VerovioMusicRenderer) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('Adjust rendering height automatically')
      .setDesc('Disables other sizing options automatically')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.adjustPageHeight)
        .onChange(async (value) => {
          this.plugin.settings.adjustPageHeight = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Adjust rendering width automatically')
      .setDesc('Disables other sizing options automatically')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.adjustPageWidth)
        .onChange(async (value) => {
          this.plugin.settings.adjustPageWidth = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Scale')
      .setDesc('Scale rendering, 1-150%')
      .addSlider(slider => slider
        .setLimits(1, 150, 1)
        .setValue(this.plugin.settings.scale)
        .onChange(async (value) => {
          this.plugin.settings.scale = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Breaks')
      .setDesc('Type of breaks')
      .addDropdown(dropdown => dropdown
        .addOption('none', 'None')
        .addOption('auto', 'Auto')
        .addOption('line', 'Line')
        .addOption('smart', 'Smart')
        .addOption('encoded', 'Encoded')
        .setValue(this.plugin.settings.breaks)
        .onChange(async (value) => {
          this.plugin.settings.breaks = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Page width')
      .setDesc('Width of the rendering.')
      .addSlider(slider => slider
        .setLimits(100, 8800, 50)
        .setValue(this.plugin.settings.pageWidth)
        .onChange(async (value) => {
          this.plugin.settings.pageWidth = value;
          await this.plugin.saveSettings();
        }));


    new Setting(containerEl)
      .setName('Font')
      .setDesc('Musical font for rendering')
      .addDropdown(dropdown => dropdown
        .addOption('Leipzig', 'Leipzig')
        .addOption('Bravura', 'Bravura')
        .addOption('Gootville', 'Gootville')
        .addOption('Leland', 'Leland')
        .setValue(this.plugin.settings.font)
        .onChange(async (value) => {
          this.plugin.settings.font = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Highlight color')
      .setDesc('Hex color used for currently-playing note highlight')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.highlightColor || '#DC143C')
        .onChange(async (value) => {
          this.plugin.settings.highlightColor = value || '#DC143C';
          await this.plugin.saveSettings();
          this.display();
        }))
      .addText(text => text
        .setPlaceholder('#DC143C')
        .setValue(this.plugin.settings.highlightColor || '#DC143C')
        .onChange(async (value) => {
          this.plugin.settings.highlightColor = value || '#DC143C';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Selection color')
      .setDesc('Hex color used for clicked notation elements')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.selectionColor || '#0066FF')
        .onChange(async (value) => {
          this.plugin.settings.selectionColor = value || '#0066FF';
          await this.plugin.saveSettings();
          this.display();
        }))
      .addText(text => text
        .setPlaceholder('#0066FF')
        .setValue(this.plugin.settings.selectionColor || '#0066FF')
        .onChange(async (value) => {
          this.plugin.settings.selectionColor = value || '#0066FF';
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Play note on click')
      .setDesc('Play the clicked note or chord as a short piano tone')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.playNoteOnClick)
        .onChange(async (value) => {
          this.plugin.settings.playNoteOnClick = value;
          await this.plugin.saveSettings();
        }));

  }
}
