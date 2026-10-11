import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { URL } from 'node:url';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Compile the standalone parser without adding a TypeScript test runner.
const source = readFileSync(new URL('../src/verovio/parseVerovioSource.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
});
const parserExports = {};
runInNewContext(outputText, { exports: parserExports });
const { default: parseVerovioSource, isCmmeInline } = parserExports;
const musicxml = readFileSync(new URL('./fixtures/musicxml-with-music-font.musicxml', import.meta.url), 'utf8');

test('MusicXML with music-font is not detected as CMME after loading a file', () => {
  for (const filePath of ['repro.musicxml', 'repro.xml']) {
    const parsed = parseVerovioSource(filePath);
    assert.equal(parsed.format, 'musicxml');
    assert.equal(parsed.filePath, filePath);
    assert.equal(isCmmeInline(musicxml), false);
  }
});

test('inline MusicXML with music-font keeps its format and document', () => {
  const parsed = parseVerovioSource(musicxml);
  assert.equal(parsed.format, 'musicxml');
  assert.ok(parsed.code.includes('<music-font font-family="Bravura"/>'));
  assert.ok(parsed.code.endsWith('</score-partwise>'));
});

for (const root of ['score-partwise', 'score-timewise']) {
  test(`${root} takes precedence over CMME-like elements inside MusicXML`, () => {
    const xml = `<${root} version="4.0"><Music><Note/></Music></${root}>`;
    assert.equal(isCmmeInline(xml), false);
    assert.equal(parseVerovioSource(xml).format, 'musicxml');
  });
}

test('MEI music and note elements are not detected as CMME', () => {
  const xml = '<mei xmlns="http://www.music-encoding.org/ns/mei"><music><body><note/></body></music></mei>';
  assert.equal(isCmmeInline(xml), false);
  assert.equal(parseVerovioSource(xml).format, 'mei');
});

for (const root of ['Piece', 'Music', 'Composition', 'GeneralData', 'VoiceData', 'MensuralMusic']) {
  test(`CMME rooted at ${root} is still recognized inline and in generic XML files`, () => {
    const xml = `<?xml version="1.0"?>\n<${root} xmlns="http://www.cmme.org"><VoiceData><Note/></VoiceData></${root}>`;
    assert.equal(isCmmeInline(xml), true);
    assert.equal(parseVerovioSource(xml).format, 'cmme.xml');
    assert.equal(parseVerovioSource('score.xml').format, 'musicxml');
  });
}

test('CMME tag names accept whitespace, attributes, and self-closing tags', () => {
  for (const xml of [
    '<Piece><GeneralData/></Piece>',
    '<Music version="1"><Note duration="1"/></Music>',
    '<Piece\nversion="1"><VoiceData\t/></Piece>',
    '<music><note /></music>',
  ]) assert.equal(isCmmeInline(xml), true, xml);
});

test('hyphenated, dotted, and colon-separated names are not CMME root tags', () => {
  for (const suffix of ['-font', '.font', ':font']) {
    const xml = `<Music${suffix}><Note/></Music${suffix}>`;
    assert.equal(isCmmeInline(xml), false, xml);
    assert.equal(parseVerovioSource(xml).code, undefined, xml);
  }
});

test('prefix matches in child element names are not CMME structure', () => {
  for (const suffix of ['-font', '.font', ':font']) {
    const xml = `<Piece><Note${suffix}/></Piece>`;
    assert.equal(isCmmeInline(xml), false, xml);
  }
});

test('explicit CMME file extensions remain supported', () => {
  for (const filePath of ['score.cmme.xml', 'score.cmme', 'SCORE.CMME.XML']) {
    assert.equal(parseVerovioSource(filePath).format, 'cmme.xml');
  }
});
