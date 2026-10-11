import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView as CMEditorView,
  highlightActiveLine,
  keymap,
  type ViewUpdate
} from '@codemirror/view';
import { basicSetup } from '@codemirror/basic-setup';
import { xml } from '@codemirror/lang-xml';
import { getSearchQuery, search, searchKeymap, searchPanelOpen } from '@codemirror/search';
import {
  activeLineTheme,
  codeFontTheme,
  markedXmlLineField
} from './editorXmlTools';

interface MusicCodeEditorOptions {
  doc: string;
  parent: HTMLElement;
  onChange?: () => void;
  onClick?: (event: MouseEvent, editor: CMEditorView) => void;
  readOnly?: boolean;
}

export function createMusicCodeEditor(options: MusicCodeEditorOptions): CMEditorView {
  const extensions: Extension[] = [
    basicSetup,
    xml(),
    markedXmlLineField,
    search(),
    keymap.of(searchKeymap),
    searchLabelStateSync(),
    highlightActiveLine(),
    activeLineTheme,
    codeFontTheme,
  ];

  if (options.onClick) {
    extensions.push(CMEditorView.domEventHandlers({
      click: (event, editor) => {
        options.onClick?.(event, editor);
        return false;
      }
    }));
  }

  if (options.readOnly) {
    extensions.push(EditorState.readOnly.of(true), CMEditorView.editable.of(false));
  }

  if (options.onChange) {
    extensions.push(CMEditorView.updateListener.of((update: ViewUpdate) => {
      if (update.docChanged) options.onChange?.();
    }));
  }

  return new CMEditorView({
    state: EditorState.create({
      doc: options.doc,
      extensions,
    }),
    parent: options.parent,
  });
}

function searchLabelStateSync(): Extension {
  return CMEditorView.updateListener.of((update) => {
    if (!searchPanelOpen(update.state)) return;

    const query = getSearchQuery(update.state);
    const previousQuery = getSearchQuery(update.startState);
    if (searchPanelOpen(update.startState)
      && query.caseSensitive === previousQuery.caseSensitive
      && query.regexp === previousQuery.regexp
      && query.wholeWord === previousQuery.wholeWord) return;

    // Update listeners run after CodeMirror has mounted and updated its panels.
    update.view.dom.querySelectorAll<HTMLLabelElement>('.cm-search label').forEach((label) => {
      const input = label.querySelector<HTMLInputElement>('input');
      if (!input) return;
      label.toggleClass('is-checked', input.checked);
    });
  });
}
