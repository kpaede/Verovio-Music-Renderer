interface ResettableVerovioToolkit {
  resetOptions(): void;
}

export function resetVerovioToolkitOptions(toolkit?: ResettableVerovioToolkit) {
  (toolkit ?? window.VerovioToolkit).resetOptions();
}
