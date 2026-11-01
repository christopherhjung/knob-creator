// Slices a knob with the compiled engine outside the browser.
// Run `node slicer/slice.js [output.gcode]` for a default knob; the tests use sliceKnob().
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { buildKnob } from '../src/knob.js';
import { defaultValues, knobFootprint } from '../src/params.js';
import { bedLayout, defaultSlicerValues, engineArguments } from '../src/slicer-settings.js';
import createCuraEngine from './engine/curaengine.js';

const DEFINITIONS = '/definitions';
const DEFINITION_FILES = [
  'fdmprinter.def.json',
  'fdmextruder.def.json',
  'anycubic_i3_mega.def.json',
  'anycubic_i3_mega_extruder_0.def.json',
];

function knobToStl(knobValues) {
  const { positions, indices } = buildKnob(knobValues);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  const stl = new STLExporter().parse(new THREE.Mesh(geometry), { binary: true });
  return new Uint8Array(stl.buffer, stl.byteOffset, stl.byteLength);
}

/** @returns {Promise<string>} G-code */
export async function sliceKnob(knobValues = defaultValues(), slicerValues = defaultSlicerValues()) {
  const engine = await createCuraEngine({
    print: () => {},
    printErr: () => {},
    preRun: [(module) => { module.ENV.CURA_ENGINE_SEARCH_PATH = DEFINITIONS; }],
  });

  engine.FS.mkdir(DEFINITIONS);
  for (const name of DEFINITION_FILES) {
    const text = await readFile(new URL(`engine/definitions/${name}`, import.meta.url), 'utf8');
    engine.FS.writeFile(`${DEFINITIONS}/${name}`, text);
  }
  engine.FS.writeFile('/knob.stl', knobToStl(knobValues));

  engine.callMain(engineArguments(slicerValues, {
    definition: `${DEFINITIONS}/anycubic_i3_mega.def.json`,
    model: '/knob.stl',
    output: '/knob.gcode',
  }, bedLayout(slicerValues, knobFootprint(knobValues)).positions));
  return engine.FS.readFile('/knob.gcode', { encoding: 'utf8' });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await writeFile(process.argv[2] ?? 'knob.gcode', await sliceKnob());
}
