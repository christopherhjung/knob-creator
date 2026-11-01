// Runs CuraEngine off the main thread, so the page stays responsive while slicing.
import createCuraEngine from '../slicer/engine/curaengine.js';

const DEFINITIONS = [
  'fdmprinter.def.json',
  'fdmextruder.def.json',
  'anycubic_i3_mega.def.json',
  'anycubic_i3_mega_extruder_0.def.json',
];

const DEFINITIONS_DIR = '/definitions';

async function fetchDefinition(name) {
  const response = await fetch(new URL(`../slicer/engine/definitions/${name}`, import.meta.url));
  if (!response.ok) throw new Error(`Could not load ${name}`);
  return [name, await response.text()];
}

self.onmessage = async ({ data: { stl, args } }) => {
  const log = [];
  try {
    const definitions = await Promise.all(DEFINITIONS.map(fetchDefinition));

    // One engine per slice: CuraEngine keeps global state and expects to exit afterwards.
    const engine = await createCuraEngine({
      print: () => {},
      printErr: (line) => {
        const progress = /^Progress:.*?([\d.]+)%\s*$/.exec(line);
        // The engine prints a 0 to 1 fraction, despite the % sign.
        if (progress) self.postMessage({ progress: Number(progress[1]) * 100 });
        else log.push(line);
      },
      preRun: [(module) => { module.ENV.CURA_ENGINE_SEARCH_PATH = DEFINITIONS_DIR; }],
    });

    engine.FS.mkdir(DEFINITIONS_DIR);
    for (const [name, text] of definitions) engine.FS.writeFile(`${DEFINITIONS_DIR}/${name}`, text);
    engine.FS.writeFile('/knob.stl', new Uint8Array(stl));

    const exitCode = engine.callMain(args);

    const gcode = engine.FS.readFile('/knob.gcode');
    // Every extruded path is labelled ;TYPE:, so a file without one prints nothing.
    if (!new TextDecoder().decode(gcode).includes(';TYPE:')) {
      throw new Error(`The engine produced no toolpaths (exit code ${exitCode}).`);
    }
    self.postMessage({ gcode }, [gcode.buffer]);
  } catch (error) {
    const detail = log.slice(-6).join(' ');
    self.postMessage({ error: `${error.message ?? error} ${detail}`.trim() });
  }
};
