// externalOpener.ts
import { Notice, TFile, Platform } from 'obsidian';
import { sourceMap } from './verovioProcessor';

export async function openFileExternally(this: any, uniqueId: string) {
  const source = findSourcePathByUniqueId(uniqueId);
  if (!source) throw new Error(`Source path not found for uniqueId: ${uniqueId}`);

  const file = this.app.vault.getAbstractFileByPath(source.trim());
  if (!file || !(file instanceof TFile)) throw new Error(`File not found or not a valid file: ${source}`);

  const absoluteFilePath = this.app.vault.adapter.getFullPath(file.path);

  if (Platform.isDesktop) {
    try {
      const { shell } = require('electron');
      await shell.openPath(absoluteFilePath);  // Open the file with the default application
    } catch (error: any) {
      console.error(`Error opening file externally: ${error.message}`);
      new Notice(`Could not open file externally: ${error.message}`);
    }
  } else {
    new Notice("Opening files externally is not supported on mobile.");
  }
}

function findSourcePathByUniqueId(uniqueId: string): string | undefined {
  return sourceMap[uniqueId];
}
