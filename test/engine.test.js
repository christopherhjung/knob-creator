import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { before, describe, test } from 'node:test';
import { buildKnob } from '../src/knob.js';
import { defaultValues } from '../src/params.js';
import { buildPipe, PIPE_PARAMS } from '../src/pipe.js';
import { defaultSlicerValues, meshFootprint } from '../src/slicer-settings.js';

const engineBuilt = existsSync(new URL('../slicer/engine/CuraEngine.wasm', import.meta.url));
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
  // A loop, since spreading a large print's points overflows the stack.
  let [min, max] = [Infinity, -Infinity];
  for (const point of points) [min, max] = [Math.min(min, point[axis]), Math.max(max, point[axis])];
  return [min, max];
};

describe('compiled engine, default knob', { skip: !engineBuilt && 'run slicer/build.sh first' }, () => {
  let gcode;
  let printed;

  before(async () => {
    const { sliceMesh } = await import('../slicer/slice.js');
    gcode = await sliceMesh(buildKnob(defaultValues()));
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

  test('places a grid of copies centred on the bed', async () => {
    const { sliceMesh } = await import('../slicer/slice.js');
    const fourKnobs = await sliceMesh(buildKnob(defaultValues()), { ...defaultSlicerValues(), copies: 4, copyGap: 5 });
    const midBody = layers(fourKnobs)[60];
    const [minX, maxX] = span(midBody, 0);
    const [minY, maxY] = span(midBody, 1);

    assert.ok(Math.abs(maxX - minX - 125) < 1, `grid width ${maxX - minX}`);
    assert.ok(Math.abs(maxY - minY - 61) < 1, `grid depth ${maxY - minY}`);
    assert.ok(Math.abs((minX + maxX) / 2 - BED / 2) < 0.5, 'centred in X');
    assert.ok(Math.abs((minY + maxY) / 2 - BED / 2) < 0.5, 'centred in Y');
    assert.ok(!midBody.some(([x]) => Math.abs(x - BED / 2) < 2), 'no extrusion in the 5 mm gap between columns');
  });

  test('heats the bed and nozzle before moving', () => {
    const start = gcode.split('G28')[0];
    assert.match(start, /M190 S60/);
    assert.match(start, /M109 S200/);
  });
});

describe('compiled engine, default pipe adapter', { skip: !engineBuilt && 'run slicer/build.sh first' }, () => {
  test('lies on the bed as drawn, with supports under it', async () => {
    const { sliceMesh } = await import('../slicer/slice.js');
    const mesh = buildPipe(defaultValues(PIPE_PARAMS));
    const gcode = await sliceMesh(mesh, { ...defaultSlicerValues(), orientation: 'flat' });
    assert.ok(gcode.includes(';TYPE:SUPPORT'));

    const walls = layers(gcode).flat();
    const [width, depth] = meshFootprint(mesh);
    const [minX, maxX] = span(walls, 0);
    const [minY, maxY] = span(walls, 1);
    // The skirt adds a few mm around it; a turned pipe would swap the two sizes.
    assert.ok(maxX - minX > width && maxX - minX < width + 12, `width ${maxX - minX} vs ${width}`);
    assert.ok(maxY - minY > depth && maxY - minY < depth + 12, `depth ${maxY - minY} vs ${depth}`);
  });
});
