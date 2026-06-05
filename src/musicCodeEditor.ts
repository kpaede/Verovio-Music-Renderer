import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView as CMEditorView,
  highlightActiveLine,
  keymap,
  type ViewUpdate
} from '@codemirror/view';
import { basicSetup } from '@codemirror/basic-setup';
import { xml } from '@codemirror/lang-xml';
import { search, searchKeymap } from '@codemirror/search';
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
