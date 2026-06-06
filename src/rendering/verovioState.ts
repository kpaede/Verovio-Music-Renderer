import type { VerovioOptions } from '../verovio/parseVerovioSource';
import type VerovioMusicRenderer from '../main';

export interface VerovioState {
  meiData: string;
  options: VerovioOptions;
  highlightColor?: string;
  selectionColor?: string;
  selectedElementIds: string[];
  lastSelectedElementId?: string;
  playNoteOnClick: boolean;
  supportsPlayback: boolean;
  measureRange?: string;
  currentPage: number;
  totalPages: number;
}

export interface ElementInfo {
  line: number;
  index: number;
}

export interface BlockMapping {
  filePath: string;
  startLine: number;
  endLine: number;
  elementMap: Record<string, ElementInfo>;
}

export interface VerovioContainerElement extends HTMLElement {
  _pluginContext?: VerovioMusicRenderer;
  _suppressNotationClick?: boolean;
}

export const instanceStateMap: Record<string, VerovioState> = {};
export const clickMap: Record<string, BlockMapping> = {};
export const sourceMap: Record<string, string> = {};

export const NOTE_ON_OFFSET = 0.0;
