declare module 'verovio' {
  interface VerovioModule {
    module: {
      onRuntimeInitialized: () => void;
    };
    toolkit: new () => VerovioToolkit;
  }

  const verovio: VerovioModule;
  export = verovio;
}
