import * as verovio from 'verovio';

export async function loadVerovio() {
  if (window.VerovioToolkit) return;

  return new Promise<void>((resolve, reject) => {
    verovio.module.onRuntimeInitialized = () => {
      try {
        window.VerovioToolkit = new verovio.toolkit();
        resolve();
      } catch {
        reject(new Error("Verovio toolkit not correctly loaded."));
      }
    };
  });
}
