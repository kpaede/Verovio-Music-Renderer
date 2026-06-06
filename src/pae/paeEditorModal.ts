import { App, Modal, Notice, setIcon } from 'obsidian';
import { buildPianoKeys, CLEFS, DURATIONS, KEYSIGS } from './paeEditorData';
import { convertPaeToMei, getPaeValidationMessages, renderPaePreviewSvg, renderPaeToolbarGlyph } from './paeRendering';

type InsertCallback = (codeBlock: string) => void;

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

    contentEl.createEl('h2', { text: 'Plaine & Easie code editor' });

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
      attr: { placeholder: 'Time signature, e.g. C c/ 3/4' },
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
    insertButton.addEventListener('click', () => this.insertPaeCodeBlock());
    const insertMeiButton = actions.createEl('button', {
      text: 'Insert MEI codeblock',
      type: 'button',
    });
    insertMeiButton.addEventListener('click', () => this.insertMeiCodeBlock());

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
      const glyph = this.renderToolbarGlyph(`${value}C/`, 'note');
      if (glyph) {
        const doc = new DOMParser().parseFromString(glyph, 'image/svg+xml');
        if (doc.documentElement) button.append(doc.documentElement);
      } else {
        button.setText(String(value));
      }
      button.dataset.duration = String(value);
      button.addEventListener('click', () => this.onDuration(value));
    });
  }

  private renderToolbarGlyph(data: string, className: 'note' | 'rest' | 'barLine'): string {
    return renderPaeToolbarGlyph(data, className);
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
    if (text.startsWith('<svg')) {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      if (doc.documentElement) button.append(doc.documentElement);
    } else {
      button.setText(text);
    }
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
          // fallthrough
        case 2:
          pitchString += "'";
          // fallthrough
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
      const svg = renderPaePreviewSvg(pae);
      this.previewEl.empty();
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (doc.documentElement) {
        this.previewEl.append(doc.documentElement);
      } else {
        this.previewEl.setText(svg);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.previewEl.setText(message);
    }
  }

  private showValidation(pae: string) {
    if (this.paeInput.value === '') return;
    const messages = getPaeValidationMessages(pae);
    if (messages.length) {
      this.warningEl.setText(messages.join('\n'));
      this.warningEl.show();
    }
  }

  private insertPaeCodeBlock() {
    const pae = this.buildPae();
    this.onInsert(`\`\`\`verovio\n${pae}\n\`\`\`\n`);
    new Notice('PAE codeblock inserted.');
    this.close();
  }

  private insertMeiCodeBlock() {
    try {
      const mei = convertPaeToMei(this.buildPae()).trim();
      this.onInsert(`\`\`\`verovio\n${mei}\n\`\`\`\n`);
      new Notice('MEI codeblock inserted.');
      this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not convert PAE to MEI: ${message}`);
    }
  }

}
