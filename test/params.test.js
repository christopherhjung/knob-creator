import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildKnob } from '../src/knob.js';
import { defaultValues, PARAMS, selectNut } from '../src/params.js';

const nutOptions = PARAMS.find(({ key }) => key === 'nutWidth').options;

test('defaults agree with the M6 table entry', () => {
  const { nutWidth, boreDiameter } = defaultValues();
  const m6 = nutOptions.find(({ thread }) => thread === 6);
  assert.deepEqual([nutWidth, boreDiameter], [m6.value, m6.bore]);
});

test('changing nut scales dimensions by the thread ratio and sets the bore', () => {
  const values = defaultValues();
  selectNut(values, 13); // M6 to M8

  assert.equal(values.nutWidth, 13);
  assert.equal(values.boreDiameter, 9);
  assert.equal(values.studDiameter, 16);
  assert.equal(values.bodyHeight, 20 * (8 / 6));
  assert.equal(values.pocketFloor, 20);
  assert.equal(values.nutClearance, 0.3); // depends on the printer, not the thread
});

test('extra hole diameter follows the thread, its percentage position does not', () => {
  const values = { ...defaultValues(), holeDiameter: 4, holePosition: 70 };
  selectNut(values, 18); // M6 to M12

  assert.equal(values.holeDiameter, 8);
  assert.equal(values.holePosition, 70);
});

test('user changes carry over, and no bore stays no bore', () => {
  const values = { ...defaultValues(), bodyLength: 60, boreDiameter: 0 };
  selectNut(values, 18); // M6 to M12

  assert.equal(values.bodyLength, 100); // 120 capped at the slider maximum
  assert.equal(values.bodyWidth, 56);
  assert.equal(values.boreDiameter, 0);
});

test('switching there and back restores the original dimensions', () => {
  const values = defaultValues();
  for (const { value } of nutOptions) selectNut(values, value);
  selectNut(values, 10);

  for (const [key, original] of Object.entries(defaultValues())) {
    assert.ok(Math.abs(values[key] - original) < 1e-9, key);
  }
});

test('every nut size gives a clean knob at the default proportions', () => {
  for (const { label, value } of nutOptions) {
    const values = defaultValues();
    selectNut(values, value);
    assert.deepEqual(buildKnob(values).warnings, [], label);
  }
});
