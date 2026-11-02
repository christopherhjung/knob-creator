import { Manifold } from './manifold.js';

const SEGMENTS = 48; // a multiple of 4, so one vertex of every ring touches the bed
const STEPS = 40; // samples per Bézier segment
const EPS = 1; // how far the bore overshoots the ends, so faces never coincide
const MAX_ANCHORS = 50;

// The centre line, in bed coordinates seen from above (mm, origin at the bed centre,
// +Y towards the back): cubic Bézier segments as anchor, control, control, anchor, …
export const DEFAULT_PATH = [[-50, -30], [-10, -30], [30, -10], [30, 30]];

const isPoint = (point) => Array.isArray(point) && point.length === 2 && point.every(Number.isFinite);

export const isPath = (path) => Array.isArray(path) && path.length >= 4 && (path.length - 1) % 3 === 0
  && path.length <= 3 * MAX_ANCHORS + 1 && path.every(isPoint);

export const PIPE_PARAMS = [
  { group: 'Pipe ends', key: 'innerA', label: 'Inner diameter at the start', min: 3, max: 150, step: 0.1, value: 20 },
  { group: 'Pipe ends', key: 'innerB', label: 'Inner diameter at the end', min: 3, max: 150, step: 0.1, value: 32 },
  // Each end keeps its diameter this far along the pipe, so the pipe can slide in.
  { group: 'Pipe ends', key: 'socketLength', label: 'Socket length (same diameter)', min: 0, max: 100, step: 0.5, value: 15 },
  // Straight pieces continuing each end of the drawn curve, at that end's diameter.
  { group: 'Pipe ends', key: 'extendA', label: 'Straight extension at the start', min: 0, max: 100, step: 0.5, value: 10 },
  { group: 'Pipe ends', key: 'extendB', label: 'Straight extension at the end', min: 0, max: 100, step: 0.5, value: 10 },
  { group: 'Wall', key: 'wall', label: 'Wall thickness', min: 0.8, max: 10, step: 0.1, value: 2 },
  // Edited on the canvas, so it has no group and no slider.
  { key: 'path', value: DEFAULT_PATH, validate: isPath },
];

export const bezier = ([a, b, c, d], t) => {
  const u = 1 - t;
  return [0, 1].map((i) => u * u * u * a[i] + 3 * u * u * t * b[i] + 3 * u * t * t * c[i] + t * t * t * d[i]);
};

const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

/**
 * Splits the segment starting at anchor index `start` at parameter t, in place, adding an
 * anchor with two control points there. The curve keeps exactly its shape (de Casteljau).
 */
export function splitSegment(path, start, t) {
  const [p0, p1, p2, p3] = path.slice(start, start + 4);
  const a = lerp(p0, p1, t);
  const b = lerp(p1, p2, t);
  const c = lerp(p2, p3, t);
  const d = lerp(a, b, t);
  const e = lerp(b, c, t);
  path.splice(start + 1, 2, a, d, lerp(d, e, t), e, c);
}

/**
 * Points along the centre line, straight extensions included, with their arc length `s`,
 * unit tangent [tx, ty], inner radius `r`, outer radius `R` and centre height `z`.
 */
export function samplePath({ path, innerA, innerB, wall, socketLength, extendA, extendB }) {
  const points = [];
  for (let i = 0; i + 3 < path.length; i += 3) {
    for (let k = i ? 1 : 0; k <= STEPS; k++) {
      const point = bezier(path.slice(i, i + 4), k / STEPS);
      const last = points.at(-1);
      if (!last || Math.hypot(point[0] - last[0], point[1] - last[1]) > 1e-6) points.push(point);
    }
  }

  // Each end points exactly along its handle, anchor to control point. A control point
  // lying on its anchor has no direction, so the next point that differs takes over.
  const direction = (anchor, ...towards) => {
    for (const [x, y] of towards) {
      const length = Math.hypot(x - anchor[0], y - anchor[1]);
      if (length > 1e-9) return [(x - anchor[0]) / length, (y - anchor[1]) / length];
    }
    return [1, 0];
  };
  const [ax, ay] = direction(path[0], path[1], path[2], path[3]); // into the pipe
  const [bx, by] = direction(path.at(-1), path.at(-2), path.at(-3), path.at(-4)); // back into the pipe

  // Extensions continue straight out of each end, against those directions.
  const extendedA = extendA > 0 && points.length > 1;
  const extendedB = extendB > 0 && points.length > 1;
  if (extendedA) points.unshift([points[0][0] - ax * extendA, points[0][1] - ay * extendA]);
  if (extendedB) points.push([points.at(-1)[0] - bx * extendB, points.at(-1)[1] - by * extendB]);

  let s = 0;
  const samples = points.map(([x, y], i) => {
    if (i) s += Math.hypot(x - points[i - 1][0], y - points[i - 1][1]);
    // Tangents from neighbours, since a control point on its anchor has no derivative.
    const [px, py] = points[Math.max(0, i - 1)];
    const [nx, ny] = points[Math.min(points.length - 1, i + 1)];
    const length = Math.hypot(nx - px, ny - py) || 1;
    return { x, y, s, tx: (nx - px) / length, ty: (ny - py) / length };
  });
  // The end faces, and the anchors where the extensions join, use the exact handle directions.
  for (const sample of samples.slice(0, extendedA ? 2 : 1)) [sample.tx, sample.ty] = [ax, ay];
  for (const sample of samples.slice(extendedB ? -2 : -1)) [sample.tx, sample.ty] = [-bx, -by];

  // Each end keeps its diameter over its extension and socket; the rest tapers.
  let start = extendA + socketLength;
  let end = extendB + socketLength;
  if (start + end > s) [start, end] = [start, end].map((length) => (length * s) / (start + end));
  const taper = s - start - end;
  for (const sample of samples) {
    const f = taper > 0 ? Math.min(1, Math.max(0, (sample.s - start) / taper)) : Number(sample.s > start);
    sample.r = (innerA + (innerB - innerA) * f) / 2;
    sample.R = sample.r + wall;
  }
  // The whole centre line sits at one height, so the widest part rests on the bed.
  const z = Math.max(...samples.map((sample) => sample.R));
  for (const sample of samples) sample.z = z;
  return samples;
}

const ring = ({ x, y, z, tx, ty }, radius, shift = 0) => Array.from({ length: SEGMENTS }, (_, j) => {
  const angle = (2 * Math.PI * j) / SEGMENTS;
  const side = Math.cos(angle) * radius;
  return [x + tx * shift - ty * side, y + ty * shift + tx * side, z + Math.sin(angle) * radius];
});

/**
 * Builds the pipe lying on the bed: the centre line follows the path in X/Y at one
 * height, with the widest part touching z = 0.
 *
 * @param {boolean} [exact] false skips the slow union where the pipe touches itself,
 *   for a live preview; the mesh is then marked `approximate` and is not printable
 * @returns {{positions: Float32Array, indices: Uint32Array, volume: number, warnings: string[],
 *            approximate: boolean}}
 */
export function buildPipe(p, exact = true) {
  const samples = samplePath(p);
  const { warnings, touchesItself } = findProblems(p, samples);
  const approximate = touchesItself && !exact;
  const { positions, indices } = touchesItself && exact ? unionMesh(samples) : sweptMesh(samples);
  return { positions, indices, volume: volumeOf(positions, indices), warnings, approximate };
}

/** Outer and inner tube joined by the two end faces. Exact, but only valid while the pipe never touches itself. */
function sweptMesh(samples) {
  const count = samples.length;
  const vertices = [...samples.flatMap((sample) => ring(sample, sample.R)), ...samples.flatMap((sample) => ring(sample, sample.r))];
  const outer = (i, j) => i * SEGMENTS + (j % SEGMENTS);
  const inner = (i, j) => (count + i) * SEGMENTS + (j % SEGMENTS);
  const indices = [];
  const quad = (a, b, c, d) => indices.push(a, b, c, a, c, d);

  for (let j = 0; j < SEGMENTS; j++) {
    for (let i = 0; i + 1 < count; i++) {
      quad(outer(i, j), outer(i, j + 1), outer(i + 1, j + 1), outer(i + 1, j));
      quad(inner(i, j), inner(i + 1, j), inner(i + 1, j + 1), inner(i, j + 1));
    }
    quad(outer(0, j), inner(0, j), inner(0, j + 1), outer(0, j + 1));
    const end = count - 1;
    quad(outer(end, j), outer(end, j + 1), inner(end, j + 1), inner(end, j));
  }
  return { positions: Float32Array.from(vertices.flat()), indices: Uint32Array.from(indices) };
}

/**
 * Unions convex hulls between neighbouring rings, which resolves a pipe running into itself.
 * ponytail: about 200 ms and notches of R·θ²/8 on the outside of bends; only used when the swept mesh would be invalid.
 */
function unionMesh(samples) {
  const last = samples.length - 1;
  const made = [];
  const keep = (solid) => (made.push(solid), solid);
  const hulls = (radius, overshoot) => samples.slice(0, -1).map((sample, i) => keep(Manifold.hull([
    ...ring(sample, radius(sample), i === 0 ? -overshoot : 0),
    ...ring(samples[i + 1], radius(samples[i + 1]), i + 1 === last ? overshoot : 0),
  ])));

  try {
    const outer = keep(Manifold.union(hulls((sample) => sample.R, 0)));
    const bore = keep(Manifold.union(hulls((sample) => sample.r, EPS)));
    const mesh = keep(outer.subtract(bore)).getMesh();
    return { positions: Float32Array.from(mesh.vertProperties), indices: Uint32Array.from(mesh.triVerts) };
  } finally {
    made.forEach((solid) => solid.delete());
  }
}

/** Signed volume of a closed mesh, in mm³. */
function volumeOf(positions, indices) {
  let sum = 0;
  for (let k = 0; k < indices.length; k += 3) {
    const [a, b, c] = [0, 1, 2].map((n) => indices[k + n] * 3);
    const at = (v, n) => positions[v + n];
    sum += at(a, 0) * (at(b, 1) * at(c, 2) - at(b, 2) * at(c, 1))
      - at(a, 1) * (at(b, 0) * at(c, 2) - at(b, 2) * at(c, 0))
      + at(a, 2) * (at(b, 0) * at(c, 1) - at(b, 1) * at(c, 0));
  }
  return sum / 6;
}

function findProblems(p, samples) {
  const warnings = [];
  const length = samples.at(-1).s;
  if (2 * p.socketLength > length - p.extendA - p.extendB) warnings.push('The sockets are longer than the pipe.');

  // Bend radius from the turn between neighbouring tangents.
  const widest = Math.max(...samples.map((sample) => sample.R));
  const tightest = Math.min(...samples.slice(1).map((sample, i) => {
    const before = samples[i];
    const turn = Math.acos(Math.min(1, before.tx * sample.tx + before.ty * sample.ty));
    return turn > 1e-9 ? (sample.s - before.s) / turn : Infinity;
  }));
  const pinched = tightest < widest;
  if (pinched) warnings.push('A bend is tighter than the pipe is wide, so the bore gets pinched.');

  // ponytail: O(n²) over ~40 samples per segment, fine below a few thousand samples.
  const crosses = samples.some((a, i) => samples.slice(i + 1).some((b) =>
    b.s - a.s > 2 * (a.R + b.R) && Math.hypot(a.x - b.x, a.y - b.y) < a.R + b.R));
  if (crosses) warnings.push('The pipe runs into itself.');

  return { warnings, touchesItself: pinched || crosses };
}
