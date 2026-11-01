import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, test } from 'node:test';
import { getLanguage, setLanguage, t } from '../src/i18n.js';
import { buildKnob } from '../src/knob.js';
import { defaultValues, PARAMS } from '../src/params.js';
import { SLICER_PARAMS } from '../src/slicer-settings.js';

after(() => setLanguage('de'));

// Words that are the same in both languages.
const SAME = new Set(['Slicer', 'Material', 'Gyroid', 'Skirt', 'Brim', 'Raft', 'mm', 'mm/s', '%', '°C', 'PLA', 'PETG', 'ABS']);
const translated = (text) => SAME.has(text) || /^M\d/.test(text) || t(text) !== text;

test('German is the default', () => {
  assert.equal(getLanguage(), 'de');
  assert.equal(t('Length'), 'Länge');
});

test('every setting has a German text', () => {
  for (const { group, label, unit, options = [] } of [...PARAMS, ...SLICER_PARAMS]) {
    for (const text of [group, label, unit ?? 'mm', ...options.map((option) => option.label)]) {
      assert.ok(translated(text), text);
    }
  }
});

test('every text in the page has a German text', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8').replaceAll('&amp;', '&');
  const texts = [...html.matchAll(/data-i18n(?:-label)?="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(texts.length >= 6);
  for (const text of texts) assert.ok(translated(text), text);
});

test('every model warning has a German text', () => {
  const base = { ...defaultValues(), grooveCount: 0, pocketFloor: 15, bodyLength: 40 };
  const cases = [
    { boreDiameter: 13 }, { boreDiameter: 11 }, { pocketFloor: 0 }, { pocketFloor: 1 }, { pocketFloor: 20 },
    { bodyWidth: 12 }, { topRounding: 12 },
    { holeDiameter: 4, holePosition: 30 }, { holeDiameter: 4, holePosition: 90 },
    { grooveCount: 1, groovePosition: 100, grooveDiameter: 15, bodyWidth: 20 },
    { grooveCount: 1, groovePosition: 30, holeDiameter: 4, holePosition: 70, grooveDiameter: 15 },
    { nutWidth: 30, pocketFloor: 0, boreDiameter: 0, studDiameter: 3 },
  ];
  const warnings = new Set(cases.flatMap((overrides) => buildKnob({ ...base, ...overrides }).warnings));
  assert.ok(warnings.size >= 12, `only ${warnings.size} warnings exercised`);
  for (const warning of warnings) assert.ok(translated(warning), warning);
});

test('numbers inside messages survive and use a German decimal comma', () => {
  assert.equal(t('The floor under the pocket is only 1.2 mm thick.'), 'Der Boden unter der Tasche ist nur 1,2 mm dick.');
  assert.equal(t('2 × 3 grid, 125.0 × 94.0 mm'), '2 × 3 Raster, 125,0 × 94,0 mm');
  assert.equal(t('M6 (10 mm)'), 'M6 (10 mm)');
  assert.equal(t('M3 (5.5 mm)'), 'M3 (5,5 mm)');
});

test('product names keep their digits', () => {
  assert.equal(t('Anycubic i3 Mega · 0.4 mm nozzle · 1.75 mm filament'), 'Anycubic i3 Mega · 0,4 mm Düse · 1,75 mm Filament');
});

test('unknown text falls back to English', () => {
  assert.equal(t('No such text'), 'No such text');
});

test('English returns the text unchanged and tells listeners', () => {
  setLanguage('en');
  assert.equal(getLanguage(), 'en');
  assert.equal(t('Length'), 'Length');
  setLanguage('de');
});
