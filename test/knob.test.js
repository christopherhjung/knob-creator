import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildKnob, groovePositions } from '../src/knob.js';
import { defaultValues } from '../src/params.js';

// Fixed proportions, so geometry checks don't move when a default changes.
const knob = (overrides = {}) =>
  buildKnob({ ...defaultValues(), bodyLength: 40, nutClearance: 0.3, pocketFloor: 15, grooveCount: 0, ...overrides });

function extent(positions, axis) {
  const values = positions.filter((_, i) => i % 3 === axis);
  return [Math.min(...values), Math.max(...values)];
}

const near = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not close to ${expected}`);

test('defaults are clean and sized as requested', () => {
  const { positions, warnings } = buildKnob(defaultValues());
  assert.deepEqual(warnings, []);
  assert.deepEqual(extent(positions, 2), [0, 22]);
  near(extent(positions, 0)[1], 30);
  near(extent(positions, 1)[1], 14);
});

test('body is a straight elliptical extrusion joined to the stud', () => {
  const { volume, warnings } = knob({ boreDiameter: 0, pocketFloor: 19, nutWidth: 3, nutClearance: 0, topRounding: 0 });
  const ellipse = Math.PI * 20 * 14 * 20;
  const stud = Math.PI * 6 ** 2 * 2;
  const pocket = (Math.sqrt(3) / 2) * 3 ** 2;
  near(volume, ellipse + stud - pocket, 0.02 * volume); // 96-gon is slightly under a true ellipse
  assert.deepEqual(warnings, []);
});

test('top rounding pulls the top outline in and keeps the base outline', () => {
  const { positions, volume } = knob();
  const onTop = [];
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 2] === 22) onTop.push(positions[i]);
  }
  near(Math.max(...onTop), 20 - 3);
  near(extent(positions, 0)[1], 20);
  assert.ok(volume < knob({ topRounding: 0 }).volume);
});

test('top rounding beyond what the body can hold stays one printable solid', () => {
  const { indices, warnings } = knob({ topRounding: 30 });
  assert.ok(indices.length > 0);
  assert.ok(!warnings.some((w) => w.includes('separate pieces')));
});

test('bore makes a through hole, and no bore leaves a solid', () => {
  assert.equal(knob().genus, 1);
  assert.equal(knob({ boreDiameter: 0 }).genus, 0);
});

test('pocket removes exactly a hexagon including clearance', () => {
  const noBore = { boreDiameter: 0 };
  const removed = knob({ ...noBore, pocketFloor: 15 }).volume - knob({ ...noBore, pocketFloor: 14 }).volume;
  const flats = 10 + 0.3;
  near(removed, (Math.sqrt(3) / 2) * flats ** 2);
});

test('floor thickness is measured up from the bottom oval face, whatever the body height', () => {
  const noBore = { boreDiameter: 0, topRounding: 0, nutWidth: 10, nutClearance: 0 };
  const hexArea = (Math.sqrt(3) / 2) * 10 ** 2;
  const removedBy = (bodyHeight) =>
    knob({ ...noBore, bodyHeight, pocketFloor: bodyHeight }).volume
    - knob({ ...noBore, bodyHeight, pocketFloor: 4 }).volume;
  near(removedBy(10), hexArea * 6);
  near(removedBy(30), hexArea * 26);
});

test('no pocket when the floor reaches the top face', () => {
  const { genus, volume } = knob({ pocketFloor: 40, boreDiameter: 0 });
  assert.equal(genus, 0);
  near(volume, knob({ pocketFloor: 20, boreDiameter: 0 }).volume);
});

test('extra hole is optional and stops at the pocket floor', () => {
  const plain = knob();
  const holed = knob({ holeDiameter: 4 });
  assert.equal(knob({ holeDiameter: 0 }).volume, plain.volume);
  // 2 mm radius, 5 mm deep; a 96-sided hole has slightly less area than a circle
  near(plain.volume - holed.volume, Math.PI * 2 ** 2 * 5, 0.1);
  assert.deepEqual(holed.warnings, []);
});

test('extra hole position runs from the centre to the outer ellipse', () => {
  const floorEdge = (holePosition) => {
    const { positions } = knob({ holeDiameter: 4, holePosition, nutWidth: 3, nutClearance: 0, boreDiameter: 0 });
    let max = 0;
    for (let i = 0; i < positions.length; i += 3) {
      if (Math.abs(positions[i + 2] - 17) < 1e-3 && Math.abs(positions[i + 1]) < 3) max = Math.max(max, positions[i]);
    }
    return max;
  };
  near(floorEdge(0), 2);
  near(floorEdge(50), 10 + 2);
});

test('extra hole needs a pocket floor to reach', () => {
  const noPocket = { pocketFloor: 20, boreDiameter: 0 };
  assert.equal(knob({ ...noPocket, holeDiameter: 4 }).volume, knob(noPocket).volume);
});

test('extra hole at the very edge leaves a notch in one piece', () => {
  const { warnings } = knob({ holeDiameter: 4, holePosition: 100 });
  assert.ok(warnings.some((w) => w.includes('outer edge')));
  assert.ok(!warnings.some((w) => w.includes('separate pieces')));
});

const grooveInput = { ...defaultValues(), bodyLength: 60, bodyWidth: 28, grooveCount: 3, grooveSpacing: 4, groovePosition: 30 };

test('grooves form four packs, centred on the ellipse outline', () => {
  const centres = groovePositions(grooveInput);
  assert.equal(centres.length, 12);
  for (const [x, y] of centres) near((x / 30) ** 2 + (y / 14) ** 2, 1, 1e-6);
  for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    assert.equal(centres.filter(([x, y]) => x * sx > 0 && y * sy > 0).length, 3);
  }
});

test('groove pack position runs from the tip to level with the centre', () => {
  const single = (groovePosition) => groovePositions({ ...grooveInput, grooveCount: 1, groovePosition })[0];
  near(single(0)[0], 30);
  near(single(30)[0], 30 * 0.7);
  near(single(100)[0], 0);
  near(single(100)[1], 14);
});

test('grooves in a pack are spaced evenly along the curve', () => {
  const pack = groovePositions(grooveInput).filter((_, i) => i % 4 === 0);
  const [first, middle, last] = pack;
  near(Math.hypot(first[0] - middle[0], first[1] - middle[1]), 4, 0.02);
  near(Math.hypot(last[0] - middle[0], last[1] - middle[1]), 4, 0.02);
});

test('grooves cut half cylinders along the full body height and are optional', () => {
  const shared = { bodyLength: 60, topRounding: 0, grooveSpacing: 8, grooveDiameter: 3 };
  const plain = knob(shared).volume;
  const cut = plain - knob({ ...shared, grooveCount: 3 }).volume;
  near(cut, 12 * (Math.PI * 1.5 ** 2 / 2) * 20, 0.03 * cut);
  assert.equal(knob({ ...shared, grooveCount: 0 }).volume, plain);
});

test('grooves leave a stud wider than the body untouched', () => {
  const wide = { bodyWidth: 12, studDiameter: 14, nutWidth: 3, topRounding: 0, grooveDiameter: 4 };
  const { positions } = knob({ ...wide, grooveCount: 1, groovePosition: 100 });
  for (let i = 2; i < positions.length; i += 3) {
    assert.ok(positions[i] === 0 || positions[i] >= 2, 'a groove cut into the stud');
  }
});

test('hexagon flats face the short axis of the oval', () => {
  const { positions } = knob({ boreDiameter: 0 });
  const floor = [];
  for (let i = 0; i < positions.length; i += 3) {
    const [x, y, z] = positions.subarray(i, i + 3);
    if (Math.abs(z - 17) < 1e-3 && Math.hypot(x, y) < 7) floor.push([x, y]); // skips the outer surface
  }
  near(Math.max(...floor.map(([x]) => x)), 10.3 / Math.sqrt(3));
  near(Math.max(...floor.map(([, y]) => y)), 10.3 / 2);
});

test('unprintable dimensions are reported', () => {
  const warned = (overrides, text) =>
    assert.ok(knob(overrides).warnings.some((w) => w.includes(text)), text);

  warned({ boreDiameter: 13 }, 'removes it');
  warned({ boreDiameter: 11 }, 'nothing to sit on');
  warned({ pocketFloor: 0 }, 'all the way through');
  warned({ bodyWidth: 12 }, 'side wall');
  warned({ topRounding: 12 }, 'rounding reaches the pocket');
  warned({ pocketFloor: 1 }, 'floor under the pocket');
  warned({ pocketFloor: 20 }, 'no nut pocket');
  warned({ holeDiameter: 4, holePosition: 30 }, 'from the nut pocket');
  warned({ grooveCount: 1, groovePosition: 100, grooveDiameter: 15, bodyWidth: 20 }, 'from the nut pocket');
  warned({ grooveCount: 1, groovePosition: 30, holeDiameter: 4, holePosition: 70, grooveDiameter: 15 }, 'from the extra hole');
  warned({ holeDiameter: 4, holePosition: 90 }, 'from the outer edge');
  warned({ nutWidth: 30, pocketFloor: 0, boreDiameter: 0, studDiameter: 3 }, 'separate pieces');
});

test('a knob with nothing left still returns an empty mesh', () => {
  const { indices } = knob({
    bodyLength: 10, bodyWidth: 10, bodyHeight: 5, studDiameter: 3, boreDiameter: 20, nutWidth: 30, pocketFloor: 0,
  });
  assert.equal(indices.length, 0);
});
