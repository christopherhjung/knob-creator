import Module from 'manifold-3d';

const wasm = await Module();
wasm.setup();
const { Manifold } = wasm;

const SEGMENTS = 96;
const ROUNDING_STEPS = 12;
const MIN_WALL = 1.2; // mm, about three perimeters on a 0.4 mm nozzle
const EPS = 1; // how far cutting tools overshoot the surface, so faces never coincide

/**
 * Builds the knob along +Z with the stud end at z = 0.
 * The nut pocket opens at the top, so a bolt coming up through the stud pulls
 * the nut into the plastic instead of out of it.
 *
 * @returns {{positions: Float32Array, indices: Uint32Array, volume: number,
 *            genus: number, warnings: string[]}}
 */
export function buildKnob(p) {
  // Manifold objects live in WASM memory and are not garbage collected.
  const made = [];
  const keep = (solid) => (made.push(solid), solid);

  const flatRadius = (p.nutWidth + p.nutClearance) / 2;
  const cornerRadius = flatRadius / Math.cos(Math.PI / 6);
  const top = p.studHeight + p.bodyHeight;
  const pocketDepth = p.bodyHeight - p.pocketFloor;

  try {
    const body = keep(Manifold.hull(bodyPoints(p)));
    const stud = keep(Manifold.cylinder(p.studHeight, p.studDiameter / 2, p.studDiameter / 2, SEGMENTS));

    let knob = keep(stud.add(body));

    if (pocketDepth > 0) {
      // A 6-sided cylinder has its corners on X, so the flats face the short axis
      // of the oval, which is where the wall is thinnest.
      const pocket = keep(keep(Manifold.cylinder(pocketDepth + EPS, cornerRadius, cornerRadius, 6))
        .translate([0, 0, top - pocketDepth]));
      knob = keep(knob.subtract(pocket));

      if (p.holeDiameter > 0) {
        const hole = keep(keep(Manifold.cylinder(pocketDepth + EPS, p.holeDiameter / 2, p.holeDiameter / 2, SEGMENTS))
          .translate([holeOffset(p), 0, top - pocketDepth]));
        knob = keep(knob.subtract(hole));
      }
    }

    if (p.boreDiameter > 0) {
      const bore = keep(keep(Manifold.cylinder(top + 2 * EPS, p.boreDiameter / 2, p.boreDiameter / 2, SEGMENTS))
        .translate([0, 0, -EPS]));
      knob = keep(knob.subtract(bore));
    }

    const mesh = knob.getMesh();
    const pieces = knob.decompose();
    pieces.forEach(keep);

    return {
      positions: Float32Array.from(mesh.vertProperties),
      indices: Uint32Array.from(mesh.triVerts),
      volume: knob.volume(),
      genus: knob.genus(),
      warnings: findProblems(p, flatRadius, cornerRadius, pieces.length),
    };
  } finally {
    new Set(made).forEach((solid) => solid.delete());
  }
}

/** Extra hole centre on the X axis: 0% is the knob's centre, 100% the outer ellipse. */
const holeOffset = (p) => (p.holePosition / 100) * (p.bodyLength / 2);

/** Largest fillet the body can hold, however far the slider goes. */
const roundingRadius = (p) =>
  Math.min(p.topRounding, p.bodyHeight, p.bodyLength / 2, p.bodyWidth / 2);

/** How far the outline has moved inwards at `depth` below the top face. */
function insetAt(radius, depth) {
  if (depth >= radius) return 0;
  return radius - Math.sqrt(radius ** 2 - (radius - depth) ** 2);
}

/**
 * Ellipse rings from the base up the fillet. The body is convex, so their hull
 * is the solid. Reducing both semi-axes by the same inset is exact on the X and
 * Y axes and a close approximation of a true offset curve in between.
 */
function bodyPoints(p) {
  const radius = roundingRadius(p);
  const top = p.studHeight + p.bodyHeight;

  const rings = [[p.studHeight, 0]];
  for (let i = 0; i <= ROUNDING_STEPS; i++) {
    const depth = radius * (1 - Math.sin((i / ROUNDING_STEPS) * Math.PI / 2));
    rings.push([top - depth, insetAt(radius, depth)]);
  }

  return rings.flatMap(([z, inset]) =>
    Array.from({ length: SEGMENTS }, (_, i) => {
      const angle = (i / SEGMENTS) * 2 * Math.PI;
      return [
        (p.bodyLength / 2 - inset) * Math.cos(angle),
        (p.bodyWidth / 2 - inset) * Math.sin(angle),
        z,
      ];
    }));
}

function findProblems(p, flatRadius, cornerRadius, pieceCount) {
  const warnings = [];

  if (p.boreDiameter >= p.studDiameter) {
    warnings.push('The bore is at least as wide as the stud and removes it.');
  }

  const pocketDepth = p.bodyHeight - p.pocketFloor;
  if (pocketDepth <= 0) {
    warnings.push('The floor reaches the top face, so there is no nut pocket.');
    return warnings;
  }

  if (p.boreDiameter >= 2 * flatRadius) {
    warnings.push('The bore is wider than the nut, so the nut has nothing to sit on.');
  }

  // Hexagon and ellipse are both convex, so the corners are the tightest points.
  // Returns how much of an outline, inset by `inset`, the hexagon fills (1 = touching).
  const reach = (inset) => {
    const a = p.bodyLength / 2 - inset;
    const b = p.bodyWidth / 2 - inset;
    return Math.max(cornerRadius / a, Math.hypot(cornerRadius / 2 / a, flatRadius / b));
  };

  const radius = roundingRadius(p);
  const floorInset = insetAt(radius, pocketDepth);
  const wall = (1 - reach(floorInset)) * (p.bodyWidth / 2 - floorInset);
  if (wall < MIN_WALL) {
    warnings.push(`The side wall around the pocket is only ${Math.max(0, wall).toFixed(1)} mm thick.`);
  } else if (reach(radius) > 1) {
    warnings.push('The rounding reaches the pocket, so the rim is lower than the top face.');
  }

  if (p.holeDiameter > 0) {
    const x = holeOffset(p);
    const holeRadius = p.holeDiameter / 2;

    // The hexagon's corner points along X, straight at the hole.
    const gap = x - holeRadius - cornerRadius;
    if (gap < MIN_WALL) {
      warnings.push(`The extra hole is only ${Math.max(0, gap).toFixed(1)} mm from the nut pocket.`);
    }

    const a = p.bodyLength / 2 - floorInset;
    const b = p.bodyWidth / 2 - floorInset;
    const toEdge = Math.min(...Array.from({ length: SEGMENTS }, (_, i) => {
      const angle = (i / SEGMENTS) * 2 * Math.PI;
      return Math.hypot(a * Math.cos(angle) - x, b * Math.sin(angle));
    }));
    if (toEdge - holeRadius < MIN_WALL) {
      warnings.push(`The extra hole is only ${Math.max(0, toEdge - holeRadius).toFixed(1)} mm from the outer edge.`);
    }
  }

  if (p.pocketFloor <= 0) {
    warnings.push('The nut pocket cuts all the way through the body.');
  } else if (p.pocketFloor < MIN_WALL) {
    warnings.push(`The floor under the pocket is only ${p.pocketFloor.toFixed(1)} mm thick.`);
  }

  if (pieceCount > 1) {
    warnings.push(`The model has split into ${pieceCount} separate pieces.`);
  }
  return warnings;
}
