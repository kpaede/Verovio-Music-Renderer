import { App, PluginSettingTab, Setting } from 'obsidian';
import VerovioMusicRenderer from './main';

export interface VerovioPluginSettings {
  scale: number;
  adjustPageHeight: boolean;
  adjustPageWidth: boolean;
  breaks: string;
  pageWidth: number;
  font: string;
}

export const DEFAULT_SETTINGS: VerovioPluginSettings = {
  scale: 100,
  adjustPageHeight: true,
  adjustPageWidth: true,
  breaks: 'auto',
  pageWidth: 700,
  font: 'Leland'
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
      .setDesc('Width of the Rendering')
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
  }
}
