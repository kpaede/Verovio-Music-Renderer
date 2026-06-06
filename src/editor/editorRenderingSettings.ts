import type VerovioMusicRenderer from '../main';
import type { VerovioOptionValue } from '../verovio/parseVerovioSource';
import { DEFAULT_SETTINGS } from '../settings';
import { clickMap, instanceStateMap, updateSVG } from '../rendering/verovioProcessor';
import { renderVerovioRenderingSettings, type RenderingSettingValue } from '../rendering/renderingSettingsControls';
import {
  getCodeBlockBodyOptionsText,
  parseOptionText,
  removeOptionsFromBody,
  updateOptionInBody
} from './editorCodeblockOptions';
import { extractCodeBlockBody } from './codeBlockRange';

interface EditorRenderingSettingsContext {
  currentUid: string | null | undefined;
  editMode: string;
  getCurrentCodeBlockText: () => string;
  plugin: VerovioMusicRenderer;
  replaceCurrentCodeBlockBody: (updateBody: (body: string) => string) => void;
}

export function renderEditorRenderingSettings(parent: HTMLElement, context: EditorRenderingSettingsContext) {
  if (context.editMode === 'file' || !context.currentUid || !clickMap[context.currentUid]) {
    parent.empty();
    parent.createEl('p', {
      cls: 'verovio-editor-placeholder',
      text: 'Rendering settings can be written only when the current rendering comes from a codeblock.'
    });
    return;
  }

  const body = extractCodeBlockBody(context.getCurrentCodeBlockText());
  const blockOptions = parseOptionText(getCodeBlockBodyOptionsText(body));
  const defaultOptions: Record<string, RenderingSettingValue> = {
    ...window.VerovioToolkit.getDefaultOptions(),
    ...DEFAULT_SETTINGS,
    ...context.plugin.settings,
  };

  renderVerovioRenderingSettings({
    parent,
    title: 'Rendering settings',
    values: blockOptions,
    fallbackValues: defaultOptions,
    includeMeasureSelection: true,
    resetLabel: 'Reset codeblock options',
    resetNotice: 'Rendering settings removed from codeblock.',
    onChange: (key, value) => updateCurrentCodeBlockOption(context, key, value),
    onResetAll: (knownKeys) => {
      context.replaceCurrentCodeBlockBody((currentBody) => removeOptionsFromBody(currentBody, knownKeys));
      const uid = context.currentUid;
      if (uid && instanceStateMap[uid]) {
        knownKeys.forEach((key) => delete instanceStateMap[uid].options[key]);
        instanceStateMap[uid].measureRange = undefined;
        updateRenderedSvgForUid(context.plugin, uid);
      }
    },
  });
}

export function updateCurrentCodeBlockOption(
  context: EditorRenderingSettingsContext,
  key: string,
  value: VerovioOptionValue | undefined
) {
  context.replaceCurrentCodeBlockBody((body) => updateOptionInBody(body, key, value));
  const uid = context.currentUid;
  if (uid && instanceStateMap[uid]) {
    instanceStateMap[uid].options = {
      ...instanceStateMap[uid].options,
      ...(value === undefined ? {} : { [key]: value }),
    };
    if (value === undefined) delete instanceStateMap[uid].options[key];
    if (key === 'measureRange') {
      instanceStateMap[uid].measureRange = typeof value === 'string' ? value : undefined;
    }
    updateRenderedSvgForUid(context.plugin, uid);
  }
}

function updateRenderedSvgForUid(plugin: VerovioMusicRenderer, uid: string) {
  const wrapper = plugin.app.workspace.containerEl.ownerDocument.querySelector<HTMLElement>(
    `.verovio-container[data-uid="${uid}"] .verovio-svg-wrapper`
  );
  if (wrapper) updateSVG(uid, wrapper);
}
