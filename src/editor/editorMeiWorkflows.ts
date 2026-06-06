import { EditorView as CMEditorView } from '@codemirror/view';
import { Notice } from 'obsidian';
import type VerovioMusicRenderer from '../main';
import parseVerovioSource from '../verovio/parseVerovioSource';
import { convertInlineCodeToMEI } from '../verovio/verovioImport';
import { instanceStateMap, updateSVG } from '../rendering/verovioProcessor';
import { applyMeiEditorCommand } from './mei/meiEditorOperations';
import { extractCodeBlockBody, replaceCodeBlockBody } from './codeBlockRange';
import { splitNotationAndOptions } from './editorCodeblockOptions';
import { confirmConvertToMei } from './convertToMeiModal';
import type { SingleEditorTab } from './editorToolbar';

export function runMeiEditorCommand(options: {
  activeCombinedTab: string;
  currentBlockEditor?: CMEditorView;
  currentEditor?: CMEditorView;
  currentFileEditor?: CMEditorView;
  currentUid?: string;
  editMode: string;
  jumpToXmlId: (elementId: string, editor?: CMEditorView) => void;
  plugin: VerovioMusicRenderer;
  commandId: string;
}): boolean {
  const editor = options.editMode === 'combined'
    ? (options.activeCombinedTab === 'block' ? options.currentBlockEditor : options.currentFileEditor)
    : options.currentEditor;
  const uid = options.currentUid;
  if (!editor || !uid) {
    new Notice('Open a MEI editor before running this command.');
    return true;
  }

  const selectedIds = instanceStateMap[uid]?.selectedElementIds ?? [];
  const currentText = editor.state.doc.toString();
  const useCodeBlockEnvelope = options.editMode === 'block' || (options.editMode === 'combined' && options.activeCombinedTab === 'block');
  const editableMei = useCodeBlockEnvelope ? extractCodeBlockBody(currentText) : currentText;
  const result = applyMeiEditorCommand(options.commandId, editableMei, selectedIds);
  if (!result.changed) {
    if (result.message) new Notice(result.message);
    return true;
  }
  const nextText = useCodeBlockEnvelope ? replaceCodeBlockBody(currentText, result.text) : result.text;

  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: nextText },
  });

  if (options.commandId === 'delete' && instanceStateMap[uid]) {
    instanceStateMap[uid].selectedElementIds = [];
    instanceStateMap[uid].lastSelectedElementId = undefined;
  }

  const lastSelected = options.commandId === 'delete'
    ? undefined
    : instanceStateMap[uid]?.lastSelectedElementId ?? selectedIds.at(-1);
  if (lastSelected) options.jumpToXmlId(lastSelected, editor);
  if (useCodeBlockEnvelope && instanceStateMap[uid]) {
    instanceStateMap[uid].meiData = result.text;
    updateRenderedSvgForUid(options.plugin, uid);
  }
  new Notice('MEI updated.');
  return true;
}

export async function convertCurrentBlockToMei(options: {
  currentBlockEditor?: CMEditorView;
  currentEditor?: CMEditorView;
  currentUid?: string;
  editMode: string;
  plugin: VerovioMusicRenderer;
  setToolbarDisabled: (tab: SingleEditorTab, disabled: boolean) => void;
}) {
  const editor = options.editMode === 'combined' ? options.currentBlockEditor : options.currentEditor;
  const uid = options.currentUid;
  if (!editor) return;
  if (!window.VerovioToolkit) {
    new Notice('Verovio toolkit is not loaded.');
    return;
  }

  const currentText = editor.state.doc.toString();
  const body = extractCodeBlockBody(currentText);
  const parsed = parseVerovioSource(body);
  if (!parsed.code) {
    new Notice('Only inline notation codeblocks can be converted to MEI.');
    return;
  }
  if (parsed.format === 'mei') {
    new Notice('This codeblock is already MEI.');
    return;
  }
  const confirmed = await confirmConvertToMei(options.plugin.app, parsed.format);
  if (!confirmed) return;

  const { notation, optionsText } = splitNotationAndOptions(body);
  const mei = (await convertInlineCodeToMEI(notation, parsed.format, parsed.options)).trim();
  if (!mei) {
    new Notice(`Could not convert ${parsed.format} to MEI.`);
    return;
  }

  const nextBody = optionsText ? `${mei}\n${optionsText}` : mei;
  const nextText = replaceCodeBlockBody(currentText, nextBody);
  editor.dispatch({
    changes: { from: 0, to: editor.state.doc.length, insert: nextText },
  });

  if (uid && instanceStateMap[uid]) {
    instanceStateMap[uid].meiData = mei;
    instanceStateMap[uid].options = { ...instanceStateMap[uid].options, inputFrom: 'mei' };
    updateRenderedSvgForUid(options.plugin, uid);
  }

  options.setToolbarDisabled('edit', false);
  options.setToolbarDisabled('insert', false);
  options.setToolbarDisabled('convert', true);
  new Notice('Codeblock converted to MEI.');
}

function updateRenderedSvgForUid(plugin: VerovioMusicRenderer, uid: string) {
  const wrapper = plugin.app.workspace.containerEl.ownerDocument.querySelector<HTMLElement>(
    `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
  );
  if (wrapper) updateSVG(uid, wrapper);
}
