import { Notice, TFile } from 'obsidian';
import type VerovioMusicRenderer from '../main';
import { clickMap, instanceStateMap, sourceMap } from '../rendering/verovioProcessor';
import { resolveCodeBlockRange } from './codeBlockRange';

export async function loadBlockSource(plugin: VerovioMusicRenderer, uid: string) {
  const mapping = clickMap[uid];
  if (!mapping) {
    new Notice('Attachment not found.');
    return undefined;
  }

  const { filePath, startLine, endLine } = mapping;
  const file = plugin.app.vault.getAbstractFileByPath(filePath);
  if (!(file instanceof TFile)) {
    new Notice(`File not found.: ${filePath}`);
    return undefined;
  }

  const content = await plugin.app.vault.read(file);
  const lines = content.split('\n');
  const range = resolveCodeBlockRange(lines, startLine, endLine);
  return { file, lines, range };
}

export async function loadFileSource(plugin: VerovioMusicRenderer, path: string) {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) {
    new Notice(`File not found.: ${path}`);
    return undefined;
  }

  const content = await plugin.app.vault.read(file);
  const lines = content.split('\n');
  return { content, file, lines };
}

export async function loadCombinedSource(plugin: VerovioMusicRenderer, uid: string) {
  const mapping = clickMap[uid];
  const path = sourceMap[uid];
  if (!mapping || !path) {
    new Notice('Attachment not found.');
    return undefined;
  }

  const blockFile = plugin.app.vault.getAbstractFileByPath(mapping.filePath);
  if (!(blockFile instanceof TFile)) {
    new Notice(`File not found.: ${mapping.filePath}`);
    return undefined;
  }

  const targetFile = plugin.app.vault.getAbstractFileByPath(path);
  if (!(targetFile instanceof TFile)) {
    new Notice(`File not found.: ${path}`);
    return undefined;
  }

  const blockContent = await plugin.app.vault.read(blockFile);
  const fileContent = await plugin.app.vault.read(targetFile);
  const blockLines = blockContent.split('\n');
  const range = resolveCodeBlockRange(blockLines, mapping.startLine, mapping.endLine);
  return { blockFile, blockLines, fileContent, path, range, targetFile };
}

export async function loadExternalCombinedSource(plugin: VerovioMusicRenderer, uid: string) {
  const block = await loadBlockSource(plugin, uid);
  if (!block) return undefined;
  return {
    ...block,
    remoteText: instanceStateMap[uid]?.meiData ?? '',
  };
}
