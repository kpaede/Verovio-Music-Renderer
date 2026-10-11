import { test, expect } from '@playwright/test';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const bundle = await build({ entryPoints: ['src/chordpro/chordProBlock.ts'], bundle: true, write: false, format: 'iife', globalName: 'chordpro' });
const styles = readFileSync('styles.css', 'utf8');
async function render(page, source) {
  await page.setContent('<html lang="en"><head><title>Chord sheet test</title></head><body><main id="sheet"></main></body></html>');
  await page.addStyleTag({ content: ':root { --font-text: Arial; --font-monospace: monospace; --text-accent: #2563eb; }' + styles });
  await page.addScriptTag({ content: bundle.outputFiles[0].text });
  await page.evaluate(source => {
    HTMLElement.prototype.createEl = function(tag, opts = {}) {
      const child = document.createElement(tag);
      child.className = typeof opts === 'string' ? opts : opts.cls || '';
      if (opts.text) child.textContent = opts.text;
      this.appendChild(child); return child;
    };
    HTMLElement.prototype.createDiv = function(opts) { return this.createEl('div', opts); };
    HTMLElement.prototype.createSpan = function(opts) { return this.createEl('span', opts); };
    HTMLElement.prototype.setText = function(text) { this.textContent = text; };
    HTMLElement.prototype.addClass = function(cls) { this.classList.add(cls); };
    window.chordpro.renderChordProBlock(source, document.querySelector('#sheet'));
  }, source);
}

test('chords appear once before their lyrics in the accessibility tree; spacers stay hidden', async ({ page }) => {
  await render(page, '[Am]Carry [D]home[]');
  const tree = await page.locator('#sheet').ariaSnapshot();
  expect(tree).toContain('Am chord Carry D chord home');
  expect(tree.match(/Am chord/g)).toHaveLength(1);
  await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
  const violations = await page.evaluate(async () => (await window.axe.run(document.querySelector('#sheet'), { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } })).violations);
  expect(violations).toEqual([]);
});

test('tab columns stay aligned and keyboard-scroll at narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 480 });
  await render(page, '{sot}\ne|--1--10--' + '-'.repeat(100) + '|\nB|--0--11--' + '-'.repeat(100) + '|\n{eot}');
  const tab = page.locator('.chopro-tab');
  const metrics = await tab.evaluate(el => {
    const lyric = el.querySelector('.chopro-lyric');
    const range = document.createRange(); range.setStart(lyric.firstChild, 0); range.setEnd(lyric.firstChild, 1);
    const a = range.getBoundingClientRect().width;
    range.setStart(lyric.firstChild, 4); range.setEnd(lyric.firstChild, 5);
    return { a, b: range.getBoundingClientRect().width, whitespace: getComputedStyle(lyric).whiteSpace, overflow: el.scrollWidth > el.clientWidth };
  });
  expect(metrics.a).toBeCloseTo(metrics.b, 1);
  expect(metrics.whitespace).toBe('pre');
  expect(metrics.overflow).toBe(true);
  await page.keyboard.press('Tab'); await expect(tab).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => tab.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
});
