import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { applyConfig, deleteConfig, readConfigs, saveConfig } from '../src/configs.js';
import { t } from '../src/i18n.js';
import { defaultValues, PARAMS } from '../src/params.js';
import { DEFAULT_PATH, PIPE_PARAMS } from '../src/pipe.js';
import { defaultSlicerValues, SLICER_PARAMS } from '../src/slicer-settings.js';

let stored;
const memoryStorage = {
  getItem: (key) => stored[key] ?? null,
  setItem: (key, value) => { stored[key] = value; },
};

beforeEach(() => {
  stored = {};
  Object.defineProperty(globalThis, 'localStorage', { value: memoryStorage, configurable: true });
});

const config = (name, bodyLength = 60) => ({ name, savedAt: 1, model: { bodyLength }, slicer: {} });

test('nothing saved gives an empty list', () => {
  assert.deepEqual(readConfigs(), []);
});

test('configurations survive being read back', () => {
  assert.equal(saveConfig(config('A')), true);
  saveConfig(config('B'));
  assert.deepEqual(readConfigs().map(({ name }) => name), ['A', 'B']);
});

test('the same name replaces the old configuration', () => {
  saveConfig(config('A', 60));
  saveConfig(config('A', 80));
  assert.equal(readConfigs().length, 1);
  assert.equal(readConfigs()[0].model.bodyLength, 80);
});

test('deleting removes only that configuration', () => {
  saveConfig(config('A'));
  saveConfig(config('B'));
  deleteConfig({ name: 'A' });
  assert.deepEqual(readConfigs().map(({ name }) => name), ['B']);
});

test('each model has its own configurations, and old ones are knobs', () => {
  saveConfig(config('A'));
  saveConfig({ ...config('A'), type: 'pipe' });
  assert.equal(readConfigs().length, 2);
  assert.deepEqual(readConfigs('knob').map(({ type }) => type), [undefined]);
  assert.deepEqual(readConfigs('pipe').map(({ type }) => type), ['pipe']);
  deleteConfig({ name: 'A', type: 'pipe' });
  assert.equal(readConfigs('pipe').length, 0);
  assert.equal(readConfigs('knob').length, 1);
});

test('a pipe path loads only when it is a valid path, and as a copy', () => {
  const path = [[0, 0], [1, 1], [2, 2], [3, 3]];
  const values = defaultValues(PIPE_PARAMS);
  applyConfig(values, PIPE_PARAMS, { path });
  assert.deepEqual(values.path, path);
  assert.notEqual(values.path, path);
  for (const damaged of [[[0, 0], [1, 1]], [[0, 0], [1, 1], [2, 2], [3, 'x']], 'path']) {
    applyConfig(values, PIPE_PARAMS, { path: damaged });
    assert.deepEqual(values.path, DEFAULT_PATH);
  }
});

test('damaged storage does not break the app', () => {
  for (const damaged of ['not json', '{"a":1}', 'null', '[null,5,{"name":3}]']) {
    stored['knobCreator.configs'] = damaged;
    assert.deepEqual(readConfigs(), [], damaged);
  }
  stored['knobCreator.configs'] = '[null,{"name":"kept"}]';
  assert.deepEqual(readConfigs(), [{ name: 'kept' }]);
});

test('full or blocked storage reports failure instead of throwing', () => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: { getItem: () => null, setItem() { throw new Error('quota'); } }, configurable: true,
  });
  assert.equal(saveConfig(config('A')), false);

  Object.defineProperty(globalThis, 'localStorage', {
    get() { throw new Error('blocked'); }, configurable: true,
  });
  assert.deepEqual(readConfigs(), []);
  assert.equal(saveConfig(config('A')), false);
});

test('a loaded configuration restores every saved value', () => {
  const saved = { ...defaultValues(), bodyLength: 82, nutWidth: 13, holeDiameter: 4 };
  const values = defaultValues();
  applyConfig(values, PARAMS, saved);
  assert.deepEqual(values, saved);

  const slicer = { ...defaultSlicerValues(), material: 'PETG', orientation: 'top', copies: 6 };
  const target = defaultSlicerValues();
  applyConfig(target, SLICER_PARAMS, slicer);
  assert.deepEqual(target, slicer);
});

test('loading replaces current changes, so a configuration always looks the same', () => {
  const values = { ...defaultValues(), bodyWidth: 40 };
  applyConfig(values, PARAMS, { bodyLength: 70 });
  assert.equal(values.bodyLength, 70);
  assert.equal(values.bodyWidth, defaultValues().bodyWidth);
});

test('out of date or invalid values fall back safely', () => {
  const values = defaultValues();
  applyConfig(values, PARAMS, { bodyLength: 9999, bodyWidth: 'wide', nutWidth: 11, removedSetting: 1 });
  assert.equal(values.bodyLength, 150);
  assert.equal(values.bodyWidth, defaultValues().bodyWidth);
  assert.equal(values.nutWidth, defaultValues().nutWidth);
  assert.equal('removedSetting' in values, false);
});

test('a configuration with no values at all loads the defaults', () => {
  const values = { ...defaultValues(), bodyLength: 80 };
  applyConfig(values, PARAMS, undefined);
  assert.deepEqual(values, defaultValues());
});

test('messages have German text', () => {
  for (const text of ['Configurations', 'Save', 'Load', 'Delete', 'Saved.', 'Loaded.', 'No saved configurations yet.',
    'Could not save in this browser.', 'Delete this configuration?', 'Replace the saved configuration with this name?']) {
    assert.notEqual(t(text), text, text);
  }
});
