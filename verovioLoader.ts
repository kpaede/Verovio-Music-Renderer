import createVerovioModule from 'verovio/dist/verovio-toolkit-wasm.js';
import { VerovioToolkit } from 'verovio/dist/verovio-module.mjs';

export async function loadVerovio() {
  if (window.VerovioToolkitLoading || window.VerovioToolkit) return;

  window.VerovioToolkitLoading = true;
  console.log("Loading Verovio toolkit...");

  try {
    const VerovioModule = await createVerovioModule();
    window.VerovioToolkit = new VerovioToolkit(VerovioModule);
    console.log("Verovio has loaded successfully");
    window.VerovioToolkitLoading = false;
  } catch (error) {
    window.VerovioToolkitLoading = false;
    throw new Error(`Error loading Verovio toolkit: ${error.message}`);
  }
}
