import { App, Notice, PluginSettingTab, requireApiVersion, setTooltip, type SettingDefinitionItem, type SettingDefinitionRender } from 'obsidian';
import VerovioMusicRenderer from './main';
import { COMMON_RENDERING_OPTIONS, SETTINGS_SKIP_GROUPS, renderVerovioRenderingSettings, shouldShowRenderingOption, type RenderingSettingValue } from './rendering/renderingSettingsControls';
import { createLinkedNumberSlider, createRenderingOptionInput } from './rendering/renderingOptionInputs';
import { formatRenderingOptionTitle, type RenderingSettingsOptions } from './rendering/renderingSettingsTypes';

export interface VerovioPluginSettings {
  [key: string]: RenderingSettingValue;
  scale?: number;
  adjustPageHeight?: boolean;
  adjustPageWidth?: boolean;
  breaks?: string;
  pageWidth?: number;
  font?: string;
  highlightColor?: string;
  selectionColor?: string;
  playNoteOnClick: boolean;
}

export const DEFAULT_SETTINGS: VerovioPluginSettings = {
  scale: 100,
  adjustPageHeight: true,
  adjustPageWidth: true,
  breaks: 'encoded',
  pageWidth: 700,
  font: 'Leland',
  highlightColor: '#DC143C',
  selectionColor: '#0066FF',
  playNoteOnClick: false
}

export { MUSIC_FALLBACK_FONTS, MUSIC_FONTS } from './rendering/musicFonts';

export class VerovioSettingTab extends PluginSettingTab {
  plugin: VerovioMusicRenderer;

  constructor(app: App, plugin: VerovioMusicRenderer) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    const definitions: SettingDefinitionItem[] = [{
      type: 'group',
      heading: 'Plugin behavior',
      items: [
        this.defineSetting('highlightColor', 'Highlight color', 'Hex color used for currently-playing note highlight',
          (parent) => this.createColorSettingRow(parent, 'highlightColor', 'Highlight color', 'Hex color used for currently-playing note highlight', '#DC143C')),
        this.defineSetting('selectionColor', 'Selection color', 'Hex color used for clicked notation elements',
          (parent) => this.createColorSettingRow(parent, 'selectionColor', 'Selection color', 'Hex color used for clicked notation elements', '#0066FF')),
        this.defineSetting('playNoteOnClick', 'Play note on click', 'Play the clicked note or chord as a short piano tone',
          (parent) => this.createBooleanSettingRow(parent, 'playNoteOnClick', 'Play note on click', 'Play the clicked note or chord as a short piano tone')),
      ],
    }];
    const toolkit = window.VerovioToolkit;
    if (!toolkit?.getAvailableOptions || !toolkit?.getDefaultOptions) {
      definitions.push({ name: 'Verovio option metadata is not available.', searchable: false });
      return definitions;
    }

    const options = this.getRenderingSettingsOptions(this.containerEl);
    const knownKeys = new Set(COMMON_RENDERING_OPTIONS.map(({ key }) => key));
    definitions.push({
      name: options.resetLabel,
      searchable: false,
      render: (setting) => {
        setting.addButton((button) => button.setButtonText('Reset').onClick(async () => {
          await options.onResetAll(knownKeys);
          if (requireApiVersion('1.13.0')) this.update();
          new Notice(options.resetNotice);
        }));
      },
    }, {
      type: 'group',
      heading: 'Common rendering settings',
      items: COMMON_RENDERING_OPTIONS.map((option) => this.defineSetting(option.key, option.label, option.title,
        (parent) => createLinkedNumberSlider(parent, {
          ...option,
          value: Number(this.plugin.settings[option.key] ?? options.fallbackValues[option.key] ?? option.defaultValue),
          resetValue: Number(options.fallbackValues[option.key] ?? option.defaultValue),
          onChange: options.onChange,
        }))),
    });

    Object.values(toolkit.getAvailableOptions().groups).forEach((group) => {
      if (SETTINGS_SKIP_GROUPS.has(group.name)) return;
      const items = Object.entries(group.options)
        .filter(([key, definition]) => shouldShowRenderingOption(key, definition))
        .map(([key, definition]) => {
          knownKeys.add(key);
          const item = this.defineSetting(key, definition.title ?? key, formatRenderingOptionTitle(key, definition),
            (parent) => {
              createRenderingOptionInput(parent, key, definition,
                this.plugin.settings[key] ?? options.fallbackValues[key] ?? definition.default ?? '',
                options.fallbackValues[key] ?? definition.default, options.onChange);
            });
          item.aliases?.push(group.name);
          return item;
        });
      if (items.length) definitions.push({ type: 'group', heading: group.name, items });
    });
    return definitions;
  }

  private defineSetting(key: string, name: string, desc: string, render: (parent: HTMLElement) => void): SettingDefinitionRender {
    return {
      name, desc, aliases: [key],
      render: (setting) => {
        setting.settingEl.empty();
        setting.settingEl.addClass('verovio-setting-definition');
        render(setting.settingEl);
      },
    };
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    this.renderPluginBehaviorSettings(containerEl);

    const renderingContainer = containerEl.createDiv('verovio-global-rendering-settings');
    renderVerovioRenderingSettings(this.getRenderingSettingsOptions(renderingContainer));
  }

  private getRenderingSettingsOptions(parent: HTMLElement): RenderingSettingsOptions {
    return {
      parent,
      title: 'Global rendering settings',
      values: this.plugin.settings,
      fallbackValues: {
        ...(window.VerovioToolkit?.getDefaultOptions?.() ?? {}),
        ...DEFAULT_SETTINGS,
      },
      includeMeasureSelection: false,
      resetLabel: 'Reset global rendering settings',
      resetNotice: 'Global rendering settings reset.',
      onChange: async (key, value) => {
        if (value === undefined) {
          if (key in DEFAULT_SETTINGS) this.plugin.settings[key] = DEFAULT_SETTINGS[key];
          else delete this.plugin.settings[key];
        }
        else this.plugin.settings[key] = value;
        await this.plugin.saveSettings();
      },
      onResetAll: async (keys) => {
        keys.forEach((key) => {
          if (key in DEFAULT_SETTINGS) this.plugin.settings[key] = DEFAULT_SETTINGS[key];
          else delete this.plugin.settings[key];
        });
        await this.plugin.saveSettings();
      },
    };
  }

  private renderPluginBehaviorSettings(parent: HTMLElement) {
    const details = parent.createEl('details', { cls: 'verovio-rendering-settings-group verovio-plugin-behavior-settings' });
    details.dataset.settingsGroup = 'Plugin behavior';
    details.open = true;
    details.createEl('summary', { text: 'Plugin behavior' });

    this.createColorSettingRow(
      details,
      'highlightColor',
      'Highlight color',
      'Hex color used for currently-playing note highlight',
      '#DC143C'
    );
    this.createColorSettingRow(
      details,
      'selectionColor',
      'Selection color',
      'Hex color used for clicked notation elements',
      '#0066FF'
    );
    this.createBooleanSettingRow(
      details,
      'playNoteOnClick',
      'Play note on click',
      'Play the clicked note or chord as a short piano tone'
    );
  }

  private createColorSettingRow(
    parent: HTMLElement,
    key: 'highlightColor' | 'selectionColor',
    label: string,
    tooltip: string,
    fallback: string
  ) {
    const item = parent.createDiv('verovio-rendering-option-item verovio-plugin-color-option');
    item.dataset.optionKey = key;
    item.dataset.optionLabel = label;
    const inputId = `verovio-global-${key}`;
    const labelEl = item.createEl('label', { text: label, attr: { for: inputId } });
    this.attachTooltip(labelEl, tooltip);

    const controls = item.createDiv('verovio-plugin-color-control');
    const colorInput = controls.createEl('input', {
      type: 'color',
      value: this.plugin.settings[key] || fallback,
      attr: { id: inputId },
    });
    this.attachTooltip(colorInput, tooltip);
    const textInput = controls.createEl('input', {
      type: 'text',
      value: this.plugin.settings[key] || fallback,
      attr: { placeholder: fallback, 'aria-label': `${label} hex value` },
    });
    this.attachTooltip(textInput, tooltip);

    const commit = async (value: string) => {
      const nextValue = value || fallback;
      this.plugin.settings[key] = nextValue;
      colorInput.value = nextValue;
      textInput.value = nextValue;
      await this.plugin.saveSettings();
    };
    colorInput.addEventListener('input', () => {
      textInput.value = colorInput.value;
    });
    colorInput.addEventListener('change', () => void commit(colorInput.value));
    textInput.addEventListener('change', () => void commit(textInput.value.trim()));
  }

  private createBooleanSettingRow(
    parent: HTMLElement,
    key: 'playNoteOnClick',
    label: string,
    tooltip: string
  ) {
    const item = parent.createDiv('verovio-rendering-option-item');
    item.dataset.optionKey = key;
    item.dataset.optionLabel = label;
    const inputId = `verovio-global-${key}`;
    const labelEl = item.createEl('label', { text: label, attr: { for: inputId } });
    this.attachTooltip(labelEl, tooltip);

    const checkboxWrapper = item.createEl('label', {
      cls: 'verovio-rendering-option-checkbox-wrap',
      attr: { for: inputId },
    });
    this.attachTooltip(checkboxWrapper, tooltip);
    const input = item.createEl('input', {
      type: 'checkbox',
      cls: 'verovio-rendering-option-checkbox',
      attr: { id: inputId },
    });
    this.attachTooltip(input, tooltip);
    checkboxWrapper.appendChild(input);
    checkboxWrapper.createSpan({ cls: 'verovio-rendering-option-checkbox-box' });
    input.checked = Boolean(this.plugin.settings[key]);
    input.addEventListener('change', () => {
      this.plugin.settings[key] = input.checked;
      void this.plugin.saveSettings();
    });
  }

  private attachTooltip(el: HTMLElement, text: string) {
    setTooltip(el, text, { placement: 'top', delay: 200 });
    el.setAttribute('aria-label', text);
  }
}
