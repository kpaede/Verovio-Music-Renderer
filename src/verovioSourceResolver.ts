import { normalizePath, requestUrl, TFile } from 'obsidian';
import type VerovioMusicRenderer from './main';

/**
 * Fetch MEI data from a file path (local vault) or external URL.
 * Network requests are triggered on-demand only when the user explicitly provides an external URL.
 * No automatic polling, periodic updates, or background data transmission occurs.
 */
export async function fetchMEIData(plugin: VerovioMusicRenderer, path: string, sourcePath?: string): Promise<{ text: string; vaultPath?: string }> {
  if (/^https?:\/\//.test(path)) {
    const res = await requestUrl({ url: path });
    if (res.status !== 200) throw new Error(`Failed to fetch ${path}: HTTP ${res.status}`);
    return { text: String(res.text) };
  }
  const file = resolveVaultFile(plugin, path, sourcePath);
  if (!(file instanceof TFile)) throw new Error(`File not found: ${path}`);
  return {
    text: await plugin.app.vault.read(file),
    vaultPath: file.path,
  };
}

function resolveVaultFile(plugin: VerovioMusicRenderer, path: string, sourcePath?: string): TFile | null {
  const cleanPath = stripObsidianLink(path.trim());
  const decodedPath = decodePath(cleanPath);
  const candidates = new Set<string>([cleanPath, decodedPath]);

  if (sourcePath) {
    const sourceDir = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : '';
    for (const candidate of Array.from(candidates)) {
      if (!candidate.startsWith('/') && !candidate.startsWith('./') && !candidate.startsWith('../')) {
        candidates.add(normalizePath(sourceDir ? `${sourceDir}/${candidate}` : candidate));
      } else {
        candidates.add(normalizePath(sourceDir ? `${sourceDir}/${candidate}` : candidate));
      }
    }
  }

  for (const candidate of candidates) {
    const file = plugin.app.vault.getAbstractFileByPath(normalizePath(candidate));
    if (file instanceof TFile) return file;
  }

  const linked = plugin.app.metadataCache.getFirstLinkpathDest(decodedPath, sourcePath || '');
  return linked instanceof TFile ? linked : null;
}

function stripObsidianLink(path: string): string {
  const wikiLink = path.match(/^\[\[([^|\]]+)(?:\|[^\]]+)?\]\]$/);
  if (wikiLink) return wikiLink[1].trim();

  const markdownLink = path.match(/^\[[^\]]+\]\(([^)]+)\)$/);
  if (markdownLink) return markdownLink[1].trim();

  return path;
}

function decodePath(path: string): string {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}
