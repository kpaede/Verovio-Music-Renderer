import { Notice, setIcon, setTooltip } from 'obsidian';
import type { VerovioOptionValue } from './parseVerovioSource';
import { MUSIC_FALLBACK_FONTS, MUSIC_FONTS } from './musicFonts';

export type RenderingOptionValue = VerovioOptionValue | null | undefined;
export type RenderingSettingValue = VerovioOptionValue | null | undefined;

export interface RenderingOptionDefinition {
  cmdOnly?: boolean;
  default?: RenderingOptionValue | RenderingOptionValue[];
  description?: string;
  max?: number;
  min?: number;
  title?: string;
  type?: string;
  values?: string[];
}

export interface RenderingSettingsOptions {
  parent: HTMLElement;
  title?: string;
  values: Record<string, RenderingSettingValue>;
  fallbackValues: Record<string, RenderingSettingValue>;
  includeMeasureSelection?: boolean;
  resetLabel: string;
  resetNotice: string;
  onChange: (key: string, value: VerovioOptionValue | undefined) => void | Promise<void>;
  onResetAll: (keys: Set<string>) => void | Promise<void>;
}

interface VerovioOptionInput {
  key: string;
  definition: RenderingOptionDefinition;
  input: HTMLInputElement | HTMLSelectElement;
}

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

function formatOptionValue(value: RenderingOptionValue | RenderingOptionValue[]): string {
  if (Array.isArray(value)) return value.join(',');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function formatRenderingOptionTitle(key: string, definition: RenderingOptionDefinition): string {
  const parts = [definition.description || definition.title || key];
  const metadata: string[] = [];
  if (definition.default !== undefined && definition.default !== null) {
    metadata.push(`default: ${formatOptionValue(definition.default)}`);
  }
  if (definition.min !== undefined) metadata.push(`min: ${definition.min}`);
  if (definition.max !== undefined) metadata.push(`max: ${definition.max}`);
  if (definition.values?.length) metadata.push(`values: ${definition.values.join(', ')}`);
  if (metadata.length) parts.push(`(${metadata.join('; ')})`);
  return parts.join(' ');
}

function getRenderingOptionStep(definition: RenderingOptionDefinition): number {
  return definition.type === 'int' ? 1 : 0.05;
}

function clampNumber(value: number, min?: number, max?: number): number {
  let nextValue = value;
  if (min !== undefined) nextValue = Math.max(min, nextValue);
  if (max !== undefined) nextValue = Math.min(max, nextValue);
  return nextValue;
}

function attachTooltip<T extends HTMLElement>(el: T, text: string): T {
  setTooltip(el, text, { placement: 'top', delay: 200 });
  el.setAttribute('aria-label', text);
  return el;
}

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
      .filter(([key, definition]) => shouldShowRenderingOption(key, definition as RenderingOptionDefinition));
    if (!optionEntries.length) return;

    const details = parent.createEl('details', { cls: 'verovio-rendering-settings-group' });
    details.dataset.settingsGroup = group.name;
    if (openedGroupCount < 3) details.open = true;
    openedGroupCount++;
    details.createEl('summary', { text: group.name });

    optionEntries.forEach(([key, rawDefinition]) => {
      const definition = rawDefinition as RenderingOptionDefinition;
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

function createLinkedNumberSlider(
  parent: HTMLElement,
  options: {
    key: string;
    label: string;
    title: string;
    min: number;
    max: number;
    step: number;
    value: number;
    resetValue: number;
    onChange: (key: string, value: VerovioOptionValue | undefined) => void | Promise<void>;
  }
) {
  const item = parent.createDiv('verovio-rendering-option-item verovio-rendering-option-item-slider');
  item.dataset.optionKey = options.key;
  item.dataset.optionLabel = options.label;
  const inputId = `verovio-rendering-option-${options.key}`;
  const labelEl = item.createEl('label', { text: options.label, attr: { for: inputId } });
  attachTooltip(labelEl, options.title);
  const controls = item.createDiv('verovio-rendering-linked-control');
  const numberInput = controls.createEl('input', {
    type: 'number',
    value: String(options.value),
    attr: { id: inputId, min: String(options.min), max: String(options.max), step: String(options.step) },
  });
  attachTooltip(numberInput, options.title);
  const slider = controls.createEl('input', {
    type: 'range',
    value: String(options.value),
    attr: { min: String(options.min), max: String(options.max), step: String(options.step), 'aria-label': `${options.label} slider` },
  });
  attachTooltip(slider, options.title);
  const commit = (rawValue: string) => {
    const value = clampNumber(Number(rawValue), options.min, options.max);
    if (Number.isNaN(value)) return;
    numberInput.value = String(value);
    slider.value = String(value);
    void options.onChange(options.key, value);
  };
  const resetValue = clampNumber(options.resetValue, options.min, options.max);
  const resetTitle = `Reset to global/default (${resetValue})`;
  const resetButton = controls.createEl('button', {
    type: 'button',
    cls: 'clickable-icon verovio-rendering-default-button',
    attr: { 'aria-label': resetTitle },
  });
  attachTooltip(resetButton, resetTitle);
  setIcon(resetButton, 'rotate-ccw');
  resetButton.addEventListener('click', () => {
    numberInput.value = String(resetValue);
    slider.value = String(resetValue);
    void options.onChange(options.key, undefined);
  });
  numberInput.addEventListener('change', () => commit(numberInput.value));
  slider.addEventListener('input', () => {
    numberInput.value = slider.value;
  });
  slider.addEventListener('change', () => commit(slider.value));
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
    attr: { id: 'verovio-rendering-option-measureRange', placeholder: 'e.g. 1-20' },
  });
  attachTooltip(input, tooltip);
  input.addEventListener('change', () => {
    void options.onChange('measureRange', input.value.trim() || undefined);
  });
}

function createRenderingOptionInput(
  parent: HTMLElement,
  key: string,
  definition: RenderingOptionDefinition,
  currentValue: RenderingOptionValue | RenderingOptionValue[],
  resetValue: RenderingOptionValue | RenderingOptionValue[],
  onChange: (key: string, value: VerovioOptionValue | undefined) => void | Promise<void>
): HTMLInputElement | HTMLSelectElement | undefined {
  const item = parent.createDiv('verovio-rendering-option-item');
  item.dataset.optionKey = key;
  item.dataset.optionLabel = definition.title ?? key;
  const inputId = `verovio-rendering-option-${key}`;
  const optionTitle = formatRenderingOptionTitle(key, definition);
  const labelEl = item.createEl('label', { text: definition.title ?? key, attr: { for: inputId } });
  attachTooltip(labelEl, optionTitle);

  if (definition.type === 'bool') {
    const checkboxWrapper = item.createEl('label', { cls: 'verovio-rendering-option-checkbox-wrap', attr: { for: inputId } });
    attachTooltip(checkboxWrapper, optionTitle);
    const input = item.createEl('input', { type: 'checkbox', cls: 'verovio-rendering-option-checkbox', attr: { id: inputId } });
    attachTooltip(input, optionTitle);
    checkboxWrapper.appendChild(input);
    checkboxWrapper.createSpan({ cls: 'verovio-rendering-option-checkbox-box' });
    input.checked = currentValue === true || currentValue === 'true';
    input.addEventListener('change', () => void onChange(key, input.checked));
    return input;
  } else if (key === 'font') {
    const input = item.createEl('select', { attr: { id: inputId } });
    attachTooltip(input, optionTitle);
    MUSIC_FONTS.forEach((font) => input.createEl('option', { text: font, value: font }));
    input.value = String(currentValue || definition.default || MUSIC_FONTS[0]);
    input.addEventListener('change', () => void onChange(key, input.value));
    return input;
  } else if (key === 'fontFallback') {
    const input = item.createEl('select', { attr: { id: inputId } });
    attachTooltip(input, optionTitle);
    MUSIC_FALLBACK_FONTS.forEach((font) => input.createEl('option', { text: font, value: font }));
    input.value = String(currentValue || definition.default || MUSIC_FALLBACK_FONTS[0]);
    input.addEventListener('change', () => void onChange(key, input.value));
    return input;
  } else if (definition.type === 'std::string-list' && definition.values?.length) {
    const input = item.createEl('select', { attr: { id: inputId } });
    attachTooltip(input, optionTitle);
    definition.values.forEach((value: string) => input.createEl('option', { text: value, value }));
    input.value = String(currentValue);
    input.addEventListener('change', () => void onChange(key, input.value));
    return input;
  } else if (definition.type === 'int' || definition.type === 'double') {
    const step = getRenderingOptionStep(definition);
    const fallbackValue = Number(resetValue ?? definition.default ?? definition.min ?? 0);
    const defaultValue = clampNumber(Number.isNaN(fallbackValue) ? Number(definition.min ?? 0) : fallbackValue, definition.min, definition.max);
    const rawValue = Number(currentValue ?? fallbackValue);
    const value = clampNumber(Number.isNaN(rawValue) ? defaultValue : rawValue, definition.min, definition.max);

    if (definition.min !== undefined && definition.max !== undefined) {
      item.addClass('verovio-rendering-option-item-slider');
      const controls = item.createDiv('verovio-rendering-linked-control');
      const input = controls.createEl('input', {
        type: 'number',
        value: String(value),
        attr: { id: inputId, min: String(definition.min), max: String(definition.max), step: String(step) },
      });
      attachTooltip(input, optionTitle);
      const slider = controls.createEl('input', {
        type: 'range',
        value: String(value),
        attr: { min: String(definition.min), max: String(definition.max), step: String(step), 'aria-label': `${definition.title ?? key} slider` },
      });
      attachTooltip(slider, optionTitle);
      const commit = (rawNextValue: string) => {
        const parsedValue = Number(rawNextValue);
        if (Number.isNaN(parsedValue)) {
          void onChange(key, undefined);
          return;
        }
        const nextValue = clampNumber(parsedValue, definition.min, definition.max);
        input.value = String(nextValue);
        slider.value = String(nextValue);
        void onChange(key, nextValue);
      };
      const resetTitle = `Reset to global/default (${defaultValue})`;
      const resetButton = controls.createEl('button', {
        type: 'button',
        cls: 'clickable-icon verovio-rendering-default-button',
        attr: { 'aria-label': resetTitle },
      });
      attachTooltip(resetButton, resetTitle);
      setIcon(resetButton, 'rotate-ccw');
      resetButton.addEventListener('click', () => {
        input.value = String(defaultValue);
        slider.value = String(defaultValue);
        void onChange(key, undefined);
      });
      input.addEventListener('change', () => commit(input.value));
      slider.addEventListener('input', () => {
        input.value = slider.value;
      });
      slider.addEventListener('change', () => commit(slider.value));
      return input;
    }

    const input = item.createEl('input', { type: 'number', value: String(value), attr: { id: inputId, step: String(step) } });
    attachTooltip(input, optionTitle);
    if (definition.min !== undefined) input.min = String(definition.min);
    if (definition.max !== undefined) input.max = String(definition.max);
    input.addEventListener('change', () => {
      const parsedValue = Number(input.value);
      void onChange(key, Number.isNaN(parsedValue) ? undefined : clampNumber(parsedValue, definition.min, definition.max));
    });
    return input;
  }

  const input = item.createEl('input', {
    type: 'text',
    value: Array.isArray(currentValue) ? currentValue.join(',') : String(currentValue ?? ''),
    attr: { id: inputId },
  });
  attachTooltip(input, optionTitle);
  input.addEventListener('change', () => void onChange(key, input.value.trim() || undefined));
  return input;
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
