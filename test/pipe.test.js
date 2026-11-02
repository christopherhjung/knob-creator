import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Manifold, Mesh } from '../src/manifold.js';
import { defaultValues } from '../src/params.js';
import { bezier, buildPipe, isPath, PIPE_PARAMS, samplePath, splitSegment } from '../src/pipe.js';

const pipe = (overrides = {}) => ({ ...defaultValues(PIPE_PARAMS), ...overrides });
const straight = [[0, 0], [10, 0], [20, 0], [30, 0]];

function lowest({ positions }) {
  let z = Infinity;
  for (let i = 2; i < positions.length; i += 3) z = Math.min(z, positions[i]);
  return z;
}

/** Lowest and highest z of the vertices whose x is within 1e-3 of `x`. */
function heightsAt({ positions }, x) {
  const z = [];
  for (let i = 0; i < positions.length; i += 3) if (Math.abs(positions[i] - x) < 1e-3) z.push(positions[i + 2]);
  return [Math.min(...z), Math.max(...z)];
}

test('a straight pipe has the volume of its 48-sided tube', () => {
  const { volume, warnings } = buildPipe(pipe({ path: straight, innerA: 20, innerB: 20, wall: 2, socketLength: 0, extendA: 0, extendB: 0 }));
  const polygonArea = (radius) => 24 * Math.sin(Math.PI / 24) * radius ** 2;
  assert.ok(Math.abs(volume - (polygonArea(12) - polygonArea(10)) * 30) < 1e-3, volume);
  assert.deepEqual(warnings, []);
});

test('the default pipe is one closed solid lying on the bed', () => {
  const mesh = buildPipe(pipe());
  const solid = new Manifold(new Mesh({ numProp: 3, vertProperties: mesh.positions, triVerts: mesh.indices }));
  try {
    assert.equal(solid.status(), 'NoError');
    assert.equal(solid.genus(), 1); // one bore through it
    assert.ok(Math.abs(solid.volume() - mesh.volume) < 1e-3 * mesh.volume);
  } finally {
    solid.delete();
  }
  assert.ok(Math.abs(lowest(mesh)) < 1e-6);
});

test('the sockets keep their diameter and the middle tapers', () => {
  const samples = samplePath(pipe({ path: [[0, 0], [30, 0], [60, 0], [90, 0]], innerA: 20, innerB: 40, socketLength: 15, extendA: 0, extendB: 0 }));
  const at = (s) => samples.find((sample) => Math.abs(sample.s - s) < 0.01).r;
  assert.equal(at(0), 10);
  assert.equal(at(13.5), 10);
  assert.equal(at(45), 15);
  assert.equal(at(76.5), 20);
  assert.equal(samples.at(-1).r, 20);
});

test('a pipe that runs into itself still comes out as one closed solid', () => {
  const mesh = buildPipe(pipe({ path: [[-30, 0], [40, 0], [40, 40], [-30, 0]] }));
  assert.ok(mesh.warnings.includes('The pipe runs into itself.'));
  assert.ok(mesh.volume > 0);
  assert.ok(Math.abs(lowest(mesh)) < 1e-6);
});

test('the live preview of a pipe touching itself skips the union and says so', () => {
  const knot = pipe({ path: [[-30, 0], [40, 0], [40, 40], [-30, 0]] });
  const started = performance.now();
  const preview = buildPipe(knot, false);
  assert.ok(performance.now() - started < 100, 'quick enough to drag');
  assert.equal(preview.approximate, true);
  assert.equal(buildPipe(knot).approximate, false);
  assert.equal(buildPipe(pipe(), false).approximate, false); // nothing to resolve, already exact
});

test('both ends and the curve share one centre height, the widest part on the bed', () => {
  const mesh = buildPipe(pipe({ path: straight, innerA: 20, innerB: 32, wall: 2, socketLength: 0, extendA: 0, extendB: 0 }));
  const [startLow, startHigh] = heightsAt(mesh, 0);
  const [endLow, endHigh] = heightsAt(mesh, 30);
  assert.ok(Math.abs((startLow + startHigh) / 2 - 18) < 1e-4, `start centre ${(startLow + startHigh) / 2}`);
  assert.ok(Math.abs((endLow + endHigh) / 2 - 18) < 1e-4, `end centre ${(endLow + endHigh) / 2}`);
  assert.ok(Math.abs(startLow - 6) < 1e-4); // the thin end floats above the bed
  assert.ok(Math.abs(endLow) < 1e-4);
});

test('straight extensions continue each end at its diameter', () => {
  const values = pipe({ path: straight, innerA: 20, innerB: 32, socketLength: 0, extendA: 10, extendB: 5 });
  const samples = samplePath(values);
  assert.deepEqual([samples[0].x, samples[0].y], [-10, 0]);
  assert.deepEqual([samples.at(-1).x, samples.at(-1).y], [35, 0]);
  const at = (x) => samples.find((sample) => Math.abs(sample.x - x) < 0.01).r;
  assert.equal(at(-10), 10);
  assert.equal(at(0), 10); // the taper starts where the drawn curve does
  assert.equal(at(30), 16);
  assert.deepEqual(buildPipe(values).warnings, []);
});

test('splitting a segment adds a point on the curve and keeps its shape', () => {
  const path = [[-50, -30], [-10, -30], [30, -10], [30, 30]];
  const original = path.map((point) => [...point]);
  splitSegment(path, 0, 0.3);
  assert.equal(path.length, 7);
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9;
  assert.ok(near(path[3], bezier(original, 0.3)), 'the new anchor lies on the old curve');
  for (const t of [0.1, 0.5, 0.9]) {
    assert.ok(near(bezier(path.slice(0, 4), t), bezier(original, 0.3 * t)));
    assert.ok(near(bezier(path.slice(3, 7), t), bezier(original, 0.3 + 0.7 * t)));
  }
  assert.ok(isPath(path));
});

test('each end and its extension follow the handle direction exactly', () => {
  const path = [[0, 0], [7, 3], [40, 10], [50, 0]];
  const samples = samplePath(pipe({ path, extendA: 10, extendB: 6 }));
  const unit = ([x, y]) => [x / Math.hypot(x, y), y / Math.hypot(x, y)];
  const [ax, ay] = unit([7, 3]);
  const [bx, by] = unit([10, -10]); // from the end's control point out through the end
  const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} vs ${expected}`);

  for (const sample of samples.slice(0, 2)) { near(sample.tx, ax); near(sample.ty, ay); }
  for (const sample of samples.slice(-2)) { near(sample.tx, bx); near(sample.ty, by); }
  near(samples[0].x, -10 * ax);
  near(samples[0].y, -10 * ay);
  near(samples.at(-1).x, 50 + 6 * bx);
  near(samples.at(-1).y, 6 * by);

  // A control point on its anchor falls back to the next point.
  const [first] = samplePath(pipe({ path: [[0, 0], [0, 0], [0, 20], [30, 20]], extendA: 0 }));
  assert.deepEqual([first.tx, first.ty], [0, 1]);
});
