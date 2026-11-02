import { bezier, samplePath, splitSegment } from './pipe.js';

const BED_SIZE = 210;
const HIT = 9; // px
const SNAP = 0.5; // mm
const GRID = 5; // mm, anchors pull onto these lines…
const GRID_RANGE = 1; // mm, …from this close
const ANGLE_SNAP = Math.PI / 4; // control points pull towards multiples of 45°…
const SNAP_RANGE = (6 * Math.PI) / 180; // …when within 6° of one, and stay free in between

/**
 * A top view of the bed for drawing the pipe's centre line, a chain of cubic Béziers
 * (anchor, control, control, anchor, …) in values.path, which is edited in place.
 * Canvas up is the back of the bed (+Y), like looking down on the printer from the front.
 * @param {() => object} getValues current pipe values
 * @param {() => void} onChange called after every edit
 */
export function createPathEditor(canvas, getValues, onChange) {
  const context = canvas.getContext('2d');
  const view = { x: 0, y: 0, scale: 1, fitted: false }; // mm at the centre, px per mm
  let drag = null;

  const style = (name) => getComputedStyle(canvas).getPropertyValue(name).trim();
  const toScreen = ([x, y]) => [
    (x - view.x) * view.scale + canvas.width / 2,
    canvas.height / 2 - (y - view.y) * view.scale,
  ];
  const toBed = (event) => {
    const box = canvas.getBoundingClientRect();
    const px = (event.clientX - box.left) * devicePixelRatio;
    const py = (event.clientY - box.top) * devicePixelRatio;
    return [(px - canvas.width / 2) / view.scale + view.x, (canvas.height / 2 - py) / view.scale + view.y];
  };
  const round = (value, step) => Math.round(value / step) * step;
  // Each axis on its own, so a point can sit on one grid line and anywhere along it.
  const magnet = (value) => (Math.abs(value - round(value, GRID)) < GRID_RANGE ? round(value, GRID) : round(value, SNAP));
  const snapAnchor = ([x, y]) => [magnet(x), magnet(y)];

  function hitPoint(event) {
    const { path } = getValues();
    const [mx, my] = toScreen(toBed(event));
    let best = -1;
    let bestDistance = HIT * devicePixelRatio;
    path.forEach((point, i) => {
      const [x, y] = toScreen(point);
      const distance = Math.hypot(x - mx, y - my);
      // Anchors win over a control point lying on top of them.
      if (distance < bestDistance || (distance === bestDistance && i % 3 === 0)) {
        best = i;
        bestDistance = distance;
      }
    });
    return best;
  }

  function draw() {
    const { width, height } = canvas;
    const values = getValues();
    const { path } = values;
    const px = devicePixelRatio;
    context.clearRect(0, 0, width, height);

    // Bed with the 5 mm grid the anchors snap to.
    const half = BED_SIZE / 2;
    context.lineWidth = px;
    context.strokeStyle = style('--line');
    context.beginPath();
    for (let mm = -half; mm <= half; mm += GRID) {
      const [x0, y0] = toScreen([mm, -half]);
      const [x1, y1] = toScreen([mm, half]);
      context.moveTo(x0, y0); context.lineTo(x1, y1);
      const [x2, y2] = toScreen([-half, mm]);
      const [x3, y3] = toScreen([half, mm]);
      context.moveTo(x2, y2); context.lineTo(x3, y3);
    }
    context.stroke();
    context.strokeStyle = style('--muted');
    const [left, top] = toScreen([-half, half]);
    context.strokeRect(left, top, BED_SIZE * view.scale, BED_SIZE * view.scale);
    context.fillStyle = style('--muted');
    context.font = `${12 * px}px system-ui, sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'alphabetic'; // the rulers leave it changed
    context.fillText(canvas.dataset.front, width / 2 - view.x * view.scale, toScreen([0, -half])[1] + 16 * px);

    // The pipe's outline, as wide as its outer diameter.
    const samples = samplePath(values);
    const side = (sign) => samples.map(({ x, y, tx, ty, R }) => toScreen([x - sign * ty * R, y + sign * tx * R]));
    context.beginPath();
    [...side(1), ...side(-1).reverse()].forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)));
    context.closePath();
    context.fillStyle = style('--pipe');
    context.fill();

    context.beginPath();
    samples.forEach((sample, i) => context[i ? 'lineTo' : 'moveTo'](...toScreen([sample.x, sample.y])));
    context.strokeStyle = style('--accent');
    context.lineWidth = 2 * px;
    context.stroke();

    // Handles from each anchor to its control points.
    context.strokeStyle = style('--muted');
    context.lineWidth = px;
    context.beginPath();
    for (let i = 0; i + 3 < path.length; i += 3) {
      context.moveTo(...toScreen(path[i])); context.lineTo(...toScreen(path[i + 1]));
      context.moveTo(...toScreen(path[i + 3])); context.lineTo(...toScreen(path[i + 2]));
    }
    context.stroke();

    path.forEach((point, i) => {
      const [x, y] = toScreen(point);
      context.beginPath();
      if (i % 3 === 0) context.rect(x - 5 * px, y - 5 * px, 10 * px, 10 * px);
      else context.arc(x, y, 4 * px, 0, 2 * Math.PI);
      context.fillStyle = i === 0 ? style('--start') : i % 3 === 0 ? style('--text') : style('--bg');
      context.fill();
      context.strokeStyle = style('--text');
      context.stroke();
    });

    drawRulers();
  }

  /** Millimetre rulers along the top and left edges, in bed coordinates, following zoom and pan. */
  function drawRulers() {
    const { width, height } = canvas;
    const px = devicePixelRatio;
    const band = 24 * px;
    // Labels at least 50 px apart, unlabelled ticks halfway between them.
    const step = [1, 2, 5, 10, 20, 50, 100].find((mm) => mm * view.scale >= 50 * px) ?? 100;

    context.fillStyle = style('--panel');
    context.fillRect(0, 0, width, band);
    context.fillRect(0, 0, band, height);
    context.strokeStyle = style('--muted');
    context.fillStyle = style('--muted');
    context.lineWidth = px;
    context.font = `${10 * px}px system-ui, sans-serif`;

    const ticks = (from, to) => {
      const list = [];
      for (let mm = Math.ceil(from / (step / 2)) * (step / 2); mm <= to; mm += step / 2) list.push(mm);
      return list;
    };
    const label = (mm) => String(Math.round(mm * 10) / 10);
    const left = view.x - width / 2 / view.scale;
    const right = view.x + width / 2 / view.scale;
    const bottom = view.y - height / 2 / view.scale;
    const top = view.y + height / 2 / view.scale;

    context.beginPath();
    context.textAlign = 'center';
    context.textBaseline = 'top';
    for (const mm of ticks(left, right)) {
      const [x] = toScreen([mm, 0]);
      if (x < band) continue;
      const major = Math.abs(mm / step - Math.round(mm / step)) < 1e-9;
      context.moveTo(x, band);
      context.lineTo(x, band - (major ? 8 : 4) * px);
      if (major) context.fillText(label(mm), x, 3 * px);
    }
    for (const mm of ticks(bottom, top)) {
      const [, y] = toScreen([0, mm]);
      if (y < band) continue;
      const major = Math.abs(mm / step - Math.round(mm / step)) < 1e-9;
      context.moveTo(band, y);
      context.lineTo(band - (major ? 8 : 4) * px, y);
      if (major) {
        context.save();
        context.translate(3 * px, y);
        context.rotate(-Math.PI / 2);
        context.fillText(label(mm), 0, 0);
        context.restore();
      }
    }
    context.moveTo(band, band);
    context.lineTo(width, band);
    context.moveTo(band, band);
    context.lineTo(band, height);
    context.stroke();
    context.textBaseline = 'middle';
    context.fillText('mm', band / 2, band / 2);
  }

  function fit() {
    view.scale = Math.min(canvas.width, canvas.height) / (BED_SIZE + 20);
    view.x = 0;
    view.y = 0;
  }

  /** Anchors pull onto the 5 mm grid, control points to 45° steps around their anchor. Shift moves freely. */
  function snapPoint(index, at, free) {
    if (free) return at;
    if (index % 3 === 0) return snapAnchor(at);
    const [ax, ay] = getValues().path[index % 3 === 1 ? index - 1 : index + 1];
    const raw = Math.atan2(at[1] - ay, at[0] - ax);
    const nearest = Math.round(raw / ANGLE_SNAP) * ANGLE_SNAP;
    const angle = Math.abs(raw - nearest) < SNAP_RANGE ? nearest : raw;
    const length = Math.round(Math.hypot(at[0] - ax, at[1] - ay) / SNAP) * SNAP;
    return [ax + Math.cos(angle) * length, ay + Math.sin(angle) * length];
  }

  function movePoint(index, to) {
    const { path } = getValues();
    const [dx, dy] = [to[0] - path[index][0], to[1] - path[index][1]];
    if (index % 3 === 0) {
      // An anchor carries its control points along.
      for (const i of [index - 1, index, index + 1]) {
        if (path[i]) path[i] = [path[i][0] + dx, path[i][1] + dy];
      }
      return;
    }
    path[index] = to;
    // Keep the joint smooth, so the pipe has no kink: the opposite control point
    // turns to stay in line, keeping its own length.
    const anchor = index % 3 === 1 ? index - 1 : index + 1;
    const opposite = index % 3 === 1 ? index - 2 : index + 2;
    if (!path[opposite] || anchor === 0 || anchor === path.length - 1) return;
    const [ax, ay] = path[anchor];
    const length = Math.hypot(path[opposite][0] - ax, path[opposite][1] - ay);
    const [ux, uy] = [ax - to[0], ay - to[1]];
    const away = Math.hypot(ux, uy);
    if (away > 0) path[opposite] = [ax + (ux / away) * length, ay + (uy / away) * length];
  }

  function addAnchor(at) {
    const { path } = getValues();
    const end = path.at(-1);
    const [cx, cy] = path.at(-2);
    // Continue smoothly out of the last anchor.
    const out = Math.hypot(end[0] - cx, end[1] - cy) || 1;
    const third = Math.hypot(at[0] - end[0], at[1] - end[1]) / 3;
    path.push(
      [end[0] + ((end[0] - cx) / out) * third, end[1] + ((end[1] - cy) / out) * third],
      [at[0] + (end[0] - at[0]) / 3, at[1] + (end[1] - at[1]) / 3],
      at,
    );
  }

  function removeAnchor(index) {
    const { path } = getValues();
    if (path.length <= 4) return false;
    const start = index === 0 ? 0 : index === path.length - 1 ? index - 2 : index - 1;
    path.splice(start, 3);
    return true;
  }

  canvas.addEventListener('pointerdown', (event) => {
    const index = hitPoint(event);
    drag = index >= 0 ? { index } : { pan: toBed(event) };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) {
      canvas.style.cursor = hitPoint(event) >= 0 ? 'grab' : '';
      return;
    }
    const at = toBed(event);
    if (drag.pan) {
      view.x += drag.pan[0] - at[0];
      view.y += drag.pan[1] - at[1];
      draw();
      return;
    }
    movePoint(drag.index, snapPoint(drag.index, at, event.shiftKey));
    onChange();
  });
  const stop = () => { drag = null; };
  canvas.addEventListener('pointerup', stop);
  canvas.addEventListener('pointercancel', stop);

  /** The closest spot on the drawn curve: its segment's first index, t and distance in mm. */
  function nearestOnCurve(at) {
    const { path } = getValues();
    let best = { distance: Infinity };
    for (let start = 0; start + 3 < path.length; start += 3) {
      const segment = path.slice(start, start + 4);
      for (let k = 0; k <= 200; k++) {
        const [x, y] = bezier(segment, k / 200);
        const distance = Math.hypot(x - at[0], y - at[1]);
        if (distance < best.distance) best = { start, t: k / 200, distance };
      }
    }
    return best;
  }

  canvas.addEventListener('dblclick', (event) => {
    const index = hitPoint(event);
    if (index >= 0) {
      if (index % 3 !== 0 || !removeAnchor(index)) return;
    } else {
      // On the pipe: a new point there. Elsewhere: a new point at the end.
      const at = toBed(event);
      const { start, t, distance } = nearestOnCurve(at);
      const width = Math.max(...samplePath(getValues()).map((sample) => sample.R));
      if (distance > Math.max(width, HIT * devicePixelRatio / view.scale)) {
        addAnchor(event.shiftKey ? at : snapAnchor(at));
      } else if (t > 0.01 && t < 0.99) {
        splitSegment(getValues().path, start, t);
      } else {
        return; // on an end point or an extension, where there is nothing to split
      }
    }
    onChange();
  });

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const before = toBed(event);
    view.scale = Math.min(100, Math.max(0.5, view.scale * Math.exp(-event.deltaY / 500)));
    const after = toBed(event);
    view.x += before[0] - after[0]; // zoom around the cursor
    view.y += before[1] - after[1];
    draw();
  }, { passive: false });

  new ResizeObserver(() => {
    const width = Math.round(canvas.clientWidth * devicePixelRatio);
    const height = Math.round(canvas.clientHeight * devicePixelRatio);
    if (!width || !height) return;
    const ratio = view.fitted ? width / canvas.width : 1;
    canvas.width = width;
    canvas.height = height;
    if (view.fitted) view.scale *= ratio;
    else fit();
    view.fitted = true;
    draw();
  }).observe(canvas);

  return { draw };
}
