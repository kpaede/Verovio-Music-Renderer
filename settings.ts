import { App, PluginSettingTab, Setting } from 'obsidian';
import VerovioMusicRenderer from './main';

export interface VerovioPluginSettings {
  mySetting: string;
  scale: number;
  adjustPageHeight: boolean;
  adjustPageWidth: boolean;
  breaks: string;
  pageWidth: number;
  midiTempoAdjustment: number;
  font: string;
}

export const DEFAULT_SETTINGS: VerovioPluginSettings = {
  mySetting: 'default',
  scale: 100,
  adjustPageHeight: true,
  adjustPageWidth: true,
  breaks: 'auto',
  pageWidth: 700,
  midiTempoAdjustment: 1.0,
  font: 'Leipzig' // Default font
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
      .setName('Setting #1')
      .setDesc("It's a secret")
      .addText(text => text
        .setPlaceholder('Enter your secret')
        .setValue(this.plugin.settings.mySetting)
        .onChange(async (value) => {
          this.plugin.settings.mySetting = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Scale')
      .setDesc('Scale for Verovio rendering')
      .addSlider(slider => slider
        .setLimits(1, 1000, 1)
        .setValue(this.plugin.settings.scale)
        .onChange(async (value) => {
          this.plugin.settings.scale = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Adjust Page Height')
      .setDesc('Adjust page height')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.adjustPageHeight)
        .onChange(async (value) => {
          this.plugin.settings.adjustPageHeight = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('Adjust Page Width')
      .setDesc('Adjust page width')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.adjustPageWidth)
        .onChange(async (value) => {
          this.plugin.settings.adjustPageWidth = value;
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
      .setName('Page Width')
      .setDesc('Width of the page')
      .addSlider(slider => slider
        .setLimits(100, 1200, 50)
        .setValue(this.plugin.settings.pageWidth)
        .onChange(async (value) => {
          this.plugin.settings.pageWidth = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('MIDI Tempo Adjustment')
      .setDesc('Adjustment factor for MIDI tempo')
      .addSlider(slider => slider
        .setLimits(0.5, 2.0, 0.1)
        .setValue(this.plugin.settings.midiTempoAdjustment)
        .onChange(async (value) => {
          this.plugin.settings.midiTempoAdjustment = value;
          await this.plugin.saveSettings();
        }));

        new Setting(containerEl)
        .setName('Font')
        .setDesc('Musical font for rendering')
        .addDropdown(dropdown => dropdown
          .addOption('"Leipzig"', 'Leipzig')
          .addOption('"Bravura"', 'Bravura')
          .addOption('"Gootville"', 'Gootville')
          .addOption('"Leland"', 'Leland')
          .setValue(this.plugin.settings.font)
          .onChange(async (value) => {
            this.plugin.settings.font = value;
            await this.plugin.saveSettings();
          }));
    }
  }
