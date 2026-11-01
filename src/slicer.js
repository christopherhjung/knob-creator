import { engineArguments } from './slicer-settings.js';

const PATHS = {
  definition: '/definitions/anycubic_i3_mega.def.json',
  model: '/knob.stl',
  output: '/knob.gcode',
};

/**
 * Slices a binary STL in a worker.
 * @param {ArrayBuffer} stl
 * @param {object} values slicer settings from the UI
 * @param {number[][]} positions copy offsets from the bed centre
 * @param {(percent: number) => void} onProgress
 * @returns {Promise<Uint8Array>} G-code
 */
export function sliceStl(stl, values, positions, onProgress) {
  const worker = new Worker(new URL('./slicer-worker.js', import.meta.url), { type: 'module' });

  return new Promise((resolve, reject) => {
    worker.onmessage = ({ data }) => {
      if (data.progress !== undefined) onProgress(data.progress);
      else if (data.gcode) resolve(data.gcode);
      else reject(new Error(data.error));
    };
    // A module worker fails here when CuraEngine.js or its WASM can't be loaded.
    worker.onerror = () => reject(new Error('The slicer engine could not be loaded. Run slicer/build.sh to compile it.'));
    worker.postMessage({ stl, args: engineArguments(values, PATHS, positions) }, [stl]);
  }).finally(() => worker.terminate());
}
