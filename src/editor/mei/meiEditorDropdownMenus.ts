import { Notice } from 'obsidian';
import { INSERT_MENU, MANIPULATE_MENU, MeiEditorMenuItem, MeiEditorMenuKind, MeiEditorMenuSection } from './meiEditorMenus';

export interface MeiEditorMenuContext {
  getSelectedCount(): number;
  runCommand(commandId: string): boolean;
}

export interface MeiEditorDropdownMenu {
  container: HTMLElement;
  open(kind: MeiEditorMenuKind, anchor: HTMLElement): void;
  close(): void;
  toggle(kind: MeiEditorMenuKind, anchor: HTMLElement): void;
}

export function createMeiEditorDropdownMenu(parent: HTMLElement, context: MeiEditorMenuContext): MeiEditorDropdownMenu {
  const container = parent.createDiv('verovio-mei-menu-dropdown');
  container.hide();

  let activeKind: MeiEditorMenuKind | null = null;
  let activeAnchor: HTMLElement | null = null;
  const ownerDocument = parent.ownerDocument;

  const onPointerDown = (event: PointerEvent) => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (container.contains(target) || activeAnchor?.contains(target)) return;
    close();
  };

  const close = () => {
    activeKind = null;
    activeAnchor = null;
    ownerDocument.removeEventListener('pointerdown', onPointerDown, true);
    container.empty();
    container.hide();
  };

  const open = (kind: MeiEditorMenuKind, anchor: HTMLElement) => {
    activeKind = kind;
    activeAnchor = anchor;
    renderDropdown(container, kind === 'manipulate' ? MANIPULATE_MENU : INSERT_MENU, context);
    positionDropdown(container, anchor, parent);
    container.show();
    ownerDocument.addEventListener('pointerdown', onPointerDown, true);
  };

  return {
    container,
    open,
    close,
    toggle(kind: MeiEditorMenuKind, anchor: HTMLElement) {
      if (activeKind === kind && container.isShown()) {
        close();
      } else {
        open(kind, anchor);
      }
    },
  };
}

function renderDropdown(container: HTMLElement, sections: MeiEditorMenuSection[], context: MeiEditorMenuContext) {
  container.empty();

  sections.forEach((section, index) => {
    if (index > 0) container.createDiv('verovio-mei-menu-separator');

    section.items.forEach((item) => {
      const button = container.createEl('button', {
        cls: 'verovio-mei-menu-item',
        attr: { type: 'button', 'data-command-id': item.id },
      });
      button.createSpan({ cls: 'verovio-mei-menu-label', text: item.label });
      if (item.shortcut) {
        button.createSpan({ cls: 'verovio-mei-menu-shortcut', text: item.shortcut });
      }
      button.addEventListener('click', () => runMeiEditorCommand(item, context));
    });
  });
}

function positionDropdown(dropdown: HTMLElement, anchor: HTMLElement, parent: HTMLElement) {
  const parentRect = parent.getBoundingClientRect();
  const anchorRect = anchor.getBoundingClientRect();
  dropdown.style.top = `${anchorRect.bottom - parentRect.top + 4}px`;
  dropdown.style.left = `${Math.max(6, anchorRect.left - parentRect.left)}px`;
}

function runMeiEditorCommand(item: MeiEditorMenuItem, context: MeiEditorMenuContext) {
  if (context.runCommand(item.id)) return;

  const selectedCount = context.getSelectedCount();
  const suffix = selectedCount ? ` (${selectedCount} selected)` : '';
  new Notice(`${item.label} is not wired yet${suffix}.`);
}
