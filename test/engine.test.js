import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { before, describe, test } from 'node:test';
import { defaultValues } from '../src/params.js';
import { defaultSlicerValues } from '../src/slicer-settings.js';

const engineBuilt = existsSync(new URL('../slicer/engine/curaengine.wasm', import.meta.url));
const BED = 210;

function layers(gcode) {
  const result = [];
  let current;
  for (const line of gcode.split('\n')) {
    if (line.startsWith(';LAYER:')) result.push(current = []);
    else if (current && /^G1 .*X.*Y.*E/.test(line)) {
      current.push([Number(/X([-\d.]+)/.exec(line)[1]), Number(/Y([-\d.]+)/.exec(line)[1])]);
    }
  }
  return result;
}

const span = (points, axis) => {
  const values = points.map((point) => point[axis]);
  return [Math.min(...values), Math.max(...values)];
};

describe('compiled engine, default knob', { skip: !engineBuilt && 'run slicer/build.sh first' }, () => {
  let gcode;
  let printed;

  before(async () => {
    const { sliceKnob } = await import('../slicer/slice.js');
    gcode = await sliceKnob();
    printed = layers(gcode);
  });

  test('writes toolpaths for every part of the print, supports included', () => {
    for (const type of ['WALL-OUTER', 'WALL-INNER', 'FILL', 'SKIN', 'SUPPORT', 'SKIRT']) {
      assert.ok(gcode.includes(`;TYPE:${type}`), type);
    }
  });

  test('stays on the bed', () => {
    const all = printed.flat();
    for (const axis of [0, 1]) {
      const [min, max] = span(all, axis);
      assert.ok(min >= 0 && max <= BED, `axis ${axis}: ${min} to ${max}`);
    }
  });

  test('is centred on the bed at the knob size', () => {
    const { bodyLength, bodyWidth } = defaultValues();
    const top = printed.at(-30).length ? printed.at(-30) : printed.at(-1);
    const [minX, maxX] = span(top, 0);
    const [minY, maxY] = span(top, 1);
    assert.ok(Math.abs((minX + maxX) / 2 - BED / 2) < 0.5, 'centred in X');
    assert.ok(Math.abs((minY + maxY) / 2 - BED / 2) < 0.5, 'centred in Y');
    assert.ok(Math.abs(maxX - minX - bodyLength) < 1, `length ${maxX - minX}`);
    assert.ok(Math.abs(maxY - minY - bodyWidth) < 1, `width ${maxY - minY}`);
  });

  test('prints with the stud on the bed', () => {
    assert.equal(defaultSlicerValues().orientation, 'stud');
    const firstModelLine = gcode.split(';TYPE:WALL-OUTER')[1].split(';TYPE:')[0];
    const points = [...firstModelLine.matchAll(/^G1 .*X([-\d.]+) Y([-\d.]+) E/gm)].map((m) => [Number(m[1]), Number(m[2])]);
    const [minX, maxX] = span(points, 0);
    assert.ok(maxX - minX < defaultValues().studDiameter + 1, `first wall is ${maxX - minX} mm wide`);
  });

  test('heats the bed and nozzle before moving', () => {
    const start = gcode.split('G28')[0];
    assert.match(start, /M190 S60/);
    assert.match(start, /M109 S200/);
  });
});
