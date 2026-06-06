import { TFile } from 'obsidian';
import type VerovioMusicRenderer from '../main';
import parseVerovioSource from '../verovio/parseVerovioSource';
import { extractCodeBlockBody, resolveCodeBlockRange } from './codeBlockRange';
import { clickMap } from '../rendering/verovioProcessor';

export async function isExternalReferenceBlock(plugin: VerovioMusicRenderer, uid: string): Promise<boolean> {
  const blockText = await readMappedBlockText(plugin, uid);
  const body = extractCodeBlockBody(blockText).trim();
  if (/^https?:\/\//i.test(body.split('\n').find((line) => line.trim()) ?? '')) return true;
  try {
    const parsed = parseVerovioSource(body);
    return /^https?:\/\//i.test(parsed.filePath ?? '');
  } catch {
    return false;
  }
}

export async function readMappedBlockText(plugin: VerovioMusicRenderer, uid: string): Promise<string> {
  const mapping = clickMap[uid];
  if (!mapping) return '';
  const file = plugin.app.vault.getAbstractFileByPath(mapping.filePath);
  if (!(file instanceof TFile)) return '';
  const lines = (await plugin.app.vault.read(file)).split('\n');
  return resolveCodeBlockRange(lines, mapping.startLine, mapping.endLine).text;
}
