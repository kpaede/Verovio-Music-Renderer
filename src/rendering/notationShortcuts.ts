import { Notice, TFile } from 'obsidian';
import type VerovioMusicRenderer from '../main';
import parseVerovioSource from '../verovio/parseVerovioSource';
import { findMenuItemByKeyboardEvent } from '../editor/mei/meiEditorMenus';
import { applyMeiEditorCommand } from '../editor/mei/meiEditorOperations';
import { extractCodeBlockBody, replaceCodeBlockBody, resolveCodeBlockRange } from '../editor/codeBlockRange';
import { clickMap, instanceStateMap, sourceMap } from './verovioState';
import { clearNotationSelection, getActiveSelectedUid } from './verovioSelection';
import { refreshRenderingsForSource, updateSVG } from './verovioProcessor';

export function handleVerovioNotationShortcut(plugin: VerovioMusicRenderer, event: KeyboardEvent) {
  if (isShortcutBlockedTarget(event.target)) return;

  const uid = getActiveSelectedUid(plugin);
  if (!uid) return;

  const item = findMenuItemByKeyboardEvent(event);
  if (!item) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  void applyShortcutCommandToSource(plugin, uid, item.id);
}

export function handleVerovioGlobalPointerDown(plugin: VerovioMusicRenderer, event: PointerEvent) {
  if (!(event.target instanceof HTMLElement)) return;
  if (isPluginInteractionTarget(event.target)) return;
  clearNotationSelection(plugin);
}

function isShortcutBlockedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest('input,textarea,select,.verovio-music-editor-content .cm-editor,.modal'));
}

function isPluginInteractionTarget(target: HTMLElement): boolean {
  return Boolean(target.closest('.verovio-container,.verovio-music-editor-content,.verovio-mei-menu-dropdown,.modal'));
}

async function applyShortcutCommandToSource(plugin: VerovioMusicRenderer, uid: string, commandId: string) {
  const st = instanceStateMap[uid];
  if (!st?.selectedElementIds.length) return;

  const sourcePath = sourceMap[uid];
  if (sourcePath) {
    if (!sourcePath.toLowerCase().endsWith('.mei')) {
      new Notice('Edit operations require MEI. Convert inline notation to MEI first.');
      return;
    }
    const file = plugin.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) {
      new Notice(`File not found.: ${sourcePath}`);
      return;
    }

    const currentText = await plugin.app.vault.read(file);
    const result = applyMeiEditorCommand(commandId, currentText, st.selectedElementIds);
    if (!result.changed) {
      if (result.message) new Notice(result.message);
      return;
    }

    await plugin.app.vault.modify(file, result.text);
    refreshRenderingsForSource(sourcePath, result.text);
    new Notice('MEI updated.');
    return;
  }

  const mapping = clickMap[uid];
  if (!mapping) {
    new Notice('Open a MEI editor or use a vault MEI file for this shortcut.');
    return;
  }

  const file = plugin.app.vault.getAbstractFileByPath(mapping.filePath);
  if (!(file instanceof TFile)) {
    new Notice(`File not found.: ${mapping.filePath}`);
    return;
  }

  const fileText = await plugin.app.vault.read(file);
  const lines = fileText.split('\n');
  const blockRange = resolveCodeBlockRange(lines, mapping.startLine, mapping.endLine);
  const blockText = blockRange.text;
  if (isExternalReferenceBlockText(blockText)) {
    new Notice('External url content is read-only.');
    return;
  }
  if (!isEditableMeiBlockText(blockText)) {
    new Notice('Edit operations require MEI. Convert this codeblock to MEI first.');
    return;
  }
  const meiText = extractCodeBlockBody(blockText);
  const result = applyMeiEditorCommand(commandId, meiText, st.selectedElementIds);
  if (!result.changed) {
    if (result.message) new Notice(result.message);
    return;
  }

  const replacement = replaceCodeBlockBody(blockText, result.text);
  const merged = [
    ...lines.slice(0, blockRange.startLine),
    ...replacement.split('\n'),
    ...lines.slice(blockRange.endLineExclusive),
  ];
  await plugin.app.vault.modify(file, merged.join('\n'));
  st.meiData = result.text;
  if (commandId === 'delete') {
    st.selectedElementIds = [];
    st.lastSelectedElementId = undefined;
  }
  const wrapper = plugin.app.workspace.containerEl.ownerDocument.querySelector<HTMLElement>(
    `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
  );
  if (wrapper) updateSVG(uid, wrapper);
  new Notice('MEI updated.');
}

function isExternalReferenceBlockText(blockText: string): boolean {
  const body = extractCodeBlockBody(blockText).trim();
  if (/^https?:\/\//i.test(body.split('\n').find((line) => line.trim()) ?? '')) return true;
  try {
    return /^https?:\/\//i.test(parseVerovioSource(body).filePath ?? '');
  } catch {
    return false;
  }
}

function isEditableMeiBlockText(blockText: string): boolean {
  const body = extractCodeBlockBody(blockText).trim();
  try {
    const parsed = parseVerovioSource(body);
    return parsed.code !== undefined && parsed.format === 'mei';
  } catch {
    return /<mei(?:\s|>)/i.test(body);
  }
}
