import createVerovioModule from 'verovio/wasm';
import { VerovioToolkit } from 'verovio/esm';

function hasCurrentVerovioToolkit(): boolean {
  const version = window.VerovioToolkit?.getVersion?.();
  return typeof version === 'string' && /^6\./.test(version);
}

export async function loadVerovio() {
  if (hasCurrentVerovioToolkit()) return;

  try {
    window.VerovioToolkit?.destroy?.();
    const verovioModule = await createVerovioModule();
    window.VerovioToolkit = new VerovioToolkit(verovioModule);
  } catch {
    throw new Error("Verovio toolkit not correctly loaded.");
  }
}
