import * as verovio from 'verovio';
import * as fs from 'fs';

export async function loadVerovio() {
  if (window.VerovioToolkit) return;

  console.log("Loading Verovio toolkit...");

  return new Promise<void>((resolve, reject) => {
    verovio.module.onRuntimeInitialized = () => {
      try {
        window.VerovioToolkit = new verovio.toolkit();
        console.log("Verovio has loaded successfully");
        resolve();
      } catch (error) {
        console.error("Error initializing Verovio toolkit:", error);
        reject(new Error("Verovio toolkit not correctly loaded."));
      }
    };
  });
}
