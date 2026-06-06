import { setIcon } from 'obsidian';

export type CombinedEditorTab = 'file' | 'block' | 'remote' | 'edit' | 'insert' | 'convert' | 'search' | 'settings';
export type SingleEditorTab = 'source' | 'block' | 'edit' | 'insert' | 'convert' | 'search' | 'settings';

export const EDITOR_TOOLBAR_ITEMS: Array<{ tab: SingleEditorTab; icon: string; label: string }> = [
  { tab: 'source', icon: 'list-music', label: 'Referenced content' },
  { tab: 'block', icon: 'code-2', label: 'Codeblock' },
  { tab: 'edit', icon: 'square-pen', label: 'Edit' },
  { tab: 'insert', icon: 'plus', label: 'Insert' },
  { tab: 'convert', icon: 'mei-text', label: 'Convert to MEI' },
  { tab: 'settings', icon: 'sliders-horizontal', label: 'Rendering settings' },
];

export function setToolbarIcon(button: HTMLElement, icon: string) {
  if (icon === 'mei-text') {
    button.createSpan({ cls: 'verovio-editor-tab-text-icon', text: 'MEI' });
    return;
  }
  setIcon(button, icon);
}
