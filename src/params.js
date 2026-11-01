// value: width across flats per ISO 4032. DIN 934 nuts differ at M10 (17) and M12 (19);
// add 1 mm of clearance for those.
// bore: ISO 273 medium clearance hole, since printed holes come out undersized.
const NUT_SIZES = [
  { label: 'M3 (5.5 mm)', thread: 3, value: 5.5, bore: 3.4 },
  { label: 'M4 (7 mm)', thread: 4, value: 7, bore: 4.5 },
  { label: 'M5 (8 mm)', thread: 5, value: 8, bore: 5.5 },
  { label: 'M6 (10 mm)', thread: 6, value: 10, bore: 6.6 },
  { label: 'M8 (13 mm)', thread: 8, value: 13, bore: 9 },
  { label: 'M10 (16 mm)', thread: 10, value: 16, bore: 11 },
  { label: 'M12 (18 mm)', thread: 12, value: 18, bore: 13.5 },
];

// Every adjustable dimension, in millimetres. The UI is generated from this table.
// `scales` marks dimensions that follow the thread size when the nut changes.
// Defaults fit an M6 nut.
export const PARAMS = [
  { group: 'Stud', key: 'studDiameter', label: 'Diameter', min: 3, max: 40, step: 0.5, value: 12, scales: true },
  { group: 'Stud', key: 'studHeight', label: 'Height', min: 1, max: 40, step: 0.5, value: 2, scales: true },
  { group: 'Stud', key: 'boreDiameter', label: 'Bolt bore (0 = none)', min: 0, max: 20, step: 0.1, value: 6.6 },

  { group: 'Oval body', key: 'bodyLength', label: 'Length', min: 10, max: 100, step: 0.5, value: 40, scales: true },
  { group: 'Oval body', key: 'bodyWidth', label: 'Width', min: 10, max: 100, step: 0.5, value: 28, scales: true },
  { group: 'Oval body', key: 'bodyHeight', label: 'Height', min: 5, max: 60, step: 0.5, value: 20, scales: true },
  { group: 'Oval body', key: 'topRounding', label: 'Top edge rounding', min: 0, max: 30, step: 0.1, value: 3, scales: true },

  { group: 'Nut pocket', key: 'nutWidth', label: 'Nut size', value: 10, options: NUT_SIZES, apply: selectNut },
  // Measured up from the bottom face of the oval to the bottom of the pocket.
  { group: 'Nut pocket', key: 'pocketFloor', label: 'Floor thickness', min: 0, max: 60, step: 0.1, value: 15, scales: true },
  // Printed holes come out undersized; tune this for your printer.
  { group: 'Nut pocket', key: 'nutClearance', label: 'Clearance', min: 0, max: 2, step: 0.05, value: 0.3 },

  // Cut down to the same floor as the nut pocket.
  { group: 'Extra hole', key: 'holeDiameter', label: 'Diameter (0 = none)', min: 0, max: 30, step: 0.1, value: 0, scales: true },
  // Along the long axis: 0 is the centre hole, 100 is the outer ellipse.
  { group: 'Extra hole', key: 'holePosition', label: 'Position (% centre to edge)', unit: '%', min: 0, max: 100, step: 1, value: 70 },
];

export const defaultValues = () =>
  Object.fromEntries(PARAMS.map(({ key, value }) => [key, value]));

/**
 * Switches `values` to the nut with the given width across flats: the bore moves
 * to that thread's clearance hole (0 stays "no bore") and every `scales` dimension
 * is multiplied by the ratio of the two thread diameters, within its slider range.
 */
export function selectNut(values, flats) {
  const nutWith = (width) => NUT_SIZES.find((nut) => nut.value === width);
  const from = nutWith(values.nutWidth);
  const to = nutWith(flats);
  const factor = to.thread / from.thread;

  for (const { key, min, max, scales } of PARAMS) {
    if (scales) values[key] = Math.min(max, Math.max(min, values[key] * factor));
  }
  values.nutWidth = to.value;
  if (values.boreDiameter > 0) values.boreDiameter = to.bore;
}
