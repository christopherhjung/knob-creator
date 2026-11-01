import { createControls } from './controls.js';
import { downloadFile } from './download.js';
import { sliceStl } from './slicer.js';
import { bedLayout, defaultSlicerValues, SLICER_PARAMS } from './slicer-settings.js';

/**
 * Wires up the Slicer tab.
 * @param {() => DataView} getStl returns the current knob as binary STL
 * @param {() => number[]} getFootprint returns the width and depth of the current knob
 */
export function createSlicerPanel(getStl, getFootprint) {
  const status = document.querySelector('#slicer-status');
  const progress = document.querySelector('#slicer-progress');
  const button = document.querySelector('#slice');
  const layoutText = document.querySelector('#slicer-layout');
  const values = defaultSlicerValues();
  let slicing = false;

  function refreshLayout() {
    const layout = bedLayout(values, getFootprint());
    layoutText.textContent = layout.fits
      ? `${layout.cols} × ${layout.rows} grid, ${layout.width.toFixed(1)} × ${layout.depth.toFixed(1)} mm`
      : `Too many knobs: ${layout.capacity} fit on the bed at this size and gap.`;
    button.disabled = slicing || !layout.fits;
    return layout;
  }

  createControls(document.querySelector('#slicer-controls'), SLICER_PARAMS, values, refreshLayout);
  document.querySelector('#tab-slicer').addEventListener('click', refreshLayout); // the knob may have changed
  refreshLayout();

  button.addEventListener('click', async () => {
    slicing = true;
    button.disabled = true;
    progress.hidden = false;
    progress.value = 0;
    status.textContent = 'Slicing…';

    try {
      const stl = getStl();
      const buffer = stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength);
      const { positions } = bedLayout(values, getFootprint());
      const gcode = await sliceStl(buffer, values, positions, (percent) => { progress.value = percent; });

      downloadFile(gcode, 'knob.gcode', 'text/x-gcode');
      const layers = /;LAYER_COUNT:(\d+)/.exec(new TextDecoder().decode(gcode.subarray(0, 8192)));
      status.textContent = layers ? `Done: ${layers[1]} layers.` : 'Done.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      slicing = false;
      refreshLayout();
      progress.hidden = true;
    }
  });
}
