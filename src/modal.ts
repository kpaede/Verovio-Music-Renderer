import { App, Modal, Notice, setIcon } from 'obsidian';

type InsertCallback = (codeBlock: string) => void;

interface PianoKey {
  pitch: string;
  octave: number;
  alteration: -1 | 0 | 1;
  midi: number;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

const CLEFS = [
  ['G-1', 'G-1'],
  ['G-2', 'G-2 (treble)'],
  ['C-1', 'C-1'],
  ['C-2', 'C-2'],
  ['C-3', 'C-3'],
  ['C-4', 'C-4'],
  ['C-5', 'C-5'],
  ['F-4', 'F-4 (bass)'],
  ['C+1', 'C+1 (mensural)'],
  ['C+2', 'C+2 (mensural)'],
  ['C+3', 'C+3 (mensural)'],
  ['C+4', 'C+4 (mensural)'],
  ['C+5', 'C+5 (mensural)'],
];

const KEYSIGS = [
  ['', 'Key signature ...'],
  ['xF', '1 ♯'],
  ['xFC', '2 ♯'],
  ['xFCG', '3 ♯'],
  ['xFCGD', '4 ♯'],
  ['xFCGDA', '5 ♯'],
  ['xFCGDAE', '6 ♯'],
  ['xFCGDAEB', '7 ♯'],
  ['bB', '1 ♭'],
  ['bBE', '2 ♭'],
  ['bBEA', '3 ♭'],
  ['bBEAD', '4 ♭'],
  ['bBEADG', '5 ♭'],
  ['bBEADGC', '6 ♭'],
  ['bBEADGCF', '7 ♭'],
];

const DURATIONS = [
  { value: 9, label: 'Long' },
  { value: 1, label: 'Whole note' },
  { value: 2, label: 'Half note' },
  { value: 4, label: 'Quarter note' },
  { value: 8, label: 'Eighth note' },
  { value: 6, label: 'Sixteenth note' },
  { value: 3, label: 'Thirty-second note' },
  { value: 5, label: 'Sixty-fourth note' },
];

const WHITE_KEYS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SHARP_KEYS = [
  { pitch: 'C', x: 17, midiOffset: 1 },
  { pitch: 'D', x: 42, midiOffset: 3 },
  { pitch: 'F', x: 92, midiOffset: 6 },
  { pitch: 'G', x: 117, midiOffset: 8 },
  { pitch: 'A', x: 142, midiOffset: 10 },
];
const FLAT_KEYS = [
  { pitch: 'D', x: 17, midiOffset: 1 },
  { pitch: 'E', x: 42, midiOffset: 3 },
  { pitch: 'G', x: 92, midiOffset: 6 },
  { pitch: 'A', x: 117, midiOffset: 8 },
  { pitch: 'B', x: 142, midiOffset: 10 },
];

function buildPianoKeys(): PianoKey[] {
  const keys: PianoKey[] = [];
  [1, 2, 3].forEach((octave, octaveIndex) => {
    const baseX = octaveIndex * 175;
    const baseMidi = 60 + octaveIndex * 12;
    WHITE_KEYS.forEach((pitch, index) => {
      keys.push({
        pitch,
        octave,
        alteration: 0,
        midi: baseMidi + [0, 2, 4, 5, 7, 9, 11][index],
        x: baseX + index * 25,
        y: 3,
        width: 25,
        height: 149,
        label: pitch,
      });
    });
    SHARP_KEYS.forEach((key) => {
      keys.push({
        pitch: key.pitch,
        octave,
        alteration: 1,
        midi: baseMidi + key.midiOffset,
        x: baseX + key.x,
        y: 3,
        width: 15,
        height: 49,
      });
    });
    FLAT_KEYS.forEach((key) => {
      keys.push({
        pitch: key.pitch,
        octave,
        alteration: -1,
        midi: baseMidi + key.midiOffset,
        x: baseX + key.x,
        y: 53,
        width: 15,
        height: 49,
      });
    });
  });
  return keys;
}

export class VerovioModal extends Modal {
  private clefSelect!: HTMLSelectElement;
  private keysigSelect!: HTMLSelectElement;
  private timesigInput!: HTMLInputElement;
  private paeInput!: HTMLTextAreaElement;
  private previewEl!: HTMLElement;
  private warningEl!: HTMLElement;
  private durationButtonsEl!: HTMLElement;
  private duration = 4;
  private dotted = false;
  private currentOctave = -1;
  private undos: string[] = [];

  constructor(app: App, private readonly onInsert: InsertCallback) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('verovio-pae-modal');
    contentEl.addEventListener('keydown', (event) => this.onShortcut(event));

    contentEl.createEl('h2', { text: 'Plaine & Easie Code Editor' });

    this.durationButtonsEl = contentEl.createDiv('verovio-pae-toolbar');
    this.createDurationButtons(this.durationButtonsEl);
    this.createToolbarButton(this.durationButtonsEl, this.renderToolbarGlyph('4-/', 'rest'), 'Add rest', () => this.onRest(), 'verovio-pae-rest-button');
    this.createToolbarButton(this.durationButtonsEl, '.', 'Toggle dot', () => this.onDot(), 'verovio-pae-dot-button');
    this.createToolbarButton(this.durationButtonsEl, '|', 'Add barline', () => this.onBarline(), 'verovio-pae-barline-button');
    this.createIconButton(this.durationButtonsEl, 'undo-2', 'Undo', () => this.onUndo());
    this.createIconButton(this.durationButtonsEl, 'trash-2', 'Clear', () => this.clearIncipit());

    const keyboardScroller = contentEl.createDiv('verovio-pae-keyboard-scroll');
    this.createPianoKeyboard(keyboardScroller);

    this.clefSelect = this.createSelect(contentEl, CLEFS, 'G-2');
    this.keysigSelect = this.createSelect(contentEl, KEYSIGS, '');
    this.timesigInput = contentEl.createEl('input', {
      type: 'text',
      cls: 'verovio-pae-field',
      attr: { placeholder: 'Time signature (e.g. c c/ 3/4)' },
    });
    this.timesigInput.addEventListener('input', () => this.updatePreview());

    this.paeInput = contentEl.createEl('textarea', {
      cls: 'verovio-pae-input',
      attr: { placeholder: 'Plaine & Easie code ...' },
    });
    this.paeInput.addEventListener('input', () => {
      if (this.paeInput.value === '') this.currentOctave = -1;
      this.updatePreview();
    });

    this.warningEl = contentEl.createDiv('verovio-pae-warning');
    this.previewEl = contentEl.createDiv('verovio-pae-preview');

    const actions = contentEl.createDiv('verovio-pae-actions');
    const cancelButton = actions.createEl('button', { text: 'Cancel', type: 'button' });
    cancelButton.addEventListener('click', () => this.close());
    const insertButton = actions.createEl('button', {
      text: 'Insert PAE codeblock',
      type: 'button',
      cls: 'mod-cta',
    });
    insertButton.addEventListener('click', () => this.insertCodeBlock());

    this.updateDurationButtons();
    this.updatePreview();
  }

  onClose() {
    this.contentEl.empty();
  }

  private createSelect(parent: HTMLElement, options: string[][], value: string): HTMLSelectElement {
    const select = parent.createEl('select', { cls: 'verovio-pae-field' });
    options.forEach(([optionValue, optionLabel]) => {
      select.createEl('option', { text: optionLabel, value: optionValue });
    });
    select.value = value;
    select.addEventListener('change', () => this.updatePreview());
    return select;
  }

  private createDurationButtons(parent: HTMLElement) {
    const group = parent.createDiv('verovio-pae-button-group');
    DURATIONS.forEach(({ value, label }) => {
      const button = group.createEl('button', {
        type: 'button',
        cls: 'verovio-pae-duration-button',
        attr: { 'aria-label': label },
      });
      button.innerHTML = this.renderToolbarGlyph(`${value}C/`, 'note') || String(value);
      button.dataset.duration = String(value);
      button.addEventListener('click', () => this.onDuration(value));
    });
  }

  private renderToolbarGlyph(data: string, className: 'note' | 'rest' | 'barLine'): string {
    if (!window.VerovioToolkit) return '';

    const pae = [
      '@clef:G-2',
      '@keysig:',
      '@key:',
      '@timesig:',
      `@data: ${data}`,
      '',
    ].join('\n');

    try {
      const rendered = window.VerovioToolkit.renderData(pae, {
        inputFrom: 'pae',
        scale: 50,
        adjustPageHeight: 1,
        pageWidth: 600,
        pageMarginTop: 0,
        pageMarginBottom: 0,
        pageMarginLeft: 0,
        pageMarginRight: 0,
        spacingStaff: 2,
        xmlIdSeed: 1,
      });
      const doc = new DOMParser().parseFromString(rendered, 'image/svg+xml');
      const defs = doc.querySelector('defs')?.innerHTML ?? '';
      const glyph = doc.querySelector<SVGGElement>(`g.${className}`);
      if (!glyph) return '';
      const viewBox = className === 'barLine'
        ? '1200 160 520 900'
        : className === 'rest'
          ? '760 160 900 900'
          : '700 360 900 980';
      return `<svg class="verovio-pae-vrv-icon" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${viewBox}" color="currentColor" fill="currentColor" stroke="currentColor" aria-hidden="true"><defs>${defs}</defs>${glyph.outerHTML}</svg>`;
    } catch (error) {
      console.error('Failed to render Verovio toolbar glyph:', error);
      return '';
    }
  }

  private createToolbarButton(
    parent: HTMLElement,
    text: string,
    label: string,
    callback: () => void,
    cls: string
  ) {
    const button = parent.createEl('button', {
      type: 'button',
      cls,
      attr: { 'aria-label': label },
    });
    button.innerHTML = text;
    button.addEventListener('click', callback);
  }

  private createIconButton(parent: HTMLElement, icon: string, label: string, callback: () => void) {
    const button = parent.createEl('button', { type: 'button', attr: { 'aria-label': label } });
    setIcon(button, icon);
    button.addEventListener('click', callback);
  }

  private createPianoKeyboard(parent: HTMLElement) {
    const keyboard = parent.createDiv('verovio-pae-piano');

    for (let i = 0; i <= 21; i++) {
      const divider = keyboard.createDiv('verovio-pae-white-divider');
      divider.style.left = `${i * 25}px`;
    }

    buildPianoKeys().forEach((key) => {
      const button = keyboard.createEl('button', {
        type: 'button',
        cls: key.alteration === 0 ? 'verovio-pae-white-key' : 'verovio-pae-black-key',
        attr: { 'aria-label': `${key.pitch}${key.alteration === 1 ? ' sharp' : key.alteration === -1 ? ' flat' : ''}` },
      });
      button.style.left = `${key.x}px`;
      button.style.top = `${key.y}px`;
      button.style.width = `${key.width}px`;
      button.style.height = `${key.height}px`;
      if (key.alteration === -1) button.addClass('is-flat');
      if (key.label) button.createSpan({ text: key.label });
      button.addEventListener('click', () => this.onPitch(key.pitch, key.octave, key.alteration));
    });
  }

  private onDuration(value: number) {
    this.duration = value;
    this.updateDurationButtons();
  }

  private onDot() {
    this.dotted = !this.dotted;
    this.updateDurationButtons();
  }

  private onPitch(pitch: string, octave: number, alteration: -1 | 0 | 1) {
    let pitchString = '';
    if (octave !== this.currentOctave) {
      switch (octave) {
        case 3:
          pitchString += "'";
        case 2:
          pitchString += "'";
        case 1:
          pitchString += "'";
      }
    }
    this.currentOctave = octave;

    pitchString += this.duration;
    if (this.dotted) pitchString += '.';
    if (alteration === 1) pitchString += 'x';
    if (alteration === -1) pitchString += 'b';
    pitchString += pitch;
    this.appendToken(pitchString);
  }

  private onRest() {
    this.appendToken(`${this.duration}-`);
  }

  private onBarline() {
    this.appendToken('/');
  }

  private onUndo() {
    const previous = this.undos.pop();
    if (previous === undefined) return;
    this.paeInput.value = previous;
    this.updatePreview();
  }

  private clearIncipit() {
    this.paeInput.value = '';
    this.currentOctave = -1;
    this.undos = [];
    this.updatePreview();
    this.paeInput.focus();
  }

  private onShortcut(event: KeyboardEvent) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
    const key = event.key.toLowerCase();
    const duration = DURATIONS.find((item) => String(item.value) === key);
    if (duration) {
      event.preventDefault();
      this.onDuration(duration.value);
    } else if (key === 'r' || key === '-') {
      event.preventDefault();
      this.onRest();
    } else if (key === 'd' || key === '.') {
      event.preventDefault();
      this.onDot();
    } else if (key === 'b' || key === '/') {
      event.preventDefault();
      this.onBarline();
    } else if (key === 'u') {
      event.preventDefault();
      this.onUndo();
    }
  }

  private updateDurationButtons() {
    if (!this.durationButtonsEl) return;
    this.durationButtonsEl.querySelectorAll<HTMLButtonElement>('[data-duration]').forEach((button) => {
      button.toggleClass('is-active', Number(button.dataset.duration) === this.duration);
    });
    this.durationButtonsEl.querySelectorAll<HTMLButtonElement>('.verovio-pae-dot-button').forEach((button) => {
      button.toggleClass('is-active', this.dotted);
    });
  }

  private appendToken(token: string) {
    this.undos.push(this.paeInput.value);
    this.paeInput.value += token;
    this.paeInput.focus();
    this.updatePreview();
  }

  private buildPae(): string {
    return [
      `@clef:${this.clefSelect.value}`,
      `@keysig:${this.keysigSelect.value}`,
      '@key:',
      `@timesig:${this.timesigInput.value.trim()}`,
      `@data: ${this.paeInput.value.trim()}`,
    ].join('\n');
  }

  private updatePreview() {
    if (!this.previewEl || !this.warningEl) return;
    const pae = this.buildPae();
    this.warningEl.empty();
    this.warningEl.hide();

    try {
      this.showValidation(pae);
      const svg = window.VerovioToolkit.renderData(`${pae}\n`, {
        inputFrom: 'pae',
        scale: 50,
        adjustPageHeight: 1,
        pageWidth: 1048,
        pageMarginTop: 0,
        pageMarginBottom: 0,
        pageMarginLeft: 0,
        pageMarginRight: 0,
        spacingStaff: 2,
        xmlIdSeed: 1,
      });
      this.previewEl.innerHTML = svg;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.previewEl.setText(message);
    }
  }

  private showValidation(pae: string) {
    const validate = window.VerovioToolkit.validatePAE;
    if (!validate || this.paeInput.value === '') return;
    const validation = validate.call(window.VerovioToolkit, pae);
    const messages: string[] = [];
    ['clef', 'keysig', 'timesig'].forEach((key) => {
      const item = validation[key];
      if (!Array.isArray(item) && item?.text) messages.push(item.text);
    });
    const dataMessages = validation.data;
    if (Array.isArray(dataMessages)) {
      dataMessages.forEach((item: { text?: string }) => {
        if (item.text) messages.push(item.text);
      });
    }
    if (messages.length) {
      this.warningEl.setText(messages.join('\n'));
      this.warningEl.show();
    }
  }

  private insertCodeBlock() {
    const pae = this.buildPae();
    this.onInsert(`\`\`\`verovio\n${pae}\n\`\`\`\n`);
    new Notice('PAE codeblock inserted.');
    this.close();
  }
}
