declare interface VerovioToolkit {
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
  getVersion?(): string;
  destroy?(): void;
  getTimeForElement?(id: string): number;
  getElementsAtTime(ms: number): VerovioElementsAtTime;
  renderData(data: string, options?: VerovioOptions): string;
  validatePAE?(data: string): VerovioValidation;
}

declare global {
  interface Window {
    VerovioToolkit: VerovioToolkit;
    __verovioDefaultHighlight?: string;
    __verovioHumdrumEnabled?: boolean;
  }
}

type VerovioOptionValue = string | number | boolean | null | undefined;
type VerovioOptions = Record<string, VerovioOptionValue>;

interface VerovioOptionDefinition {
  cmdOnly?: boolean;
  default?: VerovioOptionValue | VerovioOptionValue[];
  description?: string;
  max?: number;
  min?: number;
  title?: string;
  type?: string;
  values?: string[];
}

interface VerovioAvailableOptions {
  groups: Record<string, {
    name: string;
    options: Record<string, VerovioOptionDefinition>;
  }>;
}

interface VerovioTimemap {
  [key: string]: unknown;
}

interface VerovioElementsAtTime {
  page?: number;
  notes?: string[];
  [key: string]: unknown;
}

interface VerovioValidationMessage {
  text?: string;
  column?: number;
  [key: string]: unknown;
}

interface VerovioValidation {
  clef?: VerovioValidationMessage;
  keysig?: VerovioValidationMessage;
  timesig?: VerovioValidationMessage;
  data?: VerovioValidationMessage[];
  [key: string]: VerovioValidationMessage | VerovioValidationMessage[] | undefined;
}

export {};
