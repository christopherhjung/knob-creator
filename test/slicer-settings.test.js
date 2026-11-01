import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  defaultSlicerValues, engineArguments, SLICER_PARAMS, toEngineSettings,
} from '../src/slicer-settings.js';

const settings = (overrides = {}) => toEngineSettings({ ...defaultSlicerValues(), ...overrides });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} vs ${expected}`);

const definition = (name) =>
  JSON.parse(readFileSync(new URL(`../slicer/engine/definitions/${name}`, import.meta.url)));

function knownSettings() {
  const known = new Set();
  const walk = (node) => {
    for (const [key, value] of Object.entries(node)) {
      known.add(key);
      if (value.children) walk(value.children);
    }
  };
  walk(definition('fdmprinter.def.json').settings);
  return known;
}

test('every setting sent to the engine exists in its definition', () => {
  const known = knownSettings();
  const unknown = Object.keys(settings()).filter((key) => !known.has(key));
  assert.deepEqual(unknown, []);
});

test('choices offered in the UI are values the definition accepts', () => {
  const { infill, support, platform_adhesion: adhesion } = definition('fdmprinter.def.json').settings;
  const offered = (key) => SLICER_PARAMS.find((param) => param.key === key).options.map(({ value }) => value);
  const accepts = (setting, values) => {
    for (const value of values) assert.ok(value in setting.options, value);
  };

  accepts(infill.children.infill_pattern, offered('infillPattern'));
  accepts(adhesion.children.adhesion_type, offered('adhesion'));
  accepts(support.children.support_type, offered('supports').filter((value) => value !== 'none'));
});

test('the printer is the i3 Mega with 1.75 mm filament', () => {
  assert.equal(definition('anycubic_i3_mega.def.json').overrides.machine_width.default_value, 210);
  assert.equal(settings().material_diameter, 1.75); // fdmprinter defaults to 2.85
  assert.equal(settings().machine_nozzle_size, 0.4);
  assert.equal(settings().center_object, true);
  // The engine adds half the bed itself; adding it again puts the model off the bed.
  assert.equal(settings().mesh_position_x, undefined);
  assert.equal(settings().mesh_position_y, undefined);
});

test('start and end G-code have no unfilled Cura placeholders', () => {
  const { machine_start_gcode: start, machine_end_gcode: end } = settings({ travelSpeed: 120 });
  assert.ok(!start.includes('{') && !end.includes('{'));
  assert.ok(start.includes('F7200'), 'feed rates are in mm/min');
});

test('derived settings follow their parents, unlike the raw definition defaults', () => {
  const s = settings({ printSpeed: 40, nozzleTemp: 215, bedTemp: 70, fanSpeed: 50, retractionSpeed: 30 });
  assert.equal(s.speed_wall_0, 20);
  assert.equal(s.speed_infill, 40);
  assert.equal(s.speed_print_layer_0, 20);
  assert.equal(s.material_print_temperature_layer_0, 215);
  assert.equal(s.material_final_print_temperature, 215);
  assert.equal(s.material_bed_temperature_layer_0, 70);
  assert.equal(s.cool_fan_speed_max, 50);
  assert.equal(s.retraction_prime_speed, 30);
});

test('infill line distance matches the Cura formula', () => {
  near(settings({ infillDensity: 20, infillPattern: 'grid' }).infill_line_distance, 4);
  near(settings({ infillDensity: 20, infillPattern: 'lines' }).infill_line_distance, 2);
  near(settings({ infillDensity: 20, infillPattern: 'cubic' }).infill_line_distance, 6);
  assert.equal(settings({ infillDensity: 0 }).infill_line_distance, 0);
});

test('solid infill replaces top and bottom skin', () => {
  const s = settings({ infillDensity: 100 });
  assert.equal(s.top_layers, 0);
  assert.equal(s.bottom_layers, 999999);
  assert.equal(settings({ infillDensity: 99 }).top_layers, 4);
});

test('orientation is a proper 180 degree rotation or none', () => {
  assert.equal(settings({ orientation: 'top' }).mesh_rotation_matrix, '[[1,0,0],[0,-1,0],[0,0,-1]]');
  assert.equal(settings({ orientation: 'stud' }).mesh_rotation_matrix, '[[1,0,0],[0,1,0],[0,0,1]]');
});

test('off switches turn their feature off', () => {
  assert.equal(settings({ fanSpeed: 0 }).cool_fan_enabled, false);
  assert.equal(settings({ retractionDistance: 0 }).retraction_enable, false);
  assert.equal(settings({ supports: 'none' }).support_enable, false);
  assert.equal(settings({ supports: 'buildplate' }).support_type, 'buildplate');
});

test('choosing a material sets its temperatures and fan', () => {
  const material = SLICER_PARAMS.find(({ key }) => key === 'material');
  const values = defaultSlicerValues();
  material.apply(values, 'PETG');
  assert.deepEqual(
    [values.material, values.nozzleTemp, values.bedTemp, values.fanSpeed],
    ['PETG', 235, 80, 50],
  );
});

test('slider limits stay inside what the printer can do', () => {
  const max = (key) => SLICER_PARAMS.find((param) => param.key === key).max;
  assert.ok(max('nozzleTemp') <= 260);
  assert.ok(max('bedTemp') <= 100);
});

test('command line selects the extruder before loading the model', () => {
  const args = engineArguments(defaultSlicerValues(), { definition: '/d.json', model: '/m.stl', output: '/o.gcode' });
  assert.deepEqual(args.slice(0, 7), ['slice', '-v', '-p', '-j', '/d.json', '-o', '/o.gcode']);
  assert.ok(args.indexOf('-e0') < args.indexOf('-l'));
  assert.equal(args.at(-1), '/m.stl');
  const layerHeights = args.filter((arg) => arg === 'layer_height=0.2');
  assert.equal(layerHeights.length, 2, 'set on the global and the extruder scope');
});
