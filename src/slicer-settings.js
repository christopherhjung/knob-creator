// Print settings for the Anycubic i3 Mega and their translation to CuraEngine.
//
// The engine reads only each setting's default_value. The formulas in Cura's
// definition files run in the Cura app, so every derived setting is computed here.

const NOZZLE = 0.4;
const FILAMENT = 1.75;
const FIRST_LAYER_HEIGHT = 0.3;
const SUPPORT_DENSITY = 15;

const MATERIALS = {
  PLA: { nozzleTemp: 200, bedTemp: 60, fanSpeed: 100 },
  PETG: { nozzleTemp: 235, bedTemp: 80, fanSpeed: 50 },
  ABS: { nozzleTemp: 245, bedTemp: 100, fanSpeed: 0 },
};

const selectMaterial = (values, material) => Object.assign(values, { material }, MATERIALS[material]);

const option = (value, label = value) => ({ value, label });

// Limits follow the printer: 260 °C hotend, 100 °C bed.
export const SLICER_PARAMS = [
  {
    group: 'Print', key: 'orientation', label: 'Orientation', value: 'stud',
    options: [option('stud', 'Stud down'), option('top', 'Top face down')],
  },
  {
    group: 'Print', key: 'material', label: 'Material', value: 'PLA',
    options: Object.keys(MATERIALS).map((name) => option(name)), apply: selectMaterial,
  },

  { group: 'Quality', key: 'layerHeight', label: 'Layer height', min: 0.08, max: 0.32, step: 0.04, value: 0.2 },
  { group: 'Quality', key: 'wallCount', label: 'Wall lines', unit: 'lines', min: 1, max: 8, step: 1, value: 3 },
  { group: 'Quality', key: 'topBottomLayers', label: 'Top and bottom layers', unit: 'layers', min: 0, max: 12, step: 1, value: 4 },

  { group: 'Infill', key: 'infillDensity', label: 'Density (%)', unit: '%', min: 0, max: 100, step: 1, value: 20 },
  {
    group: 'Infill', key: 'infillPattern', label: 'Pattern', value: 'grid',
    options: [option('grid', 'Grid'), option('lines', 'Lines'), option('triangles', 'Triangles'), option('cubic', 'Cubic'), option('gyroid', 'Gyroid')],
  },

  { group: 'Temperature', key: 'nozzleTemp', label: 'Nozzle (°C)', unit: '°C', min: 170, max: 260, step: 1, value: 200 },
  { group: 'Temperature', key: 'bedTemp', label: 'Bed (°C)', unit: '°C', min: 0, max: 100, step: 1, value: 60 },
  { group: 'Temperature', key: 'fanSpeed', label: 'Fan (%)', unit: '%', min: 0, max: 100, step: 1, value: 100 },

  { group: 'Speed', key: 'printSpeed', label: 'Print (mm/s)', unit: 'mm/s', min: 10, max: 100, step: 1, value: 50 },
  { group: 'Speed', key: 'travelSpeed', label: 'Travel (mm/s)', unit: 'mm/s', min: 50, max: 200, step: 1, value: 120 },

  { group: 'Retraction', key: 'retractionDistance', label: 'Distance (0 = off)', min: 0, max: 10, step: 0.1, value: 6 },
  { group: 'Retraction', key: 'retractionSpeed', label: 'Speed (mm/s)', unit: 'mm/s', min: 10, max: 70, step: 1, value: 40 },

  {
    group: 'Supports and adhesion', key: 'supports', label: 'Supports', value: 'buildplate',
    options: [option('none', 'None'), option('buildplate', 'From bed'), option('everywhere', 'Everywhere')],
  },
  {
    group: 'Supports and adhesion', key: 'adhesion', label: 'Bed adhesion', value: 'skirt',
    options: [option('none', 'None'), option('skirt', 'Skirt'), option('brim', 'Brim'), option('raft', 'Raft')],
  },
];

export const defaultSlicerValues = () =>
  Object.fromEntries(SLICER_PARAMS.map(({ key, value }) => [key, value]));

// From anycubic_i3_mega.def.json, with Cura's {speed_travel} placeholder filled in
// as a real mm/min feed rate.
const startGcode = (travelFeed) => [
  'G21 ;metric values',
  'G90 ;absolute positioning',
  'M82 ;set extruder to absolute mode',
  'M107 ;start with the fan off',
  'G28 X0 Y0 ;move X/Y to min endstops',
  'G28 Z0 ;move Z to min endstops',
  `G1 Z15.0 F${travelFeed} ;move the platform down 15mm`,
  'G92 E0 ;zero the extruded length',
  'G1 F200 E3 ;extrude 3mm of feed stock',
  'G92 E0 ;zero the extruded length again',
  `G1 F${travelFeed}`,
  `G0 Y20 F${travelFeed}`,
  'M117 Printing...',
  'G5',
].join('\n');

const END_GCODE = [
  'M104 S0 ; turn off extruder',
  'M140 S0 ; turn off bed',
  'M84 ; disable motors',
  'M107',
  'G91 ;relative positioning',
  'G1 E-1 F300 ;retract the filament a bit before lifting the nozzle',
  'G1 Z+0.5 E-5 ;move Z up a bit and retract filament even more',
  'G28 X0 ;move X to min endstop, so the head is out of the way',
  'G1 Y180 F2000',
  'M84 ;steppers off',
  'G90',
  'M300 P300 S4000',
].join('\n');

const INFILL_LINE_FACTOR = { grid: 2, lines: 1, triangles: 3, cubic: 3, gyroid: 1 };

function infillLineDistance({ infillDensity, infillPattern }) {
  if (infillDensity === 0) return 0;
  return (NOZZLE * 100) / infillDensity * INFILL_LINE_FACTOR[infillPattern];
}

/** Translates the UI values to CuraEngine settings. */
export function toEngineSettings(v) {
  const solid = v.infillDensity === 100;
  const firstLayerSpeed = v.printSpeed / 2;

  return {
    // Printer
    machine_nozzle_size: NOZZLE,
    material_diameter: FILAMENT,
    machine_start_gcode: startGcode(v.travelSpeed * 60),
    machine_end_gcode: END_GCODE,

    // Placement: the engine adds the mid-bed offset itself, since machine_center_is_zero
    // is false, so the model only has to be centred on the origin and sit at z = 0.
    center_object: true,
    mesh_rotation_matrix: v.orientation === 'top'
      ? '[[1,0,0],[0,-1,0],[0,0,-1]]'
      : '[[1,0,0],[0,1,0],[0,0,1]]',

    // Quality
    layer_height: v.layerHeight,
    layer_height_0: FIRST_LAYER_HEIGHT,
    line_width: NOZZLE,
    wall_line_width: NOZZLE,
    wall_line_width_0: NOZZLE,
    wall_line_width_x: NOZZLE,
    skin_line_width: NOZZLE,
    infill_line_width: NOZZLE,
    skirt_brim_line_width: NOZZLE,
    support_line_width: NOZZLE,
    support_interface_line_width: NOZZLE,
    wall_line_count: v.wallCount,
    top_layers: solid ? 0 : v.topBottomLayers,
    bottom_layers: solid ? 999999 : v.topBottomLayers,

    // Infill
    infill_sparse_density: v.infillDensity,
    infill_pattern: v.infillPattern,
    infill_line_distance: infillLineDistance(v),

    // Temperature
    material_print_temperature: v.nozzleTemp,
    material_print_temperature_layer_0: v.nozzleTemp,
    material_initial_print_temperature: v.nozzleTemp,
    material_final_print_temperature: v.nozzleTemp,
    material_bed_temperature: v.bedTemp,
    material_bed_temperature_layer_0: v.bedTemp,
    cool_fan_enabled: v.fanSpeed > 0,
    cool_fan_speed: v.fanSpeed,
    cool_fan_speed_min: v.fanSpeed,
    cool_fan_speed_max: v.fanSpeed,

    // Speed
    speed_print: v.printSpeed,
    speed_infill: v.printSpeed,
    speed_wall: v.printSpeed / 2,
    speed_wall_0: v.printSpeed / 2,
    speed_wall_x: v.printSpeed,
    speed_topbottom: v.printSpeed / 2,
    speed_support: v.printSpeed,
    speed_support_infill: v.printSpeed,
    speed_support_interface: v.printSpeed / 1.5,
    speed_travel: v.travelSpeed,
    speed_layer_0: firstLayerSpeed,
    speed_print_layer_0: firstLayerSpeed,
    speed_travel_layer_0: firstLayerSpeed * (v.travelSpeed / v.printSpeed),
    skirt_brim_speed: firstLayerSpeed,

    // Retraction
    retraction_enable: v.retractionDistance > 0,
    retraction_amount: v.retractionDistance,
    retraction_speed: v.retractionSpeed,
    retraction_retract_speed: v.retractionSpeed,
    retraction_prime_speed: v.retractionSpeed,

    // Supports and adhesion
    support_enable: v.supports !== 'none',
    support_type: v.supports === 'none' ? 'everywhere' : v.supports,
    support_infill_rate: SUPPORT_DENSITY,
    support_line_distance: (NOZZLE * 100) / SUPPORT_DENSITY,
    adhesion_type: v.adhesion,
  };
}

/**
 * CuraEngine command line. Settings go on both the global and the extruder scope,
 * because the engine looks each one up in only one of them, and `-e0` must precede
 * `-l`, which is also where the rotation matrix is read.
 */
export function engineArguments(values, { definition, model, output }) {
  const settings = Object.entries(toEngineSettings(values))
    .flatMap(([key, value]) => ['-s', `${key}=${value}`]);

  return ['slice', '-v', '-p', '-j', definition, '-o', output, ...settings, '-e0', ...settings, '-l', model];
}
