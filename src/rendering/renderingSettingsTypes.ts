import { setTooltip } from 'obsidian';
import type { VerovioOptionValue } from '../verovio/parseVerovioSource';

export type RenderingOptionValue = VerovioOptionValue | null | undefined;
export type RenderingSettingValue = VerovioOptionValue | null | undefined;

export interface RenderingOptionDefinition {
  cmdOnly?: boolean;
  default?: RenderingOptionValue | RenderingOptionValue[];
  description?: string;
  max?: number;
  min?: number;
  title?: string;
  type?: string;
  values?: string[];
}

export interface RenderingSettingsOptions {
  parent: HTMLElement;
  title?: string;
  values: Record<string, RenderingSettingValue>;
  fallbackValues: Record<string, RenderingSettingValue>;
  includeMeasureSelection?: boolean;
  resetLabel: string;
  resetNotice: string;
  onChange: (key: string, value: VerovioOptionValue | undefined) => void | Promise<void>;
  onResetAll: (keys: Set<string>) => void | Promise<void>;
}

export interface VerovioOptionInput {
  key: string;
  definition: RenderingOptionDefinition;
  input: HTMLInputElement | HTMLSelectElement;
}

export function formatRenderingOptionTitle(key: string, definition: RenderingOptionDefinition): string {
  const parts = [definition.description || definition.title || key];
  const metadata: string[] = [];
  if (definition.default !== undefined && definition.default !== null) {
    metadata.push(`default: ${formatOptionValue(definition.default)}`);
  }
  if (definition.min !== undefined) metadata.push(`min: ${definition.min}`);
  if (definition.max !== undefined) metadata.push(`max: ${definition.max}`);
  if (definition.values?.length) metadata.push(`values: ${definition.values.join(', ')}`);
  if (metadata.length) parts.push(`(${metadata.join('; ')})`);
  return parts.join(' ');
}

export function getRenderingOptionStep(definition: RenderingOptionDefinition): number {
  return definition.type === 'int' ? 1 : 0.05;
}

export function clampNumber(value: number, min?: number, max?: number): number {
  let nextValue = value;
  if (min !== undefined) nextValue = Math.max(min, nextValue);
  if (max !== undefined) nextValue = Math.min(max, nextValue);
  return nextValue;
}

export function attachTooltip<T extends HTMLElement>(el: T, text: string): T {
  setTooltip(el, text, { placement: 'top', delay: 200 });
  el.setAttribute('aria-label', text);
  return el;
}

function formatOptionValue(value: RenderingOptionValue | RenderingOptionValue[]): string {
  if (Array.isArray(value)) return value.join(',');
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}
