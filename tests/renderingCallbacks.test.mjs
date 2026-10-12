import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function loadModule(path, modules, globals = {}) {
  const { outputText } = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  runInNewContext(outputText, {
    exports, Error, ...globals,
    require(name) {
      assert.ok(name in modules, `Unexpected module: ${name}`);
      return modules[name];
    },
  });
  return exports;
}

test('Obsidian receives the rendering promise from the registered code block processor', async () => {
  let callback;
  let complete;
  const rendering = new Promise((resolve) => { complete = resolve; });
  const rendererContexts = [];
  const { default: Plugin } = loadModule('../src/main.ts', {
    obsidian: { Plugin: class {
      app = { workspace: { containerEl: { ownerDocument: {} } } };
      async loadData() { return null; }
      addSettingTab() {}
      registerDomEvent() {}
      registerView() {}
      addCommand() {}
      registerMarkdownCodeBlockProcessor(language, processor) {
        assert.equal(language, 'verovio');
        callback = processor;
      }
    } },
    './rendering/verovioProcessor': { processVerovioCodeBlocks() { rendererContexts.push(this); return rendering; } },
    './rendering/notationShortcuts': {},
    './settings': { DEFAULT_SETTINGS: {}, VerovioSettingTab: class {} },
    './verovio/verovioLoader': { async loadVerovio() {} },
    './editor/musicEditorView': {},
    './pae/paeEditorModal': {},
    './verovio/parseVerovioSource': {},
    './verovio/verovioImport': {},
  });
  const plugin = new Plugin();
  await plugin.onload();
  const result = callback('<mei/>', {}, {});
  assert.equal(result, rendering);
  assert.equal(rendererContexts[0], plugin);
  complete('rendered');
  assert.equal(await result, 'rendered');
});

test('external-opening rejection is reported instead of escaping the toolbar callback', async () => {
  const notices = [];
  let callbacks;
  const plugin = { settings: {} };
  const { processVerovioCodeBlocks } = loadModule('../src/rendering/verovioProcessor.ts', {
    obsidian: { Notice: class { constructor(message) { notices.push(message); } } },
    '../verovio/parseVerovioSource': { default: () => ({ format: 'mei', code: '<mei><note/></mei>', options: {} }) },
    '../playback/midiController': {},
    './svgDownloader': {},
    './externalOpener': { async openFileExternally() {
      assert.equal(this, plugin);
      throw new Error('Source path not found');
    } },
    '../editor/musicEditorView': {},
    './verovioState': { clickMap: {}, instanceStateMap: {}, sourceMap: {} },
    './verovioOptions': { sanitizeVerovioOptions: (value) => value, getHighlightColor() {}, getSelectionColor() {} },
    '../verovio/verovioImport': { async convertInlineCodeToMEI(code) { return code; } },
    './measureRange': { applyMeasureRange() {} },
    './verovioSourceResolver': {},
    '../verovio/verovioToolkit': { resetVerovioToolkitOptions() {} },
    './renderingContainer': { createRenderingContainer(plugin, uid, el, handlers) { callbacks = handlers; return {}; } },
    './verovioSelection': {},
  }, { window: { VerovioToolkit: {
    setOptions() {}, loadData() {}, getMEI: () => '<mei><note/></mei>', getPageCount: () => 1,
  } } });
  await processVerovioCodeBlocks.call(plugin, '<mei/>', {}, {});
  callbacks.openExternal(plugin, 'test-rendering');
  await Promise.resolve();
  assert.deepEqual(notices, ['Could not open file externally: Source path not found']);
});
