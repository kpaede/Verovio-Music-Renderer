import { App, Modal } from 'obsidian';

export class VerovioModal extends Modal {
  constructor(app: App) {
    super(app);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.setText('Verovio is loaded!');
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
