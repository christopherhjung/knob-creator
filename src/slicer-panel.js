import { createControls } from './controls.js';
import { downloadFile } from './download.js';
import { sliceStl } from './slicer.js';
import { defaultSlicerValues, SLICER_PARAMS } from './slicer-settings.js';

/**
 * Wires up the Slicer tab.
 * @param {() => DataView} getStl returns the current knob as binary STL
 */
export function createSlicerPanel(getStl) {
  const status = document.querySelector('#slicer-status');
  const progress = document.querySelector('#slicer-progress');
  const button = document.querySelector('#slice');
  const values = defaultSlicerValues();

  createControls(document.querySelector('#slicer-controls'), SLICER_PARAMS, values, () => {});

  button.addEventListener('click', async () => {
    button.disabled = true;
    progress.hidden = false;
    progress.value = 0;
    status.textContent = 'Slicing…';

    try {
      const stl = getStl();
      const buffer = stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength);
      const gcode = await sliceStl(buffer, values, (percent) => { progress.value = percent; });

      downloadFile(gcode, 'knob.gcode', 'text/x-gcode');
      const layers = /;LAYER_COUNT:(\d+)/.exec(new TextDecoder().decode(gcode.subarray(0, 8192)));
      status.textContent = layers ? `Done: ${layers[1]} layers.` : 'Done.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
      progress.hidden = true;
    }
  });
}
