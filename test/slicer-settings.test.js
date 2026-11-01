import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  bedLayout, defaultSlicerValues, engineArguments, SLICER_PARAMS, toEngineSettings,
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

const FOOTPRINT = [60, 28];
const layoutOf = (overrides) => bedLayout({ ...defaultSlicerValues(), ...overrides }, FOOTPRINT);

test('one knob sits in the middle of the bed', () => {
  assert.deepEqual(layoutOf({ copies: 1 }).positions, [[0, 0]]);
});

test('grid is compact, evenly spaced and centred', () => {
  const { cols, rows, width, depth, positions } = layoutOf({ copies: 4, copyGap: 5 });
  assert.deepEqual([cols, rows, width, depth], [2, 2, 125, 61]);
  assert.deepEqual(positions, [[-32.5, -16.5], [32.5, -16.5], [-32.5, 16.5], [32.5, 16.5]]);
});

test('an unfinished row is centred too', () => {
  const { positions } = layoutOf({ copies: 3, copyGap: 5 });
  assert.equal(positions.length, 3);
  const lastRow = positions.filter(([, y]) => y === Math.max(...positions.map((p) => p[1])));
  const sum = lastRow.reduce((total, [x]) => total + x, 0);
  assert.ok(Math.abs(sum) < 1e-9);
});

test('every copy is requested once, each at its own position', () => {
  const positions = [[-10, 0], [10, 0]];
  const args = engineArguments(defaultSlicerValues(), { definition: 'd', model: 'm', output: 'o' }, positions);
  assert.equal(args.filter((arg) => arg === 'm').length, 2);
  assert.ok(args.includes('mesh_position_x=-10') && args.includes('mesh_position_x=10'));
  assert.ok(args.lastIndexOf('-e0') < args.lastIndexOf('-l'));
});

test('copies never leave the bed, with room for the bed adhesion', () => {
  for (const [adhesion, margin] of [['none', 0], ['skirt', 4], ['brim', 9], ['raft', 16]]) {
    for (let copies = 1; copies <= 36; copies++) {
      const { fits, positions } = layoutOf({ copies, adhesion });
      if (!fits) continue;
      for (const [x, y] of positions) {
        assert.ok(Math.abs(x) + 30 <= 105 - margin, `${adhesion} ${copies} x`);
        assert.ok(Math.abs(y) + 14 <= 105 - margin, `${adhesion} ${copies} y`);
      }
    }
  }
});

test('too many copies are refused with the number that does fit', () => {
  const { fits, capacity, positions } = layoutOf({ copies: 36, copyGap: 5 });
  assert.equal(fits, false);
  assert.equal(capacity, 18);
  assert.deepEqual(positions, []);
  assert.equal(layoutOf({ copies: 18, copyGap: 5 }).fits, true);
});

test('a knob larger than the bed fits zero times', () => {
  const { fits, capacity } = bedLayout({ ...defaultSlicerValues(), copies: 1 }, [300, 28]);
  assert.equal(fits, false);
  assert.equal(capacity, 0);
});

test('command line selects the extruder before loading the model', () => {
  const args = engineArguments(defaultSlicerValues(), { definition: '/d.json', model: '/m.stl', output: '/o.gcode' });
  assert.deepEqual(args.slice(0, 7), ['slice', '-v', '-p', '-j', '/d.json', '-o', '/o.gcode']);
  assert.ok(args.indexOf('-e0') < args.indexOf('-l'));
  assert.equal(args.filter((arg) => arg === '/m.stl').length, 1);
  const layerHeights = args.filter((arg) => arg === 'layer_height=0.2');
  assert.equal(layerHeights.length, 2, 'set on the global and the extruder scope');
});
