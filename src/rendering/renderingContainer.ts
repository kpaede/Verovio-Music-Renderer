import { setIcon } from 'obsidian';
import type VerovioMusicRenderer from '../main';
import { instanceStateMap, type VerovioContainerElement } from './verovioState';

interface RenderingContainerCallbacks {
  changePage: (uid: string, delta: number) => void;
  downloadSvg: (uid: string) => void;
  openEditor: (plugin: VerovioMusicRenderer, uid: string) => void;
  openExternal: (plugin: VerovioMusicRenderer, uid: string) => void;
  play: (uid: string) => void;
  renderSvg: (uid: string, wrapper: HTMLElement) => void;
  stop: (uid: string) => void;
}

export function createRenderingContainer(
  plugin: VerovioMusicRenderer,
  uid: string,
  parentEl: HTMLElement,
  callbacks: RenderingContainerCallbacks
) {
  const container = parentEl.createDiv('verovio-container') as VerovioContainerElement;
  container._pluginContext = plugin;
  container.dataset.uid = uid;

  const color = instanceStateMap[uid]?.highlightColor || plugin.settings.highlightColor || '#DC143C';
  container.style.setProperty('--verovio-play-color', color);
  const selectionColor = instanceStateMap[uid]?.selectionColor || plugin.settings.selectionColor || '#0066FF';
  container.style.setProperty('--verovio-selection-color', selectionColor);

  const svgWrap = container.createDiv('verovio-svg-wrapper');
  callbacks.renderSvg(uid, svgWrap);

  const toolbar = container.createDiv('verovio-toolbar');
  toolbar.appendChild(createToolbarButton('chevron-left', () => callbacks.changePage(uid, -1)));
  toolbar.appendChild(createToolbarButton('chevron-right', () => callbacks.changePage(uid, 1)));
  toolbar.appendChild(createToolbarButton('play', () => callbacks.play(uid), {
    disabled: !instanceStateMap[uid]?.supportsPlayback,
    title: instanceStateMap[uid]?.supportsPlayback ? 'Play' : 'Playback is not supported for gabc/neume notation in verovio.',
  }));
  toolbar.appendChild(createToolbarButton('square', () => callbacks.stop(uid)));
  toolbar.appendChild(createToolbarButton('pencil', () => callbacks.openEditor(plugin, uid), {
    title: 'Open code editor',
  }));
  toolbar.appendChild(createToolbarButton('image-down', () => callbacks.downloadSvg(uid)));
  toolbar.appendChild(createToolbarButton('external-link', () => callbacks.openExternal(plugin, uid)));

  return container;
}

function createToolbarButton(icon: string, cb: () => void, opts: { disabled?: boolean; title?: string } = {}) {
  const btn = createEl('button');
  setIcon(btn, icon);
  if (opts.title) btn.title = opts.title;
  if (opts.disabled) {
    btn.disabled = true;
    btn.setAttribute('aria-disabled', 'true');
  }
  btn.addEventListener('click', e => {
    e.preventDefault();
    cb();
  });
  return btn;
}
