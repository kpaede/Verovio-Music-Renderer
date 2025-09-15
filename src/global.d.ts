declare interface VerovioToolkit {
  setOptions(options: Record<string, any>): void;
  loadData(data: string): void;
  redoLayout(): void;
  select(opts: Record<string, any>): void;
  renderToSVG(page?: number): string;
  renderToMIDI(): string | null;
  renderToTimemap(opts?: any): any;
  getMEI(): string;
  getPageCount(): number;
  getElementsAtTime(ms: number): any;
  renderData(data: string, options?: any): string;
}

declare global {
  interface Window {
    VerovioToolkit: VerovioToolkit;
  }
}

export {};
