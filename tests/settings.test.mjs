import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Obsidian supplies the DOM and setting tab at runtime. Mock those boundaries
// while exercising the actual settings definitions and persistence callbacks.
function createSettingsTab(toolkit, initialSettings = {}, modernApi = true) {
  const inputs = [];
  let saves = 0;
  let updates = 0;
  let legacyOptions;
  const window = { VerovioToolkit: toolkit };
  const obsidian = {
    PluginSettingTab: class {
      containerEl = { empty() {}, createDiv() { return {}; } };
      update() { updates++; }
    },
    Notice: class {},
    requireApiVersion: () => modernApi,
  };
  const optionInputs = {
    createLinkedNumberSlider: (parent, options) => inputs.push(options),
    createRenderingOptionInput: (parent, key, definition, value, resetValue, onChange) => {
      inputs.push({ key, value, resetValue, onChange });
    },
  };
  function compile(path, modules) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    });
    const exports = {};
    runInNewContext(outputText, {
      exports, window,
      require(name) {
        assert.ok(name in modules, `Unexpected module: ${name}`);
        return modules[name];
      },
    });
    return exports;
  }
  const types = compile('../src/rendering/renderingSettingsTypes.ts', { obsidian });
  const controls = compile('../src/rendering/renderingSettingsControls.ts', {
    obsidian, './renderingOptionInputs': optionInputs, './renderingSettingsTypes': types,
  });
  controls.renderVerovioRenderingSettings = (options) => { legacyOptions = options; };
  const { VerovioSettingTab, DEFAULT_SETTINGS } = compile('../src/settings.ts', {
    obsidian,
    './rendering/renderingSettingsControls': controls,
    './rendering/renderingOptionInputs': optionInputs,
    './rendering/renderingSettingsTypes': types,
    './rendering/musicFonts': {},
  });
  const plugin = { settings: { ...DEFAULT_SETTINGS, ...initialSettings }, async saveSettings() { saves++; } };
  const tab = new VerovioSettingTab({}, plugin);
  const rows = () => tab.getSettingDefinitions().flatMap((item) => item.items ?? [item]);
  const row = (key) => rows().find((item) => item.aliases?.includes(key));
  const render = (key) => {
    row(key).render({ settingEl: { empty() {}, addClass() {} } });
    return inputs.at(-1);
  };
  return { tab, plugin, rows, row, render, saves: () => saves, updates: () => updates, legacyOptions: () => legacyOptions };
}

const toolkit = {
  getDefaultOptions: () => ({ scale: 100, pageWidth: 2100, spacingLinear: 0.25, font: 'Bravura' }),
  getAvailableOptions: () => ({ groups: {
    layout: { name: 'Layout', options: {
      pageWidth: { type: 'int', default: 2100 },
      spacingLinear: { type: 'double', title: 'Linear spacing', description: 'Linear spacing factor', default: 0.25 },
      adjustPageHeight: { type: 'bool', title: 'Adjust page height', default: false },
      font: { type: 'std::string', title: 'Font', default: 'Bravura' },
      breaks: { type: 'std::string-list', title: 'Breaks', values: ['auto', 'encoded'], default: 'auto' },
      appXPathQuery: { type: 'std::string' },
      unsupported: { type: 'std::string' },
      commandOnly: { type: 'bool', cmdOnly: true },
    } },
    selectors: { name: 'Element selectors', options: { selector: { type: 'bool' } } },
  } }),
};

test('behavior settings remain searchable when Verovio metadata is unavailable', () => {
  const { rows, row } = createSettingsTab(undefined);
  for (const key of ['highlightColor', 'selectionColor', 'playNoteOnClick']) {
    assert.ok(row(key)?.name);
    assert.ok(row(key)?.desc);
    assert.equal(typeof row(key)?.render, 'function');
  }
  assert.ok(rows().some((item) => item.name === 'Verovio option metadata is not available.' && item.searchable === false));
});

test('search definitions include editable Verovio options and omit hidden options', () => {
  const { row, rows } = createSettingsTab(toolkit);
  for (const key of ['scale', 'pageWidth', 'spacingLinear', 'font', 'breaks', 'adjustPageHeight']) assert.ok(row(key));
  for (const key of ['appXPathQuery', 'unsupported', 'commandOnly', 'selector']) assert.equal(row(key), undefined);
  assert.equal(rows().filter((item) => item.aliases?.includes('pageWidth')).length, 1);
  assert.ok(row('spacingLinear').aliases.includes('Layout'));
  assert.ok(row('spacingLinear').desc.includes('Linear spacing factor'));
});

test('controls use plugin defaults and persist changes and individual resets', async () => {
  const context = createSettingsTab(toolkit);
  const width = context.render('pageWidth');
  assert.equal(width.value, 700);
  assert.equal(width.resetValue, 700);
  await width.onChange('pageWidth', 1200);
  assert.equal(context.plugin.settings.pageWidth, 1200);
  assert.equal(context.render('pageWidth').value, 1200);
  await width.onChange('pageWidth', undefined);
  assert.equal(context.plugin.settings.pageWidth, 700);

  const spacing = context.render('spacingLinear');
  assert.equal(spacing.value, 0.25);
  await spacing.onChange('spacingLinear', 0.5);
  assert.equal(context.plugin.settings.spacingLinear, 0.5);
  await spacing.onChange('spacingLinear', undefined);
  assert.equal('spacingLinear' in context.plugin.settings, false);
  assert.equal(context.saves(), 4);
});

test('reset all affects only exposed rendering settings and refreshes the tab', async () => {
  const context = createSettingsTab(toolkit, {
    pageWidth: 1200, font: 'Bravura', spacingLinear: 0.5,
    highlightColor: '#123456', playNoteOnClick: true, unsupported: 'keep',
  });
  const reset = context.rows().find((item) => item.name === 'Reset global rendering settings');
  let onClick;
  const button = { setButtonText() { return this; }, onClick(callback) { onClick = callback; return this; } };
  reset.render({ addButton(callback) { callback(button); } });
  await onClick();
  assert.equal(context.plugin.settings.pageWidth, 700);
  assert.equal(context.plugin.settings.font, 'Leland');
  assert.equal('spacingLinear' in context.plugin.settings, false);
  assert.equal(context.plugin.settings.highlightColor, '#123456');
  assert.equal(context.plugin.settings.playNoteOnClick, true);
  assert.equal(context.plugin.settings.unsupported, 'keep');
  assert.equal(context.saves(), 1);
  assert.equal(context.updates(), 1);
});

test('legacy display still works without the Obsidian 1.13 API', async () => {
  const context = createSettingsTab(toolkit, {}, false);
  let behaviorRendered = false;
  context.tab.renderPluginBehaviorSettings = () => { behaviorRendered = true; };
  context.tab.display();
  assert.equal(behaviorRendered, true);
  await context.legacyOptions().onChange('pageWidth', 900);
  assert.equal(context.plugin.settings.pageWidth, 900);
  assert.equal(context.saves(), 1);
  assert.equal(context.updates(), 0);
});
