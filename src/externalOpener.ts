// externalOpener.ts
import { Notice, TFile, Platform } from 'obsidian';
import { sourceMap } from './verovioProcessor';
import type VerovioMusicRenderer from './main';

interface ElectronShell {
  openPath(path: string): Promise<string>;
}

interface ElectronModule {
  shell: ElectronShell;
}

interface FullPathAdapter {
  getFullPath(path: string): string;
}

export async function openFileExternally(this: VerovioMusicRenderer, uniqueId: string) {
  const source = findSourcePathByUniqueId(uniqueId);
  if (!source) throw new Error(`Source path not found for uniqueId: ${uniqueId}`);

  const file = this.app.vault.getAbstractFileByPath(source.trim());
  if (!file || !(file instanceof TFile)) throw new Error(`File not found or not a valid file: ${source}`);

  const absoluteFilePath = (this.app.vault.adapter as typeof this.app.vault.adapter & FullPathAdapter).getFullPath(file.path);

  if (Platform.isDesktop) {
    try {
      const { shell } = await import('electron') as ElectronModule;
      await shell.openPath(absoluteFilePath);  // Open the file with the default application
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error opening file externally: ${message}`);
      new Notice(`Could not open file externally: ${message}`);
    }
  } else {
    new Notice("Opening files externally is not supported on mobile.");
  }
}

function findSourcePathByUniqueId(uniqueId: string): string | undefined {
  return sourceMap[uniqueId];
}
