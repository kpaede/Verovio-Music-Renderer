declare module 'verovio/wasm' {
  export default function createVerovioModule(): Promise<unknown>;
}

declare module 'verovio/wasm-hum' {
  export default function createVerovioModule(): Promise<unknown>;
}

declare module 'verovio/esm' {
  export class VerovioToolkit {
    constructor(module: unknown);
    setOptions(options: VerovioOptions): void;
    loadData(data: string): void;
    redoLayout(): void;
    select(opts: VerovioOptions): void;
    renderToSVG(page?: number): string;
    renderToMIDI(): string | null;
    renderToTimemap(opts?: VerovioOptions): VerovioTimemap;
    getMEI(): string;
    getAvailableOptions(): VerovioAvailableOptions;
    getDefaultOptions(): VerovioOptions;
    getOptions(defaultValues?: boolean): VerovioOptions;
    getPageCount(): number;
    getVersion(): string;
    destroy(): void;
    getTimeForElement(id: string): number;
    getElementsAtTime(ms: number): VerovioElementsAtTime;
    renderData(data: string, options?: VerovioOptions): string;
    validatePAE?(data: string): VerovioValidation;
  }
}
