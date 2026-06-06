import { Notice } from 'obsidian';
import { createLinkedNumberSlider, createRenderingOptionInput } from './renderingOptionInputs';
import { attachTooltip, type RenderingOptionDefinition, type RenderingSettingsOptions, type VerovioOptionInput } from './renderingSettingsTypes';
export type { RenderingSettingValue } from './renderingSettingsTypes';

export const SETTINGS_SKIP_OPTIONS = new Set([
  'appXPathQuery',
  'engravingDefaults',
  'expand',
  'handwrittenFont',
  'pageWidth',
  'svgAdditionalAttribute',
]);

export const SETTINGS_SKIP_GROUPS = new Set([
  'Base short options',
  'Element selectors',
]);

function shouldShowRenderingOption(key: string, definition: RenderingOptionDefinition): boolean {
  if (definition.cmdOnly || SETTINGS_SKIP_OPTIONS.has(key)) return false;
  if (definition.type === 'std::string') return key === 'font';
  return ['bool', 'int', 'double', 'std::string-list'].includes(definition.type ?? '');
}

export function renderVerovioRenderingSettings(options: RenderingSettingsOptions) {
  const { parent } = options;
  parent.empty();
  if (options.title) parent.createEl('h2', { text: options.title });

  if (!window.VerovioToolkit?.getAvailableOptions || !window.VerovioToolkit?.getDefaultOptions) {
    parent.createEl('p', {
      cls: 'verovio-editor-placeholder',
      text: 'Verovio option metadata is not available.',
    });
    return;
  }

  const availableOptions = window.VerovioToolkit.getAvailableOptions();
  const optionInputs: VerovioOptionInput[] = [];

  const controls = parent.createDiv('verovio-rendering-settings-controls');
  const filterInput = controls.createEl('input', {
    type: 'search',
    attr: {
      placeholder: 'Filter settings',
      'aria-label': 'Filter rendering settings',
    },
  });
  filterInput.addEventListener('input', () => filterRenderingSettings(parent, filterInput.value));
  const resetButton = controls.createEl('button', { text: options.resetLabel, type: 'button' });
  resetButton.addEventListener('click', () => {
    const knownKeys = collectRenderingOptionKeys(optionInputs, options.includeMeasureSelection);
    void Promise.resolve(options.onResetAll(knownKeys)).then(() => {
      renderVerovioRenderingSettings(options);
      new Notice(options.resetNotice);
    });
  });

  if (options.includeMeasureSelection) createMeasureRangeSettingsGroup(parent, options);
  createCommonRenderingSettingsGroup(parent, options);

  let openedGroupCount = 0;
  Object.keys(availableOptions.groups).forEach((groupKey) => {
    const group = availableOptions.groups[groupKey];
    if (SETTINGS_SKIP_GROUPS.has(group.name)) return;
    const optionEntries = Object.entries(group.options)
      .filter(([key, definition]) => shouldShowRenderingOption(key, definition));
    if (!optionEntries.length) return;

    const details = parent.createEl('details', { cls: 'verovio-rendering-settings-group' });
    details.dataset.settingsGroup = group.name;
    if (openedGroupCount < 3) details.open = true;
    openedGroupCount++;
    details.createEl('summary', { text: group.name });

    optionEntries.forEach(([key, definition]) => {
      const currentValue = options.values[key] ?? options.fallbackValues[key] ?? definition.default ?? '';
      const input = createRenderingOptionInput(details, key, definition, currentValue, options.fallbackValues[key] ?? definition.default, options.onChange);
      if (input) optionInputs.push({ key, definition, input });
    });
  });
}

function collectRenderingOptionKeys(optionInputs: VerovioOptionInput[], includeMeasureSelection?: boolean): Set<string> {
  const knownKeys = new Set<string>(['pageWidth', 'scale']);
  if (includeMeasureSelection) knownKeys.add('measureRange');
  optionInputs.forEach(({ key }) => knownKeys.add(key));
  return knownKeys;
}

function createCommonRenderingSettingsGroup(parent: HTMLElement, options: RenderingSettingsOptions) {
  const details = parent.createEl('details', { cls: 'verovio-rendering-settings-group' });
  details.dataset.settingsGroup = 'Common rendering settings';
  details.open = true;
  details.createEl('summary', { text: 'Common rendering settings' });

  createLinkedNumberSlider(details, {
    key: 'scale',
    label: 'Scale (%)',
    title: 'Scale of the output in percent. 100 is normal size; values above 100 enlarge the notation. (default: 100; min: 1; max: 1000)',
    min: 1,
    max: 1000,
    step: 1,
    value: Number(options.values.scale ?? options.fallbackValues.scale ?? 100),
    resetValue: Number(options.fallbackValues.scale ?? 100),
    onChange: options.onChange,
  });
  createLinkedNumberSlider(details, {
    key: 'pageWidth',
    label: 'Page width',
    title: 'The page width. Larger values fit more music into one system; smaller values wrap earlier. (default: 2100; min: 100; max: 100000)',
    min: 100,
    max: 100000,
    step: 50,
    value: Number(options.values.pageWidth ?? options.fallbackValues.pageWidth ?? 2100),
    resetValue: Number(options.fallbackValues.pageWidth ?? 2100),
    onChange: options.onChange,
  });
}

function createMeasureRangeSettingsGroup(parent: HTMLElement, options: RenderingSettingsOptions) {
  const details = parent.createEl('details', { cls: 'verovio-rendering-settings-group' });
  details.dataset.settingsGroup = 'Measure selection';
  details.open = true;
  details.createEl('summary', { text: 'Measure selection' });
  const item = details.createDiv('verovio-rendering-option-item');
  item.dataset.optionKey = 'measureRange';
  item.dataset.optionLabel = 'Measure range';
  const tooltip = 'Render a measure selection, e.g. 1-20, 5, 2-end, or 15-end.';
  const labelEl = item.createEl('label', { text: 'Measure range', attr: { for: 'verovio-rendering-option-measureRange' } });
  attachTooltip(labelEl, tooltip);
  const input = item.createEl('input', {
    type: 'text',
    value: String(options.values.measureRange ?? ''),
    attr: { id: 'verovio-rendering-option-measureRange', placeholder: 'E.g. 1-20' },
  });
  attachTooltip(input, tooltip);
  input.addEventListener('change', () => {
    void options.onChange('measureRange', input.value.trim() || undefined);
  });
}

function filterRenderingSettings(parent: HTMLElement, query: string) {
  const needle = query.trim().toLowerCase();
  parent.querySelectorAll<HTMLElement>('.verovio-rendering-option-item').forEach((item) => {
    const haystack = `${item.dataset.optionKey ?? ''} ${item.dataset.optionLabel ?? ''}`.toLowerCase();
    item.toggle(!needle || haystack.includes(needle));
  });
  parent.querySelectorAll<HTMLDetailsElement>('.verovio-rendering-settings-group').forEach((group) => {
    const visibleItems = group.querySelectorAll<HTMLElement>('.verovio-rendering-option-item:not([style*="display: none"])');
    const groupMatches = (group.dataset.settingsGroup ?? '').toLowerCase().includes(needle);
    group.toggle(!needle || groupMatches || visibleItems.length > 0);
    if (needle && (groupMatches || visibleItems.length > 0)) group.open = true;
  });
}
