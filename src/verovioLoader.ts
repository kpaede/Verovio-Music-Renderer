import * as verovio from 'verovio';
import * as fs from 'fs';

export async function loadVerovio() {
  if (window.VerovioToolkit) return;

  return new Promise<void>((resolve, reject) => {
    verovio.module.onRuntimeInitialized = () => {
      try {
        window.VerovioToolkit = new verovio.toolkit();
        resolve();
      } catch (error) {
        reject(new Error("Verovio toolkit not correctly loaded."));
      }
    };
  });
}
