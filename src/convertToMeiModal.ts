import { ButtonComponent, Modal } from 'obsidian';
import VerovioMusicRenderer from './main';

export function confirmConvertToMei(app: VerovioMusicRenderer['app'], format: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = new ConfirmConvertToMeiModal(app, format, resolve);
    modal.open();
  });
}

class ConfirmConvertToMeiModal extends Modal {
  private resolved = false;

  constructor(
    app: VerovioMusicRenderer['app'],
    private readonly format: string,
    private readonly resolveChoice: (confirmed: boolean) => void
  ) {
    super(app);
  }

  onOpen() {
    this.contentEl.empty();
    this.contentEl.createEl('h2', { text: 'Convert to MEI?' });
    this.contentEl.createEl('p', {
      text: `This will replace the inline ${this.format} notation in the codeblock with generated MEI. Codeblock options will be kept.`
    });

    const buttonRow = this.contentEl.createDiv('verovio-confirm-buttons');
    new ButtonComponent(buttonRow)
      .setButtonText('Convert to MEI')
      .setCta()
      .onClick(() => this.resolve(true));
    new ButtonComponent(buttonRow)
      .setButtonText('Cancel')
      .onClick(() => this.resolve(false));
  }

  onClose() {
    this.resolve(false);
  }

  private resolve(confirmed: boolean) {
    if (this.resolved) return;
    this.resolved = true;
    this.resolveChoice(confirmed);
    this.close();
  }
}
